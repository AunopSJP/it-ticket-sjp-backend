-- เป้าหมาย SLA "ตอบผู้แจ้งครั้งแรก" (server-side ตามนโยบาย Priority/ปฏิทิน)
-- ตั๋วเก่าไม่มีค่า -> คำนวณตอนอ่านจาก created_at + นโยบายของ triage priority

ALTER TABLE "ticket_tb"
  ADD COLUMN IF NOT EXISTS "ticket_first_response_due_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "ticket_first_responded_at" timestamptz;

CREATE INDEX IF NOT EXISTS "idx_ticket_first_response_due"
  ON "ticket_tb" ("ticket_first_response_due_at");
