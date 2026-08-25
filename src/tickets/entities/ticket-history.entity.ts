import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TicketStatus } from '../../common/enums/ticket-status.enum';
import { TicketTb } from './ticket.entity';
import { AdminTb } from '../../admin/admin.entity';
import { DepartmentTb } from '../../departments/department.entity';
import { TicketImageTb } from './ticket-image.entity';

@Entity('ticket_history_tb')
export class TicketHistoryTb {
  @PrimaryGeneratedColumn({ name: 'ticket_history_id' })
  ticket_history_id: number;

  @ManyToOne(() => TicketTb, (ticket) => ticket.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: TicketTb;

  @Column({ name: 'ticket_id' })
  ticket_id: string;

  @Column({ name: 'ticket_history_from_status', type: 'varchar' })
  from_status: TicketStatus;

  @Column({ name: 'ticket_history_to_status', type: 'varchar' })
  to_status: TicketStatus;

  @ManyToOne(() => DepartmentTb, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ticket_history_from_department_id' })
  from_department: DepartmentTb | null;

  @Column({ name: 'ticket_history_from_department_id', type: 'int', nullable: true })
  from_department_id: number | null;

  @ManyToOne(() => DepartmentTb, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ticket_history_to_department_id' })
  to_department: DepartmentTb | null;

  @Column({ name: 'ticket_history_to_department_id', type: 'int', nullable: true })
  to_department_id: number | null;

  @ManyToOne(() => AdminTb, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ticket_history_changed_by_admin_id' })
  changed_by: AdminTb | null;

  @Column({ name: 'ticket_history_changed_by_admin_id', type: 'int', nullable: true })
  changed_by_id: number | null;

  @Column({ name: 'ticket_history_note', type: 'text', nullable: true })
  note: string | null;

  /** รูปประกอบที่แอดมินแนบตอนทำ action นี้ (resolve/wait/forward) - ว่างเปล่าสำหรับ history แถวเดิม
   *  ที่สร้างก่อนมีฟีเจอร์นี้ และแถว "สร้างตั๋วงานใหม่เข้าสู่ระบบ" (รูปตอนแจ้งปัญหาอยู่ที่ ticket.images แทน) */
  @OneToMany(() => TicketImageTb, (image) => image.ticket_history)
  images: TicketImageTb[];

  @CreateDateColumn({ name: 'ticket_history_created_at' })
  created_at: Date;
}
