require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { ForbiddenException, UnauthorizedException, ConflictException } = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');
const {
  phoneSchema,
  createAdminSchema,
  updateProfileSchema,
  changePasswordSchema,
} = require('../shared/src/schemas/ticket.schema.ts');
const { INITIAL_ADMINS } = require('../src/seed/initial-admins.ts');
const { Role } = require('../src/common/enums/role.enum.ts');
const { AdminsService } = require('../src/admin/admins.service.ts');
const { AllowPasswordChange } = require('../src/common/decorators/allow-password-change.decorator.ts');
const { JwtAuthGuard, PASSWORD_CHANGE_REQUIRED_MESSAGE } = require('../src/common/guards/jwt-auth.guard.ts');

// ------------------------------------------------------------------ schemas

test('phone schema accepts Thai mobile numbers with spaces or dashes and rejects others', () => {
  assert.equal(phoneSchema.parse('0924320342'), '0924320342');
  assert.equal(phoneSchema.parse(' 092-432-0342 '), '0924320342');
  for (const bad of ['', '924320342', '09243203421', '+66924320342', 'abcdefghij']) {
    assert.throws(() => phoneSchema.parse(bad), undefined, bad);
  }
});

test('createAdminSchema requires a phone and an 8+ character temporary password; email is optional', () => {
  const ok = createAdminSchema.parse({ full_name: 'สมชาย', phone: '0811111111', password: 'abcdefgh' });
  assert.equal(ok.phone, '0811111111');
  assert.equal(ok.email, undefined);
  assert.throws(() => createAdminSchema.parse({ full_name: 'x', password: 'abcdefgh' }));
  assert.throws(() => createAdminSchema.parse({ full_name: 'x', phone: '0811111111', password: 'short' }));
  assert.throws(() => createAdminSchema.parse({ full_name: 'x', phone: '0811111111', password: 'abcdefgh', email: 'bad' }));
  assert.equal(updateProfileSchema.parse({ full_name: 'x', phone: '081-111-1111' }).phone, '0811111111');
});

test('changePasswordSchema rejects short passwords and reusing the current one', () => {
  assert.ok(changePasswordSchema.parse({ current_password: '@dmin123456', new_password: 'NewPassw0rd!' }));
  assert.throws(() => changePasswordSchema.parse({ current_password: '@dmin123456', new_password: 'short' }));
  assert.throws(() => changePasswordSchema.parse({ current_password: '@dmin123456', new_password: '@dmin123456' }));
});

// ------------------------------------------------------------- initial file

test('initial admins file defines exactly the two super admins that the system expects', () => {
  assert.equal(INITIAL_ADMINS.length, 2);
  assert.deepEqual(INITIAL_ADMINS.map((a) => a.phone), ['0924320342', '0800907356']);
  for (const admin of INITIAL_ADMINS) {
    assert.equal(admin.role, Role.SUPER_ADMIN);
    assert.doesNotThrow(() => phoneSchema.parse(admin.phone));
    assert.ok(admin.full_name.trim().length > 0);
    // รหัสชั่วคราวต้องผ่านเกณฑ์ขั้นต่ำเดียวกับรหัสที่ผู้ดูแลตั้งให้
    assert.ok(admin.temporary_password.length >= 8);
  }
  assert.notEqual(INITIAL_ADMINS[0].phone, INITIAL_ADMINS[1].phone);
});

// ------------------------------------------------------------ guard behavior

