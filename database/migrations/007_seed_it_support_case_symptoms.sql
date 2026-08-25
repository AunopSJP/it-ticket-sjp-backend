-- สรุปหมวดอาการจากแท็บ "เคสเสีย" ของชีตจดเคส (ข้อมูล 438 แถว ณ 2026-08-04)
-- ผูกเฉพาะแผนก IT Support และ mark manual เพื่อให้แสดงในฟอร์มทันที
WITH source(symptom_label, symptom_hit_count) AS (
  VALUES
    ('ONU LOS / ไฟ PON ไม่ติด', 101),
    ('เสา Offline', 108),
    ('กล้อง Offline', 34),
    ('ภาพกล้องไม่ขึ้น', 38),
    ('ภาพ Video Wall ค้าง/ไม่ขึ้น', 21),
    ('PA Offline', 14),
    ('PA Online แต่เสียงไม่ออก', 15),
    ('VPN เข้า MikroTik ไม่ได้', 8),
    ('Dying Gasp', 4),
    ('อินเทอร์เน็ต Offline', 2)
), it_support AS (
  SELECT department_id
  FROM department_tb
  WHERE department_code = 'it_support'
)
INSERT INTO symptom_tb (
  department_id,
  symptom_label,
  symptom_is_manual,
  symptom_hit_count,
  symptom_last_seen_at,
  symptom_created_at,
  symptom_updated_at
)
SELECT
  it_support.department_id,
  source.symptom_label,
  true,
  source.symptom_hit_count,
  NOW(),
  NOW(),
  NOW()
FROM source
CROSS JOIN it_support
ON CONFLICT (department_id, symptom_label) DO UPDATE SET
  symptom_is_manual = true,
  symptom_hit_count = GREATEST(symptom_tb.symptom_hit_count, EXCLUDED.symptom_hit_count),
  symptom_last_seen_at = NOW(),
  symptom_updated_at = NOW();
