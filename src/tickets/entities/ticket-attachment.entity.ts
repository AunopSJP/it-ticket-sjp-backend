import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TicketTb } from './ticket.entity';
import { TicketMessageTb } from './ticket-message.entity';
import { TicketCommentTb } from './ticket-comment.entity';

/**
 * ไฟล์แนบของบทสนทนา - ใช้ตารางเดียวกับทั้งข้อความที่ส่งถึงผู้แจ้ง (ticket_message_id)
 * และบันทึกภายใน (ticket_comment_id) โดยบังคับให้มีอย่างน้อยหนึ่งอย่าง
 *
 * เหตุผลที่แยกจาก ticket_image_tb: รูปของ ticket_image_tb ผูกกับตัวตั๋ว/ประวัติการดำเนินการ
 * ส่วนไฟล์ในตารางนี้ผูกกับข้อความหรือบันทึก และต้องถูกกรองตามสิทธิ์ของบทสนทนา (ผู้แจ้งเห็นเฉพาะของข้อความ)
 */
@Entity('ticket_attachment_tb')
@Check('chk_ticket_attachment_owner', '"ticket_message_id" IS NOT NULL OR "ticket_comment_id" IS NOT NULL')
export class TicketAttachmentTb {
  @PrimaryGeneratedColumn({ name: 'ticket_attachment_id' })
  ticket_attachment_id: number;

  @ManyToOne(() => TicketTb, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: TicketTb;

  @Column({ name: 'ticket_id', type: 'uuid' })
  ticket_id: string;

  @ManyToOne(() => TicketMessageTb, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_message_id' })
  message: TicketMessageTb | null;

  @Column({ name: 'ticket_message_id', type: 'int', nullable: true })
  ticket_message_id: number | null;

  @ManyToOne(() => TicketCommentTb, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_comment_id' })
  comment: TicketCommentTb | null;

  @Column({ name: 'ticket_comment_id', type: 'int', nullable: true })
  ticket_comment_id: number | null;

  @Column({ name: 'ticket_attachment_file_name' })
  file_name: string;

  @Column({ name: 'ticket_attachment_original_name' })
  original_name: string;

  /** path สำหรับแสดงผล (relative) เช่น /api/uploads/tickets/xxx.jpg */
  @Column({ name: 'ticket_attachment_file_path' })
  file_path: string;

  @CreateDateColumn({ name: 'ticket_attachment_created_at' })
  created_at: Date;
}