function guardWith(user, handlerAllows) {
  const reflector = new Reflector();
  const guard = new JwtAuthGuard(reflector);
  // ข้ามขั้น passport (ตรวจ JWT) - ทดสอบเฉพาะกติกา must_change_password ที่เพิ่มเข้ามา
  Object.getPrototypeOf(JwtAuthGuard.prototype).canActivate = async () => true;
  const handler = () => undefined;
  if (handlerAllows) AllowPasswordChange()(null, null, { value: handler });
  if (handlerAllows) Reflect.defineMetadata('allowPasswordChange', true, handler);
  const context = {
    getHandler: () => handler,
    getClass: () => class Dummy {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
  return { guard, context };
}

test('JwtAuthGuard blocks users who must change their password from every other endpoint', async () => {
  const { guard, context } = guardWith({ admin_id: 1, must_change_password: true }, false);
  await assert.rejects(
    () => guard.canActivate(context),
    (err) => err instanceof ForbiddenException && err.message === PASSWORD_CHANGE_REQUIRED_MESSAGE,
  );
});

test('JwtAuthGuard lets them reach endpoints marked AllowPasswordChange, and lets normal users through', async () => {
  const forced = guardWith({ admin_id: 1, must_change_password: true }, true);
  assert.equal(await forced.guard.canActivate(forced.context), true);
  const normal = guardWith({ admin_id: 2, must_change_password: false }, false);
  assert.equal(await normal.guard.canActivate(normal.context), true);
});

// --------------------------------------------------------------- service

function makeAdminsService(overrides = {}) {
  const updates = [];
  const repo = {
    findByIdWithPassword: async () => ({ admin_id: 1, password: await bcrypt.hash('@dmin123456', 4) }),
    findById: async () => ({ admin_id: 1, must_change_password: false }),
    updateFields: async (id, fields) => { updates.push({ id, fields }); },
    findByPhone: async () => null,
    findByEmail: async () => null,
    create: (d) => d,
    save: async (d) => ({ admin_id: 9, ...d }),
    ...overrides,
  };
  return { service: new AdminsService(repo), updates };
}

test('changeOwnPassword verifies the current password, stores a new hash and clears the flag', async () => {
  const { service, updates } = makeAdminsService();
  await service.changeOwnPassword(1, '@dmin123456', 'NewPassw0rd!');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].fields.must_change_password, false);
  assert.ok(await bcrypt.compare('NewPassw0rd!', updates[0].fields.password));
});

test('changeOwnPassword rejects a wrong current password without writing anything', async () => {
  const { service, updates } = makeAdminsService();
  await assert.rejects(() => service.changeOwnPassword(1, 'wrong-password', 'NewPassw0rd!'), UnauthorizedException);
  assert.equal(updates.length, 0);
});

test('admins issued by a super admin start with a temporary password that must be changed', async () => {
  const { service } = makeAdminsService();
  const saved = await service.create({ full_name: 'สมชาย', phone: '0811111111', password: 'abcdefgh' }, Role.ADMIN);
  assert.equal(saved.must_change_password, true);
  assert.equal(saved.phone, '0811111111');
  assert.equal(saved.email, null);
  assert.notEqual(saved.password, 'abcdefgh');
});

test('creating an admin with a phone that already exists is a conflict', async () => {
  const { service } = makeAdminsService({ findByPhone: async () => ({ admin_id: 5 }) });
  await assert.rejects(
    () => service.create({ full_name: 'x', phone: '0811111111', password: 'abcdefgh' }),
    ConflictException,
  );
});

test('a password reset issued by a super admin forces the owner to change it again', async () => {
  const target = { admin_id: 7, role: Role.ADMIN, department_id: 2 };
  const { service, updates } = makeAdminsService({ findById: async () => target });
  const superAdmin = { admin_id: 1, role: Role.SUPER_ADMIN, department_id: null };
  await service.resetPassword(7, 'TempPassw0rd', superAdmin);
  assert.equal(updates[0].fields.must_change_password, true);
});

// ถดถอยที่เคยเกิดจริง: findAll เลือกคอลัมน์เองแบบ explicit จึงไม่ส่ง phone ให้หน้าจัดการบัญชี (เซลล์ว่างทั้งตาราง)
test('admin list query selects phone and must_change_password, never the password hash', async () => {
  const { AdminsRepository } = require('../src/admin/admins.repository.ts');
  let options;
  const repo = new AdminsRepository({ find: async (o) => { options = o; return []; } }, null);
  await repo.findAll();
  assert.ok(options.select.includes('phone'));
  assert.ok(options.select.includes('must_change_password'));
  assert.ok(!options.select.includes('password'));
});
