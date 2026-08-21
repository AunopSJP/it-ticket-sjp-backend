import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('audit_tb')
export class AuditEntity {
  @PrimaryGeneratedColumn({ name: 'audit_id' })
  audit_id!: number;

  @Column()
  audit_user_id!: number;

  @Column()
  audit_action!: string;

  @Column()
  audit_description!: string;

  @CreateDateColumn({ name: 'audit_create_date' })
  audit_create_date!: Date;

  @UpdateDateColumn({ name: 'audit_update_date' })
  audit_update_date!: Date;
}
