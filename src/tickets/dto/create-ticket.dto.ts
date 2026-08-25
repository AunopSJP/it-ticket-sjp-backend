import { createTicketSchema, CreateTicketInput } from '@it-ticket/shared';

/**
 * SSOT: shape ของ input มาจาก createTicketSchema (@it-ticket/shared) เท่านั้น
 * ส่งมาแบบ multipart/form-data (เพราะแนบไฟล์ได้) ทุก field จึงมาถึง backend เป็น string เสมอ
 * แม้แต่ enum และตัวเลข - createTicketSchema ใช้ z.coerce/preprocess จัดการเรื่องนี้ให้แล้ว
 * validate จริงเกิดที่ ZodValidationPipe ใน controller โดยใช้ shared schema เป็น SSOT
 */
export { createTicketSchema };
export type CreateTicketDto = CreateTicketInput;
