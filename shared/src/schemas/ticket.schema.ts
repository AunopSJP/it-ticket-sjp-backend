import { z } from 'zod';

/**
 * Single Source of Truth สำหรับ "Ticket" ทั้งระบบ
 * ทั้ง backend (validation ที่ boundary ของ API) และ frontend (type ของ response/form)
 * ต้อง derive มาจากไฟล์นี้ไฟล์เดียว ห้ามประกาศ interface/DTO ซ้ำเอง
 *
 * เดิม type ของ "ticket" กระจายอยู่ 3 ที่: class-validator DTO (backend), TypeORM entity (backend),
 * และ interface เขียนมือ (frontend) - ทั้งสามชุดต้อง sync กันเองด้วยมือ ไฟล์นี้รวมให้เหลือที่เดียว
 *
 * หมายเหตุ: department/user schema (เดิมแยกไฟล์ department.schema.ts / user.schema.ts) ถูกรวมเข้ามา
 * ไว้ในไฟล์นี้โดยตรง (ไม่ import ข้ามไฟล์) เพราะ shared/package.json ชี้ main/types มาที่ไฟล์นี้ตรงๆ
 * (บายพาส index.ts barrel ที่ Vite resolve extension-less relative import ไม่ได้ - ดู package.json)
 * แต่ปัญหาเดียวกันเกิดซ้ำกับ relative import ข้ามไฟล์ "ภายใน" ไฟล์ entry point เองด้วย (Vite/Rollup
 * resolve './department.schema' แบบไม่มีนามสกุลไม่ได้ ต่างจาก backend ที่ผ่าน tsc ตรงๆ ได้ปกติ)
 * ทางแก้ที่เสถียรที่สุดคือไม่มี relative import ระหว่างไฟล์ schema เลย - รวมเป็นไฟล์เดียว
 */

// ==================== Department ====================

/** รหัสแผนกพิเศษที่ต้องอยู่ท้ายสุดของรายการเสมอ (ดู departments.repository.ts findAllActive()) */
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

// ==================== User (บัญชีแอดมิน) ====================

export const ROLE_VALUES = ['admin', 'super_admin'] as const;
export const roleSchema = z.enum(ROLE_VALUES);
export type Role = z.infer<typeof roleSchema>;

/** ข้อมูลเต็มของบัญชีแอดมิน (ไม่มี password) ใช้ทั้งตอน login response และหน้าจัดการบัญชี */
export const adminAccountSchema = z.object({
  admin_id: z.number().int(),
  full_name: z.string(),
  email: z.string().email(),
  role: roleSchema,
  is_active: z.boolean(),
  /** null = super admin (เห็น/จัดการตั๋วได้ทุกแผนก), ไม่ null = แอดมินแผนกนั้น */
  department_id: z.number().int().nullable(),
  created_at: z.union([z.date(), z.string()]),
  updated_at: z.union([z.date(), z.string()]).optional(),
});
export type AdminAccount = z.infer<typeof adminAccountSchema>;
export const adminAccountListSchema = z.array(adminAccountSchema);

