// schema: admin_tb
// admin_id
// admin_full_name
// admin_email
// admin_password
// admin_role
// admin_status
// admin_department_id
// admin_create_date

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('admin_tb')
export class AdminEntity {
  @PrimaryGeneratedColumn({ name: 'admin_id' })
  admin_id!: number;

  @Column()
  admin_full_name!: string;

  @Column()
  admin_email!: string;

  @Column()
  admin_password!: string;

  @Column()
  admin_role!: string;

  @Column()
  admin_status!: string;

  @Column()
  admin_department_id!: string;

  @CreateDateColumn({ name: 'admin_create_date' })
  admin_create_date!: Date;
}
