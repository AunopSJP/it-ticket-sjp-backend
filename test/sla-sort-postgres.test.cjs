require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Integration test กับ PostgreSQL จริง (บั๊ก orderBy/alias ของ TypeORM จะโผล่เฉพาะตอน execute)
 * ข้ามเมื่อไม่มี TEST_DATABASE_URL เพื่อให้ชุดเทสต์ปกติไม่ต้องพึ่ง Docker
 */
const url = process.env.TEST_DATABASE_URL;

test('sla sort executes on PostgreSQL and returns rows ordered by the soonest open target', { skip: !url && 'ไม่มี TEST_DATABASE_URL' }, async () => {
  const { DataSource } = require('typeorm');
  const { TicketTb } = require('../src/tickets/entities/ticket.entity.ts');
  const { TicketImageTb } = require('../src/tickets/entities/ticket-image.entity.ts');
  const { TicketHistoryTb } = require('../src/tickets/entities/ticket-history.entity.ts');
  const { TicketCommentTb } = require('../src/tickets/entities/ticket-comment.entity.ts');
  const { TicketAttachmentTb } = require('../src/tickets/entities/ticket-attachment.entity.ts');
  const { TicketMessageTb } = require('../src/tickets/entities/ticket-message.entity.ts');
  const { DepartmentTb } = require('../src/departments/department.entity.ts');
  const { AdminTb } = require('../src/admin/admin.entity.ts');
  const { UserTb } = require('../src/users/user.entity.ts');
  const { TicketsRepository } = require('../src/tickets/tickets.repository.ts');

  const ds = new DataSource({
    type: 'postgres',
    url,
    entities: [TicketTb, TicketImageTb, TicketHistoryTb, TicketCommentTb, TicketAttachmentTb,
      TicketMessageTb, DepartmentTb, AdminTb, UserTb],
    synchronize: false,
  });
  await ds.initialize();
  try {
    const rows = await ds.query(`
      WITH seed AS (
        INSERT INTO ticket_tb (ticket_no, ticket_reporter_name, ticket_reporter_contact, department_id,
          ticket_priority, ticket_triage_priority, ticket_subject, ticket_description, ticket_status,
          ticket_first_response_due_at, ticket_resolve_due_at, ticket_sla_breached)
        VALUES
          ('IT-SRT-3', 'x', 'x', 1, 'normal', 'p3', 'later',  'd', 'in_progress', now() + interval '3 hour', NULL, false),
          ('IT-SRT-1', 'x', 'x', 1, 'normal', 'p1', 'sooner', 'd', 'in_progress', now() + interval '1 hour', NULL, false),
          ('IT-SRT-2', 'x', 'x', 1, 'normal', 'p3', 'no target', 'd', 'in_progress', NULL, NULL, false)
        RETURNING ticket_id
      )
      SELECT count(*)::int AS created FROM seed
    `);

    const repo = new TicketsRepository(ds.getRepository(TicketTb), ds.getRepository(TicketImageTb), ds.getRepository(TicketCommentTb), ds.getRepository(TicketAttachmentTb));
    const page = await repo.findAllForAdmin(null, { keyword: 'IT-SRT', sort: 'sla' }, 1, 10);

    assert.equal(rows[0].created, 3);
    assert.deepEqual(page.items.map((item) => item.ticket_no), ['IT-SRT-1', 'IT-SRT-3', 'IT-SRT-2'],
      'ต้องเรียงตามกำหนดที่ใกล้ที่สุด แล้วตั๋วที่ไม่มีเป้าหมายค้างอยู่ท้าย');
  } finally {
    await ds.query("DELETE FROM ticket_tb WHERE ticket_no LIKE 'IT-SRT-%'");
    await ds.destroy();
  }
});
