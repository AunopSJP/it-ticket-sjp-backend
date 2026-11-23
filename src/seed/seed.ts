/**
 * สคริปต์ seed ข้อมูลเริ่มต้น: รัน `npm run seed`
 * - สร้าง 9 แผนกให้ตรงกับ dropdown ฝั่ง frontend
 * - สร้างบัญชีแอดมินเริ่มต้น 1 บัญชี (อีเมล/รหัสผ่านตั้งค่าได้ผ่าน .env)
 * ปลอดภัยที่จะรันซ้ำได้หลายครั้ง (เช็คก่อนว่ามีอยู่แล้วหรือยัง ไม่สร้างซ้ำ)
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AdminTb } from '../admin/admin.entity';
import { DepartmentTb } from '../departments/department.entity';
import { TicketTb } from '../tickets/entities/ticket.entity';
import { TicketImageTb } from '../tickets/entities/ticket-image.entity';
import { TicketHistoryTb } from '../tickets/entities/ticket-history.entity';
import { SymptomSuggestionTb } from '../symptoms/symptom-suggestion.entity';
import { NotificationTb } from '../notifications/notification.entity';
import { UserTb } from '../users/user.entity';
import { UserNotificationTb } from '../notifications/user-notification.entity';
import { Role } from '../common/enums/role.enum';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

// หมายเหตุ: department_name_th ต้องเป็นภาษาไทยล้วน (ไม่ผสมอังกฤษ) เพราะหน้าฟอร์มแจ้งปัญหา
// แสดงเฉพาะชื่อไทยเท่านั้น - department_name_en เก็บไว้ใช้งานภายใน/เอกสารเท่านั้น
const DEPARTMENTS: Array<{ code: string; en: string; th: string }> = [
  { code: 'pm', en: 'PM', th: 'ผู้จัดการโครงการ' },
  { code: 'sales', en: 'Sales', th: 'ฝ่ายขาย' },
  { code: 'technician_support', en: 'Technician Support', th: 'ช่างเทคนิค' },
  { code: 'network_support', en: 'Network Support', th: 'ดูแลระบบเครือข่าย' },
  { code: 'it_support', en: 'IT Support', th: 'ไอทีซัพพอร์ต' },
  { code: 'accounting', en: 'Accounting', th: 'บัญชี' },
  { code: 'post_sales', en: 'Post Sales', th: 'หลังการขาย' },
  { code: 'developer', en: 'Developer', th: 'นักพัฒนาระบบ' },
  { code: 'procurement_hr', en: 'Procurement/HR', th: 'จัดซื้อ/ทรัพยากรบุคคล' },
  // แผนก "อื่นๆ" ใช้ตอนไม่เจอแผนกที่ต้องการ - เลือกแล้วพิมพ์ชื่อเองในช่องข้อความ
  // (แทนฟีเจอร์เดิมที่สร้างแผนกใหม่ถาวรได้ ซึ่งถูกลบออกแล้ว)
  { code: 'other', en: 'Other (please specify)', th: 'อื่นๆ (โปรดระบุ)' },
];

/** อาการตั้งต้นของ IT Support สรุปจากแท็บ "เคสเสีย" ในชีตงานจริง
 * รวมคำที่สะกด/เว้นวรรคต่างกันให้อยู่ในหมวดเดียว เพื่อให้ผู้แจ้งเลือกได้ง่าย */
const IT_SUPPORT_SYMPTOMS: Array<{ label: string; hit_count: number }> = [
  { label: 'ONU LOS / ไฟ PON ไม่ติด', hit_count: 101 },
  { label: 'เสา Offline', hit_count: 108 },
  { label: 'กล้อง Offline', hit_count: 34 },
  { label: 'ภาพกล้องไม่ขึ้น', hit_count: 38 },
  { label: 'ภาพ Video Wall ค้าง/ไม่ขึ้น', hit_count: 21 },
  { label: 'PA Offline', hit_count: 14 },
  { label: 'PA Online แต่เสียงไม่ออก', hit_count: 15 },
  { label: 'VPN เข้า MikroTik ไม่ได้', hit_count: 8 },
  { label: 'Dying Gasp', hit_count: 4 },
  { label: 'อินเทอร์เน็ต Offline', hit_count: 2 },
];

/** รายการยอดนิยมตั้งต้นของแต่ละแผนก เพื่อให้ผู้แจ้งเลือกหัวข้อได้เร็วตั้งแต่วันแรก
 * hit_count เป็นเพียงลำดับเริ่มต้น หลังใช้งานจริงระบบจะเรียนรู้จากจำนวนเคสต่อไปเอง */
