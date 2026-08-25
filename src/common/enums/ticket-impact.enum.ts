import { TicketImpactLevel as TicketImpactLevelType } from '@it-ticket/shared';

/**
 * SSOT: ค่าจริงมาจาก ticketImpactLevelSchema ใน @it-ticket/shared (ดูเหตุผลเรื่อง const object ที่
 * ticket-status.enum.ts) ระดับผลกระทบจากปัญหา - บังคับเลือกเฉพาะตอน priority = urgent (ตรวจใน DTO)
 * ช่วยแอดมินประเมินลำดับความสำคัญของเคสเร่งด่วนแต่ละใบว่าควรจัดคิวไปแก้ก่อนใคร
 * INDIVIDUAL = กระทบบุคคลเดียว (ทำงานต่อไม่ได้ 1 คน)
 * TEAM       = กระทบทั้งแผนก/ทีม (กระทบงานภาพรวมทีม)
 * CUSTOMER   = กระทบลูกค้า/รายได้ (กระทบระบบหลักภายนอก)
 */
export const TicketImpactLevel = {
  INDIVIDUAL: 'individual',
  TEAM: 'team',
  CUSTOMER: 'customer',
} as const satisfies Record<string, TicketImpactLevelType>;

export type TicketImpactLevel = TicketImpactLevelType;