export const createAdminSchema = z.object({
  full_name: z.string().trim().min(1, 'กรุณากรอกชื่อ-นามสกุล'),
  email: z.string().trim().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'),
  department_id: z.number().int().optional(),
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

// ==================== Ticket ====================

// ---------------- Enums ----------------

export const TICKET_STATUS_VALUES = [
  'open',
  'in_progress',
  'waiting',
  'forwarded',
  'pending_confirmation',
  'closed',
] as const;
export const ticketStatusSchema = z.enum(TICKET_STATUS_VALUES);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const TICKET_PRIORITY_VALUES = ['normal', 'urgent'] as const;
export const ticketPrioritySchema = z.enum(TICKET_PRIORITY_VALUES);
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;

export const TICKET_IMPACT_LEVEL_VALUES = [
  'individual',
  'team',
  'customer',
] as const;
export const ticketImpactLevelSchema = z.enum(TICKET_IMPACT_LEVEL_VALUES);
export type TicketImpactLevel = z.infer<typeof ticketImpactLevelSchema>;

/** ลำดับ workflow ของสถานะ (น้อย -> มาก = ต้นทาง -> ปลายทาง) ใช้ตอนกดหัวคอลัมน์ "สถานะ" เพื่อเรียง */
export const TICKET_STATUS_ORDER: Record<TicketStatus, number> = {
  open: 0,
  in_progress: 1,
  waiting: 2,
  forwarded: 3,
  pending_confirmation: 4,
  closed: 5,
};

export const STATUS_LABEL_TH: Record<TicketStatus, string> = {
  open: 'รอดำเนินการ',
  in_progress: 'กำลังดำเนินการ',
  waiting: 'รอแก้ไข',
  forwarded: 'ส่งต่อแล้ว',
  pending_confirmation: 'รอผู้แจ้งยืนยัน',
  closed: 'เสร็จสิ้น',
};

export const PRIORITY_LABEL_TH: Record<TicketPriority, string> = {
  normal: 'ปกติ',
  urgent: 'เร่งด่วน',
};

export const IMPACT_LEVEL_LABEL_TH: Record<TicketImpactLevel, string> = {
  individual: 'บุคคลเดียว',
  team: 'ทั้งแผนก / ทีม',
  customer: 'ลูกค้า / รายได้',
};

export const IMPACT_LEVEL_HINT_TH: Record<TicketImpactLevel, string> = {
  individual: 'กระทบแค่คุณคนเดียว',
  team: 'กระทบทั้งทีม/แผนก',
  customer: 'กระทบลูกค้า/งานภายนอกองค์กร',
};

// ---------------- Shared sub-shapes ----------------

/** ทั้ง backend (Date) และ frontend (ISO string) ใช้ ticket schema คนละ "โหมด" กัน
 *  เพราะ backend ส่ง Date object ในโค้ด แต่ข้าม HTTP JSON จะกลายเป็น string เสมอ
 *  ใช้ z.union รับได้ทั้งคู่ที่ boundary ฝั่ง frontend (คือจุดที่ต้อง parse จริง) */
const dateOrIsoString = z.union([z.date(), z.string()]);

/**
 * รูปย่อของ AdminAccount (@it-ticket/shared user.schema.ts) ที่ใช้แสดงผลใน ticket context เท่านั้น
 * (assignee / ผู้เปลี่ยนสถานะใน history) - pick มาจาก schema เต็มเพื่อไม่ให้ field ชื่อเดียวกันนิยามซ้ำ 2 ที่
 */
export const adminUserSchema = adminAccountSchema.pick({
  admin_id: true,
  full_name: true,
  department_id: true,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const ticketImageSchema = z.object({
  ticket_image_id: z.number().int(),
  file_name: z.string(),
  original_name: z.string(),
  file_path: z.string(),
  /** null/undefined = รูปที่ผู้แจ้งแนบตอนสร้างตั๋ว - มีค่า = รูปที่แอดมินแนบตอนดำเนินการ (ผูกกับ history แถวนั้น) */
  ticket_history_id: z.number().int().nullable().optional(),
  created_at: dateOrIsoString,
});
export type TicketImage = z.infer<typeof ticketImageSchema>;

export const ticketUserSchema = z.object({
  user_id: z.number().int(),
  line_user_id: z.string(),
  line_display_name: z.string().nullable(),
  line_picture_url: z.string().nullable(),
});
export type TicketUser = z.infer<typeof ticketUserSchema>;

export const ticketHistoryEntrySchema = z.object({
  ticket_history_id: z.number().int(),
  from_status: ticketStatusSchema,
  to_status: ticketStatusSchema,
  // .nullable().optional() เพราะ TypeORM relation ที่เป็น null ไม่ส่ง key มาเลย (ดูเหตุผลเต็มที่ user ใน ticketSchema)
  from_department: departmentSchema.nullable().optional(),
  to_department: departmentSchema.nullable().optional(),
  changed_by: adminUserSchema.nullable().optional(),
  note: z.string().nullable(),
  /** รูปประกอบที่แอดมินแนบตอนทำ action นี้ (ไม่บังคับ) - ว่างเปล่าสำหรับ history เก่าก่อนมีฟีเจอร์นี้ */
  images: z.array(ticketImageSchema).optional().default([]),
  created_at: dateOrIsoString,
});
export type TicketHistoryEntry = z.infer<typeof ticketHistoryEntrySchema>;

// ---------------- Ticket (full) ----------------

export const ticketSchema = z.object({
  ticket_id: z.string().uuid(),
  ticket_no: z.string(),
  full_name: z.string(),
  contact: z.string(),
  location: z.string().nullable(),
  department: departmentSchema,
  department_id: z.number().int(),
  priority: ticketPrioritySchema,
  urgent_detail: z.string().nullable(),
  impact_level: ticketImpactLevelSchema.nullable(),
  deadline_note: z.string().nullable(),
  deadline_date: dateOrIsoString.nullable(),
  urgent_phone: z.string().nullable(),
  selected_symptoms: z.array(z.string()),
  // .nullable().optional() แทน .nullable() เฉยๆ เพราะ TypeORM ไม่ส่ง key นี้มาเลยเมื่อ relation
  // เป็น null (ไม่ใช่ส่ง "user": null) - Zod เห็นเป็น undefined ซึ่ง .nullable() อย่างเดียวไม่ยอมรับ
  user: ticketUserSchema.nullable().optional(),
  subject: z.string(),
  description: z.string().nullable(),
  custom_department_note: z.string().nullable(),
  status: ticketStatusSchema,
  assignee: adminUserSchema.nullable().optional(),
  assignee_id: z.number().int().nullable(),
  resolution_note: z.string().nullable(),
  closed_at: dateOrIsoString.nullable(),
  assign_by: dateOrIsoString.nullable(),
  resolve_by: dateOrIsoString.nullable(),
  sla_breached: z.boolean(),
  resolved_at: dateOrIsoString.nullable(),
  confirmation_deadline: dateOrIsoString.nullable(),
  images: z.array(ticketImageSchema),
  history: z.array(ticketHistoryEntrySchema),
  created_at: dateOrIsoString,
  updated_at: dateOrIsoString,
  /** มีค่าเฉพาะตอนเป็นผลลัพธ์จากการ "ส่งฟอร์มแจ้งปัญหา" - true = เจอตั๋วเดิมที่ยังไม่ปิดอยู่แล้ว ไม่ได้สร้างใหม่ */
  is_duplicate: z.boolean().optional(),
});
export type Ticket = z.infer<typeof ticketSchema>;

/**
 * รายการตั๋วฝั่งแอดมิน (GET /tickets) - backend จงใจไม่ join images/history ในหน้ารายการ
 * (ดู comment ใน tickets.repository.ts: "ไม่ join 'images' - หน้า dashboard ไม่แสดงรูปในรายการ")
 * เปิดดูทีละใบผ่าน GET /tickets/:id (findByIdWithDetail) ถึงจะได้ images/history เต็มตาม ticketSchema
 * ต้องแยก schema นี้ออกจาก ticketSchema เพราะ response จริงของ endpoint list ไม่มี 2 field นี้
 */
export const ticketListItemSchema = ticketSchema.omit({
  images: true,
  history: true,
});
export type TicketListItem = z.infer<typeof ticketListItemSchema>;

/** ผลค้นหาสาธารณะ - full_name/contact/description/resolution_note เป็น null เสมอถ้าไม่ใช่ตั๋วของผู้ค้นเอง */
export const publicTicketResultSchema = z.object({
  ticket_id: z.string().uuid(),
  ticket_no: z.string(),
  full_name: z.string().nullable(),
  contact: z.string().nullable(),
  department: departmentSchema,
  custom_department_note: z.string().nullable().optional(),
  priority: ticketPrioritySchema,
  subject: z.string(),
  selected_symptoms: z.array(z.string()).default([]),
  description: z.string().nullable(),
  status: ticketStatusSchema,
  resolution_note: z.string().nullable(),
  created_at: dateOrIsoString,
  is_own_ticket: z.boolean().optional(),
  assignee_name: z.string().nullable(),
  has_assignee: z.boolean(),
  updated_at: dateOrIsoString,
});
export type PublicTicketResult = z.infer<typeof publicTicketResultSchema>;

export const myTicketSummarySchema = z.object({
  ticket_id: z.string().uuid(),
  ticket_no: z.string(),
  subject: z.string(),
  selected_symptoms: z.array(z.string()).default([]),
  status: ticketStatusSchema,
  department: departmentSchema,
  created_at: dateOrIsoString,
});
export type MyTicketSummary = z.infer<typeof myTicketSummarySchema>;

export const symptomSuggestionSchema = z.object({
  symptom_id: z.number().int(),
  department_id: z.number().int(),
  label: z.string(),
  is_manual: z.boolean(),
  hit_count: z.number().int(),
  last_seen_at: dateOrIsoString.nullable(),
});
export type SymptomSuggestion = z.infer<typeof symptomSuggestionSchema>;

// ---------------- Input schemas (ใช้ทั้งเป็น validation ที่ backend และ form type ที่ frontend) ----------------

/**
 * ส่งมาแบบ multipart/form-data (เพราะแนบไฟล์ได้) ทุก field จึงมาถึง backend เป็น string เสมอ
 * แม้แต่ enum และตัวเลข - preprocess คืนค่าที่ backend รับจริงจาก multer ก่อน parse
 */
export const createTicketSchema = z
  .object({
    full_name: z.string().trim().min(1, 'กรุณากรอกชื่อ-นามสกุลผู้แจ้ง'),
    department_id: z.coerce.number().int('กรุณาเลือกแผนก'),
    contact: z.string().trim().min(1, 'กรุณากรอกช่องทางติดต่อกลับ'),
    location: z.string().max(200, 'สถานที่ต้องไม่เกิน 200 ตัวอักษร').optional(),
    priority: ticketPrioritySchema,
    urgent_detail: z
      .string()
      .trim()
      .max(1000, 'เหตุผลที่เร่งด่วนต้องไม่เกิน 1000 ตัวอักษร')
      .optional(),
    impact_level: ticketImpactLevelSchema.optional(),
    deadline_note: z
      .string()
      .trim()
      .max(200, 'กรอบเวลาที่ต้องการต้องไม่เกิน 200 ตัวอักษร')
      .optional(),
    deadline_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่กำหนดต้องอยู่ในรูปแบบที่ถูกต้อง')
      .refine(
        (value) => value >= new Date().toISOString().slice(0, 10),
        'กำหนดวันย้อนหลังไม่ได้',
      )
      .optional(),
    urgent_phone: z
      .string()
      .trim()
      .max(50, 'เบอร์โทรศัพท์ต้องไม่เกิน 50 ตัวอักษร')
      .refine(
        (value) => value === '' || /^[+()\-\s\d]+$/.test(value),
        'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง',
      )
      .refine(
        (value) => value === '' || value.replace(/\D/g, '').length >= 9,
        'เบอร์โทรศัพท์ต้องมีตัวเลขอย่างน้อย 9 หลัก',
      )
      .refine(
        (value) => value === '' || value.replace(/\D/g, '').length <= 15,
        'เบอร์โทรศัพท์ต้องมีตัวเลขไม่เกิน 15 หลัก',
      )
      .optional(),
    subject: z
      .string()
      .trim()
      .min(1, 'กรุณากรอกหัวข้อรายการ')
      .max(300, 'หัวข้อรายการต้องไม่เกิน 300 ตัวอักษร'),
    // เดิมไม่มี MaxLength - คนที่ยิง API ตรงๆ ใส่ข้อความยาวแค่ไหนก็ได้ เสี่ยงฐานข้อมูลบวมจากตั๋วสแปม
    description: z
      .string()
      .max(2000, 'รายละเอียดปัญหาต้องไม่เกิน 2000 ตัวอักษร')
      .optional(),
    /** ระบุชื่อแผนกเอง - บังคับกรอกเฉพาะตอนเลือกแผนก "อื่นๆ" เท่านั้น (ตรวจซ้ำที่ service เพราะต้องรู้ department_code) */
    custom_department_note: z
      .string()
      .max(100, 'ชื่อแผนกที่ระบุต้องไม่เกิน 100 ตัวอักษร')
      .optional(),
    /** อาการที่พบบ่อยที่ติ๊กเลือก - multipart ส่งมาเป็น string เดี่ยวได้ถ้าเลือกแค่ 1 อัน จึงต้อง normalize เป็น array เสมอ */
    selected_symptoms: z.preprocess(
      (value) => (Array.isArray(value) ? value : value ? [value] : []),
      z
        .array(z.string().trim().min(1).max(80))
        .max(5, 'เลือกอาการที่พบบ่อยได้ไม่เกิน 5 ข้อ')
        .refine(
          (items) => new Set(items).size === items.length,
          'อาการที่เลือกต้องไม่ซ้ำกัน',
        ),
    ),
    /** ทุกตั๋วต้องผูกกับผู้แจ้งที่ LINE ยืนยันแล้ว ป้องกัน anonymous spam/สวมรอย */
    line_id_token: z
      .string()
      .trim()
      .min(20, 'กรุณาเข้าสู่ระบบ LINE ใหม่อีกครั้ง'),
    /** กันกดส่งฟอร์มซ้ำ (double-submit / network retry) และบังคับรูปแบบที่เดายาก */
    idempotency_key: z.string().uuid('รหัสป้องกันการส่งซ้ำไม่ถูกต้อง'),
  })
  .superRefine((data, ctx) => {
    // บังคับกรอกเฉพาะตอนเลือก "เร่งด่วน" (เทียบเท่า @ValidateIf เดิม)
    if (data.priority === 'urgent') {
      if (!data.urgent_detail || data.urgent_detail.trim().length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['urgent_detail'],
          message: 'กรุณาระบุเหตุผลที่เร่งด่วนอย่างน้อย 10 ตัวอักษร',
        });
      }
      if (!data.impact_level) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['impact_level'],
          message: 'กรุณาเลือกระดับผลกระทบจากปัญหานี้',
        });
      }
      if (!data.urgent_phone?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['urgent_phone'],
          message: 'กรุณากรอกเบอร์โทรศัพท์ที่ติดต่อได้ทันที',
        });
      }
    } else if (
      data.urgent_detail?.trim() ||
      data.impact_level ||
      data.deadline_note?.trim() ||
      data.deadline_date ||
      data.urgent_phone?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priority'],
        message: 'ข้อมูลเร่งด่วนใช้ได้เฉพาะตั๋วระดับเร่งด่วนเท่านั้น',
      });
    }
  });
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

