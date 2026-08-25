import { Injectable } from '@nestjs/common';
import { SymptomSuggestionTb } from './symptom-suggestion.entity';
import { SymptomsRepository } from './symptoms.repository';

/** อาการต้องถูกแจ้งซ้ำอย่างน้อยกี่ครั้ง... */
export const SYMPTOM_QUALIFY_HIT_COUNT = 5;
/** ...ภายในกี่วันล่าสุด ถึงจะเลื่อนขึ้นเป็นปุ่มติ๊กอัตโนมัติ */
export const SYMPTOM_QUALIFY_WINDOW_DAYS = 30;

@Injectable()
export class SymptomsService {
  constructor(
    private readonly repo: SymptomsRepository,
  ) {}

  async findQualifiedByDepartment(department_id: number): Promise<SymptomSuggestionTb[]> {
    const since = new Date();
    since.setDate(since.getDate() - SYMPTOM_QUALIFY_WINDOW_DAYS);

    const all = await this.repo.findSince(department_id, since);

    return all.filter((s) => s.is_manual || s.hit_count >= SYMPTOM_QUALIFY_HIT_COUNT);
  }

  async createManual(department_id: number, label: string): Promise<SymptomSuggestionTb> {
    const normalized = this.normalize(label);
    let row = await this.repo.findByLabel(department_id, normalized);
    if (!row) {
      row = this.repo.create({ department_id, label: normalized, is_manual: true, last_seen_at: new Date() });
    } else {
      row.is_manual = true;
    }
    return this.repo.save(row);
  }

  /** นับความถี่ของ "อาการ" จากทั้งปุ่มที่ติ๊กและหัวข้อที่พิมพ์เอง เพื่อให้คำที่ซ้ำบ่อย
   *  ค่อยๆ เลื่อนขึ้นมาเป็นปุ่มติ๊กเอง */
  async recordOccurrences(department_id: number, labels: string[]): Promise<void> {
    const now = new Date();
    // หนึ่งตั๋วนับคำเดียวได้เพียงครั้งเดียว กัน subject ซ้ำกับชิปและ request ที่จงใจส่งค่าซ้ำมาปั่นสถิติ
    const uniqueLabels = [...new Set(labels.map((raw) => this.normalize(raw)).filter(Boolean))];
    for (const label of uniqueLabels) {

      let row = await this.repo.findByLabel(department_id, label);
      if (!row) {
        row = this.repo.create({ department_id, label, hit_count: 1, last_seen_at: now });
      } else {
        row.hit_count += 1;
        row.last_seen_at = now;
      }
      await this.repo.save(row);
    }
  }

  private normalize(text: string): string {
    return (text || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  }
}
