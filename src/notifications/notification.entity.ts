import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AdminTb } from '../admin/admin.entity';
import { TicketTb } from '../tickets/entities/ticket.entity';

/**
 * ใช้ fan-out-on-write: insert 1 แถวต่อแอดมิน 1 คน แต่ละคนจึงมีสถานะอ่านของตัวเอง
 * ไม่ต้องมีตาราง read-state แยก (เหมาะกับจำนวนแอดมินไม่เยอะ)
 */
@Entity('notification_tb')
export class NotificationTb {
  @PrimaryGeneratedColumn({ name: 'notification_id' })
  notification_id: number;

  @ManyToOne(() => AdminTb, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_recipient_admin_id' })
  recipient_admin: AdminTb;

  @Column({ name: 'notification_recipient_admin_id' })
  recipient_admin_id: number;

  @ManyToOne(() => TicketTb, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'ticket_id' })
  ticket: TicketTb | null;

  @Column({ name: 'ticket_id', type: 'uuid', nullable: true })
  ticket_id: string | null;

  @Column({ name: 'notification_message' })
  message: string;

  @Column({ name: 'notification_is_read', default: false })
  is_read: boolean;

  @CreateDateColumn({ name: 'notification_created_at' })
  created_at: Date;
}
