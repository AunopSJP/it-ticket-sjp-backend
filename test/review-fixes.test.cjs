require('ts-node/register');
require('tsconfig-paths/register');

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { NotFoundException, UnauthorizedException } = require('@nestjs/common');
const { TicketStatus } = require('../src/common/enums/ticket-status.enum.ts');
const { Role } = require('../src/common/enums/role.enum.ts');
const { TicketsService } = require('../src/tickets/tickets.service.ts');
const { LineVerifyService } = require('../src/line/line-verify.service.ts');
const { TicketChatService } = require('../src/ticket-chat/ticket-chat.service.ts');
const { TicketChatRepository } = require('../src/ticket-chat/ticket-chat.repository.ts');

const silentLogger = { error() {}, warn() {}, log() {} };

/** สร้าง TicketsService โดยไม่ผ่าน constructor (ไม่ต้องต่อ DB) แล้วฉีดเฉพาะ dependency ที่เมธอดนั้นใช้ */
function makeTicketsService(deps) {
  const service = Object.create(TicketsService.prototype);
  service.logger = silentLogger;
  Object.assign(service, deps);
  return service;
}

test('new admin-created tickets enter triage at P3 even with legacy urgent impact', async () => {
  let stored;
  const service = makeTicketsService({
    departmentsService: { findById: async () => ({ department_code: 'IT' }) },
    generateTicketNo: async () => 'IT-123',
    dataSource: { transaction: async (cb) => cb({}) },
    ticketsRepo: {
      createTicket: (ticket) => ticket,
      saveTicket: async (ticket) => (stored = { ...ticket, ticket_id: 'new', created_at: new Date() }),
      createHistory: (entry) => entry,
      saveHistory: async () => {},
      findByIdWithDetail: async () => stored,
    },
    symptomsService: { recordOccurrences: async () => {} },
    notificationsService: { notifyAllAdmins: async () => {} },
  });
  const ticket = await service.createByAdmin({
    department_id: 1, priority: 'urgent', triage_priority: 'p1', subject: 'Test',
  }, [], { admin_id: 7 });
  assert.equal(ticket.triage_priority, 'p3');
  assert.equal(ticket.priority, 'urgent');
});

test('triage priority is writable by the current team but not by a read-only origin team', async () => {
  const manager = {};
  const ticket = { ticket_id: 't-1', ticket_no: 'IT-1', department_id: 2, assignee_id: 3,
    status: TicketStatus.OPEN, triage_priority: 'p3', created_at: new Date(2026, 10, 10, 9, 0, 0),
    first_responded_at: null, resolved_at: null, sla_paused_ms: 0, wait_started_at: null };
  const writes = [];
  const service = makeTicketsService({
    dataSource: { transaction: async (cb) => cb(manager) },
    ticketsRepo: {
      lockStatus: async () => ticket.status,
      findById: async () => ticket,
      updateFields: async (id, fields, tx) => { writes.push([id, fields, tx]); Object.assign(ticket, fields); },
      findByIdWithDetail: async () => ticket,
    },
    recordTicketAudit: async () => {},
  });
  await assert.rejects(
    () => service.changeTriagePriority('t-1', 'p1', { admin_id: 7, department_id: 1, role: Role.ADMIN }),
    { status: 403 },
  );
  assert.equal(writes.length, 0);
  const updated = await service.changeTriagePriority('t-1', 'p2', { admin_id: 7, department_id: 2, role: Role.ADMIN });
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], 't-1');
  assert.equal(writes[0][1].triage_priority, 'p2');
  assert.ok(writes[0][1].first_response_due_at instanceof Date, 'ยังไม่ตอบ = กำหนดตอบครั้งแรกต้องเปลี่ยนตาม Priority ใหม่');
  assert.ok(writes[0][1].resolve_due_at instanceof Date, 'ยังไม่ปิด = กำหนดแก้ไขต้องเปลี่ยนตาม Priority ใหม่');
  assert.equal(updated.triage_priority, 'p2');
  assert.equal(updated.status, TicketStatus.OPEN);
});

// ---------------------------------------------------------------- SLA job

