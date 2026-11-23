import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { AdminTb } from './admin.entity';
import { TicketTb } from '../tickets/entities/ticket.entity';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { Role } from '../common/enums/role.enum';

/**
 * Separate Data Layer: รวม TypeORM access ของ user (บัญชีแอดมิน) ไว้ที่นี่ที่เดียว
 * AdminsService (business logic) เรียกผ่าน repository นี้แทนที่จะยิง TypeORM ตรงๆ
 */
@Injectable()
export class AdminsRepository {
  constructor(
    @InjectRepository(AdminTb)
    private readonly adminsRepo: Repository<AdminTb>,
    @InjectRepository(TicketTb)
    private readonly ticketsRepo: Repository<TicketTb>,
  ) {}

  async findAll(): Promise<AdminTb[]> {
    return this.adminsRepo.find({
      select: ['admin_id', 'full_name', 'email', 'role', 'is_active', 'department_id', 'created_at', 'updated_at'],
      order: { created_at: 'ASC' },
    });
  }

  async findById(admin_id: number): Promise<AdminTb | null> {
    return this.adminsRepo.findOne({ where: { admin_id } });
  }

  async findByEmail(email: string): Promise<AdminTb | null> {
    return this.adminsRepo.findOne({ where: { email } });
  }

  /** ใช้เฉพาะตอน login เท่านั้น เพราะเป็นที่เดียวที่ต้องใช้ password hash */
  async findByEmailWithPassword(email: string): Promise<AdminTb | null> {
    return this.adminsRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('LOWER(user.email) = :email', { email: email.toLowerCase().trim() })
      .getOne();
  }

  create(data: Partial<AdminTb>): AdminTb {
    return this.adminsRepo.create(data);
  }

  async save(user: AdminTb): Promise<AdminTb> {
    return this.adminsRepo.save(user);
  }

  async updateFields(admin_id: number, fields: Partial<AdminTb>): Promise<void> {
    await this.adminsRepo.update({ admin_id }, fields);
  }

  async remove(admin_id: number): Promise<void> {
    await this.adminsRepo.delete({ admin_id });
  }

  /** จำนวนตั๋วที่ยังไม่ปิดที่แอดมินคนนี้ถืออยู่ ณ ตอนนี้ - ใช้เตือนตอนจะปิดใช้งานบัญชี */
  async countActiveAssignedTickets(admin_id: number): Promise<number> {
    return this.ticketsRepo.count({ where: { assignee_id: admin_id, status: Not(TicketStatus.CLOSED) } });
  }

  countHeadAdminsByDepartment(department_id: number): Promise<number> {
    return this.adminsRepo.count({ where: { department_id, role: Role.HEAD_ADMIN } });
  }
}
