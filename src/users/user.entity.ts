import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * แยกออกจาก ticket_tb เพื่อไม่ให้ข้อมูล LINE ซ้ำเวลาคนเดิมแจ้งหลายตั๋ว
 * user_id เป็น null ได้เฉพาะกรณี LIFF ใช้งานไม่ได้ตอนแจ้ง (ชื่อ/ช่องทางติดต่อยังเก็บที่ ticket_tb เสมอ)
 */
@Entity('reporter_tb')
export class UserTb {
  @PrimaryGeneratedColumn({ name: 'reporter_id' })
  user_id: number;

  @Column({ name: 'reporter_line_user_id', unique: true })
  line_user_id: string;

  @Column({ name: 'reporter_line_display_name', type: 'varchar', nullable: true })
  line_display_name: string | null;

  @Column({ name: 'reporter_line_picture_url', type: 'varchar', nullable: true })
  line_picture_url: string | null;

  @CreateDateColumn({ name: 'reporter_created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'reporter_updated_at' })
  updated_at: Date;
}