test('SLA job updates only flag columns and never saves the whole stale ticket', async () => {
  const now = Date.now();
  const ticket = {
    ticket_id: 't-1',
    ticket_no: 'TK-IT-2026-11-0001',
    subject: 'เน็ตล่ม',
    department_id: 3,
    status: TicketStatus.IN_PROGRESS,
    assignee_id: 7,
    assign_by: null,
    deadline_date: null,
    created_at: new Date(now - 10 * 3600_000),
    resolve_by: new Date(now - 3600_000),
    sla_paused_ms: 0,
    sla_breached: false,
    wait_started_at: null,
  };
  const updates = [];
  let saveCalls = 0;
  const notified = [];
  const service = makeTicketsService({
    ticketsRepo: {
      findAllActive: async () => [ticket],
      saveTicket: async () => { saveCalls += 1; },
      updateFields: async (id, fields) => { updates.push({ id, fields }); },
    },
    notificationsService: { notifyAllAdmins: async (...args) => { notified.push(args); } },
  });

  await service.checkSlaForActiveTickets();

  assert.equal(saveCalls, 0, 'ห้ามเรียก saveTicket (จะเขียนสถานะเก่าทับ)');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 't-1');
  assert.deepEqual(Object.keys(updates[0].fields).sort(), ['sla_breach_notified_at', 'sla_breached']);
  assert.equal(updates[0].fields.sla_breached, true);
  assert.equal(notified.length, 1);
});

test('auto-close writes only status and closed_at inside the locked transaction', async () => {
  const stale = { ticket_id: 't-2', ticket_no: 'TK-2', status: TicketStatus.PENDING_CONFIRMATION, assignee_id: 7 };
  const updates = [];
  let saveCalls = 0;
  const manager = { tag: 'manager' };
  const service = makeTicketsService({
    dataSource: { transaction: async (cb) => cb(manager) },
    ticketsRepo: {
      findOverdueUnconfirmed: async () => [stale],
      lockStatus: async () => TicketStatus.PENDING_CONFIRMATION,
      saveTicket: async () => { saveCalls += 1; },
      updateFields: async (id, fields, m) => { updates.push({ id, fields, m }); },
      createHistory: (data) => data,
      saveHistory: async () => ({}),
      findByIdWithDetail: async () => ({ ...stale, status: TicketStatus.CLOSED }),
    },
  });

  await service.autoCloseUnconfirmedTickets();

  assert.equal(saveCalls, 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].m, manager, 'ต้องใช้ manager ของ transaction เดียวกัน');
  assert.deepEqual(Object.keys(updates[0].fields).sort(), ['closed_at', 'status']);
  assert.equal(updates[0].fields.status, TicketStatus.CLOSED);
});

test('auto-close skips a ticket the reporter already confirmed', async () => {
  const stale = { ticket_id: 't-3', ticket_no: 'TK-3' };
  let updated = 0;
  const service = makeTicketsService({
    dataSource: { transaction: async (cb) => cb({}) },
    ticketsRepo: {
      findOverdueUnconfirmed: async () => [stale],
      lockStatus: async () => TicketStatus.CLOSED,
      updateFields: async () => { updated += 1; },
    },
  });
  await service.autoCloseUnconfirmedTickets();
  assert.equal(updated, 0);
});

// ------------------------------------------------------------ transition()

function makeTransitionService(order, lockResult) {
  const ticket = {
    ticket_id: 't-9',
    ticket_no: 'TK-9',
    status: TicketStatus.IN_PROGRESS,
    user_id: null,
    assignee_id: 1,
    department_id: 1,
    history: [],
  };
  return makeTicketsService({
    dataSource: { transaction: async (cb) => cb({}) },
    ticketsRepo: {
      lockStatus: async () => { order.push('lockStatus'); return lockResult; },
      findById: async () => { order.push('findById'); return ticket; },
      saveTicket: async () => { order.push('saveTicket'); },
      createHistory: (d) => d,
      saveHistory: async () => { order.push('saveHistory'); return { ticket_history_id: 1 }; },
      findByIdWithDetail: async () => ticket,
    },
  });
}

