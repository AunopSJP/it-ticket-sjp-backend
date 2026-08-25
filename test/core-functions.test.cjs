require('ts-node/register');
require('tsconfig-paths/register');

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException } = require('@nestjs/common');
const { TicketPriority } = require('../src/common/enums/ticket-priority.enum.ts');
const {
  addBusinessHours,
  computeSlaDeadlines,
} = require('../src/tickets/sla.util.ts');
const {
  detectImageTypeOrThrow,
  mimeFromExt,
} = require('../src/storage/storage.shared.ts');
const { errorCodeForStatus, sanitizeRequestPath } = require('../src/common/filters/api-exception.filter.ts');
const {
  loginSchema,
  registerSchema,
  sendTicketMessageSchema,
} = require('../shared/src/schemas/ticket.schema.ts');
const { getOrCreateRequestId } = require('../src/common/observability/request-id.ts');

test('addBusinessHours starts at working hours and skips weekends', () => {
  const beforeWork = new Date(2026, 7, 3, 7, 0); // Monday
  assert.deepEqual(addBusinessHours(beforeWork, 1), new Date(2026, 7, 3, 9, 30));

  const fridayAfternoon = new Date(2026, 7, 7, 16, 30);
  assert.deepEqual(addBusinessHours(fridayAfternoon, 2), new Date(2026, 7, 10, 9, 30));
});

test('computeSlaDeadlines applies urgent and normal SLA rules', () => {
  const createdAt = new Date(2026, 7, 3, 8, 30);
  const urgent = computeSlaDeadlines(TicketPriority.URGENT, createdAt);
  const normal = computeSlaDeadlines(TicketPriority.NORMAL, createdAt);

  assert.deepEqual(urgent.assign_by, new Date(2026, 7, 3, 9, 30));
  assert.deepEqual(urgent.resolve_by, new Date(2026, 7, 3, 12, 30));
  assert.deepEqual(normal.assign_by, new Date(2026, 7, 3, 12, 30));
  assert.deepEqual(normal.resolve_by, new Date(2026, 7, 5, 14, 30));
});

test('detectImageTypeOrThrow accepts supported magic bytes', () => {
  assert.deepEqual(detectImageTypeOrThrow(Buffer.from([0xff, 0xd8, 0xff, 0x00])), {
    ext: '.jpg',
    mime: 'image/jpeg',
  });
  assert.deepEqual(
    detectImageTypeOrThrow(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])),
    { ext: '.png', mime: 'image/png' },
  );
  assert.deepEqual(detectImageTypeOrThrow(Buffer.from('GIF89a!')), {
    ext: '.gif',
    mime: 'image/gif',
  });
  assert.deepEqual(detectImageTypeOrThrow(Buffer.from('RIFF0000WEBP!')), {
    ext: '.webp',
    mime: 'image/webp',
  });
});

test('detectImageTypeOrThrow rejects spoofed and unsupported files', () => {
  assert.throws(
    () => detectImageTypeOrThrow(Buffer.from('<svg><script/></svg>')),
    BadRequestException,
  );
  assert.throws(() => detectImageTypeOrThrow(Buffer.from('not an image')), BadRequestException);
});

test('mimeFromExt is case-insensitive and safely falls back', () => {
  assert.equal(mimeFromExt('.PNG'), 'image/png');
  assert.equal(mimeFromExt('.svg'), 'application/octet-stream');
});

test('errorCodeForStatus returns stable client-facing codes', () => {
  assert.equal(errorCodeForStatus(400), 'VALIDATION_ERROR');
  assert.equal(errorCodeForStatus(401), 'UNAUTHORIZED');
  assert.equal(errorCodeForStatus(404), 'NOT_FOUND');
  assert.equal(errorCodeForStatus(429), 'RATE_LIMITED');
  assert.equal(errorCodeForStatus(500), 'INTERNAL_ERROR');
});

test('sanitizeRequestPath removes bearer-like query tokens from logs and responses', () => {
  const safe = sanitizeRequestPath('/api/tickets/mine?line_id_token=secret-token&keyword=abc');
  assert.equal(safe, '/api/tickets/mine?line_id_token=%5BREDACTED%5D&keyword=abc');
  assert.equal(safe.includes('secret-token'), false);
  const camelCaseSafe = sanitizeRequestPath('/api/tickets/mine?lineIdToken=secret-token');
  assert.equal(camelCaseSafe, '/api/tickets/mine?lineIdToken=%5BREDACTED%5D');
});

test('shared auth schemas validate and normalize login input', () => {
  assert.deepEqual(loginSchema.parse({ email: ' Admin@Example.com ', password: 'secret' }), {
    email: 'admin@example.com',
    password: 'secret',
  });
  assert.throws(() => loginSchema.parse({ email: 'not-an-email', password: '' }));
});

test('shared register schema validates optional department input', () => {
  assert.deepEqual(registerSchema.parse({
    full_name: 'Admin',
    email: 'admin@example.com',
    password: 'secret',
    department_id: '2',
  }), {
    full_name: 'Admin',
    email: 'admin@example.com',
    password: 'secret',
    department_id: 2,
  });
  assert.throws(() => registerSchema.parse({ full_name: '', email: 'bad', password: '123' }));
});

test('shared ticket message schema trims and bounds chat messages', () => {
  assert.deepEqual(sendTicketMessageSchema.parse({ message: '  ขอความช่วยเหลือ  ' }), {
    message: 'ขอความช่วยเหลือ',
  });
  assert.throws(() => sendTicketMessageSchema.parse({ message: ' ' }));
  assert.throws(() => sendTicketMessageSchema.parse({ message: 'x'.repeat(2001) }));
});

test('request id utility preserves valid ids and replaces unsafe input', () => {
  const provided = '123e4567-e89b-12d3-a456-426614174000';
  assert.equal(getOrCreateRequestId(provided), provided);
  const generated = getOrCreateRequestId('not-a-request-id');
  assert.match(generated, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('database schema follows the current entity table and column contract', () => {
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  assert.match(schema, /CREATE TABLE "reporter_tb"/);
  assert.match(schema, /CREATE TABLE "ticket_tb"/);
  assert.match(schema, /"ticket_assignee_admin_id"/);
  assert.match(schema, /"ticket_created_at"/);
  assert.match(schema, /CREATE TABLE "reporter_notification_tb"/);
  assert.doesNotMatch(schema, /CREATE TABLE "user_tb"/);
  assert.doesNotMatch(schema, /"ticket_assign_admin_id"/);
  assert.doesNotMatch(schema, /"ticket_created_date"/);
});

test('database migration repairs legacy reporter table names', () => {
  const migrationPath = path.join(
    __dirname,
    '..',
    'database',
    'migrations',
    '006_restore_canonical_column_contract.sql',
  );
  const migration = fs.readFileSync(migrationPath, 'utf8');

  assert.match(migration, /ALTER TABLE "user_tb" RENAME TO "reporter_tb"/);
  assert.match(migration, /\('reporter_tb', 'user_line_user_id', 'reporter_line_user_id'\)/);
  assert.match(migration, /\('ticket_tb', 'user_id', 'reporter_id'\)/);
});