const DEPARTMENT_POPULAR_SYMPTOMS: Record<string, Array<{ label: string; hit_count: number }>> = {
  pm: [
    { label: 'ขออนุมัติหรือขอคำตัดสินใจ', hit_count: 60 },
    { label: 'งานล่าช้ากว่าแผน', hit_count: 50 },
    { label: 'ประสานงานระหว่างทีม', hit_count: 40 },
    { label: 'ขอเปลี่ยนแปลงขอบเขตงาน', hit_count: 30 },
    { label: 'ติดตามความคืบหน้าโครงการ', hit_count: 20 },
  ],
  sales: [
    { label: 'ขอใบเสนอราคา', hit_count: 60 },
    { label: 'ข้อมูลลูกค้าหรือโครงการไม่ครบ', hit_count: 50 },
    { label: 'ติดตามสถานะการขาย', hit_count: 40 },
    { label: 'แก้ไขข้อมูลในเอกสารเสนอขาย', hit_count: 30 },
    { label: 'ขอข้อมูลสินค้าหรือบริการ', hit_count: 20 },
  ],
  technician_support: [
    { label: 'อุปกรณ์เปิดไม่ติด', hit_count: 60 },
    { label: 'อุปกรณ์ทำงานผิดปกติ', hit_count: 50 },
    { label: 'ต้องการเข้าตรวจสอบหน้างาน', hit_count: 40 },
    { label: 'ขอเปลี่ยนหรือซ่อมอุปกรณ์', hit_count: 30 },
    { label: 'ติดตั้งอุปกรณ์เพิ่มเติม', hit_count: 20 },
  ],
  network_support: [
    { label: 'อินเทอร์เน็ตใช้งานไม่ได้', hit_count: 60 },
    { label: 'สัญญาณช้าหรือหลุดบ่อย', hit_count: 50 },
    { label: 'เชื่อมต่อ Wi-Fi ไม่ได้', hit_count: 40 },
    { label: 'เข้า VPN ไม่ได้', hit_count: 30 },
    { label: 'อุปกรณ์เครือข่าย Offline', hit_count: 20 },
  ],
  accounting: [
    { label: 'ขอใบแจ้งหนี้หรือใบเสร็จ', hit_count: 60 },
    { label: 'ข้อมูลยอดเงินไม่ถูกต้อง', hit_count: 50 },
    { label: 'ติดตามสถานะการชำระเงิน', hit_count: 40 },
    { label: 'แก้ไขข้อมูลเอกสารบัญชี', hit_count: 30 },
    { label: 'ขอเอกสารภาษี', hit_count: 20 },
  ],
  post_sales: [
    { label: 'ติดตามงานหลังส่งมอบ', hit_count: 60 },
    { label: 'แจ้งปัญหาหลังติดตั้ง', hit_count: 50 },
    { label: 'ขอเข้าตรวจสอบหน้างาน', hit_count: 40 },
    { label: 'ขอเอกสารรับประกัน', hit_count: 30 },
    { label: 'ลูกค้าต้องการคำแนะนำการใช้งาน', hit_count: 20 },
  ],
  developer: [
    { label: 'ระบบเข้าใช้งานไม่ได้', hit_count: 60 },
    { label: 'หน้าจอหรือข้อมูลแสดงผิด', hit_count: 50 },
    { label: 'บันทึกหรือแก้ไขข้อมูลไม่ได้', hit_count: 40 },
    { label: 'ระบบทำงานช้าหรือค้าง', hit_count: 30 },
    { label: 'ขอเพิ่มหรือปรับฟังก์ชัน', hit_count: 20 },
  ],
  procurement_hr: [
    { label: 'ขอจัดซื้ออุปกรณ์หรือวัสดุ', hit_count: 60 },
    { label: 'ติดตามสถานะการจัดซื้อ', hit_count: 50 },
    { label: 'ขอเอกสารพนักงาน', hit_count: 40 },
    { label: 'แก้ไขข้อมูลพนักงาน', hit_count: 30 },
    { label: 'แจ้งปัญหาเวลาเข้างานหรือลางาน', hit_count: 20 },
  ],
};

