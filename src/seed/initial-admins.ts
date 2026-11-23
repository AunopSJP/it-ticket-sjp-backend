import { Role } from '../common/enums/role.enum';

/**
 * บัญชีแอดมินเริ่มต้นของระบบ (super admin ไม่ผูกแผนก) - `npm run seed` สร้างให้ถ้ายังไม่มีเบอร์นั้นในระบบ
 * บัญชีอื่นที่เพิ่มภายหลังถูกออกให้จากหน้า "จัดการบัญชีแอดมิน" โดยสองบัญชีนี้เท่านั้น
 *
 * - login ด้วยเบอร์โทร + รหัสผ่านด้านล่าง และถูกบังคับเปลี่ยนรหัสผ่านทันทีที่เข้าใช้งานครั้งแรก
 * - รหัสผ่านในไฟล์นี้ใช้ได้แค่ครั้งแรก: seed จะไม่แก้รหัสของบัญชีที่มีอยู่แล้ว
 *   (ถึงจะรัน seed ซ้ำหลังเปลี่ยนรหัสไปแล้ว รหัสใหม่ก็ไม่ถูกเขียนทับ)
 * - แก้ชื่อ-นามสกุลได้ตามต้องการก่อนรัน seed
 */
export interface InitialAdmin {
  full_name: string;
  /** เบอร์มือถือ 10 หลักขึ้นต้น 0 เขียนติดกันไม่มีขีด */
  phone: string;
  /** รหัสผ่านชั่วคราว (ผู้ใช้ต้องเปลี่ยนตอน login ครั้งแรก) */
  temporary_password: string;
  role: Role.SUPER_ADMIN;
}

export const INITIAL_ADMINS: readonly InitialAdmin[] = [
  {
    full_name: 'ผู้ดูแลระบบ 1',
    phone: '0924320342',
    temporary_password: '@dmin123456',
    role: Role.SUPER_ADMIN,
  },
  {
    full_name: 'ผู้ดูแลระบบ 2',
    phone: '0800907356',
    temporary_password: '@dmin123456',
    role: Role.SUPER_ADMIN,
  },
];
