import { Controller, Get, Param, ParseIntPipe, Patch, Query, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { NotificationsService } from './notifications.service';
import { SseConnectionLimiterService } from '../common/sse/sse-connection-limiter.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminTb } from '../admin/admin.entity';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_RELAXED, THROTTLE_STANDARD } from '../common/constants/throttle.constants';

/**
 * แจ้งเตือนส่วนตัวของแอดมินแต่ละคน - push ผ่าน SSE และยังคง poll ทุก ~20 วิ ไว้เป็น fallback
 * เผื่อ SSE หลุดการเชื่อมต่อ
 */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly sseLimiter: SseConnectionLimiterService,
  ) {}

  /** รับ JWT ผ่าน query param เพราะ EventSource แนบ Authorization header เองไม่ได้
   *  ส่งแค่ unread_count ให้ frontend ไปโหลดรายการเต็มต่อเอง */
  @Sse('stream')
  @Throttle(THROTTLE_STANDARD)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  stream(@CurrentUser() admin: AdminTb): Observable<{ data: { unread_count: number } }> {
    return this.sseLimiter.guard(`admin:${admin.admin_id}`, () =>
      this.notificationsService.streamForAdmin(admin.admin_id),
    );
  }

  @Get()
  @Throttle(THROTTLE_RELAXED)
  async findMine(@CurrentUser() admin: AdminTb, @Query('unread') unread?: string) {
    const [items, unread_count] = await Promise.all([
      this.notificationsService.findForAdmin(admin.admin_id, unread === 'true'),
      this.notificationsService.unread_count(admin.admin_id),
    ]);
    return { items, unread_count };
  }

  @Patch(':id/read')
  @Throttle(THROTTLE_STANDARD)
  markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() admin: AdminTb) {
    return this.notificationsService.markRead(id, admin.admin_id);
  }

  @Patch('read-all')
  @Throttle(THROTTLE_STANDARD)
  markAllRead(@CurrentUser() admin: AdminTb) {
    return this.notificationsService.markAllRead(admin.admin_id);
  }
}
