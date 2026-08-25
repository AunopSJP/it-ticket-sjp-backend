import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AdminTb } from './admin.entity';
import { AdminsRepository } from './admins.repository';
import { CreateAdminInput } from '@it-ticket/shared';
import { Role } from '../common/enums/role.enum';

/** จำนวนรอบ salt สำหรับ bcrypt hash รหัสผ่าน */
const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AdminsService {
  constructor(
    private readonly adminsRepo: AdminsRepository,
  ) {}

  async findAll(): Promise<AdminTb[]> {
    return this.adminsRepo.findAll();
  }

  async findAllForSuperAdmin(requestingUser: AdminTb): Promise<AdminTb[]> {
    if (requestingUser.department_id !== null) {
      throw new ForbiddenException('เฉพาะผู้ดูแลระบบ (super admin) เท่านั้นที่ดูบัญชีแอดมินทั้งหมดได้');
    }
    return this.findAll();
  }

  async findById(admin_id: number): Promise<AdminTb> {
    const user = await this.adminsRepo.findById(admin_id);
    if (!user) {
      throw new NotFoundException('ไม่พบผู้ใช้งานนี้');
    }
    return user;
  }

  /** ใช้เฉพาะตอน login เท่านั้น เพราะเป็นที่เดียวที่ต้องใช้ password hash */
  async findByEmailWithPassword(email: string): Promise<AdminTb | null> {
    return this.adminsRepo.findByEmailWithPassword(email);
  }

  async create(dto: CreateAdminInput): Promise<AdminTb> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.adminsRepo.findByEmail(email);
    if (existing) {
      throw new ConflictException('อีเมลนี้ถูกใช้งานแล้ว');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = this.adminsRepo.create({
      full_name: dto.full_name,
      email,
      password: hashedPassword,
      role: Role.ADMIN,
      department_id: dto.department_id ?? null,
    });
    const saved = await this.adminsRepo.save(user);
    return saved;
  }

  async createBySuperAdmin(dto: CreateAdminInput, requestingUser: AdminTb): Promise<AdminTb> {
    if (requestingUser.department_id !== null) {
      throw new ForbiddenException('เฉพาะผู้ดูแลระบบ (super admin) เท่านั้นที่สร้างบัญชีแอดมินใหม่ได้');
    }
    return this.create(dto);
  }

  /** ปิด/เปิดบัญชีตัวเองไม่ได้เด็ดขาด
   *
   *  คืน active_assigned_ticket_count มาด้วยเสมอ - จงใจไม่ auto-reassign ตั๋วที่ค้างอยู่
   *  เพราะเป็นการตัดสินใจเชิงธุรกิจที่ super admin ควรเลือกเอง แค่เตือนให้เห็นว่าต้องไปจัดการต่อ */
  async setActive(
    admin_id: number,
    is_active: boolean,
    requestingUser: AdminTb,
  ): Promise<{ user: AdminTb; active_assigned_ticket_count: number }> {
    if (requestingUser.department_id !== null) {
      throw new ForbiddenException('เฉพาะผู้ดูแลระบบ (super admin) เท่านั้นที่เปิด/ปิดใช้งานบัญชีแอดมินคนอื่นได้');
    }
    if (admin_id === requestingUser.admin_id) {
      throw new ForbiddenException('ไม่สามารถจัดการบัญชีของตัวเองได้');
    }

    await this.findById(admin_id); // ตรวจสอบว่ามี user นี้จริงไหม (ถ้าไม่มีจะ throw 404)

    await this.adminsRepo.updateFields(admin_id, { is_active });

    const [user, active_assigned_ticket_count] = await Promise.all([
      this.findById(admin_id),
      is_active ? Promise.resolve(0) : this.adminsRepo.countActiveAssignedTickets(admin_id),
    ]);

    return { user, active_assigned_ticket_count };
  }

  /** ลบบัญชีแอดมิน - เฉพาะ super admin (department_id null) เท่านั้นที่เรียกได้ (กันไม่ให้ลบบัญชีตัวเอง) */
  async remove(admin_id: number, requestingUser: AdminTb): Promise<void> {
    if (requestingUser.department_id !== null) {
      throw new ForbiddenException('เฉพาะผู้ดูแลระบบ (super admin) เท่านั้นที่ลบบัญชีแอดมินคนอื่นได้');
    }
    if (admin_id === requestingUser.admin_id) {
      throw new ForbiddenException('ไม่สามารถจัดการบัญชีของตัวเองได้');
    }

    await this.findById(admin_id);
    await this.adminsRepo.remove(admin_id);
  }

  async updateProfile(
    admin_id: number,
    full_name: string,
    email: string,
    requestingUser: AdminTb,
  ): Promise<AdminTb> {
    if (requestingUser.department_id !== null) {
      throw new ForbiddenException('เฉพาะผู้ดูแลระบบ (super admin) เท่านั้นที่แก้ไขข้อมูลแอดมินคนอื่นได้');
    }

    await this.findById(admin_id); // ตรวจสอบว่ามี user นี้จริงไหม

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await this.adminsRepo.findByEmail(normalizedEmail);
    if (existing && existing.admin_id !== admin_id) {
      throw new ConflictException('อีเมลนี้ถูกใช้งานแล้ว');
    }

    await this.adminsRepo.updateFields(admin_id, { full_name, email: normalizedEmail });
    return this.findById(admin_id);
  }

  /** ใช้แทนการ "ดูรหัสผ่านเดิม" ซึ่งเป็นไปไม่ได้เพราะเก็บเป็น bcrypt hash ทางเดียว */
  async resetPassword(
    admin_id: number,
    new_password: string,
    requestingUser: AdminTb,
  ): Promise<AdminTb> {
    if (requestingUser.department_id !== null) {
      throw new ForbiddenException('เฉพาะผู้ดูแลระบบ (super admin) เท่านั้นที่ตั้งรหัสผ่านใหม่ให้แอดมินคนอื่นได้');
    }

    await this.findById(admin_id); // ตรวจสอบว่ามี user นี้จริงไหม

    const hashedPassword = await bcrypt.hash(new_password, BCRYPT_SALT_ROUNDS);
    await this.adminsRepo.updateFields(admin_id, { password: hashedPassword });
    return this.findById(admin_id);
  }

  async validatePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async updateDepartment(
    admin_id: number,
    department_id: number | null,
    requestingUser: AdminTb,
  ): Promise<AdminTb> {
    if (requestingUser.department_id !== null) {
      throw new ForbiddenException('เฉพาะผู้ดูแลระบบ (super admin) เท่านั้นที่กำหนดแผนกของแอดมินคนอื่นได้');
    }

    await this.findById(admin_id); // ตรวจสอบว่ามี user นี้จริงไหม

    await this.adminsRepo.updateFields(admin_id, { department_id });
    return this.findById(admin_id);
  }
}