/** Admin uses the same validated ticket fields but authenticates with JWT,
 * so LINE identity and client idempotency are not part of its DTO contract. */
/**
 * ใช้เฉพาะ endpoint ที่แอดมิน (login ด้วย JWT อยู่แล้ว) เป็นคนสร้างตั๋วแทนผู้แจ้งเอง
 * เช่น รับแจ้งทางโทรศัพท์/walk-in - ไม่มี LINE identity ให้ verify จึงตัด line_id_token/idempotency_key ออก
 * ผลคือตั๋วที่สร้างทางนี้จะมี user_id เป็น null เสมอ (ไม่ผูกกับผู้แจ้ง LINE คนไหน จึงไม่เข้า flow
 * เช็คตั๋วซ้ำ/แท็บติดตามสถานะ/ยืนยันปิดงานของผู้แจ้ง - แอดมินต้องเป็นคนปิดงานให้เองผ่านหน้า resolve ปกติ)
 * โครงสร้างฟิลด์อื่นทั้งหมดใช้ร่วมกับ createTicketSchema เพื่อไม่ให้ validation เพี้ยนไปจากฟอร์ม user
 */
export const adminCreateTicketSchema = createTicketSchema
  .innerType()
  .omit({
    line_id_token: true,
    idempotency_key: true,
  })
  .superRefine((data, ctx) => {
    if (data.priority === 'urgent') {
      if (!data.urgent_detail || data.urgent_detail.trim().length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['urgent_detail'],
          message: 'กรุณาระบุเหตุผลที่เร่งด่วนอย่างน้อย 10 ตัวอักษร',
        });
      }
      if (!data.impact_level) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['impact_level'],
          message: 'กรุณาเลือกระดับผลกระทบจากปัญหานี้',
        });
      }
      if (!data.urgent_phone?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['urgent_phone'],
          message: 'กรุณากรอกเบอร์โทรศัพท์ที่ติดต่อได้ทันที',
        });
      }
    } else if (
      data.urgent_detail?.trim() ||
      data.impact_level ||
      data.deadline_note?.trim() ||
      data.deadline_date ||
      data.urgent_phone?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priority'],
        message: 'ข้อมูลเร่งด่วนใช้ได้เฉพาะตั๋วระดับเร่งด่วนเท่านั้น',
      });
    }
  });
