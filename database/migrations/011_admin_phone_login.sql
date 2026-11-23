-- แอดมิน login ด้วยเบอร์โทรศัพท์แทนอีเมล และบังคับเปลี่ยนรหัสผ่านตอนใช้งานครั้งแรก
-- ไม่ลบข้อมูลเดิม: บัญชีเก่ายังมีอีเมลอยู่ (ใช้ login ชั่วคราวได้จนกว่าจะใส่เบอร์โทร)

ALTER TABLE "admin_tb"
  ADD COLUMN IF NOT EXISTS "admin_phone" varchar,
  ADD COLUMN IF NOT EXISTS "admin_must_change_password" boolean NOT NULL DEFAULT false;

-- บัญชีใหม่ไม่จำเป็นต้องมีอีเมล (UNIQUE ยังกันซ้ำได้ เพราะ NULL ไม่นับว่าซ้ำกัน)
ALTER TABLE "admin_tb" ALTER COLUMN "admin_email" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_admin_tb_phone" ON "admin_tb" ("admin_phone");