async function run() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase().trim();
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || '';
  if (!adminEmail || !seedPassword) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required; refusing to use default credentials');
  }
  if (seedPassword.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
  }

  const dataSource = new DataSource({
    type: 'postgres',
    host: requiredEnv('DB_HOST'),
    port: Number(requiredEnv('DB_PORT')),
    username: requiredEnv('DB_USERNAME'),
    password: requiredEnv('DB_PASSWORD'),
    database: requiredEnv('DB_NAME'),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities: [
      AdminTb,
      DepartmentTb,
      TicketTb,
      TicketImageTb,
      TicketHistoryTb,
      SymptomSuggestionTb,
      NotificationTb,
      UserTb,
      UserNotificationTb,
    ],
    // production ตารางถูกสร้างจาก database/schema.sql ไว้แล้ว seed ไม่ควรแก้โครงสร้างทับ
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
  });

  await dataSource.initialize();
  console.log('🔌 เชื่อมต่อฐานข้อมูลสำเร็จ');

  const deptRepo = dataSource.getRepository(DepartmentTb);
  for (const dept of DEPARTMENTS) {
    const existing = await deptRepo.findOne({ where: { department_code: dept.code } });
    if (existing) {
      // sync ชื่อให้ตรงกับ DEPARTMENTS เสมอ (เฉพาะแผนกมาตรฐานตาม code ด้านบน) เผื่อรันซ้ำ
      // หลังแก้ชื่อให้เป็นภาษาไทยล้วน - แผนกที่ผู้แจ้งเคยพิมพ์เพิ่มเอง (is_custom = true) จะไม่ถูกแตะเลย
      // เพราะ code ของแผนกเหล่านั้นสุ่มไม่ตรงกับ list นี้
      if (existing.department_name_th !== dept.th || existing.department_name_en !== dept.en) {
        await deptRepo.update(
          { department_id: existing.department_id },
          { department_name_th: dept.th, department_name_en: dept.en },
        );
        console.log(`🔄 อัปเดตชื่อแผนก "${dept.code}" เป็น "${dept.th}" แล้ว`);
      } else {
        console.log(`↷ ข้ามแผนก "${dept.en}" (มีอยู่แล้ว)`);
      }
      continue;
    }
    await deptRepo.save(
      deptRepo.create({
        department_code: dept.code,
        department_name_en: dept.en,
        department_name_th: dept.th,
      }),
    );
    console.log(`✅ สร้างแผนก "${dept.en}" แล้ว`);
  }

  const symptomRepo = dataSource.getRepository(SymptomSuggestionTb);
  const symptomsByDepartment = { ...DEPARTMENT_POPULAR_SYMPTOMS, it_support: IT_SUPPORT_SYMPTOMS };
  for (const [department_code, symptoms] of Object.entries(symptomsByDepartment)) {
    const department = await deptRepo.findOneOrFail({ where: { department_code } });
    for (const symptom of symptoms) {
      const existing = await symptomRepo.findOne({
        where: { department_id: department.department_id, label: symptom.label },
      });
      await symptomRepo.save(
        symptomRepo.create({
          ...existing,
          department_id: department.department_id,
          label: symptom.label,
          is_manual: true,
          hit_count: Math.max(existing?.hit_count ?? 0, symptom.hit_count),
          last_seen_at: new Date(),
        }),
      );
    }
  }
  console.log('✅ เพิ่มอาการยอดนิยมตั้งต้นของแต่ละแผนกแล้ว');

  const userRepo = dataSource.getRepository(AdminTb);
  const existingAdmin = await userRepo.findOne({ where: { email: adminEmail } });
  if (existingAdmin) {
    if (existingAdmin.role !== Role.SUPER_ADMIN || existingAdmin.department_id !== null) {
      await userRepo.update(
        { admin_id: existingAdmin.admin_id },
        { role: Role.SUPER_ADMIN, department_id: null },
      );
      console.log(`🔐 ยกระดับบัญชี "${adminEmail}" เป็น super admin แล้ว`);
    } else {
      console.log(`↷ ข้ามบัญชีแอดมิน "${adminEmail}" (เป็น super admin อยู่แล้ว)`);
    }
  } else {
    const hashedPassword = await bcrypt.hash(seedPassword, 10);
    await userRepo.save(
      userRepo.create({
        full_name: requiredEnv('SEED_ADMIN_NAME'),
        email: adminEmail,
        password: hashedPassword,
        role: Role.SUPER_ADMIN,
      }),
    );
    console.log(`✅ สร้างบัญชีแอดมิน "${adminEmail}" แล้ว`);
    console.log('   กรุณาเปลี่ยนรหัสผ่านหลัง login ครั้งแรก');
  }

  await dataSource.destroy();
  console.log('🌱 Seed ข้อมูลเสร็จสมบูรณ์');
}

run().catch((err) => {
  console.error('❌ Seed ล้มเหลว:', err);
  process.exit(1);
});
