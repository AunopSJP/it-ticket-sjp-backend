import { Injectable, NotFoundException } from '@nestjs/common';
import { DepartmentTb } from './department.entity';
import { DepartmentsRepository } from './departments.repository';

@Injectable()
export class DepartmentsService {
  constructor(private readonly departmentsRepo: DepartmentsRepository) {}

  async findAll(): Promise<DepartmentTb[]> {
    return this.departmentsRepo.findAllActive();
  }

  async findById(department_id: number): Promise<DepartmentTb> {
    const dept = await this.departmentsRepo.findById(department_id);
    if (!dept) {
      throw new NotFoundException('ไม่พบแผนกนี้');
    }
    return dept;
  }
}