test('transition locks the ticket row before reading it', async () => {
  const order = [];
  const service = makeTransitionService(order, TicketStatus.IN_PROGRESS);
  const admin = { admin_id: 1, role: Role.SUPER_ADMIN, department_id: null };

  await service.transition('t-9', admin, {
    mutate: () => ({ to_status: TicketStatus.WAITING }),
  });

  assert.equal(order[0], 'lockStatus');
  assert.equal(order[1], 'findById');
});

test('transition returns NotFound when the locked row does not exist', async () => {
  const order = [];
  const service = makeTransitionService(order, null);
  const admin = { admin_id: 1, role: Role.SUPER_ADMIN, department_id: null };

  await assert.rejects(
    () => service.transition('missing', admin, { mutate: () => ({ to_status: TicketStatus.WAITING }) }),
    NotFoundException,
  );
  assert.ok(!order.includes('findById'));
});

// ------------------------------------------------------------- LINE verify

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

async function withFetch(sequence, fn) {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    const next = sequence[Math.min(calls, sequence.length - 1)];
    calls += 1;
    return next;
  };
  try {
    await fn(() => calls);
  } finally {
    global.fetch = original;
  }
}

const validPayload = () => ({
  iss: 'https://access.line.me',
  sub: 'U123',
  aud: '2010638501',
  exp: Math.floor(Date.now() / 1000) + 600,
  iat: Math.floor(Date.now() / 1000),
});

const makeLine = () => new LineVerifyService({ get: () => '2010638501' });

test('LINE 429/5xx is transient: a retry with the same token is not blocked by the negative cache', async () => {
  const service = makeLine();
  await withFetch([jsonResponse(429, {}), jsonResponse(200, validPayload())], async (calls) => {
    await assert.rejects(() => service.verifyIdToken('tok'), UnauthorizedException);
    const payload = await service.verifyIdToken('tok');
    assert.equal(payload.sub, 'U123');
    assert.equal(calls(), 2, 'ต้องถาม LINE ซ้ำ ไม่ใช่ตอบจาก negative cache');
  });
});

test('LINE 503 is also treated as transient', async () => {
  const service = makeLine();
  await withFetch([jsonResponse(503, {}), jsonResponse(200, validPayload())], async () => {
    await assert.rejects(() => service.verifyIdToken('tok2'), UnauthorizedException);
    assert.equal((await service.verifyIdToken('tok2')).sub, 'U123');
  });
});

test('LINE 400 invalid token is still negative-cached', async () => {
  const service = makeLine();
  await withFetch([jsonResponse(400, { error: 'invalid_request' })], async (calls) => {
    await assert.rejects(() => service.verifyIdToken('bad'), UnauthorizedException);
    await assert.rejects(() => service.verifyIdToken('bad'), UnauthorizedException);
    assert.equal(calls(), 1, 'token ผิดจริงต้องไม่ถูกถาม LINE ซ้ำ');
  });
});

// -------------------------------------------------------------- chat inbox

test('inbox filter: department admins only see tickets they are assigned to', async () => {
  const wheres = [];
  const chain = {
    leftJoinAndSelect() { return chain; },
    where() { return chain; },
    andWhere(clause, params) { wheres.push([clause, params]); return chain; },
    orderBy() { return chain; },
    getMany: async () => [],
  };
  const repo = new TicketChatRepository(null, { createQueryBuilder: () => chain }, null);

  await repo.findInboxTickets({ admin_id: 5, role: Role.ADMIN, department_id: 2 });
  const stringClauses = wheres.filter(([c]) => typeof c === 'string');
  assert.deepEqual(stringClauses, [['ticket.assignee_id = :admin_id', { admin_id: 5 }]]);

  wheres.length = 0;
  await repo.findInboxTickets({ admin_id: 1, role: Role.SUPER_ADMIN, department_id: null });
  assert.equal(wheres.filter(([c]) => typeof c === 'string').length, 0);
});

