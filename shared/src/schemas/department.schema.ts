import { z } from 'zod';

/**
 * Single Source of Truth สำหรับ "Department" ทั้งระบบ
 * เดิม shape นี้กระจายอยู่ 3 ที่: backend entity, frontend Department interface,
 * และ departmentSchema ที่ประกาศซ้ำ (แคบกว่า) อยู่ใน ticket.schema.ts - รวมมาไว้ที่เดียวที่นี่
 */

/** รหัสแผนกพิเศษที่ต้องอยู่ท้ายสุดของรายการเสมอ (ดู departments.service.ts findAll()) */
export const OTHER_DEPARTMENT_CODE = 'other';

export const departmentSchema = z.object({
  department_id: z.number().int(),
  department_code: z.string(),
  department_name_en: z.string(),
  department_name_th: z.string(),
  is_active: z.boolean(),
});
export type Department = z.infer<typeof departmentSchema>;

export const departmentListSchema = z.array(departmentSchema);
