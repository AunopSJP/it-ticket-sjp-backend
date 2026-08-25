import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, finalize, of } from 'rxjs';

/**
 * จำกัดจำนวน SSE connection ที่เปิดค้างพร้อมกัน
 *
 * @Sse() เปิด connection ค้างได้นานเป็นชั่วโมง (nginx ตั้ง proxy_read_timeout 1h) ต่างจาก REST
 * ที่ตอบเสร็จแล้วปิด - rate limit แบบ "กี่ครั้งต่อนาที" จึงกันไม่ได้เลย เพราะคนร้ายไม่ต้องยิงรัว
 * แค่เปิดค้างเยอะๆ ครั้งเดียวก็กิน socket จนหมดแล้ว ที่นี่จึงนับ "จำนวนที่เปิดค้างอยู่" แทน
 *
 * ปฏิเสธด้วยการคืน stream เปล่า ไม่ throw - EventSource ฝั่ง frontend จะได้ไม่ error วนรัวๆ
 * และยังมี polling fallback ทำงานแทนอยู่แล้ว
 */
@Injectable()
export class SseConnectionLimiterService {
  private readonly logger = new Logger(SseConnectionLimiterService.name);

  private readonly perKey = new Map<string, number>();
  private total = 0;

  private readonly maxPerKey: number;
  private readonly maxTotal: number;

  constructor(config: ConfigService) {
    // 5 ต่อคน: เผื่อเปิดหลายแท็บ/หลายหน้าพร้อมกันตามปกติ (กระดิ่งแจ้งเตือน + หน้าแชท) แต่ไม่ปล่อยไม่จำกัด
    this.maxPerKey = Number(config.get('SSE_MAX_CONNECTIONS_PER_CLIENT', 5));
    this.maxTotal = Number(config.get('SSE_MAX_CONNECTIONS_TOTAL', 500));
  }

  /** @param key ตัวระบุผู้เชื่อมต่อ - `admin:<admin_id>` หรือ `user:<user_id>` */
  guard<T>(key: string, createStream: () => Observable<T>): Observable<T> {
    const current = this.perKey.get(key) ?? 0;

    if (this.total >= this.maxTotal) {
      this.logger.warn(`ปฏิเสธ SSE connection (${key}) - ถึงเพดานรวมทั้งระบบแล้ว (${this.maxTotal})`);
      return of();
    }
    if (current >= this.maxPerKey) {
      this.logger.warn(`ปฏิเสธ SSE connection (${key}) - เกินเพดานต่อผู้ใช้ (${this.maxPerKey})`);
      return of();
    }

    this.perKey.set(key, current + 1);
    this.total += 1;

    // finalize ทำงานทั้งตอน client ปิดแท็บ, connection หลุด และตอน stream จบเอง
    // ถ้าไม่ปล่อยตรงนี้ ตัวนับจะค้างจนเปิดใหม่ไม่ได้อีกเลย
    return createStream().pipe(
      finalize(() => {
        const remaining = (this.perKey.get(key) ?? 1) - 1;
        if (remaining <= 0) {
          this.perKey.delete(key);
        } else {
          this.perKey.set(key, remaining);
        }
        this.total = Math.max(0, this.total - 1);
      }),
    );
  }
}