test('getInbox uses two batch queries regardless of ticket count', async () => {
  const tickets = ['a', 'b', 'c'].map((id) => ({
    ticket_id: id, ticket_no: id.toUpperCase(), subject: id, status: TicketStatus.IN_PROGRESS,
    department_id: 1, department: { department_name_th: 'ไอที' }, full_name: 'ผู้แจ้ง',
    assignee: { full_name: 'แอดมิน' }, updated_at: new Date(0),
  }));
  const calls = { last: 0, unread: 0, perTicket: 0 };
  const repo = {
    findInboxTickets: async () => tickets,
    findLastMessagesByTickets: async (ids) => {
      calls.last += 1;
      assert.deepEqual(ids, ['a', 'b', 'c']);
      return [{ ticket_id: 'a', message: 'สวัสดี', created_at: new Date(5) }];
    },
    countUnreadFromUserByTickets: async () => { calls.unread += 1; return new Map([['b', 3]]); },
    findLastMessage: async () => { calls.perTicket += 1; },
    countUnreadFromUser: async () => { calls.perTicket += 1; },
  };
  const service = new TicketChatService(repo, {}, {});

  const inbox = await service.getInbox({ admin_id: 1, role: Role.SUPER_ADMIN, department_id: null });

  assert.deepEqual(calls, { last: 1, unread: 1, perTicket: 0 });
  assert.equal(inbox.length, 3);
  assert.equal(inbox[0].last_message, 'สวัสดี');
  assert.equal(inbox[0].unread_count, 0);
  assert.equal(inbox[1].last_message, '');
  assert.equal(inbox[1].unread_count, 3);
});

// -------------------------------------------- spec 2.2 status behaviour

test('reopening a resolved ticket returns it to in-progress and pauses the resolve clock for the time it sat in confirmation', async () => {
  const resolvedAt = new Date(2026, 10, 10, 12, 0, 0);
  const ticket = {
    ticket_id: 't-1', ticket_no: 'IT-1', status: TicketStatus.PENDING_CONFIRMATION,
    department_id: 1, assignee_id: 7, created_at: new Date(2026, 10, 10, 9, 0, 0),
    resolved_at: resolvedAt, first_responded_at: new Date(2026, 10, 10, 9, 30, 0),
    confirmation_deadline: new Date(2026, 10, 13, 12, 0, 0), sla_paused_ms: 0, wait_started_at: null,
  };
  const manager = {};
  const fields = [];
  const service = makeTicketsService({
    dataSource: { transaction: async (cb) => cb(manager) },
    ticketsRepo: {
      lockStatus: async () => TicketStatus.PENDING_CONFIRMATION,
      findById: async () => ticket,
      updateFields: async (id, values) => { fields.push(values); Object.assign(ticket, values); },
      createHistory: (data) => data,
      saveHistory: async () => {},
      findByIdWithDetail: async () => ticket,
    },
    recordTicketAudit: async () => {},
  });

  const frozen = Date.now;
  Date.now = () => resolvedAt.getTime() + 2 * 3_600_000; // อยู่รอยืนยัน 2 ชม.
  try {
    const reopened = await service.reopen('t-1', { admin_id: 7, department_id: 1, role: Role.ADMIN, full_name: 'แอดมิน' });
    assert.equal(reopened.status, TicketStatus.IN_PROGRESS);
    assert.equal(reopened.resolved_at, null, 'ต้องเริ่มนับรอบแก้ไขต่อ ไม่ใช่ถือว่าเสร็จแล้ว');
    assert.equal(reopened.confirmation_deadline, null);
    assert.equal(reopened.sla_paused_ms, 2 * 3_600_000, 'ช่วงที่อยู่รอยืนยันต้องไม่ถูกนับเป็นเวลาทำงาน');
    assert.equal(reopened.first_responded_at.getTime(), ticket.first_responded_at.getTime(),
      'เปิดเคสใหม่ต้องไม่เริ่มรอบตอบครั้งแรกใหม่');
  } finally {
    Date.now = frozen;
  }
});

