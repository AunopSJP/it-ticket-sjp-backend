import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
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
    if (requestingUser.role === Role.SUPER_ADMIN && requestingUser.department_id === null) return this.findAll();
    if (requestingUser.role === Role.HEAD_ADMIN && requestingUser.department_id !== null) {
      return (await this.findAll()).filter((user) => user.department_id === requestingUser.department_id);
    }
    throw new ForbiddenException('ไม่มีสิทธิ์ดูบัญชีแอดมิน');
  }

  private async managedAdmin(admin_id: number, requestingUser: AdminTb): Promise<AdminTb> {
    const target = await this.findById(admin_id);
    if (requestingUser.role === Role.SUPER_ADMIN && requestingUser.department_id === null) return target;
    if (requestingUser.role === Role.HEAD_ADMIN && target.role === Role.ADMIN && target.department_id === requestingUser.department_id) return target;
    throw new ForbiddenException('ไม่มีสิทธิ์จัดการบัญชีนี้');
  }

  async findById(admin_id: number): Promise<AdminTb> {
    const user = await this.adminsRepo.findById(admin_id);
    if (!user) {
      throw new NotFoundException('ไม่พบผู้ใช้งานนี้');
    }
    return user;
  }

  /** ใช้เฉพาะตอน login (เบอร์โทร หรืออีเมลของบัญชีเก่า) เพราะต้องใช้ password hash */
  async findByUsernameWithPassword(username: string): Promise<AdminTb | null> {
    return this.adminsRepo.findByUsernameWithPassword(username);
  }

  private normalizeEmail(email: string | null | undefined): string | null {
    const value = email?.toLowerCase().trim();
    return value ? value : null;
  }

  private async assertContactUnique(phone: string, email: string | null, exceptAdminId?: number): Promise<void> {
    const byPhone = await this.adminsRepo.findByPhone(phone);
    if (byPhone && byPhone.admin_id !== exceptAdminId) {
      throw new ConflictException('เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว');
    }
    if (email) {
      const byEmail = await this.adminsRepo.findByEmail(email);
      if (byEmail && byEmail.admin_id !== exceptAdminId) {
        throw new ConflictException('อีเมลนี้ถูกใช้งานแล้ว');
      }
    }
  }

  /**
   * บัญชีที่ออกให้โดยผู้ดูแลระบบใช้รหัสผ่านชั่วคราว - must_change_password = true เสมอ
   * ให้เจ้าของบัญชีตั้งรหัสเองตอน login ครั้งแรก (ผู้ออกบัญชีรู้รหัสชั่วคราวเท่านั้น)
   */
  async create(dto: CreateAdminInput, role: Role = Role.ADMIN): Promise<AdminTb> {
    const email = this.normalizeEmail(dto.email);
    await this.assertContactUnique(dto.phone, email);

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = this.adminsRepo.create({
      full_name: dto.full_name,
      phone: dto.phone,
      email,
      password: hashedPassword,
      must_change_password: true,
      role,
      department_id: dto.department_id ?? null,
    });
    const saved = await this.adminsRepo.save(user);
    return saved;
  }

  async createBySuperAdmin(dto: CreateAdminInput, requestingUser: AdminTb): Promise<AdminTb> {
    if (requestingUser.role !== Role.SUPER_ADMIN || requestingUser.department_id !== null) {
      throw new ForbiddenException('เฉพาะผู้ดูแลระบบ (super admin) เท่านั้นที่สร้างบัญชีแอดมินใหม่ได้');
    }
    const role = dto.role === 'super_admin'
      ? Role.SUPER_ADMIN
      : dto.role === 'head_admin'
        ? Role.HEAD_ADMIN
        : Role.ADMIN;
    if (role === Role.SUPER_ADMIN && dto.department_id !== undefined && dto.department_id !== null) {
      throw new ForbiddenException('super admin ต้องไม่ผูกกับแผนก');
    }
    if (role !== Role.SUPER_ADMIN && (dto.department_id === undefined || dto.department_id === null)) {
      throw new ForbiddenException('admin และ head admin ต้องผูกกับแผนก');
    }
    if (role === Role.HEAD_ADMIN && dto.department_id !== undefined && dto.department_id !== null) {
      const headCount = await this.adminsRepo.countHeadAdminsByDepartment(dto.department_id);
      if (headCount >= 2) throw new ConflictException('แต่ละแผนกมี head admin ได้สูงสุด 2 คน');
    }
    return this.create(dto, role);
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
    if (admin_id === requestingUser.admin_id) {
      throw new ForbiddenException('ไม่สามารถจัดการบัญชีของตัวเองได้');
    }

    await this.managedAdmin(admin_id, requestingUser);

    await this.adminsRepo.updateFields(admin_id, { is_active });

    const [user, active_assigned_ticket_count] = await Promise.all([
      this.findById(admin_id),
      is_active ? Promise.resolve(0) : this.adminsRepo.countActiveAssignedTickets(admin_id),
    ]);

    return { user, active_assigned_ticket_count };
  }

  /** ลบบัญชีแอดมิน - เฉพาะ super admin (department_id null) เท่านั้นที่เรียกได้ (กันไม่ให้ลบบัญชีตัวเอง) */
  async remove(admin_id: number, requestingUser: AdminTb): Promise<void> {
    if (admin_id === requestingUser.admin_id) {
      throw new ForbiddenException('ไม่สามารถจัดการบัญชีของตัวเองได้');
    }

    await this.managedAdmin(admin_id, requestingUser);
    await this.adminsRepo.remove(admin_id);
  }

  async updateProfile(
    admin_id: number,
    full_name: string,
    phone: string,
    email: string | null | undefined,
    requestingUser: AdminTb,
  ): Promise<AdminTb> {
    await this.managedAdmin(admin_id, requestingUser);

    const normalizedEmail = this.normalizeEmail(email);
    await this.assertContactUnique(phone, normalizedEmail, admin_id);

    await this.adminsRepo.updateFields(admin_id, { full_name, phone, email: normalizedEmail });
    return this.findById(admin_id);
  }

  /** ใช้แทนการ "ดูรหัสผ่านเดิม" ซึ่งเป็นไปไม่ได้เพราะเก็บเป็น bcrypt hash ทางเดียว */
  async resetPassword(
    admin_id: number,
    new_password: string,
    requestingUser: AdminTb,
  ): Promise<AdminTb> {
    await this.managedAdmin(admin_id, requestingUser);

    const hashedPassword = await bcrypt.hash(new_password, BCRYPT_SALT_ROUNDS);
    // รหัสที่ผู้ดูแลตั้งให้เป็นรหัสชั่วคราว - เจ้าของบัญชีต้องเปลี่ยนเองตอน login ครั้งถัดไป
    await this.adminsRepo.updateFields(admin_id, { password: hashedPassword, must_change_password: true });
    return this.findById(admin_id);
  }

  /**
   * เปลี่ยนรหัสผ่านของตัวเอง (ใช้ตอนถูกบังคับเปลี่ยนครั้งแรก) - ต้องยืนยันรหัสเดิมก่อนเสมอ
   * ไม่ผ่าน managedAdmin เพราะเป็นบัญชีของตัวเอง
   */
  async changeOwnPassword(admin_id: number, current_password: string, new_password: string): Promise<AdminTb> {
    const user = await this.adminsRepo.findByIdWithPassword(admin_id);
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้งานนี้');
    if (!(await bcrypt.compare(current_password, user.password))) {
      throw new UnauthorizedException('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }
    const hashedPassword = await bcrypt.hash(new_password, BCRYPT_SALT_ROUNDS);
    await this.adminsRepo.updateFields(admin_id, { password: hashedPassword, must_change_password: false });
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
    if (requestingUser.role !== Role.SUPER_ADMIN || requestingUser.department_id !== null) {
      throw new ForbiddenException('เฉพาะผู้ดูแลระบบ (super admin) เท่านั้นที่กำหนดแผนกของแอดมินคนอื่นได้');
    }

    await this.findById(admin_id); // ตรวจสอบว่ามี user นี้จริงไหม

    const targetRole = (await this.findById(admin_id)).role;
    if (targetRole === Role.SUPER_ADMIN && department_id !== null) {
      throw new ForbiddenException('super admin ต้องไม่ผูกกับแผนก');
    }

    await this.adminsRepo.updateFields(admin_id, { department_id });
    return this.findById(admin_id);
  }
}
