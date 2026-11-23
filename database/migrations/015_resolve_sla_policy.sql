-- เป้าหมาย SLA "แก้ไข" ตามนโยบายเดียวกับตอบครั้งแรก (ไม่ใช้ค่า normal/urgent เดิม)
ALTER TABLE "ticket_tb"
  ADD COLUMN IF NOT EXISTS "ticket_resolve_due_at" timestamptz;

CREATE INDEX IF NOT EXISTS "idx_ticket_resolve_due"
  ON "ticket_tb" ("ticket_resolve_due_at");