test('a reporter message while waiting resumes the ticket to in-progress and clears the wait pause', async () => {
  const waitStarted = new Date(2026, 10, 10, 10, 0, 0);
  const ticket = {
    ticket_id: 't-2', ticket_no: 'IT-2', status: TicketStatus.WAITING, department_id: 1,
    assignee_id: 7, created_at: new Date(2026, 10, 10, 9, 0, 0), wait_started_at: waitStarted,
    sla_paused_ms: 0, resolved_at: null, first_responded_at: new Date(2026, 10, 10, 9, 15, 0),
  };
  const fields = [];
  const service = makeTicketsService({
    dataSource: { transaction: async (cb) => cb({}) },
    ticketsRepo: {
      lockStatus: async () => TicketStatus.WAITING,
      findById: async () => ticket,
      updateFields: async (id, values) => { fields.push(values); Object.assign(ticket, values); },
      createHistory: (data) => data,
      saveHistory: async () => {},
      findByIdWithDetail: async () => ticket,
    },
  });

  const frozen = Date.now;
  Date.now = () => waitStarted.getTime() + 30 * 60_000; // รอ 30 นาที
  try {
    await service.resumeFromWaiting('t-2');
    assert.equal(ticket.status, TicketStatus.IN_PROGRESS);
    assert.equal(ticket.sla_paused_ms, 30 * 60_000, 'เวลาที่รอต้องถูกพักก่อนกลับมาดำเนินการ');
    assert.equal(ticket.wait_started_at, null);
    assert.equal(ticket.first_responded_at.getTime(), new Date(2026, 10, 10, 9, 15, 0).getTime(),
      'ตอบครั้งแรกที่เคยปิดไปแล้วต้องไม่ถูกล้าง');
  } finally {
    Date.now = frozen;
  }
});

test('a reporter message does not change a ticket that is not waiting', async () => {
  const service = makeTicketsService({
    dataSource: { transaction: async (cb) => cb({}) },
    ticketsRepo: {
      lockStatus: async () => TicketStatus.IN_PROGRESS,
      findById: async () => ({ ticket_id: 't-3', status: TicketStatus.IN_PROGRESS }),
      updateFields: async () => { throw new Error('must not write'); },
      createHistory: (data) => data,
      saveHistory: async () => { throw new Error('must not write'); },
    },
  });

  await service.resumeFromWaiting('t-3');
});

// -------------------------------------------- spec 2.4 send-and-resolve

test('send-and-resolve replies to the reporter and moves the ticket to pending confirmation with the reply as the resolution note', async () => {
  const ticket = { ticket_id: 't1', ticket_no: 'IT-1', status: TicketStatus.IN_PROGRESS, assignee_id: 9, user_id: null };
  const saved = [];
  const resolved = [];
  const repo = {
    findTicket: async () => ticket,
    findAdmin: async () => ({ role: Role.ADMIN, full_name: 'แอดมิน' }),
    findByIdempotencyKey: async () => null,
    create: (data) => data,
    save: async (data) => { saved.push(data); return { ...data, ticket_message_id: 5 }; },
    findAttachmentsByMessageIds: async () => [],
    updateFirstRespondedAt: async () => {},
  };
  const tickets = {
    resolve: async (id, dto, admin) => { resolved.push({ id, dto, admin }); return { ...ticket, status: TicketStatus.PENDING_CONFIRMATION }; },
  };
  const service = new TicketChatService(repo, {}, {}, { uploadTicketImage: async () => ({}) }, tickets);

  const message = await service.sendAndResolve('t1', 9, '  เปลี่ยนสายไฟและทดสอบแล้ว  ', [], undefined,
    { admin_id: 9, full_name: 'แอดมิน' });

  assert.equal(saved.length, 1);
  assert.equal(message.ticket_message_id, 5);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].dto.resolution_note, 'เปลี่ยนสายไฟและทดสอบแล้ว');
});

test('send-and-resolve refuses tickets that are already waiting for confirmation', async () => {
  const ticket = { ticket_id: 't2', ticket_no: 'IT-2', status: TicketStatus.PENDING_CONFIRMATION, assignee_id: 9, user_id: null };
  let saved = 0;
  const service = new TicketChatService({
    findTicket: async () => ticket,
    findAdmin: async () => ({ role: Role.ADMIN, full_name: 'แอดมิน' }),
    create: (data) => data,
    save: async () => { saved += 1; return {}; },
  }, {}, {}, {}, { resolve: async () => ({}) });

  await assert.rejects(() => service.sendAndResolve('t2', 9, 'ตอบ', [], undefined,
    { admin_id: 9, full_name: 'แอดมิน' }), { status: 400 });
  assert.equal(saved, 0, 'ต้องไม่ส่งข้อความถ้าเปลี่ยนสถานะไม่ได้');
});

