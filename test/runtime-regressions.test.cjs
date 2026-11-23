require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');

/**
 * Regression guards สำหรับบั๊กที่เจอตอนรันกับ Postgres จริงเท่านั้น
 * (unit test ที่ mock query chain จับสองเรื่องนี้ไม่ได้)
 */

// ---------------------------------------------------------------- sort 'sla'

/** entity metadata บอกว่าคอลัมน์ที่อ้างถึงมีจริงไหม */
const TICKET_COLUMNS = new Set([
  'sla_breached', 'first_response_due_at', 'resolve_due_at', 'updated_at', 'created_at',
  'first_responded_at', 'resolved_at', 'status', 'triage_priority',
]);

async function slaOrderBys() {
  const { TicketsRepository } = require('../src/tickets/tickets.repository.ts');
  const orders = [];
  const chain = {
    leftJoin: () => chain, leftJoinAndSelect: () => chain, andWhere: () => chain,
    distinct: () => chain, skip: () => chain, take: () => chain, setParameter: () => chain,
    addSelect: () => chain,
    orderBy(sql, dir, nulls) { orders.push({ sql, dir, nulls }); return chain; },
    addOrderBy(sql, dir, nulls) { orders.push({ sql, dir, nulls }); return chain; },
    getManyAndCount: async () => [[], 0],
  };
  const repo = new TicketsRepository({ createQueryBuilder: () => chain }, null, null);
  await repo.findAllForAdmin(null, { sort: 'sla' });
  return orders;
}

test('sla sort only orders by real ticket columns (TypeORM cannot resolve CASE/LEAST in orderBy)', async () => {
  const orders = await slaOrderBys();

  assert.ok(orders.length >= 3, `ต้องมีหลายคีย์เรียง แต่ได้ ${orders.length}`);
  for (const { sql } of orders) {
    assert.ok(!/CASE|LEAST|COALESCE|\(/i.test(sql), `orderBy ต้องเป็นคอลัมน์เดี่ยว ไม่ใช่ expression: ${sql}`);
    const column = sql.replace(/^ticket\./, '');
    assert.ok(TICKET_COLUMNS.has(column), `ไม่รู้จักคอลัมน์ ${sql}`);
  }
  const columns = orders.map((order) => order.sql);
  assert.deepEqual(columns.slice(0, 3), [
    'ticket.sla_breached',
    'ticket.first_response_due_at',
    'ticket.resolve_due_at',
  ]);
  assert.ok(orders.some((order) => order.nulls === 'NULLS LAST'), 'เป้าหมายที่ไม่เหลือต้องไปท้าย');
});

test('sla sort never falls back to the legacy normal/urgent deadlines', async () => {
  const sql = (await slaOrderBys()).map((order) => order.sql).join(' ');
  assert.ok(!sql.includes('resolve_by'));
  assert.ok(!sql.includes('assign_by'));
});

// ---------------------------------------------------------------- module wiring

test('TicketsModule exports TicketsService so TicketChatModule can resolve it', () => {
  const { TicketsModule } = require('../src/tickets/tickets.module.ts');
  const { TicketsService } = require('../src/tickets/tickets.service.ts');
  const exportsList = Reflect.getMetadata('exports', TicketsModule) ?? [];
  assert.ok(
    exportsList.includes(TicketsService),
    'ถ้า export หาย backend จะสตาร์ทไม่ขึ้น (Nest can\'t resolve dependencies of TicketChatService)',
  );
});

test('TicketChatModule imports the module that provides TicketsService', () => {
  const { TicketChatModule } = require('../src/ticket-chat/ticket-chat.module.ts');
  const { TicketsModule } = require('../src/tickets/tickets.module.ts');
  const imports = Reflect.getMetadata('imports', TicketChatModule) ?? [];
  assert.ok(
    imports.includes(TicketsModule),
    'TicketChatService ต้องได้ TicketsService ผ่านการ import TicketsModule',
  );
});

test('TicketChatService declares TicketsService as a constructor dependency', () => {
  const { TicketChatService } = require('../src/ticket-chat/ticket-chat.service.ts');
  const paramTypes = Reflect.getMetadata('design:paramtypes', TicketChatService) ?? [];
  const { TicketsService } = require('../src/tickets/tickets.service.ts');
  assert.ok(
    paramTypes.includes(TicketsService),
    'ต้องมี TicketsService ใน constructor เพื่อใช้ auto-resume/ส่งและแก้ไขแล้ว',
  );
});
