import { Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Query, Sse } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Observable, of } from 'rxjs';
import { UserNotificationsService } from './user-notifications.service';
import { UsersService } from './users.service';
import { SseConnectionLimiterService } from '../common/sse/sse-connection-limiter.service';
import { LineVerifyService } from '../line/line-verify.service';
import { THROTTLE_STANDARD } from '../common/constants/throttle.constants';

/**
 * endpoint สาธารณะสำหรับผู้แจ้ง (ไม่มี JWT) ระบุตัวตนผ่าน line_id_token ที่ verify กับ LINE ก่อนเสมอ
 * ไม่รับ line_user_id ดิบเป็น path param อีกต่อไป (เดิมใครก็พิมพ์ของคนอื่นใส่ URL แล้วดูได้เลย)
 *
 * ส่ง line_id_token เป็น query param ไม่ใช่ path param โดยตั้งใจ - ค่านี้เทียบเท่า bearer token
 * ทางที่ปลอดภัยที่สุดคือย้ายไป Authorization header แต่ EventSource แนบ header เองไม่ได้
 */
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userNotificationsService: UserNotificationsService,
    private readonly lineVerifyService: LineVerifyService,
    private readonly sseLimiter: SseConnectionLimiterService,
  ) {}

  /**
   * ตัวอย่าง endpoint แบบ JavaScript-style ใน TypeScript
   * - รับ ID token จาก LIFF
   * - verify กับ LINE ก่อน ไม่เชื่อ line_user_id ที่ client ส่งมาเอง
   * - ถ้ายังไม่มี user จะสร้างให้ ถ้ามีแล้วจะอัปเดตชื่อ/รูปภาพล่าสุด
   */
  @Get('me')
  @Throttle(THROTTLE_STANDARD)
  async me(@Query('line_id_token') line_id_token: string) {
    const profile = await this.lineVerifyService.verifyIdToken(line_id_token);
    const user = await this.usersService.findOrCreateFromLineProfile(
      profile.sub,
      profile.name,
      profile.picture,
    );

    return {
      user_id: user.user_id,
      line_user_id: user.line_user_id,
      display_name: user.line_display_name,
      picture_url: user.line_picture_url,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  /** ผู้แจ้งไม่มี JwtAuthGuard คอย resolve ตัวตนให้ จึง verify line_id_token เองในนี้
   *  verify ไม่ผ่านคืน stream เปล่าแทน throw - กัน EventSource error วนรัวๆ ตอน token หมดอายุ */
  @Sse('notifications/stream')
  @Throttle(THROTTLE_STANDARD)
  async stream(@Query('line_id_token') line_id_token: string): Promise<Observable<{ data: { unread_count: number } }>> {
    const user = await this.findUserFromToken(line_id_token);
    if (!user) {
      return of();
    }
    // จำกัดจำนวน connection ที่เปิดค้างพร้อมกันต่อผู้แจ้ง 1 คน - นับด้วย user_id (ที่ verify แล้ว)
    // ไม่ใช่ IP เพราะพนักงานทั้งออฟฟิศมักออกเน็ตผ่าน IP เดียวกัน จะบล็อกกันเองโดยไม่ตั้งใจ
    return this.sseLimiter.guard(`user:${user.user_id}`, () =>
      this.userNotificationsService.streamForUser(user.user_id),
    );
  }

  @Get('notifications')
  @Throttle(THROTTLE_STANDARD)
  async listNotifications(@Query('line_id_token') line_id_token: string) {
    const user = await this.findUserFromToken(line_id_token, { throwOnInvalid: true });
    if (!user) {
      // ยังไม่เคยแจ้งตั๋วมาก่อน (หรือ token verify ไม่ผ่าน) - ถือว่าไม่มีแจ้งเตือน ไม่ error
      return [];
    }
    return this.userNotificationsService.listUnread(user.user_id);
  }

  @Get('notifications/recent')
  @Throttle(THROTTLE_STANDARD)
  async listRecent(@Query('line_id_token') line_id_token: string) {
    const user = await this.findUserFromToken(line_id_token, { throwOnInvalid: true });
    if (!user) {
      return { items: [], unread_count: 0 };
    }
    const [items, unread_count] = await Promise.all([
      this.userNotificationsService.listRecent(user.user_id),
      this.userNotificationsService.unread_count(user.user_id),
    ]);
    return { items, unread_count };
  }

  /** สาธารณะ: mark แจ้งเตือนทั้งหมดของผู้แจ้งคนนี้เป็นอ่านแล้ว
   *  หมายเหตุ: ต้องประกาศ route คงที่นี้ไว้ก่อน 'notifications/:notification_id/read' กันชนกับ path param */
  @Patch('notifications/mark-read')
  @Throttle(THROTTLE_STANDARD)
  async markAllRead(@Query('line_id_token') line_id_token: string) {
    const user = await this.findUserFromToken(line_id_token, { throwOnInvalid: true });
    if (!user) {
      throw new NotFoundException('ไม่พบผู้แจ้งปัญหานี้');
    }
    await this.userNotificationsService.markAllRead(user.user_id);
    return { success: true };
  }

  @Patch('notifications/:notification_id/read')
  @Throttle(THROTTLE_STANDARD)
  async markRead(
    @Query('line_id_token') line_id_token: string,
    @Param('notification_id', ParseIntPipe) notification_id: number,
  ) {
    const user = await this.findUserFromToken(line_id_token, { throwOnInvalid: true });
    if (!user) {
      throw new NotFoundException('ไม่พบผู้แจ้งปัญหานี้');
    }
    await this.userNotificationsService.markRead(notification_id, user.user_id);
    return { success: true };
  }

  /** throwOnInvalid: false ใช้กับ GET ที่ไม่อยาก error ทั้งก้อนถ้า token หมดอายุ
   *  true ใช้กับ endpoint ที่เขียนข้อมูล ต้อง fail-closed */
  private async findUserFromToken(line_id_token: string, options: { throwOnInvalid?: boolean } = {}) {
    try {
      const { sub: line_user_id } = await this.lineVerifyService.verifyIdToken(line_id_token);
      return this.userNotificationsService.findByLineUserId(line_user_id);
    } catch (err) {
      if (options.throwOnInvalid) throw err;
      return null;
    }
  }
}