// -------------------------------------------- chat attachments and idempotency
test('resending an admin reply with the same idempotency key returns the stored message instead of creating a duplicate', async () => {
  const ticket = { ticket_id: 't1', ticket_no: 'IT-1', status: TicketStatus.IN_PROGRESS, assignee_id: 9, user_id: null };
  const stored = { ticket_message_id: 42, ticket_id: 't1', message: 'ตอบแล้ว', sender_type: 'admin', idempotency_key: 'k-1' };
  let saved = 0;
  let uploaded = 0;
  const repo = {
    findTicket: async () => ticket,
    findAdmin: async () => ({ role: Role.ADMIN, full_name: 'แอดมิน' }),
    findByIdempotencyKey: async () => stored,
    create: (data) => data,
    save: async () => { saved += 1; return stored; },
    findAttachmentsByMessageIds: async () => [],
  };
  const storage = { uploadTicketImage: async () => { uploaded += 1; return { file_name: 'f.png', public_url: '/p/f.png' }; } };
  const service = new TicketChatService(repo, {}, {}, storage);
  const events = [];
  service.events$.subscribe((event) => events.push(event));

  const result = await service.sendFromAdmin('t1', 9, 'ตอบแล้ว', [], 'k-1');

  assert.equal(result.ticket_message_id, 42);
  assert.equal(saved, 0, 'ต้องไม่บันทึกข้อความซ้ำ');
  assert.equal(uploaded, 0);
  assert.equal(events.length, 0, 'ข้อความเดิมไม่ควรยิง event ซ้ำ');
});

test('attaching files stores them against the message and returns a protected download url', async () => {
  const ticket = { ticket_id: 't1', ticket_no: 'IT-1', status: TicketStatus.IN_PROGRESS, assignee_id: 9, user_id: null };
  const rows = [];
  const repo = {
    findTicket: async () => ticket,
    findAdmin: async () => ({ role: Role.ADMIN, full_name: 'แอดมิน' }),
    findByIdempotencyKey: async () => null,
    create: (data) => data,
    save: async (data) => ({ ...data, ticket_message_id: 7 }),
    saveAttachments: async (items) => {
      rows.push(...items);
      return items.map((item, index) => ({ ...item, ticket_attachment_id: 100 + index }));
    },
    findAttachmentsByMessageIds: async () => [],
  };
  const storage = {
    uploadTicketImage: async (file) => ({ file_name: `uuid-${file.originalname}`, public_url: `/api/uploads/${file.originalname}` }),
  };
  const service = new TicketChatService(repo, {}, {}, storage);

  const saved = await service.sendFromAdmin('t1', 9, 'แนบรูปมาด้วย', [
    { originalname: 'screen.png' },
    { originalname: 'error.jpg' },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].ticket_message_id, 7);
  assert.equal(rows[0].ticket_comment_id, null, 'ไฟล์ของข้อความต้องไม่ถูกผูกกับบันทึกภายใน');
  assert.deepEqual(saved.attachments.map((a) => a.original_name), ['screen.png', 'error.jpg']);
  assert.equal(saved.attachments[0].download_url, '/tickets/chat/attachments/100');
  assert.ok(!JSON.stringify(saved.attachments).includes('uuid-'), 'ต้องไม่ส่งชื่อไฟล์ภายในออกไป');
});

test('a reporter cannot download an attachment that belongs to an internal note', async () => {
  const service = new TicketChatService({
    findAttachment: async () => ({
      ticket_attachment_id: 5, ticket_id: 't1', ticket_message_id: null, ticket_comment_id: 3,
      file_name: 'secret.png', original_name: 'secret.png', file_path: '/p',
    }),
  }, {}, {}, {});

  await assert.rejects(() => service.readReporterAttachment(5, 1), { status: 403 });
});


