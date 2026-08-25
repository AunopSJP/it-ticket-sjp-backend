import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Observable, of } from 'rxjs';
import { TicketChatService } from './ticket-chat.service';
import { SendTicketMessageDto } from './dto/send-ticket-message.dto';
import { LineVerifyService } from '../line/line-verify.service';
import { UserNotificationsService } from '../users/user-notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SseConnectionLimiterService } from '../common/sse/sse-connection-limiter.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminTb } from '../admin/admin.entity';
import { TicketMessageTb } from '../tickets/entities/ticket-message.entity';
import { THROTTLE_RELAXED, THROTTLE_STANDARD } from '../common/constants/throttle.constants';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { sendTicketMessageSchema } from './dto/send-ticket-message.dto';

/**
 * แชทผูกกับตั๋วงาน 1 ใบ - แยก route ฝั่งผู้แจ้ง (verify ผ่าน line_id_token) กับฝั่งแอดมิน (JwtAuthGuard)
 * สิทธิ์ตัดสินจริงอยู่ที่ TicketChatService controller นี้แค่ resolve ตัวตนแล้วส่งต่อ
 */
@ApiTags('ticket-chat')
@Controller('tickets/:ticket_id/chat')
export class TicketChatController {
  constructor(
    private readonly ticketChatService: TicketChatService,
    private readonly lineVerifyService: LineVerifyService,
    private readonly userNotificationsService: UserNotificationsService,
    private readonly sseLimiter: SseConnectionLimiterService,
  ) {}

  // ---------------- ฝั่งผู้แจ้ง (สาธารณะ ยืนยันตัวตนผ่าน line_id_token) ----------------

  /** verify ไม่ผ่าน/ไม่ใช่เจ้าของตั๋ว คืน stream เปล่าแทน throw (กัน EventSource error-loop) */
  @Sse('user/stream')
  @Throttle(THROTTLE_STANDARD)
  async userStream(
    @Param('ticket_id', ParseUUIDPipe) ticket_id: string,
    @Query('line_id_token') line_id_token: string,
  ): Promise<Observable<{ data: TicketMessageTb }>> {
    const user_id = await this.resolveUserId(line_id_token);
    if (user_id === null) return of();
    try {
      // เช็คสิทธิ์ผ่าน getHistory (throw ถ้าไม่ใช่เจ้าของตั๋ว) ก่อนเปิด stream จริง
      await this.ticketChatService.getHistoryForUser(ticket_id, user_id);
    } catch {
      return of();
    }
    return this.sseLimiter.guard(`user:${user_id}`, () =>
      this.ticketChatService.streamForTicket(ticket_id),
    );
  }

  @Get('user')
  @Throttle(THROTTLE_RELAXED)
  async getHistoryForUser(
    @Param('ticket_id', ParseUUIDPipe) ticket_id: string,
    @Query('line_id_token') line_id_token: string,
  ) {
    const user_id = await this.resolveUserId(line_id_token, { throwOnInvalid: true });
    const messages = await this.ticketChatService.getHistoryForUser(ticket_id, user_id!);
    return { items: messages };
  }

  @Post('user')
  @Throttle(THROTTLE_STANDARD)
  @UsePipes(new ZodValidationPipe(sendTicketMessageSchema))
  async sendFromUser(
    @Param('ticket_id', ParseUUIDPipe) ticket_id: string,
    @Query('line_id_token') line_id_token: string,
    @Body() dto: SendTicketMessageDto,
  ) {
    const user_id = await this.resolveUserId(line_id_token, { throwOnInvalid: true });
    return this.ticketChatService.sendFromUser(ticket_id, user_id!, dto.message);
  }

  @Patch('user/read')
  @Throttle(THROTTLE_RELAXED)
  async markReadByUser(
    @Param('ticket_id', ParseUUIDPipe) ticket_id: string,
    @Query('line_id_token') line_id_token: string,
  ) {
    const user_id = await this.resolveUserId(line_id_token, { throwOnInvalid: true });
    await this.ticketChatService.markReadByUser(ticket_id, user_id!);
    return { success: true };
  }

  /** throwOnInvalid: true สำหรับ endpoint ที่เขียนข้อมูล (fail-closed)
   *  false สำหรับ SSE ที่อยากคืน stream เปล่าแทน error */
  private async resolveUserId(
    line_id_token: string,
    options: { throwOnInvalid?: boolean } = {},
  ): Promise<number | null> {
    try {
      const { sub: line_user_id } = await this.lineVerifyService.verifyIdToken(line_id_token);
      const user = await this.userNotificationsService.findByLineUserId(line_user_id);
      if (!user) {
        // ต้องเป็น HttpException ที่มี status ชัดเจน - โยน Error ธรรมดาจะกลายเป็น 500
        if (options.throwOnInvalid) throw new NotFoundException('ไม่พบผู้แจ้งปัญหานี้');
        return null;
      }
      return user.user_id;
    } catch (err) {
      if (options.throwOnInvalid) throw err;
      return null;
    }
  }

  // ---------------- ฝั่งแอดมิน (ต้อง login, JwtAuthGuard) ----------------

  @Sse('admin/stream')
  @Throttle(THROTTLE_STANDARD)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async adminStream(
    @Param('ticket_id', ParseUUIDPipe) ticket_id: string,
    @CurrentUser() admin: AdminTb,
  ): Promise<Observable<{ data: TicketMessageTb }>> {
    try {
      await this.ticketChatService.getHistoryForAdmin(ticket_id, admin.admin_id);
    } catch {
      return of();
    }
    return this.sseLimiter.guard(`admin:${admin.admin_id}`, () =>
      this.ticketChatService.streamForTicket(ticket_id),
    );
  }

  @Get('admin')
  @Throttle(THROTTLE_RELAXED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getHistoryForAdmin(@Param('ticket_id', ParseUUIDPipe) ticket_id: string, @CurrentUser() admin: AdminTb) {
    const messages = await this.ticketChatService.getHistoryForAdmin(ticket_id, admin.admin_id);
    return { items: messages };
  }

  @Post('admin')
  @Throttle(THROTTLE_STANDARD)
  @UsePipes(new ZodValidationPipe(sendTicketMessageSchema))
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async sendFromAdmin(
    @Param('ticket_id', ParseUUIDPipe) ticket_id: string,
    @CurrentUser() admin: AdminTb,
    @Body() dto: SendTicketMessageDto,
  ) {
    return this.ticketChatService.sendFromAdmin(ticket_id, admin.admin_id, dto.message);
  }

  @Patch('admin/read')
  @Throttle(THROTTLE_RELAXED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async markReadByAdmin(@Param('ticket_id', ParseUUIDPipe) ticket_id: string, @CurrentUser() admin: AdminTb) {
    await this.ticketChatService.markReadByAdmin(ticket_id, admin.admin_id);
    return { success: true };
  }
}
