import { Injectable } from "@nestjs/common";
import { AuditLogTb } from "./audit-log.entity";
import { AdminTb } from "../admin/admin.entity";
import { AuditLogRepository } from "./audit-log.repository";

/** ค่า limit เริ่มต้นเมื่อไม่ระบุตอนเรียก list() */
const AUDIT_LOG_DEFAULT_LIMIT = 100;
/** เพดานสูงสุดของ limit กัน query โตไม่มีขอบเขตถ้ามีคนขอ limit สูงเกินจำเป็น */
const AUDIT_LOG_MAX_LIMIT = 300;

export interface AuditLogInput {
  admin?: AdminTb | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | number | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditLogService {
  constructor(
    private readonly auditRepo: AuditLogRepository,
  ) {}

  record(input: AuditLogInput): Promise<AuditLogTb> {
    return this.auditRepo.save(
      this.auditRepo.create({
        admin_id: input.admin?.admin_id ?? null,
        admin_action: input.action,
        admin_entity_type: input.entity_type ?? null,
        admin_entity_id: input.entity_id == null ? null : String(input.entity_id),
        admin_summary: input.summary,
        admin_metadata: input.metadata ?? null,
      }),
    );
  }

  list(limit = AUDIT_LOG_DEFAULT_LIMIT): Promise<AuditLogTb[]> {
    return this.auditRepo.list(Math.min(Math.max(limit, 1), AUDIT_LOG_MAX_LIMIT));
  }
}
