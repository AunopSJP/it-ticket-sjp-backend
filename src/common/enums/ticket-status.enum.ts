import { TicketStatus as TicketStatusType } from '@it-ticket/shared';

/**
 * SSOT: ค่าจริงมาจาก ticketStatusSchema ใน @it-ticket/shared (ไฟล์เดียวกับที่ frontend ใช้)
 * ยังคงหน้าตาเป็น "TicketStatus.OPEN" แบบเดิมทุกจุดที่ใช้อยู่แล้วในระบบ (entity, service, controller)
 * แต่ประกาศเป็น const object (ไม่ใช่ TS enum) เพื่อให้ type เข้ากันได้กับ union type ที่มาจาก Zod โดยตรง
 * ไม่ต้อง cast ตอนรับค่าจาก DTO ที่ validate ด้วย Zod แล้ว
 *
 * สถานะของ Ticket ตลอดวงจรการทำงาน
 * OPEN                  -> ผู้ใช้เพิ่งแจ้งปัญหาเข้ามา ยังไม่มีแอดมิน/ช่างรับเรื่อง
 * IN_PROGRESS           -> มีแอดมินกดรับเคส (Assign to Me) แล้ว กำลังดำเนินการแก้ไข
 * WAITING               -> รออุปกรณ์ / รอข้อมูลเพิ่มเติมจากผู้แจ้ง ก่อนดำเนินการต่อ (พัก SLA clock)
 * FORWARDED             -> ส่งต่อเคสไปให้อีกแผนกดูแลแทน (รอแผนกใหม่กดรับเรื่องอีกครั้ง)
 * PENDING_CONFIRMATION  -> แอดมินกด Resolve แล้ว รอผู้แจ้งกดยืนยันว่าแก้ไขจริง (หรือหมดเวลารอ auto-close)
 * CLOSED                -> ดำเนินการแก้ไขเสร็จสิ้น ปิดงานแล้ว (ผู้แจ้งยืนยัน หรือหมดเวลารอ)
 */
export const TicketStatus = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  WAITING: 'waiting',
  FORWARDED: 'forwarded',
  PENDING_CONFIRMATION: 'pending_confirmation',
  CLOSED: 'closed',
} as const satisfies Record<string, TicketStatusType>;

export type TicketStatus = TicketStatusType;
