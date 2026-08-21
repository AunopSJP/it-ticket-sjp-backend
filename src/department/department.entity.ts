import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('department_tb')
export class DepartmentEntity {
  @PrimaryGeneratedColumn({ name: 'department_id' })
  department_id!: number;

  @Column({ name: 'department_code' })
  department_code!: string;

  @Column({ name: 'department_name_th' })
  department_name_th!: string;

  @Column({ name: 'department_name_en' })
  department_name_en!: string;

  @Column({ name: 'department_status' })
  department_status!: boolean;

  @Column({ name: 'department_is_custom' })
  department_is_custom!: boolean;

  @CreateDateColumn({ name: 'department_create_date' })
  department_create_date!: Date;

  @UpdateDateColumn({ name: 'department_update_date' })
  department_update_date!: Date;

  @DeleteDateColumn({ name: 'department_delete_date' })
  department_delete_date!: Date;
}
