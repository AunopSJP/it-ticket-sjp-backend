import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentTb } from './department.entity';
import { OTHER_DEPARTMENT_CODE } from '@it-ticket/shared';

/**
 * Separate Data Layer: รวม TypeORM access ของ department ไว้ที่นี่ที่เดียว
 * DepartmentsService (business logic) เรียกผ่าน repository นี้แทนที่จะยิง TypeORM ตรงๆ
 */
@Injectable()
export class DepartmentsRepository {
  constructor(
    @InjectRepository(DepartmentTb)
    private readonly repo: Repository<DepartmentTb>,
  ) {}

  async findAllActive(): Promise<DepartmentTb[]> {
    const list = await this.repo.find({ where: { is_active: true }, order: { department_name_th: 'ASC' } });
    // แผนก "อื่นๆ (โปรดระบุ)" ต้องอยู่ท้ายสุดของรายการเสมอ ไม่ว่า collation ของ DB จะเรียง
    // ตัวอักษรไทยยังไงก็ตาม (เจอเคสจริงที่ "อื่นๆ" ขึ้นก่อน "ไอทีซัพพอร์ต" เพราะเรียงตาม unicode ตรงๆ)
    return [
      ...list.filter((d) => d.department_code !== OTHER_DEPARTMENT_CODE),
      ...list.filter((d) => d.department_code === OTHER_DEPARTMENT_CODE),
    ];
  }

  async findById(department_id: number): Promise<DepartmentTb | null> {
    return this.repo.findOne({ where: { department_id } });
  }
}
