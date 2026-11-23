require('ts-node/register');
require('tsconfig-paths/register');

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PRIMARY_STATUS_VALUES,
  PRIMARY_STATUS_LABEL_TH,
  STATUS_SECONDARY_LABEL_TH,
  TICKET_STATUS_TRANSITIONS,
  TICKET_STATUS_VALUES,
  canTransition,
  primaryStatusOf,
} = require('../shared/src/schemas/ticket.schema.ts');

/**
 * สเปก 2.2: ผู้ใช้เห็น 4 สถานะหลักเท่านั้น สถานะภายในที่เหลือต้องถูกแมปและมี transition ที่ชัด
 */

test('four primary statuses with the spec wording', () => {
  assert.deepEqual([...PRIMARY_STATUS_VALUES], ['open', 'in_progress', 'waiting', 'resolved']);
  assert.deepEqual(PRIMARY_STATUS_LABEL_TH, {
    open: 'ใหม่',
    in_progress: 'กำลังดำเนินการ',
    waiting: 'รอข้อมูลผู้แจ้ง',
    resolved: 'แก้ไขแล้ว',
  });
});

test('every internal status maps to exactly one primary status', () => {
  const expected = {
    open: 'open',
    in_progress: 'in_progress',
    forwarded: 'in_progress',
    waiting: 'waiting',
    pending_confirmation: 'resolved',
    closed: 'resolved',
  };
  for (const status of TICKET_STATUS_VALUES) {
    assert.equal(primaryStatusOf(status), expected[status], `${status} ต้องแมปเป็น ${expected[status]}`);
    assert.ok(PRIMARY_STATUS_VALUES.includes(primaryStatusOf(status)), `${status} แมปออกนอก 4 สถานะหลัก`);
  }
});

test('non-primary internal statuses are shown as secondary badges instead of extra states', () => {
  assert.deepEqual(Object.keys(STATUS_SECONDARY_LABEL_TH).sort(), ['closed', 'forwarded']);
  for (const status of Object.keys(STATUS_SECONDARY_LABEL_TH)) {
    assert.ok(!PRIMARY_STATUS_VALUES.includes(status), `${status} ต้องไม่เป็นสถานะหลัก`);
  }
});

test('the transition table covers the spec 2.2 flow and is closed at the end', () => {
  assert.ok(canTransition('open', 'in_progress'), 'รับเคส: ใหม่ → กำลังดำเนินการ');
  assert.ok(canTransition('in_progress', 'waiting'), 'รอข้อมูล: กำลังดำเนินการ → รอข้อมูลผู้แจ้ง');
  assert.ok(canTransition('waiting', 'in_progress'), 'ผู้แจ้งตอบ: รอข้อมูลผู้แจ้ง → กำลังดำเนินการ');
  assert.ok(canTransition('in_progress', 'pending_confirmation'), 'แก้ไขแล้ว: กำลังดำเนินการ → แก้ไขแล้ว');
  assert.ok(canTransition('pending_confirmation', 'in_progress'), 'เปิดใหม่: แก้ไขแล้ว → กำลังดำเนินการ');
  assert.ok(canTransition('pending_confirmation', 'closed'), 'ยืนยัน/ปิดอัตโนมัติ: แก้ไขแล้ว → ปิดงาน');
  assert.deepEqual([...TICKET_STATUS_TRANSITIONS.closed], [], 'ตั๋วที่ปิดแล้วต้องไม่ออกได้');
});

test('transitions that must not exist are rejected', () => {
  assert.equal(canTransition('closed', 'in_progress'), false);
  assert.equal(canTransition('closed', 'waiting'), false);
  assert.equal(canTransition('open', 'open'), false, 'สร้างตั๋วแล้วต้องไม่คงสถานะเดิมซ้ำ');
  assert.equal(canTransition('waiting', 'waiting'), false);
});

test('every transition target in the table is a known status', () => {
  for (const [from, targets] of Object.entries(TICKET_STATUS_TRANSITIONS)) {
    assert.ok(TICKET_STATUS_VALUES.includes(from), `สถานะต้นทางไม่รู้จัก: ${from}`);
    for (const to of targets) {
      assert.ok(TICKET_STATUS_VALUES.includes(to), `${from} → ${to} ปลายทางไม่รู้จัก`);
    }
  }
});

test('every status the service writes exists in the transition table as a legal target', () => {
  const service = fs.readFileSync(path.join(__dirname, '..', 'src', 'tickets', 'tickets.service.ts'), 'utf8');
  const targets = [...service.matchAll(/to_status:\s*TicketStatus\.([A-Z_]+)/g)]
    .map((match) => match[1].toLowerCase());
  const legal = new Set(Object.values(TICKET_STATUS_TRANSITIONS).flat());
  // 'open' ที่ service เขียนคือแถว history แรกตอนสร้างตั๋ว (open → open) ไม่ใช่ transition
  const realTransitions = targets.filter((target) => target !== 'open');

  assert.ok(realTransitions.length >= 5, `พบ transition ${realTransitions.length} จุด`);
  for (const target of realTransitions) {
    assert.ok(legal.has(target), `to_status ${target} ต้องเป็นปลายทางที่ตารางอนุญาต`);
  }
});

test('the API exposes primary_status so the UI never has to know the internal six', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'shared', 'src', 'schemas', 'ticket.schema.ts'), 'utf8');
  assert.ok(schema.includes('primary_status: primaryStatusSchema.optional()'));

  const service = fs.readFileSync(path.join(__dirname, '..', 'src', 'tickets', 'tickets.service.ts'), 'utf8');
  assert.ok(service.includes('primaryStatusOf(ticket.status)'), 'service ต้องแนบ primary_status กับทุก response');
});

test('every ticket the service returns carries first_response/resolve/primary_status', () => {
  const service = fs.readFileSync(path.join(__dirname, '..', 'src', 'tickets', 'tickets.service.ts'), 'utf8');
  // regression: create/wait/resolve/forward/assign/reopen/confirm คืน entity ดิบ ทำให้ primary_status ว่าง
  // หลังกดเปลี่ยนสถานะ (เจอจากการรัน UI จริง) - ทุกจุดที่คืน ticket ต้องผ่าน withFirstResponse
  const lines = service.split('\n');
  const unwrapped = [];
  lines.forEach((line, index) => {
    if (!/return this\.findByIdInternal\(/.test(line)) return;
    const nearby = lines.slice(index, index + 10).join('\n');
    if (!nearby.includes('withFirstResponse')) unwrapped.push(index + 1);
  });
  assert.deepEqual(unwrapped, [], `คืน ticket ดิบโดยไม่ผ่าน withFirstResponse ที่บรรทัด: ${unwrapped.join(', ')}`);

  const wrapped = [...service.matchAll(/this\.withFirstResponse\(/g)].length;
  assert.ok(wrapped >= 8, `ต้องแนบข้อมูล SLA/สถานะหลักอย่างน้อย 8 จุด (พบ ${wrapped})`);
});
