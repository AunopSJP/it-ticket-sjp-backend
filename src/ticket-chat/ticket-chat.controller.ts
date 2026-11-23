import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  Sse,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Observable, of } from 'rxjs';
import { TicketChatService } from './ticket-chat.service';
import { LineVerifyService } from '../line/line-verify.service';
import { UserNotificationsService } from '../users/user-notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SseConnectionLimiterService } from '../common/sse/sse-connection-limiter.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminTb } from '../admin/admin.entity';
import { TicketMessageTb } from '../tickets/entities/ticket-message.entity';
import { THROTTLE_RELAXED, THROTTLE_STANDARD } from '../common/constants/throttle.constants';
import { sendTicketMessageSchema, SendTicketMessageInput } from './dto/send-ticket-message.dto';

/** multipart form fields arrive as strings - validate with the shared schema explicitly
 *  (a parameter-level UsePipes would also try to validate the single @Query token) */
function parseSendTicketMessage(body: unknown): SendTicketMessageInput {
  const result = sendTicketMessageSchema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'ข้อมูลข้อความไม่ถูกต้อง');
  }
  return result.data;
}

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
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { files: 5, fileSize: 5 * 1024 * 1024 } }))
  async sendFromUser(
    @Param('ticket_id', ParseUUIDPipe) ticket_id: string,
    @Query('line_id_token') line_id_token: string,
    @Body() body: unknown,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const user_id = await this.resolveUserId(line_id_token, { throwOnInvalid: true });
    const dto = parseSendTicketMessage(body);
    return this.ticketChatService.sendFromUser(
      ticket_id,
      user_id!,
      dto.message,
      files ?? [],
      dto.idempotency_key,
    );
  }

  /** ไฟล์แนบของข้อความ - ผู้แจ้งเห็นได้เฉพาะไฟล์ของข้อความ ไม่ใช่ไฟล์ของบันทึกภายใน */
  @Get('user/attachments/:attachment_id')
  @Throttle(THROTTLE_RELAXED)
  async downloadAttachmentForUser(
    @Param('attachment_id', ParseIntPipe) attachment_id: number,
    @Query('line_id_token') line_id_token: string,
    @Res() response: Response,
  ) {
    const user_id = await this.resolveUserId(line_id_token, { throwOnInvalid: true });
    const file = await this.ticketChatService.readReporterAttachment(attachment_id, user_id!);
    response.setHeader('Content-Type', file.content_type);
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.original_name)}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    response.send(file.buffer);
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
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { files: 5, fileSize: 5 * 1024 * 1024 } }))
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async sendFromAdmin(
    @Param('ticket_id', ParseUUIDPipe) ticket_id: string,
    @CurrentUser() admin: AdminTb,
    @Body() body: unknown,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const dto = parseSendTicketMessage(body);
    return this.ticketChatService.sendFromAdmin(
      ticket_id,
      admin.admin_id,
      dto.message,
      files ?? [],
      dto.idempotency_key,
    );
  }

  /** "ส่งและแก้ไขแล้ว" - ส่งคำตอบแล้วพาตั๋วไปรอผู้แจ้งยืนยันในครั้งเดียว (สเปก 2.4) */
  @Post('admin/reply-and-resolve')
  @Throttle(THROTTLE_STANDARD)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { files: 5, fileSize: 5 * 1024 * 1024 } }))
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async sendAndResolve(
    @Param('ticket_id', ParseUUIDPipe) ticket_id: string,
    @CurrentUser() admin: AdminTb,
    @Body() body: unknown,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const dto = parseSendTicketMessage(body);
    return this.ticketChatService.sendAndResolve(
      ticket_id, admin.admin_id, dto.message, files ?? [], dto.idempotency_key, admin,
    );
  }

  /** ไฟล์แนบของบทสนทนา - ตรวจสิทธิ์เดียวกับประวัติแชท (assignee/super admin)   *  ไฟล์ของบันทึกภายในใช้สิทธิ์การจัดการตั๋ว (ดู readAdminAttachment) */
  @Get('attachments/:attachment_id')
  @Throttle(THROTTLE_RELAXED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async downloadAttachment(
    @Param('attachment_id', ParseIntPipe) attachment_id: number,
    @CurrentUser() admin: AdminTb,
    @Res() response: Response,
  ) {
    const file = await this.ticketChatService.readAdminAttachment(attachment_id, admin);
    response.setHeader('Content-Type', file.content_type);
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.original_name)}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    response.send(file.buffer);
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
