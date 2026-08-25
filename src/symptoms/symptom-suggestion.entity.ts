import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DepartmentTb } from '../departments/department.entity';

/**
 * "อาการที่พบบ่อย" แยกตามแผนก - ทุกครั้งที่มีตั๋วใหม่ ระบบ normalize หัวข้อแล้ว upsert แถวนี้
 * พอ hit_count ถึงเกณฑ์ (default 5 ครั้งใน 30 วัน) จะถูกดึงไปแสดงเป็นปุ่มติ๊กในฟอร์มผู้แจ้ง
 */
@Entity('symptom_tb')
@Index(['department_id', 'label'], { unique: true })
export class SymptomSuggestionTb {
  @PrimaryGeneratedColumn({ name: 'symptom_id' })
  symptom_id: number;

  @ManyToOne(() => DepartmentTb, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'department_id' })
  department: DepartmentTb;

  @Column({ name: 'department_id' })
  department_id: number;

  @Column({ name: 'symptom_label' })
  label: string;

  @Column({ name: 'symptom_is_manual', default: false })
  is_manual: boolean;

  @Column({ name: 'symptom_hit_count', type: 'int', default: 0 })
  hit_count: number;

  @Column({ name: 'symptom_last_seen_at', type: 'timestamptz', nullable: true })
  last_seen_at: Date | null;

  @CreateDateColumn({ name: 'symptom_created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'symptom_updated_at' })
  updated_at: Date;
}
