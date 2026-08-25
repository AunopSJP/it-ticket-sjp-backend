import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserTb } from '../users/user.entity';
import { TicketTb } from '../tickets/entities/ticket.entity';

/** fan-out-on-write เหมือนฝั่งแอดมิน - ผู้แจ้งไม่มี JWT จึงดึงผ่าน line_id_token ที่ verify แล้ว */
@Entity('reporter_notification_tb')
export class UserNotificationTb {
  @PrimaryGeneratedColumn({ name: 'reporter_notification_id' })
  user_notification_id: number;

  @ManyToOne(() => UserTb, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  user: UserTb;

  @Column({ name: 'reporter_id' })
  user_id: number;

  @ManyToOne(() => TicketTb, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: TicketTb;

  @Column({ name: 'ticket_id', type: 'uuid' })
  ticket_id: string;

  @Column({ name: 'reporter_notification_message' })
  message: string;

  @Column({ name: 'reporter_notification_is_read', default: false })
  is_read: boolean;

  @CreateDateColumn({ name: 'reporter_notification_created_at' })
  created_at: Date;
}
