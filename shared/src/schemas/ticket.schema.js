'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.myTicketSummaryListSchema =
  exports.publicTicketResultListSchema =
  exports.ticketListSchema =
  exports.createTicketCommentSchema =
  exports.confirmResolutionSchema =
  exports.waitTicketSchema =
  exports.resolveTicketSchema =
  exports.forwardTicketSchema =
  exports.adminCreateTicketSchema =
  exports.createTicketSchema =
  exports.symptomSuggestionSchema =
  exports.myTicketSummarySchema =
  exports.publicTicketResultSchema =
  exports.ticketListItemSchema =
  exports.ticketSchema =
  exports.ticketHistoryEntrySchema =
  exports.ticketUserSchema =
  exports.ticketImageSchema =
  exports.adminUserSchema =
  exports.IMPACT_LEVEL_HINT_TH =
  exports.IMPACT_LEVEL_LABEL_TH =
  exports.PRIORITY_LABEL_TH =
  exports.STATUS_LABEL_TH =
  exports.TICKET_STATUS_ORDER =
  exports.ticketImpactLevelSchema =
  exports.TICKET_IMPACT_LEVEL_VALUES =
  exports.ticketPrioritySchema =
  exports.TICKET_PRIORITY_VALUES =
  exports.ticketStatusSchema =
  exports.TICKET_STATUS_VALUES =
  exports.updateProfileSchema =
  exports.resetPasswordSchema =
  exports.updateDepartmentSchema =
  exports.setActiveSchema =
  exports.createAdminSchema =
  exports.adminAccountListSchema =
  exports.adminAccountSchema =
  exports.roleSchema =
  exports.ROLE_VALUES =
  exports.departmentListSchema =
  exports.departmentSchema =
  exports.OTHER_DEPARTMENT_CODE =
    void 0;
