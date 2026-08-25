import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("audit_log_tb")
export class AuditLogTb {
  @PrimaryGeneratedColumn({ name: "audit_log_id" })
  audit_log_id!: number;

  @Column({ name: "admin_id", type: "int", nullable: true })
  admin_id!: number | null;

  @Column({ name: "audit_log_action" })
  admin_action!: string;

  @Column({ name: "audit_log_entity_type", type: "varchar", nullable: true })
  admin_entity_type!: string | null;

  @Column({ name: "audit_log_entity_id", type: "varchar", nullable: true })
  admin_entity_id!: string | null;

  @Column({ name: "audit_log_summary", type: "text" })
  admin_summary!: string;

  @Column({ name: "audit_log_metadata", type: "jsonb", nullable: true })
  admin_metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "audit_log_created_at" })
  admin_created_at!: Date;
}
