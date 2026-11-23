import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DEFAULT_TICKET_TRIAGE_PRIORITY, TicketTriagePriority } from '@it-ticket/shared';
import { TicketStatus } from '../../common/enums/ticket-status.enum';
import { TicketPriority } from '../../common/enums/ticket-priority.enum';
import { TicketImpactLevel } from '../../common/enums/ticket-impact.enum';
import { DepartmentTb } from '../../departments/department.entity';
import { AdminTb } from '../../admin/admin.entity';
import { UserTb } from '../../users/user.entity';
import { TicketImageTb } from './ticket-image.entity';
import { TicketHistoryTb } from './ticket-history.entity';

/**
 * ชื่อ/ช่องทางติดต่อที่กรอกในฟอร์มเก็บในตารางนี้เสมอ (ข้อมูล ณ ตอนแจ้ง) ส่วน identity ที่ login
 * ผ่าน LINE แยกไปอยู่ reporter_tb กันข้อมูลซ้ำเวลาแจ้งหลายตั๋ว
 */
@Entity('ticket_tb')
@Check('chk_ticket_triage_priority', `"ticket_triage_priority" IN ('p1', 'p2', 'p3', 'p4')`)
export class TicketTb {
  // gen_random_uuid() built-in ใน PostgreSQL 13+ ไม่ต้องพึ่ง extension "uuid-ossp"
  @PrimaryColumn({ type: 'uuid', name: 'ticket_id', default: () => 'gen_random_uuid()' })
  ticket_id: string;

  @Column({ name: 'ticket_no', unique: true })
  ticket_no: string;

  @Column({ name: 'ticket_reporter_name' })
  full_name: string;

  @Column({ name: 'ticket_reporter_contact' })
  contact: string;

  @Column({ name: 'ticket_location', type: 'varchar', nullable: true })
  location: string | null;