test('a failing notification after a chat message neither rejects nor leaves an unhandled rejection', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const ticket = { ticket_id: 't', ticket_no: 'TK', user_id: 5, assignee_id: 9, status: TicketStatus.IN_PROGRESS };
    const repo = {
      findTicket: async () => ticket,
      findAdmin: async () => ({ role: Role.SUPER_ADMIN, full_name: 'แอดมิน' }),
      create: (d) => d,
      save: async (d) => ({ ...d, ticket_id: 't' }),
      updateFirstRespondedAt: async () => {},
      clearSlaDue: async () => {},
    };
    const failing = async () => { throw new Error('db down'); };
    const service = new TicketChatService(repo, { notifyAdmin: failing }, { notifyUser: failing });
    const logged = [];
    service.logger = { error: (msg) => logged.push(msg) };

    await service.sendFromUser('t', 5, 'สวัสดี');
    await service.sendFromAdmin('t', 9, 'ตอบกลับ');
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(unhandled.length, 0);
    assert.equal(logged.length, 2);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

// ------------------------------------------------------------ env example

test('.env.example contains no real-looking credentials and documents TZ', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
  assert.ok(!text.includes('01072569'));
  assert.ok(!/aunopsjp@gmail\.com/.test(text));
  assert.match(text, /^# TZ=Asia\/Bangkok$/m);
});

// ------------------------------------------------------------- Zod pipe

test('ZodValidationPipe validates the body but skips single query params (reporter chat regression)', () => {
  const { ZodValidationPipe } = require('../src/common/pipes/zod-validation.pipe.ts');
  const { sendTicketMessageSchema } = require('../shared/src/schemas/ticket.schema.ts');
  const { BadRequestException } = require('@nestjs/common');
  const pipe = new ZodValidationPipe(sendTicketMessageSchema);

  // body ถูกตรวจและ trim ตามสคีมา
  assert.deepEqual(pipe.transform({ message: '  สวัสดี  ' }, { type: 'body' }), { message: 'สวัสดี' });
  assert.throws(() => pipe.transform({ message: ' ' }, { type: 'body' }), BadRequestException);

  // ?line_id_token=... เป็นค่าเดี่ยว ต้องผ่านไปตามเดิม (เดิมถูกตรวจกับ schema ของข้อความแล้วได้ 400)
  assert.equal(pipe.transform('some-token-value', { type: 'query', data: 'line_id_token' }), 'some-token-value');
  // path param และ custom ก็ข้าม
  assert.equal(pipe.transform('uuid', { type: 'param', data: 'ticket_id' }), 'uuid');

  // @Query() ทั้งก้อนยังถูกตรวจ
  assert.throws(() => pipe.transform({ message: '' }, { type: 'query' }), BadRequestException);
});

// ------------------------------------------------- reporter tracking search

test('reporter ticket search joins the assignee so the page can show who is handling it', async () => {
  const { TicketsRepository } = require('../src/tickets/tickets.repository.ts');
  const joins = [];
  const chain = {
    leftJoinAndSelect(path, alias) { joins.push([path, alias]); return chain; },
    orderBy() { return chain; },
    limit() { return chain; },
    where() { return chain; },
    andWhere() { return chain; },
    getMany: async () => [],
  };
  const repo = new TicketsRepository({ createQueryBuilder: () => chain }, null, null);

  await repo.searchByUser(1, 'vpn');

  assert.deepEqual(joins, [['ticket.department', 'department'], ['ticket.assignee', 'assignee']]);
});

// ------------------------------------------------------------ reporter form

test('reporter form needs only a subject and a description', () => {
  const { createTicketSchema } = require('../shared/src/schemas/ticket.schema.ts');
  const parsed = createTicketSchema.parse({
    subject: '  เน็ตดับ  ',
    description: '  ใช้งานอินเทอร์เน็ตไม่ได้ตั้งแต่เช้า  ',
    line_id_token: 'x'.repeat(30),
    idempotency_key: '11111111-1111-4111-8111-111111111111',
  });

  assert.equal(parsed.subject, 'เน็ตดับ');
  assert.equal(parsed.description, 'ใช้งานอินเทอร์เน็ตไม่ได้ตั้งแต่เช้า');
  assert.equal(parsed.priority, undefined, 'ผู้แจ้งต้องไม่ตั้ง Priority เอง');
  assert.equal(parsed.department_id, undefined, 'ไม่บังคับเลือกแผนกก่อนพิมพ์');
  assert.equal(parsed.contact, undefined, 'ไม่บังคับช่องทางติดต่อกลับ');
});

test('reporter form rejects a request without a description', () => {
  const { createTicketSchema } = require('../shared/src/schemas/ticket.schema.ts');
  const required = {
    subject: 'เครื่องพิมพ์เสีย',
    line_id_token: 'x'.repeat(30),
    idempotency_key: '11111111-1111-4111-8111-111111111111',
  };

  assert.throws(() => createTicketSchema.parse(required));
  assert.throws(
    () => createTicketSchema.parse({ ...required, description: '   ' }),
    (error) => error.issues.some((issue) => issue.message.includes('รายละเอียด')),
  );
});

test('reporter form ignores any priority the client tries to set and still requires an idempotency key', () => {
  const { createTicketSchema } = require('../shared/src/schemas/ticket.schema.ts');
  const parsed = createTicketSchema.parse({
    subject: 'ระบบล่ม',
    description: 'เข้าใช้งานระบบไม่ได้ทั้งแผนก',
    priority: 'urgent',
    urgent_detail: 'กระทบงานลูกค้าทั้งหมด',
    impact_level: 'team',
    urgent_phone: '0812345678',
    line_id_token: 'x'.repeat(30),
    idempotency_key: '11111111-1111-4111-8111-111111111111',
  });

  assert.equal(parsed.priority, undefined);
  assert.equal(parsed.urgent_detail, undefined, 'ค่าเร่งด่วนเดิมต้องไม่ถูกใช้ตัดสิน SLA ของผู้แจ้ง');
  assert.throws(
    () => createTicketSchema.parse({ subject: 'ก', description: 'ข', line_id_token: 'x'.repeat(30) }),
    /idempotency|ส่งซ้ำ/i,
  );
});



/** เก็บ order clauses ที่ findAllForAdmin ส่งออกไป โดยไม่ต้องต่อ DB */
async function queueOrderSql(sort) {
  const { TicketsRepository } = require('../src/tickets/tickets.repository.ts');
  const parts = [];
  const chain = {
    leftJoin() { return chain; },
    leftJoinAndSelect() { return chain; },
    andWhere() { return chain; },
    distinct() { return chain; },
    skip() { return chain; },
    take() { return chain; },
    setParameter() { return chain; },
    addSelect(sql) { parts.push(sql); return chain; },
    orderBy(sql, dir, nulls) { parts.push(`ORDER:${sql}${nulls ? ':' + nulls : ''}`); return chain; },
    addOrderBy(sql, dir, nulls) { parts.push(`ORDER:${sql}${nulls ? ':' + nulls : ''}`); return chain; },
    getManyAndCount: async () => [[], 0],
  };
  const repo = new TicketsRepository({ createQueryBuilder: () => chain }, null, null);
  await repo.findAllForAdmin(1, { sort });
  return parts.join(' | ');
}

test('queue SLA sort puts breached tickets first and then the earliest open deadline', async () => {
  const sql = await queueOrderSql('sla');

  assert.ok(sql.includes('ORDER:ticket.sla_breached'), `คิวเริ่มต้นต้องเรียงจาก SLA: ${sql}`);
  assert.ok(sql.includes('ORDER:ticket.first_response_due_at'), 'ต้องใช้เป้าหมายตอบครั้งแรกจากนโยบาย');
  assert.ok(sql.includes('ORDER:ticket.resolve_due_at'), 'ต้องใช้เป้าหมายแก้ไขจากนโยบาย');
  assert.ok(sql.includes('NULLS LAST'), 'ตั๋วที่ไม่มีเป้าหมายค้างต้องอยู่ท้าย');
  assert.ok(!sql.includes('ticket_resolve_by'), 'ห้ามใช้ deadline เดิมจาก normal/urgent');
  assert.ok(!sql.includes('CASE'), 'TypeORM แปล CASE ใน orderBy ไม่ได้บน Postgres');
});

test('queue Priority sort follows the triage P1-P4 values instead of the legacy urgent flag', async () => {
  const sql = await queueOrderSql('priority');

  assert.ok(sql.includes('ticket_triage_priority'), `ต้องเรียงตาม P1-P4: ${sql}`);
  assert.ok(!sql.includes('ticket_priority'), 'ต้องไม่ใช้ค่า urgent/normal เดิมตัดสินลำดับคิว');
});
