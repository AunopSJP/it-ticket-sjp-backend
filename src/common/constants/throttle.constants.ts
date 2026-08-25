/**
 * Preset สำหรับ @Throttle() ทั้งระบบ - เดิม ttl: 60000 (1 นาที) พิมพ์ซ้ำเป็น magic number
 * อยู่ทุก decorator (15 จุดทั่ว tickets/users/ticket-chat/auth controller) ต่างกันแค่ limit
 * รวมมาที่นี่ที่เดียว เปลี่ยนหน้าต่างเวลาทีเดียวได้ทุกจุด ไม่ต้องไล่แก้ทีละไฟล์
 */
const ONE_MINUTE_MS = 60_000;

/** เข้มที่สุด - endpoint ที่เขียนข้อมูล/มีความเสี่ยงสูง (เช่น สร้างตั๋วใหม่พร้อมอัปโหลดไฟล์, login) */
export const THROTTLE_STRICT = { default: { limit: 5, ttl: ONE_MINUTE_MS } };

/** มาตรฐาน - endpoint สาธารณะทั่วไปที่อ่าน/เขียนข้อมูลเบาๆ */
export const THROTTLE_STANDARD = { default: { limit: 20, ttl: ONE_MINUTE_MS } };

/** ผ่อนคลาย - endpoint ที่ต้องเรียกถี่กว่าปกติ (เช่น แชทตั๋วงาน) */
export const THROTTLE_RELAXED = { default: { limit: 30, ttl: ONE_MINUTE_MS } };