const zod_1 = require('zod');
exports.OTHER_DEPARTMENT_CODE = 'other';
exports.departmentSchema = zod_1.z.object({
  department_id: zod_1.z.number().int(),
  department_code: zod_1.z.string(),
  department_name_en: zod_1.z.string(),
  department_name_th: zod_1.z.string(),
  is_active: zod_1.z.boolean(),
});
exports.departmentListSchema = zod_1.z.array(exports.departmentSchema);
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
exports.TICKET_STATUS_VALUES = [
  'open',
  'in_progress',
  'waiting',
  'forwarded',
  'pending_confirmation',
  'closed',
];
exports.ticketStatusSchema = zod_1.z.enum(exports.TICKET_STATUS_VALUES);
exports.TICKET_PRIORITY_VALUES = ['normal', 'urgent'];
exports.ticketPrioritySchema = zod_1.z.enum(exports.TICKET_PRIORITY_VALUES);
exports.TICKET_IMPACT_LEVEL_VALUES = ['individual', 'team', 'customer'];
exports.ticketImpactLevelSchema = zod_1.z.enum(
  exports.TICKET_IMPACT_LEVEL_VALUES,
);
exports.TICKET_STATUS_ORDER = {
  open: 0,
  in_progress: 1,
  waiting: 2,
  forwarded: 3,
  pending_confirmation: 4,
  closed: 5,
};
exports.STATUS_LABEL_TH = {
  open: 'รอดำเนินการ',
  in_progress: 'กำลังดำเนินการ',
  waiting: 'รอแก้ไข',
  forwarded: 'ส่งต่อแล้ว',
  pending_confirmation: 'รอผู้แจ้งยืนยัน',
  closed: 'เสร็จสิ้น',
};
exports.PRIORITY_LABEL_TH = {
  normal: 'ปกติ',
  urgent: 'เร่งด่วน',
};
exports.IMPACT_LEVEL_LABEL_TH = {
  individual: 'บุคคลเดียว',
  team: 'ทั้งแผนก / ทีม',
  customer: 'ลูกค้า / รายได้',
};
exports.IMPACT_LEVEL_HINT_TH = {
  individual: 'กระทบแค่คุณคนเดียว',
  team: 'กระทบทั้งทีม/แผนก',
  customer: 'กระทบลูกค้า/งานภายนอกองค์กร',
};
const dateOrIsoString = zod_1.z.union([zod_1.z.date(), zod_1.z.string()]);
exports.adminUserSchema = exports.adminAccountSchema.pick({
  admin_id: true,
  full_name: true,
  department_id: true,
});
exports.ticketImageSchema = zod_1.z.object({
  ticket_image_id: zod_1.z.number().int(),
  file_name: zod_1.z.string(),
  original_name: zod_1.z.string(),
  file_path: zod_1.z.string(),
  ticket_history_id: zod_1.z.number().int().nullable().optional(),
  created_at: dateOrIsoString,
});
exports.ticketUserSchema = zod_1.z.object({
  user_id: zod_1.z.number().int(),
  line_user_id: zod_1.z.string(),
  line_display_name: zod_1.z.string().nullable(),
  line_picture_url: zod_1.z.string().nullable(),
});
exports.ticketHistoryEntrySchema = zod_1.z.object({
  ticket_history_id: zod_1.z.number().int(),
  from_status: exports.ticketStatusSchema,
  to_status: exports.ticketStatusSchema,
  from_department: exports.departmentSchema.nullable().optional(),
  to_department: exports.departmentSchema.nullable().optional(),
  changed_by: exports.adminUserSchema.nullable().optional(),
  note: zod_1.z.string().nullable(),
  images: zod_1.z.array(exports.ticketImageSchema).optional().default([]),
  created_at: dateOrIsoString,
});
exports.ticketSchema = zod_1.z.object({
  ticket_id: zod_1.z.string().uuid(),
  ticket_no: zod_1.z.string(),
  full_name: zod_1.z.string(),
  contact: zod_1.z.string(),
  location: zod_1.z.string().nullable(),
  department: exports.departmentSchema,
  department_id: zod_1.z.number().int(),
  priority: exports.ticketPrioritySchema,
  urgent_detail: zod_1.z.string().nullable(),
  impact_level: exports.ticketImpactLevelSchema.nullable(),
  deadline_note: zod_1.z.string().nullable(),
  deadline_date: dateOrIsoString.nullable(),
  urgent_phone: zod_1.z.string().nullable(),
  selected_symptoms: zod_1.z.array(zod_1.z.string()),
  user: exports.ticketUserSchema.nullable().optional(),
  subject: zod_1.z.string(),
  description: zod_1.z.string().nullable(),
  custom_department_note: zod_1.z.string().nullable(),
  status: exports.ticketStatusSchema,
  assignee: exports.adminUserSchema.nullable().optional(),
  assignee_id: zod_1.z.number().int().nullable(),
  resolution_note: zod_1.z.string().nullable(),
  closed_at: dateOrIsoString.nullable(),
  assign_by: dateOrIsoString.nullable(),
  resolve_by: dateOrIsoString.nullable(),
  sla_breached: zod_1.z.boolean(),
  resolved_at: dateOrIsoString.nullable(),
  confirmation_deadline: dateOrIsoString.nullable(),
  images: zod_1.z.array(exports.ticketImageSchema),
  history: zod_1.z.array(exports.ticketHistoryEntrySchema),
  created_at: dateOrIsoString,
  updated_at: dateOrIsoString,
  is_duplicate: zod_1.z.boolean().optional(),
});
exports.ticketListItemSchema = exports.ticketSchema.omit({
  images: true,
  history: true,
});
exports.publicTicketResultSchema = zod_1.z.object({
  ticket_id: zod_1.z.string().uuid(),
  ticket_no: zod_1.z.string(),
  full_name: zod_1.z.string().nullable(),
  contact: zod_1.z.string().nullable(),
  department: exports.departmentSchema,
  custom_department_note: zod_1.z.string().nullable().optional(),
  priority: exports.ticketPrioritySchema,
  subject: zod_1.z.string(),
  selected_symptoms: zod_1.z.array(zod_1.z.string()).default([]),
  description: zod_1.z.string().nullable(),
  status: exports.ticketStatusSchema,
  resolution_note: zod_1.z.string().nullable(),
  created_at: dateOrIsoString,
  is_own_ticket: zod_1.z.boolean().optional(),
  assignee_name: zod_1.z.string().nullable(),
  has_assignee: zod_1.z.boolean(),
  updated_at: dateOrIsoString,
});
exports.myTicketSummarySchema = zod_1.z.object({
  ticket_id: zod_1.z.string().uuid(),
  ticket_no: zod_1.z.string(),
  subject: zod_1.z.string(),
  selected_symptoms: zod_1.z.array(zod_1.z.string()).default([]),
  status: exports.ticketStatusSchema,
  department: exports.departmentSchema,
  created_at: dateOrIsoString,
});
exports.symptomSuggestionSchema = zod_1.z.object({
  symptom_id: zod_1.z.number().int(),
  department_id: zod_1.z.number().int(),
  label: zod_1.z.string(),
  is_manual: zod_1.z.boolean(),
  hit_count: zod_1.z.number().int(),
  last_seen_at: dateOrIsoString.nullable(),
});
exports.createTicketSchema = zod_1.z
  .object({
    full_name: zod_1.z.string().trim().min(1, 'กรุณากรอกชื่อ-นามสกุลผู้แจ้ง'),
    department_id: zod_1.z.coerce.number().int('กรุณาเลือกแผนก'),
    contact: zod_1.z.string().trim().min(1, 'กรุณากรอกช่องทางติดต่อกลับ'),
    location: zod_1.z
      .string()
      .max(200, 'สถานที่ต้องไม่เกิน 200 ตัวอักษร')
      .optional(),
    priority: exports.ticketPrioritySchema,
    urgent_detail: zod_1.z
      .string()
      .trim()
      .max(1000, 'เหตุผลที่เร่งด่วนต้องไม่เกิน 1000 ตัวอักษร')
      .optional(),
    impact_level: exports.ticketImpactLevelSchema.optional(),
    deadline_note: zod_1.z
      .string()
      .trim()
      .max(200, 'กรอบเวลาที่ต้องการต้องไม่เกิน 200 ตัวอักษร')
      .optional(),
    deadline_date: zod_1.z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่กำหนดต้องอยู่ในรูปแบบที่ถูกต้อง')
      .refine(
        (value) => value >= new Date().toISOString().slice(0, 10),
        'กำหนดวันย้อนหลังไม่ได้',
      )
      .optional(),
    urgent_phone: zod_1.z
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
    subject: zod_1.z
      .string()
      .trim()
      .min(1, 'กรุณากรอกหัวข้อรายการ')
      .max(300, 'หัวข้อรายการต้องไม่เกิน 300 ตัวอักษร'),
    description: zod_1.z
      .string()
      .max(2000, 'รายละเอียดปัญหาต้องไม่เกิน 2000 ตัวอักษร')
      .optional(),
    custom_department_note: zod_1.z
      .string()
      .max(100, 'ชื่อแผนกที่ระบุต้องไม่เกิน 100 ตัวอักษร')
      .optional(),
    selected_symptoms: zod_1.z.preprocess(
      (value) => (Array.isArray(value) ? value : value ? [value] : []),
      zod_1.z
        .array(zod_1.z.string().trim().min(1).max(80))
        .max(5, 'เลือกอาการที่พบบ่อยได้ไม่เกิน 5 ข้อ')
        .refine(
          (items) => new Set(items).size === items.length,
          'อาการที่เลือกต้องไม่ซ้ำกัน',
        ),
    ),
    line_id_token: zod_1.z
      .string()
      .trim()
      .min(20, 'กรุณาเข้าสู่ระบบ LINE ใหม่อีกครั้ง'),
    idempotency_key: zod_1.z.string().uuid('รหัสป้องกันการส่งซ้ำไม่ถูกต้อง'),
  })
  .superRefine((data, ctx) => {
    if (data.priority === 'urgent') {
      if (!data.urgent_detail || data.urgent_detail.trim().length < 10) {
        ctx.addIssue({
          code: zod_1.z.ZodIssueCode.custom,
          path: ['urgent_detail'],
          message: 'กรุณาระบุเหตุผลที่เร่งด่วนอย่างน้อย 10 ตัวอักษร',
        });
      }
      if (!data.impact_level) {
        ctx.addIssue({
          code: zod_1.z.ZodIssueCode.custom,
          path: ['impact_level'],
          message: 'กรุณาเลือกระดับผลกระทบจากปัญหานี้',
        });
      }
      if (!data.urgent_phone?.trim()) {
        ctx.addIssue({
          code: zod_1.z.ZodIssueCode.custom,
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
        code: zod_1.z.ZodIssueCode.custom,
        path: ['priority'],
        message: 'ข้อมูลเร่งด่วนใช้ได้เฉพาะตั๋วระดับเร่งด่วนเท่านั้น',
      });
    }
  });
exports.adminCreateTicketSchema = exports.createTicketSchema
  .innerType()
  .omit({
    line_id_token: true,
    idempotency_key: true,
  })
  .superRefine((data, ctx) => {
    if (data.priority === 'urgent') {
      if (!data.urgent_detail || data.urgent_detail.trim().length < 10) {
        ctx.addIssue({
          code: zod_1.z.ZodIssueCode.custom,
          path: ['urgent_detail'],
          message: 'กรุณาระบุเหตุผลที่เร่งด่วนอย่างน้อย 10 ตัวอักษร',
        });
      }
      if (!data.impact_level) {
        ctx.addIssue({
          code: zod_1.z.ZodIssueCode.custom,
          path: ['impact_level'],
          message: 'กรุณาเลือกระดับผลกระทบจากปัญหานี้',
        });
      }
      if (!data.urgent_phone?.trim()) {
        ctx.addIssue({
          code: zod_1.z.ZodIssueCode.custom,
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
        code: zod_1.z.ZodIssueCode.custom,
        path: ['priority'],
        message: 'ข้อมูลเร่งด่วนใช้ได้เฉพาะตั๋วระดับเร่งด่วนเท่านั้น',
      });
    }
  });
exports.forwardTicketSchema = zod_1.z.object({
  department_id: zod_1.z.coerce.number().int('กรุณาเลือกแผนกปลายทาง'),
  note: zod_1.z
    .string()
    .max(1000, 'บันทึกต้องไม่เกิน 1000 ตัวอักษร')
    .optional(),
});
exports.resolveTicketSchema = zod_1.z.object({
  resolution_note: zod_1.z
    .string()
    .trim()
    .min(1, 'กรุณาบันทึกวิธีแก้ไขปัญหาก่อนปิดงาน')
    .max(2000, 'บันทึกวิธีแก้ไขต้องไม่เกิน 2000 ตัวอักษร'),
});
exports.waitTicketSchema = zod_1.z.object({
  note: zod_1.z
    .string()
    .max(1000, 'บันทึกต้องไม่เกิน 1000 ตัวอักษร')
    .optional(),
});
exports.confirmResolutionSchema = zod_1.z.object({
  line_id_token: zod_1.z
    .string()
    .trim()
    .min(1, 'ไม่พบ ID token จาก LINE กรุณาเข้าสู่ระบบใหม่'),
});
exports.createTicketCommentSchema = zod_1.z.object({
  note: zod_1.z.string().min(1).max(2000),
  is_internal: zod_1.z.boolean().optional(),
});
exports.ticketListSchema = zod_1.z.array(exports.ticketListItemSchema);
exports.publicTicketResultListSchema = zod_1.z.array(
  exports.publicTicketResultSchema,
);
exports.myTicketSummaryListSchema = zod_1.z.array(
  exports.myTicketSummarySchema,
);
//# sourceMappingURL=ticket.schema.js.map
