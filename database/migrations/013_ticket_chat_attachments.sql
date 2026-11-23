-- ไฟล์แนบของบทสนทนา (ตอบผู้แจ้ง + บันทึกภายใน) และ idempotency ของข้อความ
-- ใช้ตารางเดียวกับทั้งข้อความและบันทึก โดยบังคับให้มีอย่างน้อยหนึ่งเจ้าของ

ALTER TABLE "ticket_message_tb"
  ADD COLUMN IF NOT EXISTS "ticket_message_idempotency_key" varchar;

-- unique ต่อตั๋ว: retry ด้วยคีย์เดิมคืนข้อความเดิม ไม่สร้างข้อความซ้ำ
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ticket_message_idempotency"
  ON "ticket_message_tb" ("ticket_id", "ticket_message_idempotency_key");

CREATE TABLE IF NOT EXISTS "ticket_attachment_tb" (
  "ticket_attachment_id" serial PRIMARY KEY,
  "ticket_id" uuid NOT NULL,
  "ticket_message_id" int,
  "ticket_comment_id" int,
  "ticket_attachment_file_name" varchar NOT NULL,
  "ticket_attachment_original_name" varchar NOT NULL,
  "ticket_attachment_file_path" varchar NOT NULL,
  "ticket_attachment_created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "fk_ticket_attachment_ticket" FOREIGN KEY ("ticket_id")
    REFERENCES "ticket_tb" ("ticket_id") ON DELETE CASCADE,
  CONSTRAINT "fk_ticket_attachment_message" FOREIGN KEY ("ticket_message_id")
    REFERENCES "ticket_message_tb" ("ticket_message_id") ON DELETE CASCADE,
  CONSTRAINT "fk_ticket_attachment_comment" FOREIGN KEY ("ticket_comment_id")
    REFERENCES "ticket_comment_tb" ("ticket_comment_id") ON DELETE CASCADE,
  CONSTRAINT "chk_ticket_attachment_owner"
    CHECK ("ticket_message_id" IS NOT NULL OR "ticket_comment_id" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "idx_ticket_attachment_message"
  ON "ticket_attachment_tb" ("ticket_message_id");
CREATE INDEX IF NOT EXISTS "idx_ticket_attachment_comment"
  ON "ticket_attachment_tb" ("ticket_comment_id");
CREATE INDEX IF NOT EXISTS "idx_ticket_attachment_ticket"
  ON "ticket_attachment_tb" ("ticket_id");
