import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * department_code ตรงกับ value ของ <option> ในฟอร์มฝั่ง frontend ทุกตัว
 * (pm, sales, technician_support, network_support, it_support, accounting,
 *  post_sales, developer, procurement_hr)
 */
@Entity('department_tb')
export class DepartmentTb {
  @PrimaryGeneratedColumn({ name: 'department_id' })
  department_id: number;

  @Column({ name: 'department_code', unique: true })
  department_code: string;

  @Column({ name: 'department_name_en' })
  department_name_en: string;

  @Column({ name: 'department_name_th' })
  department_name_th: string;

  @Column({ name: 'department_is_active', default: true })
  is_active: boolean;

  /** legacy: true = สร้างผ่านฟีเจอร์ "เพิ่มแผนกใหม่" เดิมที่ถูกลบไปแล้ว (ดู migration 002) ไม่ใช้ต่อแล้ว */
  @Column({ name: 'department_is_custom', default: false })
  is_custom: boolean;

  @CreateDateColumn({ name: 'department_created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'department_updated_at' })
  updated_at: Date;
}