  @ManyToOne(() => DepartmentTb, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'department_id' })
  department: DepartmentTb;

  @Column({ name: 'department_id' })
  department_id: number;

  @Column({ name: 'ticket_priority', type: 'varchar', default: TicketPriority.NORMAL })
  priority: TicketPriority;

  @Column({ name: 'ticket_triage_priority', type: 'varchar', default: DEFAULT_TICKET_TRIAGE_PRIORITY })
  triage_priority: TicketTriagePriority;

  @Column({ name: 'ticket_urgent_detail', type: 'text', nullable: true })
  urgent_detail: string | null;

  @Column({ name: 'ticket_impact_level', type: 'varchar', nullable: true })
  impact_level: TicketImpactLevel | null;

  /** กรอบเวลาที่ต้องการให้แก้ไขเสร็จ (ผู้แจ้งกรอกเอง ไม่บังคับ แม้ตอนเลือกเร่งด่วน) - เก็บเป็นข้อความอิสระ
   *  เช่น "ภายใน 1 ชม." / "ก่อนเวลา 15:00 น." เพราะผู้แจ้งมักพิมพ์เป็นข้อความบรรยายมากกว่าเลือกวันเวลาที่แน่นอน */
  @Column({ name: 'ticket_deadline_note', type: 'varchar', nullable: true })
  deadline_note: string | null;

  @Column({ name: 'ticket_deadline_date', type: 'date', nullable: true })
  deadline_date: string | null;

  /** เบอร์โทรศัพท์ที่ติดต่อได้ทันที - บังคับกรอกเฉพาะตอน priority = urgent (ตรวจใน DTO)
   *  แยกจาก contact เพราะ contact อาจเป็น LINE ID/ช่องทางอื่นที่ติดต่อไม่ทันทีเท่าเบอร์โทร */
  @Column({ name: 'ticket_urgent_phone', type: 'varchar', nullable: true })
  urgent_phone: string | null;

  @Column({ name: 'ticket_selected_symptoms', type: 'text', array: true, default: () => 'ARRAY[]::text[]' })
  selected_symptoms: string[];

  /** ผู้แจ้งที่ login LINE ผ่าน LIFF มาแล้ว (null เฉพาะกรณี fallback ที่ LIFF ใช้งานไม่ได้ตอนแจ้ง) */
  @ManyToOne(() => UserTb, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reporter_id' })
  user: UserTb | null;

  @Column({ name: 'reporter_id', type: 'int', nullable: true })
  user_id: number | null;

  /** ชื่อแผนกที่ผู้แจ้งพิมพ์เอง - มีค่าเฉพาะตอนเลือกแผนก "อื่นๆ" (department_code = 'other') เท่านั้น
   *  แทนที่ฟีเจอร์เดิมที่ให้สร้างแผนกใหม่ถาวรในระบบได้เอง (ถูกลบออกแล้วเพราะทำให้ชื่อแผนกปนภาษา/ข้อมูลไม่สะอาด) */
  @Column({ name: 'ticket_custom_department_note', type: 'varchar', nullable: true })
  custom_department_note: string | null;

  @Column({ name: 'ticket_subject' })
  subject: string;

  @Column({ name: 'ticket_description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'ticket_status', type: 'varchar', default: TicketStatus.OPEN })
  status: TicketStatus;

  @ManyToOne(() => AdminTb, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ticket_assignee_admin_id' })
  assignee: AdminTb | null;

  @Column({ name: 'ticket_assignee_admin_id', type: 'int', nullable: true })
  assignee_id: number | null;

  @Column({ name: 'ticket_resolution_note', type: 'text', nullable: true })
  resolution_note: string | null;

  @Column({ name: 'ticket_closed_at', type: 'timestamptz', nullable: true })
  closed_at: Date | null;

  // ---------------- SLA ----------------
  /** กำหนดเวลาที่ควรมีคนกดรับเคส คำนวณจาก priority ตอนสร้างตั๋ว (ดู sla.util.ts) */
  @Column({ name: 'ticket_assign_by', type: 'timestamptz', nullable: true })
  assign_by: Date | null;

  @Column({ name: 'ticket_resolve_by', type: 'timestamptz', nullable: true })
  resolve_by: Date | null;

  /** true = เกิน resolve_by ไปแล้ว (ขึ้น flag แดงใน dashboard แอดมิน) */
  @Column({ name: 'ticket_sla_breached', default: false })
  sla_breached: boolean;

  /** เป้าหมาย "ตอบผู้แจ้งครั้งแรก" ตามนโยบาย Priority/ปฏิทิน (คำนวณฝั่งเซิร์ฟเวอร์) */
  @Column({ name: 'ticket_first_response_due_at', type: 'timestamptz', nullable: true })
  first_response_due_at: Date | null;

  /** ข้อความแรกที่เจ้าหน้าที่ส่งถึงผู้แจ้ง - null = ยังไม่ตอบ (บันทึกภายในไม่นับ) */
  @Column({ name: 'ticket_first_responded_at', type: 'timestamptz', nullable: true })
  first_responded_at: Date | null;

  /** เป้าหมาย "แก้ไข" ตามนโยบายเดียวกัน - ถึงสถานะรอผู้แจ้งยืนยัน/ปิดงานจึงนับว่าเสร็จ */
  @Column({ name: 'ticket_resolve_due_at', type: 'timestamptz', nullable: true })
  resolve_due_at: Date | null;

  /** กันแจ้งเตือน SLA ใกล้ครบ/เกิน ซ้ำหลายรอบจาก background job */
  @Column({ name: 'ticket_sla_warning_notified_at', type: 'timestamptz', nullable: true })
  sla_warning_notified_at: Date | null;
  @Column({ name: 'ticket_sla_breach_notified_at', type: 'timestamptz', nullable: true })
  sla_breach_notified_at: Date | null;

  @Column({ name: 'ticket_assign_breach_notified_at', type: 'timestamptz', nullable: true })
  assign_breach_notified_at: Date | null;

  @Column({ name: 'ticket_deadline_warning_notified_at', type: 'timestamptz', nullable: true })
  deadline_warning_notified_at: Date | null;

  @Column({ name: 'ticket_deadline_breach_notified_at', type: 'timestamptz', nullable: true })
  deadline_breach_notified_at: Date | null;


  /** เวลาที่เข้าสถานะ Wait ล่าสุด (null ถ้าไม่ได้อยู่ในสถานะ Wait) ใช้คำนวณเวลาที่ SLA clock หยุดนับ */
  @Column({ name: 'ticket_wait_started_at', type: 'timestamptz', nullable: true })
  wait_started_at: Date | null;

  /** เวลารวมที่ SLA clock ถูกพักไว้ (มิลลิวินาที) สะสมทุกครั้งที่ออกจากสถานะ Wait */
  @Column({ name: 'ticket_sla_paused_ms', type: 'bigint', default: 0, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  sla_paused_ms: number;

  // ---------------- Resolve → รอผู้แจ้งยืนยัน ----------------
  @Column({ name: 'ticket_resolved_at', type: 'timestamptz', nullable: true })
  resolved_at: Date | null;

  /** ถ้าผู้แจ้งไม่กดยืนยันภายในเวลานี้ ระบบจะ auto-close ให้เอง */
  @Column({ name: 'ticket_confirmation_deadline', type: 'timestamptz', nullable: true })
  confirmation_deadline: Date | null;

  /** กันกดส่งฟอร์มซ้ำ (double-submit / network retry) ไม่ให้สร้างตั๋วซ้อนกัน */
  @Column({ name: 'ticket_idempotency_key', type: 'varchar', nullable: true, unique: true })
  idempotency_key: string | null;

  @OneToMany(() => TicketImageTb, (image) => image.ticket, { cascade: true })
  images: TicketImageTb[];

  @OneToMany(() => TicketHistoryTb, (history) => history.ticket)
  history: TicketHistoryTb[];

  @CreateDateColumn({ name: 'ticket_created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'ticket_updated_at' })
  updated_at: Date;
}
