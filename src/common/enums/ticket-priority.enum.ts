import { TicketPriority as TicketPriorityType } from '@it-ticket/shared';

/**
 * SSOT: ค่าจริงมาจาก ticketPrioritySchema ใน @it-ticket/shared (ดูเหตุผลเรื่อง const object ที่
 * ticket-status.enum.ts) ระดับความเร่งด่วน - เมื่อเลือก urgent ผู้แจ้งต้องกรอกเหตุผลเพิ่มใน urgent_detail
 * ข้อมูลเก่าที่เคยเป็น 3 ระดับ: low -> normal, medium/high -> urgent
 */
export const TicketPriority = {
  NORMAL: 'normal',
  URGENT: 'urgent',
} as const satisfies Record<string, TicketPriorityType>;

export type TicketPriority = TicketPriorityType;
