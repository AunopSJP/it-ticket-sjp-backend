-- อาการยอดนิยมตั้งต้นของแต่ละแผนก (IT Support ใช้ข้อมูลเคสจริงจาก migration 007 แล้ว)
-- is_manual=true ทำให้แสดงทันที และระบบยังเพิ่ม hit_count จากเคสจริงต่อไปได้
WITH source_raw(department_code, symptom_label, symptom_hit_count) AS (
  VALUES
    ('pm', 'ขออนุมัติหรือขอคำตัดสินใจ', 60),
    ('pm', 'งานล่าช้ากว่าแผน', 50),
    ('pm', 'ประสานงานระหว่างทีม', 40),
    ('pm', 'ขอเปลี่ยนแปลงขอบเขตงาน', 30),
    ('pm', 'ติดตามความคืบหน้าโครงการ', 20),
    ('sales', 'ขอใบเสนอราคา', 60),
    ('sales', 'ข้อมูลลูกค้าหรือโครงการไม่ครบ', 50),
    ('sales', 'ติดตามสถานะการขาย', 40),
    ('sales', 'แก้ไขข้อมูลในเอกสารเสนอขาย', 30),
    ('sales', 'ขอข้อมูลสินค้าหรือบริการ', 20),
    ('technician_support', 'อุปกรณ์เปิดไม่ติด', 60),
    ('technician_support', 'อุปกรณ์ทำงานผิดปกติ', 50),
    ('technician_support', 'ต้องการเข้าตรวจสอบหน้างาน', 40),
    ('technician_support', 'ขอเปลี่ยนหรือซ่อมอุปกรณ์', 30),
    ('technician_support', 'ติดตั้งอุปกรณ์เพิ่มเติม', 20),
    ('network_support', 'อินเทอร์เน็ตใช้งานไม่ได้', 60),
    ('network_support', 'สัญญาณช้าหรือหลุดบ่อย', 50),
    ('network_support', 'เชื่อมต่อ Wi-Fi ไม่ได้', 40),
    ('network_support', 'เข้า VPN ไม่ได้', 30),
    ('network_support', 'อุปกรณ์เครือข่าย Offline', 20),
    ('accounting', 'ขอใบแจ้งหนี้หรือใบเสร็จ', 60),
    ('accounting', 'ข้อมูลยอดเงินไม่ถูกต้อง', 50),
    ('accounting', 'ติดตามสถานะการชำระเงิน', 40),
    ('accounting', 'แก้ไขข้อมูลเอกสารบัญชี', 30),
    ('accounting', 'ขอเอกสารภาษี', 20),
    ('post_sales', 'ติดตามงานหลังส่งมอบ', 60),
    ('post_sales', 'แจ้งปัญหาหลังติดตั้ง', 50),
    ('post_sales', 'ขอเข้าตรวจสอบหน้างาน', 40),
    ('post_sales', 'ขอเอกสารรับประกัน', 30),
    ('post_sales', 'ลูกค้าต้องการคำแนะนำการใช้งาน', 20),
    ('developer', 'ระบบเข้าใช้งานไม่ได้', 60),
    ('developer', 'หน้าจอหรือข้อมูลแสดงผิด', 50),
    ('developer', 'บันทึกหรือแก้ไขข้อมูลไม่ได้', 40),
    ('developer', 'ระบบทำงานช้าหรือค้าง', 30),
    ('developer', 'ขอเพิ่มหรือปรับฟังก์ชัน', 20),
    ('procurement_hr', 'ขอจัดซื้ออุปกรณ์หรือวัสดุ', 60),
    ('procurement_hr', 'ติดตามสถานะการจัดซื้อ', 50),
    ('procurement_hr', 'ขอเอกสารพนักงาน', 40),
    ('procurement_hr', 'แก้ไขข้อมูลพนักงาน', 30),
    ('procurement_hr', 'แจ้งปัญหาเวลาเข้างานหรือลางาน', 20)
), source AS (
  SELECT department_code, symptom_label, MAX(symptom_hit_count) AS symptom_hit_count
  FROM source_raw
  GROUP BY department_code, symptom_label
)
INSERT INTO symptom_tb (
  department_id, symptom_label, symptom_is_manual, symptom_hit_count,
  symptom_last_seen_at, symptom_created_at, symptom_updated_at
)
SELECT
  department.department_id, source.symptom_label, true, source.symptom_hit_count,
  NOW(), NOW(), NOW()
FROM source
JOIN LATERAL (
  -- รองรับฐานข้อมูลเก่าที่เคยมี department_code ซ้ำก่อนเพิ่ม unique constraint
  SELECT department_id
  FROM department_tb
  WHERE department_code = source.department_code
  ORDER BY department_id
  LIMIT 1
) department ON true
ON CONFLICT (department_id, symptom_label) DO UPDATE SET
  symptom_is_manual = true,
  symptom_hit_count = GREATEST(symptom_tb.symptom_hit_count, EXCLUDED.symptom_hit_count),
  symptom_last_seen_at = NOW(),
  symptom_updated_at = NOW();
