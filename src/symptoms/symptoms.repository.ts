import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { SymptomSuggestionTb } from './symptom-suggestion.entity';

@Injectable()
export class SymptomsRepository {
  constructor(
    @InjectRepository(SymptomSuggestionTb)
    private readonly repo: Repository<SymptomSuggestionTb>,
  ) {}

  findSince(department_id: number, since: Date): Promise<SymptomSuggestionTb[]> {
    return this.repo.find({
      where: { department_id, last_seen_at: MoreThanOrEqual(since) },
      order: { hit_count: 'DESC' },
    });
  }

  findByLabel(department_id: number, label: string): Promise<SymptomSuggestionTb | null> {
    return this.repo.findOne({ where: { department_id, label } });
  }

  create(data: Partial<SymptomSuggestionTb>): SymptomSuggestionTb {
    return this.repo.create(data);
  }

  save(row: SymptomSuggestionTb): Promise<SymptomSuggestionTb> {
    return this.repo.save(row);
  }
}
