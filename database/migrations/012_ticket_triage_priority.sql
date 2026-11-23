-- แยก Priority ของเจ้าหน้าที่จากค่า normal/urgent และ SLA เดิม
-- ตั๋วเก่าเริ่มที่ P3 เช่นกันจนกว่าเจ้าหน้าที่จะคัดแยก ไม่แปลง urgent เดิมเป็น P1 อัตโนมัติ
ALTER TABLE "ticket_tb"
  ADD COLUMN IF NOT EXISTS "ticket_triage_priority" varchar NOT NULL DEFAULT 'p3'
    CONSTRAINT "chk_ticket_triage_priority" CHECK ("ticket_triage_priority" IN ('p1', 'p2', 'p3', 'p4'));
