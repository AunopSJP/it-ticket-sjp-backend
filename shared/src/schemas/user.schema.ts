import { z } from 'zod';

/**
 * Single Source of Truth สำหรับ "User" (บัญชีแอดมิน) ทั้งระบบ
 * เดิม shape นี้กระจายอยู่หลายที่: backend entity, RegisterDto + 4 DTO ประกาศแยกใน users.controller.ts,
 * frontend AdminUser/AdminAccount (hardcode role: 'admin' เป็น literal เอง ไม่ import จาก Role enum),
 * และ adminUserSchema แบบย่อใน ticket.schema.ts - รวม SSOT มาไว้ที่เดียวที่นี่
 */

export const ROLE_VALUES = ['admin', 'head_admin', 'super_admin'] as const;
export const roleSchema = z.enum(ROLE_VALUES);
export type Role = z.infer<typeof roleSchema>;

/**
 * เบอร์โทรศัพท์มือถือไทย 10 หลักขึ้นต้น 0 - ใช้เป็นชื่อผู้ใช้ตอน login
 * ตัดช่องว่างและขีดทิ้งก่อนตรวจ (ผู้ใช้พิมพ์ 092-432-0342 ก็ได้)
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^0\d{9}$/, 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0'));

/** ข้อมูลเต็มของบัญชีแอดมิน (ไม่มี password) ใช้ทั้งตอน login response และหน้าจัดการบัญชี */
export const adminAccountSchema = z.object({
  admin_id: z.number().int(),
  full_name: z.string(),
  /** เบอร์โทรคือชื่อผู้ใช้ - บัญชีเก่าก่อนเปลี่ยนระบบอาจยังไม่มี */
  phone: z.string().nullable().optional(),
  /** อีเมลเป็นข้อมูลเสริม ไม่ใช้ login แล้ว */
  email: z.string().email().nullable().optional(),
  /** true = ต้องเปลี่ยนรหัสผ่านก่อนใช้งานส่วนอื่นของระบบ */
  must_change_password: z.boolean().optional(),
  role: roleSchema,
  is_active: z.boolean(),
  /** super admin ต้องไม่มี department_id; head/admin ต้องผูกกับแผนก */
  department_id: z.number().int().nullable(),
  created_at: z.union([z.date(), z.string()]),
  updated_at: z.union([z.date(), z.string()]).optional(),
});
export type AdminAccount = z.infer<typeof adminAccountSchema>;
export const adminAccountListSchema = z.array(adminAccountSchema);

// ---------------- Input schemas (validation ที่ backend + form type ที่ frontend) ----------------

export const createAdminSchema = z.object({
  full_name: z.string().trim().min(1, 'กรุณากรอกชื่อ-นามสกุล'),
  phone: phoneSchema,
  email: z.string().trim().email('อีเมลไม่ถูกต้อง').nullish(),
  /** รหัสผ่านชั่วคราว - ผู้ใช้ถูกบังคับให้เปลี่ยนตอน login ครั้งแรก */
  password: z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'),
  department_id: z.number().int().optional(),
  role: roleSchema.default('admin'),
});
export type CreateAdminInput = z.infer<typeof createAdminSchema>;

export const setActiveSchema = z.object({
  is_active: z.boolean(),
});
export type SetActiveInput = z.infer<typeof setActiveSchema>;

export const updateDepartmentSchema = z.object({
  /** null = ปลดเป็น super admin (เห็นทุกแผนก) */
  department_id: z.number().int().nullable().optional(),
});
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const resetPasswordSchema = z.object({
  new_password: z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** เปลี่ยนรหัสผ่านของตัวเอง (บังคับตอน login ครั้งแรก) - ต้องยืนยันรหัสเดิมและรหัสใหม่ต้องไม่ซ้ำเดิม */
export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'กรุณากรอกรหัสผ่านปัจจุบัน'),
    new_password: z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'),
  })
  .refine((value) => value.new_password !== value.current_password, {
    message: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม',
    path: ['new_password'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ใช้'),
  phone: phoneSchema,
  email: z.string().trim().email('อีเมลไม่ถูกต้อง').nullish(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
