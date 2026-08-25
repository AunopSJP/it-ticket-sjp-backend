require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ticketAccessForAdmin,
  assertTicketManageableByAdmin,
  assertTicketImageReadableByAdmin,
} = require('../src/tickets/ticket-access.policy.ts');
const { Role } = require('../src/common/enums/role.enum.ts');

const ticket = (overrides = {}) => ({
  ticket_id: 't-1', department_id: 2, assignee_id: 7, history: [], ...overrides,
});
const admin = (overrides = {}) => ({ admin_id: 10, department_id: 2, role: Role.ADMIN, ...overrides });

test('current department admin can manage and view images', () => {
  const user = admin();
  assert.equal(ticketAccessForAdmin(ticket({ assignee_id: 99 }), user), 'full');
  assert.doesNotThrow(() => assertTicketManageableByAdmin(ticket({ assignee_id: 99 }), user));
  assert.doesNotThrow(() => assertTicketImageReadableByAdmin(ticket({ assignee_id: 99 }), user));
});

test('origin department admin can read but cannot manage or view images', () => {
  const user = admin({ department_id: 1 });
  const value = ticket({ assignee_id: 99, history: [{ from_department_id: 1, to_department_id: 2 }] });
  assert.equal(ticketAccessForAdmin(value, user), 'origin-read');
  assert.throws(() => assertTicketManageableByAdmin(value, user));
  assert.throws(() => assertTicketImageReadableByAdmin(value, user));
});

test('unrelated department is denied and super admin has full access', () => {
  const value = ticket({ assignee_id: 99 });
  assert.equal(ticketAccessForAdmin(value, admin({ department_id: 3 })), 'denied');
  assert.equal(ticketAccessForAdmin(value, admin({ department_id: null, role: Role.SUPER_ADMIN })), 'full');
});
