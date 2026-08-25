import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TicketTb } from './ticket.entity';
import { TicketHistoryTb } from './ticket-history.entity';

@Entity('ticket_image_tb')
export class TicketImageTb {
  @PrimaryGeneratedColumn({ name: 'ticket_image_id' })
  ticket_image_id: number;

  @ManyToOne(() => TicketTb, (ticket) => ticket.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: TicketTb;

  @Column({ name: 'ticket_id' })
  ticket_id: string;

  /** null = รูปที่ผู้แจ้งแนบตอนสร้างตั๋ว (พฤติกรรมเดิม) - ไม่ null = รูปที่แอดมินแนบตอน
   *  resolve/wait/forward ครั้งนั้นๆ ผูกกับแถวประวัติที่สร้างพร้อมกันในทรานแซคชันเดียวกัน */
  @ManyToOne(() => TicketHistoryTb, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_history_id' })
  ticket_history: TicketHistoryTb | null;

  @Column({ name: 'ticket_history_id', type: 'int', nullable: true })
  ticket_history_id: number | null;

  @Column({ name: 'ticket_image_file_name' })
  file_name: string;

  @Column({ name: 'ticket_image_original_name' })
  original_name: string;

  /** path สำหรับแสดงผล (relative เสมอ) เช่น /api/uploads/tickets/xxx.jpg
   *  เก็บเป็น relative เพื่อให้ย้ายโดเมน/พอร์ตได้โดยไม่ต้องไล่แก้ข้อมูลเก่าในฐานข้อมูล */
  @Column({ name: 'ticket_image_file_path' })
  file_path: string;

  @CreateDateColumn({ name: 'ticket_image_created_at' })
  created_at: Date;
}
