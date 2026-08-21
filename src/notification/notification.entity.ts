import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('notification_tb')
export class NotificationEntity {
  @PrimaryGeneratedColumn({ name: 'notification_id' })
  notification_id!: number;

  // เก็บค่าการแจ้งเตือนจากTicket
  @Column()
  notification_ticket_id!: number;

  @Column()
  notification_message!: string;

  @CreateDateColumn({ name: 'notification_create_date' })
  notification_create_date!: Date;
}
