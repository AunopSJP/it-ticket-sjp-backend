import { Injectable, NotFoundException } from '@nestjs/common';
import { OTHER_DEPARTMENT_CODE } from '@it-ticket/shared';
import { DepartmentTb } from './department.entity';
import { DepartmentsRepository } from './departments.repository';

@Injectable()
export class DepartmentsService {
  constructor(private readonly departmentsRepo: DepartmentsRepository) {}

  async findAll(): Promise<DepartmentTb[]> {
    return this.departmentsRepo.findAllActive();
  }

  async findByCode(department_code: string): Promise<DepartmentTb | null> {
    const list = await this.departmentsRepo.findAllActive();
    return list.find((dept) => dept.department_code === department_code) ?? null;
  }

  /** แผนกเริ่มต้นเมื่อผู้แจ้งไม่เลือก (สเปก: ค่าเริ่มต้นหมวดคือ "ไม่แน่ใจ") */
  async findFallback(): Promise<DepartmentTb> {
    const dept = await this.findByCode(OTHER_DEPARTMENT_CODE);
    if (!dept) {
      throw new NotFoundException('ไม่พบแผนกเริ่มต้นสำหรับรับเรื่อง');
    }
    return dept;
  }

  async findById(department_id: number): Promise<DepartmentTb> {
    const dept = await this.departmentsRepo.findById(department_id);
    if (!dept) {
      throw new NotFoundException('ไม่พบแผนกนี้');
    }
    return dept;
  }
}