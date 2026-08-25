'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.updateProfileSchema =
  exports.resetPasswordSchema =
  exports.updateDepartmentSchema =
  exports.setActiveSchema =
  exports.createAdminSchema =
  exports.adminAccountListSchema =
  exports.adminAccountSchema =
  exports.roleSchema =
  exports.ROLE_VALUES =
    void 0;
const zod_1 = require('zod');
exports.ROLE_VALUES = ['admin', 'super_admin'];
exports.roleSchema = zod_1.z.enum(exports.ROLE_VALUES);
exports.adminAccountSchema = zod_1.z.object({
  admin_id: zod_1.z.number().int(),
  full_name: zod_1.z.string(),
  email: zod_1.z.string().email(),
  role: exports.roleSchema,
  is_active: zod_1.z.boolean(),
  department_id: zod_1.z.number().int().nullable(),
  created_at: zod_1.z.union([zod_1.z.date(), zod_1.z.string()]),
  updated_at: zod_1.z.union([zod_1.z.date(), zod_1.z.string()]).optional(),
});
exports.adminAccountListSchema = zod_1.z.array(exports.adminAccountSchema);
exports.createAdminSchema = zod_1.z.object({
  full_name: zod_1.z.string().trim().min(1, 'กรุณากรอกชื่อ-นามสกุล'),
  email: zod_1.z.string().trim().email('อีเมลไม่ถูกต้อง'),
  password: zod_1.z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'),
  department_id: zod_1.z.number().int().optional(),
});
exports.setActiveSchema = zod_1.z.object({
  is_active: zod_1.z.boolean(),
});
exports.updateDepartmentSchema = zod_1.z.object({
  department_id: zod_1.z.number().int().nullable().optional(),
});
exports.resetPasswordSchema = zod_1.z.object({
  new_password: zod_1.z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'),
});
exports.updateProfileSchema = zod_1.z.object({
  full_name: zod_1.z.string().trim().min(1, 'กรุณากรอกชื่อผู้ใช้'),
  email: zod_1.z.string().trim().email('อีเมลไม่ถูกต้อง'),
});
//# sourceMappingURL=user.schema.js.map
