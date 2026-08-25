import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogTb } from './audit-log.entity';

@Injectable()
export class AuditLogRepository {
  constructor(
    @InjectRepository(AuditLogTb)
    private readonly repo: Repository<AuditLogTb>,
  ) {}

  create(data: Partial<AuditLogTb>): AuditLogTb {
    return this.repo.create(data);
  }

  save(log: AuditLogTb): Promise<AuditLogTb> {
    return this.repo.save(log);
  }

  list(limit: number): Promise<AuditLogTb[]> {
    return this.repo.find({
      order: { admin_created_at: 'DESC' },
      take: limit,
    });
  }
}