export type AdminCreateTicketInput = z.infer<typeof adminCreateTicketSchema>;

export const forwardTicketSchema = z.object({
  department_id: z.coerce.number().int('กรุณาเลือกแผนกปลายทาง'),
  note: z.string().max(1000, 'บันทึกต้องไม่เกิน 1000 ตัวอักษร').optional(),
});
export type ForwardTicketInput = z.infer<typeof forwardTicketSchema>;

export const resolveTicketSchema = z.object({
  resolution_note: z
    .string()
    .trim()
    .min(1, 'กรุณาบันทึกวิธีแก้ไขปัญหาก่อนปิดงาน')
    .max(2000, 'บันทึกวิธีแก้ไขต้องไม่เกิน 2000 ตัวอักษร'),
});
export type ResolveTicketInput = z.infer<typeof resolveTicketSchema>;

export const waitTicketSchema = z.object({
  note: z.string().max(1000, 'บันทึกต้องไม่เกิน 1000 ตัวอักษร').optional(),
});
export type WaitTicketInput = z.infer<typeof waitTicketSchema>;

export const confirmResolutionSchema = z.object({
  line_id_token: z
    .string()
    .trim()
    .min(1, 'ไม่พบ ID token จาก LINE กรุณาเข้าสู่ระบบใหม่'),
});
export type ConfirmResolutionInput = z.infer<typeof confirmResolutionSchema>;

export const createTicketCommentSchema = z.object({
  note: z.string().min(1).max(2000),
  is_internal: z.boolean().optional(),
});
export type CreateTicketCommentInput = z.infer<
  typeof createTicketCommentSchema
>;

// ---------------- Response array wrappers (ใช้ตอน validate ที่ boundary ฝั่ง frontend) ----------------

export const ticketListSchema = z.array(ticketListItemSchema);
export const publicTicketResultListSchema = z.array(publicTicketResultSchema);
export const myTicketSummaryListSchema = z.array(myTicketSummarySchema);

// ---------------- Auth and chat input schemas ----------------

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  full_name: z.string().trim().min(1, 'กรุณากรอกชื่อ-นามสกุล'),
  email: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'),
  department_id: z.coerce.number().int().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const sendTicketMessageSchema = z.object({
  message: z.string().trim().min(1, 'กรุณาพิมพ์ข้อความก่อนส่ง').max(2000),
});
export type SendTicketMessageInput = z.infer<typeof sendTicketMessageSchema>;
