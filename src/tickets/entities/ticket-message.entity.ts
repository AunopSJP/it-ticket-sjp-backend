import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TicketTb } from './ticket.entity';
import { AdminTb } from '../../admin/admin.entity';
import { UserTb } from '../../users/user.entity';

export enum TicketMessageSenderType {
  REPORTER = 'reporter',
  ADMIN = 'admin',
}

/**
 * แชทระหว่างผู้แจ้งกับแอดมิน - แยกจาก ticket_comment_tb โดยตั้งใจ: comment เป็นบันทึกภายใน
 * ที่แอดมินเห็นกันเอง ส่วนตารางนี้ผู้แจ้งเห็นเสมอ ไม่มี flag internal
 *
 * สิทธิ์ส่งข้อความ (บังคับที่ service ไม่ใช่ที่ entity):
 * - ผู้แจ้ง: ต้องเป็นเจ้าของตั๋ว และตั๋วต้องมี assignee แล้ว
 * - แอดมิน: ต้องเป็น assignee ของตั๋วนั้นเท่านั้น ไม่ใช่ทุกคนในแผนก
 * - ตั๋วปิดแล้ว: read-only
 */
@Entity('ticket_message_tb')
export class TicketMessageTb {
  @PrimaryGeneratedColumn({ name: 'ticket_message_id' })
  ticket_message_id: number;

  @ManyToOne(() => TicketTb, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: TicketTb;

  @Column({ name: 'ticket_id', type: 'uuid' })
  ticket_id: string;

  @Column({ name: 'ticket_message_sender_type', type: 'varchar' })
  sender_type: TicketMessageSenderType;

  @ManyToOne(() => UserTb, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sender_reporter_id' })
  sender_user: UserTb | null;

  @Column({ name: 'sender_reporter_id', type: 'int', nullable: true })
  sender_user_id: number | null;

  /** เก็บ id ไว้แม้ assignee จะเปลี่ยนภายหลัง เพื่อให้ประวัติแชทยังรู้ว่าใครส่งตอนนั้น */
  @ManyToOne(() => AdminTb, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sender_admin_id' })
  sender_admin: AdminTb | null;

  @Column({ name: 'sender_admin_id', type: 'int', nullable: true })
  sender_admin_id: number | null;

  @Column({ name: 'ticket_message_text', type: 'text' })
  message: string;

  @Column({ name: 'ticket_message_is_read', default: false })
  is_read: boolean;

  /** กันกดส่งซ้ำ: unique ต่อ (ticket_id, key) - ข้อความเดิมที่ส่งด้วยคีย์เดิมจะถูกคืนแทนการสร้างใหม่ */
  @Column({ name: 'ticket_message_idempotency_key', type: 'varchar', nullable: true })
  idempotency_key: string | null;

  @CreateDateColumn({ name: 'ticket_message_created_at' })
  created_at: Date;

  /** Response-only display fields populated when chat history joins sender relations. */
  sender_admin_name?: string;
  sender_user_name?: string;
  attachments?: TicketMessageAttachment[];
}

/** response-only: ไฟล์แนบที่ส่งมากับข้อความ (ไม่ใช่คอลัมน์ของตาราง) */
export interface TicketMessageAttachment {
  ticket_attachment_id: number;
  original_name: string;
  file_path: string;
  /** URL ที่ต้องแนบ token เพื่อดาวน์โหลด - controller เป็นผู้ตรวจสิทธิ์ ไม่ใช่ static path */
  download_url: string;
}
