import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_KEY = 'allowPasswordChange';

/**
 * ทำเครื่องหมาย endpoint ที่ผู้ใช้ซึ่งยังต้องเปลี่ยนรหัสผ่าน (must_change_password) เรียกได้
 * (เช่น ดูโปรไฟล์ตัวเอง และเปลี่ยนรหัสผ่าน) - endpoint อื่นถูก JwtAuthGuard บล็อกทั้งหมด
 */
export const AllowPasswordChange = () => SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);
