import { Injectable } from '@nestjs/common';
import { DataSource, DeepPartial, Repository } from 'typeorm';

import { DepartmentEntity } from './department.entity';

@Injectable()
export class DepartmentRepository {
  private readonly repository: Repository<DepartmentEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(DepartmentEntity);
  }

  async findAll(): Promise<DepartmentEntity[]> {
    return this.repository.find();
  }

  async findById(id: number): Promise<DepartmentEntity | null> {
    return this.repository.findOne({ where: { department_id: id } });
  }

  async create(data: DeepPartial<DepartmentEntity>): Promise<DepartmentEntity> {
    const department = this.repository.create(data);
    return this.repository.save(department);
  }

  async update(
    id: number,
    data: DeepPartial<DepartmentEntity>,
  ): Promise<DepartmentEntity | null> {
    await this.repository.update(id, data);
    return this.findById(id);
  }
}
