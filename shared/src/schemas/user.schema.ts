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

/** ข้อมูลเต็มของบัญชีแอดมิน (ไม่มี password) ใช้ทั้งตอน login response และหน้าจัดการบัญชี */
export const adminAccountSchema = z.object({
  admin_id: z.number().int(),
  full_name: z.string(),
  email: z.string().email(),
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
  email: z.string().trim().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'),
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
  new_password: z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ใช้'),
  email: z.string().trim().email('อีเมลไม่ถูกต้อง'),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
