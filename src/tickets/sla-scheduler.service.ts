import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { errorStack } from '../common/error-utils';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 นาที

/**
 * [Background Job] ตรวจ SLA เป็นระยะ: ใกล้ครบ/เกินกำหนด -> แจ้งเตือน + flag แดง
 * และ auto-close ตั๋วที่รอผู้แจ้งยืนยันเกินเวลา
 *
 * ใช้ setInterval แทน @nestjs/schedule (ไม่ต้องเพิ่ม dependency) - ถ้ารันหลาย instance
 * ในอนาคตต้องย้ายไป job queue กลาง ไม่งั้นงานจะซ้ำ
 */
@Injectable()
export class SlaSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ticketsService: TicketsService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.runChecks(), CHECK_INTERVAL_MS);
    // เช็ครอบแรกทันทีตอน backend สตาร์ทขึ้นมา ไม่ต้องรอ 5 นาทีแรก
    void this.runChecks();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async runChecks(): Promise<void> {
    try {
      await this.ticketsService.checkSlaForActiveTickets();
      await this.ticketsService.autoCloseUnconfirmedTickets();
    } catch (err) {
      this.logger.error('SLA background job ล้มเหลว:', errorStack(err));
    }
  }
}
