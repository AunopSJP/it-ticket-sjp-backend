import { adminCreateTicketSchema, AdminCreateTicketInput } from '@it-ticket/shared';

/**
 * SSOT: shape ของ input มาจาก adminCreateTicketSchema (@it-ticket/shared) เท่านั้น
 * ใช้เฉพาะกับ POST /tickets/admin-create - เหมือน createTicketSchema ทุกอย่างยกเว้นตัด
 * line_id_token/idempotency_key ออก เพราะแอดมิน login ด้วย JWT อยู่แล้ว ไม่มี LINE identity ให้ verify
 */
export { adminCreateTicketSchema };
export type AdminCreateTicketDto = AdminCreateTicketInput;
