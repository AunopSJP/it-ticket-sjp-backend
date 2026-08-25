import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { DepartmentTb } from '../departments/department.entity';

/**
 * บัญชีที่ต้อง login (แอดมิน) - แม็พกับตาราง admin_tb ผู้แจ้งปัญหาทั่วไปไม่ต้องมีบัญชีในตารางนี้
 *
 * department_id: null = super admin เห็นทุกแผนก, ไม่ null = แอดมินแผนกนั้นแผนกเดียว
 */
@Entity('admin_tb')
export class AdminTb {
  @PrimaryGeneratedColumn({ name: 'admin_id' })
  admin_id!: number;

  @Column({ name: 'admin_full_name' })
  full_name!: string;

  @Column({ name: 'admin_email', unique: true })
  email!: string;

  /** select: false ป้องกันไม่ให้ password หลุดออกมาใน query ทั่วไปโดยไม่ตั้งใจ */
  @Column({ name: 'admin_password_hash', select: false })
  password!: string;

  @Column({ name: 'admin_role', type: 'varchar', default: Role.ADMIN })
  role!: Role;

  @Column({ name: 'admin_is_active', default: true })
  is_active!: boolean;

  @ManyToOne(() => DepartmentTb, {
    eager: true,
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'admin_department_id' })
  department!: DepartmentTb | null;

  @Column({ name: 'admin_department_id', type: 'int', nullable: true })
  department_id!: number | null;

  @CreateDateColumn({ name: 'admin_create_date' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'admin_updated_date' })
  updated_at!: Date;
}
