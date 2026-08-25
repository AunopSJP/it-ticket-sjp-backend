-- ============================================================================
-- Migration 009: รองรับแนบรูปภาพประกอบตอนแอดมินดำเนินการกับตั๋ว (resolve/wait/forward)
-- ============================================================================
-- เดิม ticket_image_tb ผูกกับ ticket_id อย่างเดียว ใช้ได้แค่ตอน "แจ้งปัญหา" เท่านั้น
-- เพิ่มคอลัมน์ ticket_history_id (nullable) เพื่อผูกรูปกับ "การดำเนินการ" ครั้งใดครั้งหนึ่งโดยเฉพาะ:
--   - ticket_history_id IS NULL  = รูปหลักฐานที่ผู้แจ้งแนบตอนสร้างตั๋ว (พฤติกรรมเดิม ไม่เปลี่ยน)
--   - ticket_history_id NOT NULL = รูปประกอบที่แอดมินแนบตอน resolve/wait/forward ครั้งนั้นๆ
--
-- ทุกคำสั่งรันซ้ำได้ปลอดภัย (IF NOT EXISTS ทั้งหมด)
-- วิธีรัน: docker exec -i local_postgres psql -U appuser -d appdb < database/migrations/009_add_resolution_images.sql
-- ============================================================================

ALTER TABLE "ticket_image_tb"
  ADD COLUMN IF NOT EXISTS "ticket_history_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_image_tb_ticket_history_id_fkey') THEN
    ALTER TABLE "ticket_image_tb" ADD CONSTRAINT "ticket_image_tb_ticket_history_id_fkey"
      FOREIGN KEY ("ticket_history_id") REFERENCES "ticket_history_tb" ("ticket_history_id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ticket_image_ticket_history
  ON "ticket_image_tb" ("ticket_history_id")
  WHERE "ticket_history_id" IS NOT NULL;
