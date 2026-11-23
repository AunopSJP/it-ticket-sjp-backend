import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { errorStack } from '../common/error-utils';
import { Subject, Observable, filter, map } from 'rxjs';
import {
  TicketMessageAttachment,
  TicketMessageSenderType,
  TicketMessageTb,
} from '../tickets/entities/ticket-message.entity';
import { TicketAttachmentTb } from '../tickets/entities/ticket-attachment.entity';
import { TicketStorageService } from '../storage/ticket-storage.service';
import { TicketsService } from '../tickets/tickets.service';
import { TicketTb } from '../tickets/entities/ticket.entity';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { UserNotificationsService } from '../users/user-notifications.service';
import { Role } from '../common/enums/role.enum';
import { AdminTb } from '../admin/admin.entity';
import { TicketChatRepository } from './ticket-chat.repository';

/** แยก type จาก NotificationEvent ทั่วไปเพื่อให้ frontend รู้ว่าต้อง refresh หน้าต่างแชท
 *  ไม่ใช่แค่กระดิ่งแจ้งเตือน */
interface TicketChatEvent {
  ticket_id: string;
  message: TicketMessageTb;
}

/**
 * แชทผูกกับตั๋ว 1 ใบ - subscribe ด้วย ticket_id ไม่ใช่ recipientId เพราะทั้งผู้แจ้งและ assignee
 * ต้องเห็นข้อความเดียวกันพร้อมกัน ไม่ใช่คนละ stream
 *
 * กติกาสิทธิ์บังคับใน service นี้ (ไม่ใช่แค่ controller) เพราะผูกกับสถานะตั๋ว:
 * - ต้องมี assignee แล้วเท่านั้นถึงจะแชทได้
 * - ตั๋วปิดแล้วอ่านย้อนหลังได้ แต่ส่งข้อความใหม่ไม่ได้
 */
@Injectable()
export class TicketChatService {
  private readonly logger = new Logger(TicketChatService.name);
  private readonly events$ = new Subject<TicketChatEvent>();

  constructor(
    private readonly repo: TicketChatRepository,
    private readonly notificationsService: NotificationsService,
    private readonly userNotificationsService: UserNotificationsService,
    private readonly storage: TicketStorageService,
    private readonly tickets: TicketsService,
  ) {}

  private async loadTicketOrThrow(ticket_id: string): Promise<TicketTb> {
    const ticket = await this.repo.findTicket(ticket_id);
    if (!ticket) {
      throw new NotFoundException('ไม่พบตั๋วงานนี้');
    }
    return ticket;
  }

  private assertUserOwnsTicket(ticket: TicketTb, user_id: number): void {
    if (ticket.user_id !== user_id) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์เข้าถึงแชทของตั๋วนี้');
    }
  }

  private assertAdminIsAssignee(ticket: TicketTb, adminId: number): void {
    if (ticket.assignee_id !== adminId) {
      throw new ForbiddenException('เฉพาะเจ้าของเคส (ผู้รับเคสนี้) เท่านั้นที่ตอบแชทได้');
    }
  }

  /** ยังไม่มีคนรับเคส = ยังไม่เปิดแชท (ทั้งสองฝั่ง) เพราะยังไม่รู้ว่าใครคือคู่สนทนาฝั่งแอดมิน */
  private assertHasAssignee(ticket: TicketTb): void {
    if (!ticket.assignee_id) {
      throw new ForbiddenException('ยังไม่มีเจ้าหน้าที่รับเรื่องนี้ กรุณารอเจ้าหน้าที่รับเคสก่อนเริ่มแชท');
    }
  }

  /** ตั๋วปิดแล้ว = read-only ส่งข้อความใหม่ไม่ได้ (แต่ดูประวัติย้อนหลังได้เสมอ) */
  private assertNotClosed(ticket: TicketTb): void {
    if (ticket.status === TicketStatus.CLOSED) {
      throw new ForbiddenException('ตั๋วนี้ปิดงานแล้ว ไม่สามารถส่งข้อความใหม่ได้ (ดูประวัติย้อนหลังได้ตามปกติ)');
    }
  }

  async getHistoryForUser(ticket_id: string, user_id: number): Promise<TicketMessageTb[]> {
    const ticket = await this.loadTicketOrThrow(ticket_id);
    this.assertUserOwnsTicket(ticket, user_id);
    if (!ticket.assignee_id) return []; // ยังไม่มี assignee = ยังไม่เคยมีแชทเกิดขึ้นได้เลย
    const messages = await this.repo.findMessages(ticket_id);
    return this.withAttachments(messages);
  }

  async getHistoryForAdmin(ticket_id: string, adminId: number): Promise<TicketMessageTb[]> {
    const ticket = await this.loadTicketOrThrow(ticket_id);
    const admin = await this.repo.findAdmin(adminId);
    if (admin?.role !== Role.SUPER_ADMIN) this.assertAdminIsAssignee(ticket, adminId);
    const messages = await this.repo.findMessages(ticket_id);
    return this.withAttachments(messages);
  }

  /** แนบไฟล์ของข้อความ (ไม่รวมไฟล์ของบันทึกภายใน - ผู้แจ้งต้องไม่เห็น) */
  private async withAttachments(messages: TicketMessageTb[]): Promise<TicketMessageTb[]> {
    const attachments = await this.repo.findAttachmentsByMessageIds(
      messages.map((message) => message.ticket_message_id),
    );
    const byMessage = new Map<number, TicketMessageAttachment[]>();
    for (const attachment of attachments) {
      if (attachment.ticket_message_id === null) continue;
      const list = byMessage.get(attachment.ticket_message_id) ?? [];
      list.push(toMessageAttachment(attachment));
      byMessage.set(attachment.ticket_message_id, list);
    }
    return messages.map((message) => ({
      ...this.addSenderNames(message),
      attachments: byMessage.get(message.ticket_message_id) ?? [],
    }));
  }

  async getInbox(admin: { admin_id: number; role: Role; department_id: number | null }) {
    const tickets = await this.repo.findInboxTickets(admin);
    const ticketIds = tickets.map((ticket) => ticket.ticket_id);
    const [lastMessages, unreadCounts] = await Promise.all([
      this.repo.findLastMessagesByTickets(ticketIds),
      this.repo.countUnreadFromUserByTickets(ticketIds),
    ]);
    const lastByTicket = new Map(lastMessages.map((message) => [message.ticket_id, message]));
    return tickets.map((ticket) => {
      const last = lastByTicket.get(ticket.ticket_id);
      const unread = unreadCounts.get(ticket.ticket_id) ?? 0;
      return { ticket_id: ticket.ticket_id, ticket_no: ticket.ticket_no, subject: ticket.subject, status: ticket.status, department_id: ticket.department_id, department_name: ticket.department?.department_name_th ?? '', user_name: ticket.full_name, assignee_name: ticket.assignee?.full_name ?? '', last_message: last?.message ?? '', last_message_at: last?.created_at ?? ticket.updated_at, unread_count: unread };
    });
  }

  async sendFromUser(ticket_id: string, user_id: number, message: string, files: Express.Multer.File[] = [], idempotency_key?: string): Promise<TicketMessageTb> {
    const ticket = await this.loadTicketOrThrow(ticket_id);
    this.assertUserOwnsTicket(ticket, user_id);
    this.assertHasAssignee(ticket);
    this.assertNotClosed(ticket);

    const normalizedMessage = message.trim();
    if (!normalizedMessage) throw new BadRequestException('กรุณาพิมพ์ข้อความก่อนส่ง');

    const replay = await this.findReplay(ticket_id, idempotency_key);
    if (replay) return replay;

    const saved = await this.repo.save(
      this.repo.create({
        ticket_id,
        sender_type: TicketMessageSenderType.REPORTER,
        sender_user_id: user_id,
        sender_admin_id: null,
        message: normalizedMessage,
        idempotency_key: idempotency_key ?? null,
      }),
    );
    const withFiles = await this.attachFiles(saved, files);
    // ผู้แจ้งตอบกลับในสถานะ "รอข้อมูลผู้แจ้ง" = กลับมาดำเนินการอัตโนมัติ (สเปก 2.2)
    if (ticket.status === TicketStatus.WAITING) {
      try {
        await this.tickets.resumeFromWaiting(ticket_id);
      } catch (err) {
        this.logger.error('กลับมาดำเนินการอัตโนมัติไม่สำเร็จ (ข้อความถูกส่งแล้ว)', errorStack(err));
      }
    }
    this.afterSave(withFiles, ticket);
    // แจ้งเตือน assignee (กระดิ่ง) แยกจาก SSE stream ของหน้าแชทที่เปิดอยู่ - เผื่อแอดมินไม่ได้เปิด
    // หน้าแชทของตั๋วนี้ค้างไว้ตอนนั้น ยังต้องเห็นแจ้งเตือนใหม่ผ่านกระดิ่งปกติ
    if (ticket.assignee_id) {
      this.notificationsService
        .notifyAdmin(
          ticket.assignee_id,
          ticket_id,
          `ผู้แจ้งส่งข้อความใหม่ในตั๋ว ${ticket.ticket_no}`,
        )
        .catch((err: unknown) => this.logger.error('ส่งแจ้งเตือนแอดมินไม่สำเร็จ (ไม่กระทบข้อความที่ส่งแล้ว)', errorStack(err)));
    }
    return saved;
  }

  async sendFromAdmin(ticket_id: string, adminId: number, message: string, files: Express.Multer.File[] = [], idempotency_key?: string): Promise<TicketMessageTb> {
    const ticket = await this.loadTicketOrThrow(ticket_id);
    const admin = await this.repo.findAdmin(adminId);
    if (admin?.role !== Role.SUPER_ADMIN) this.assertAdminIsAssignee(ticket, adminId);
    this.assertNotClosed(ticket);

    const normalizedMessage = message.trim();
    if (!normalizedMessage) throw new BadRequestException('กรุณาพิมพ์ข้อความก่อนส่ง');

    const replay = await this.findReplay(ticket_id, idempotency_key);
    if (replay) return replay;

    const saved = await this.repo.save(
      this.repo.create({
        ticket_id,
        sender_type: TicketMessageSenderType.ADMIN,
        sender_user_id: null,
        sender_admin_id: adminId,
        message: normalizedMessage,
        idempotency_key: idempotency_key ?? null,
      }),
    );
    saved.sender_admin_name = admin?.full_name ?? 'เจ้าหน้าที่';
    const withFiles = await this.attachFiles(saved, files);
    await this.markFirstResponse(ticket);
    this.afterSave(withFiles, ticket);
    if (ticket.user_id) {
      this.userNotificationsService
        .notifyUser(
          ticket.user_id,
          ticket_id,
          `เจ้าหน้าที่ตอบข้อความในตั๋ว ${ticket.ticket_no}`,
        )
        .catch((err: unknown) => this.logger.error('ส่งแจ้งเตือนผู้แจ้งไม่สำเร็จ (ไม่กระทบข้อความที่ส่งแล้ว)', errorStack(err)));
    }
    return withFiles;
  }

  /** ปิดเป้าหมาย "ตอบผู้แจ้งครั้งแรก" ด้วยข้อความแรกที่ถึงผู้แจ้ง - บันทึกภายใน/addComment ไม่เรียกเมธอดนี้ */
  private async markFirstResponse(ticket: TicketTb): Promise<void> {
    if (ticket.first_responded_at) return;
    try {
      // เคลียร์ due ของเป้าหมายที่บรรลุแล้ว เพื่อให้คิวเรียงเฉพาะเป้าหมายที่ยังเปิด (UI คำนวณ due จากนโยบายเอง)
      await this.repo.updateFirstRespondedAt(ticket.ticket_id, new Date());
      await this.repo.clearSlaDue(ticket.ticket_id, 'first_response');
    } catch (err) {
      this.logger.error('บันทึกเวลาตอบผู้แจ้งครั้งแรกไม่สำเร็จ (ข้อความถูกส่งแล้ว)', errorStack(err));
    }
  }

  /**
   * "ส่งและแก้ไขแล้ว" (สเปก 2.4): ส่งคำตอบถึงผู้แจ้งแล้วพาตั๋วไปสถานะรอผู้แจ้งยืนยันในครั้งเดียว
   * - ตรวจก่อนว่าสถานะเปลี่ยนได้ เพื่อไม่ให้ส่งข้อความแล้วเปลี่ยนสถานะไม่ได้
   * - ใช้ข้อความที่ส่งเป็นบันทึกวิธีแก้ไข (ผู้ใช้แก้ไขได้ในช่องเดียวกันก่อนส่ง)
   */
  async sendAndResolve(
    ticket_id: string,
    adminId: number,
    message: string,
    files: Express.Multer.File[],
    idempotency_key: string | undefined,
    admin: AdminTb,
  ): Promise<TicketMessageTb> {
    const ticket = await this.loadTicketOrThrow(ticket_id);
    if (ticket.status === TicketStatus.CLOSED || ticket.status === TicketStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException('ตั๋วนี้ปิดหรือรอผู้แจ้งยืนยันแล้ว ไม่สามารถส่งและแก้ไขได้');
    }
    const sent = await this.sendFromAdmin(ticket_id, adminId, message, files, idempotency_key);
    await this.tickets.resolve(ticket_id, { resolution_note: message.trim() }, admin);
    return sent;
  }

  /** คีย์เดิม = ผู้ใช้กดซ้ำหลัง network ค้าง - คืนข้อความเดิมพร้อมไฟล์เดิม ไม่สร้างซ้ำ */  private async findReplay(ticket_id: string, idempotency_key?: string): Promise<TicketMessageTb | null> {
    if (!idempotency_key) return null;
    const existing = await this.repo.findByIdempotencyKey(ticket_id, idempotency_key);
    if (!existing) return null;
    const [message] = await this.withAttachments([existing]);
    return message;
  }

  /** อัปโหลดไฟล์แนบของข้อความ - ข้อความถูกบันทึกแล้วจึงอัปโหลด กันไฟล์ค้างเมื่อ DB ล้ม */
  private async attachFiles(message: TicketMessageTb, files: Express.Multer.File[]): Promise<TicketMessageTb> {
    if (!files?.length) return { ...message, attachments: [] };
    try {
      const uploaded = await Promise.all(files.map((file) => this.storage.uploadTicketImage(file)));
      const saved = await this.repo.saveAttachments(
        uploaded.map(({ file_name, public_url }, index) => ({
          ticket_id: message.ticket_id,
          ticket_message_id: message.ticket_message_id,
          ticket_comment_id: null,
          file_name,
          original_name: files[index].originalname,
          file_path: public_url,
        })),
      );
      return { ...message, attachments: saved.map(toMessageAttachment) };
    } catch (err) {
      // ข้อความถูกส่งไปแล้ว - ไฟล์ที่อัปโหลดไม่สำเร็จต้องแจ้งผู้ใช้ได้ ไม่ควรกลืนหาย
      this.logger.error('บันทึกไฟล์แนบของข้อความไม่สำเร็จ:', errorStack(err));
      throw new BadRequestException('แนบไฟล์ไม่สำเร็จ กรุณาลองส่งใหม่');
    }
  }

  /** mark ข้อความ "ฝั่งตรงข้าม" ทั้งหมดของตั๋วนี้เป็นอ่านแล้ว - user อ่าน = mark ข้อความจาก admin,
   *  admin อ่าน = mark ข้อความจาก user */
  async markReadByUser(ticket_id: string, user_id: number): Promise<void> {
    const ticket = await this.loadTicketOrThrow(ticket_id);
    this.assertUserOwnsTicket(ticket, user_id);
    await this.repo.markReadFromAdmin(ticket_id);
  }

  async markReadByAdmin(ticket_id: string, adminId: number): Promise<void> {
    const ticket = await this.loadTicketOrThrow(ticket_id);
    const admin = await this.repo.findAdmin(adminId);
    if (admin?.role !== Role.SUPER_ADMIN) this.assertAdminIsAssignee(ticket, adminId);
    await this.repo.markReadFromUser(ticket_id);
  }

  async unreadCountForUser(ticket_id: string): Promise<number> {
    return this.repo.countUnreadFromAdmin(ticket_id);
  }

  async unreadCountForAdmin(ticket_id: string): Promise<number> {
    return this.repo.countUnreadFromReporter(ticket_id);
  }

  /** ticket_id ของไฟล์แนบ - ใช้ตรวจสิทธิ์ก่อนอ่านไฟล์ */
  async getAttachmentTicketId(ticket_attachment_id: number): Promise<string> {
    const attachment = await this.repo.findAttachment(ticket_attachment_id);
    if (!attachment) throw new NotFoundException('ไม่พบไฟล์แนบนี้');
    return attachment.ticket_id;
  }

  async readAttachment(ticket_attachment_id: number) {
    const attachment = await this.repo.findAttachment(ticket_attachment_id);
    if (!attachment) throw new NotFoundException('ไม่พบไฟล์แนบนี้');
    return {
      buffer: await this.storage.getImage(attachment.file_name),
      content_type: this.storage.getContentType(attachment.file_name),
      original_name: attachment.original_name,
    };
  }

  /** ผู้แจ้งอ่านได้เฉพาะไฟล์ของข้อความในแชทของตัวเอง ไม่ใช่ไฟล์ของบันทึกภายใน */
  async readReporterAttachment(ticket_attachment_id: number, user_id: number) {
    const attachment = await this.repo.findAttachment(ticket_attachment_id);
    if (!attachment) throw new NotFoundException('ไม่พบไฟล์แนบนี้');
    if (attachment.ticket_message_id === null) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์เข้าถึงไฟล์นี้');
    }
    const ticket = await this.loadTicketOrThrow(attachment.ticket_id);
    this.assertUserOwnsTicket(ticket, user_id);
    return this.readAttachment(ticket_attachment_id);
  }

  /** แอดมินอ่านไฟล์ของข้อความ (ต้องเป็น assignee/super) หรือไฟล์ของบันทึกภายใน (ต้องจัดการตั๋วได้) */
  async readAdminAttachment(ticket_attachment_id: number, admin: AdminTb) {
    const attachment = await this.repo.findAttachment(ticket_attachment_id);
    if (!attachment) throw new NotFoundException('ไม่พบไฟล์แนบนี้');
    const ticket = await this.loadTicketOrThrow(attachment.ticket_id);
    if (attachment.ticket_message_id === null) {
      const manageable = admin.role === Role.SUPER_ADMIN || admin.department_id === null ||
        ticket.assignee_id === admin.admin_id || ticket.department_id === admin.department_id;
      if (!manageable) {
        throw new ForbiddenException('คุณไม่มีสิทธิ์เข้าถึงไฟล์ของบันทึกภายในนี้');
      }
    } else if (admin.role !== Role.SUPER_ADMIN) {
      this.assertAdminIsAssignee(ticket, admin.admin_id);
    }
    return this.readAttachment(ticket_attachment_id);
  }

  private afterSave(saved: TicketMessageTb, ticket: TicketTb): void {
    // push แบบ real-time ให้ทั้งสองฝั่งที่เปิดหน้าแชทของตั๋วนี้อยู่พร้อมกัน (ไม่แยก recipient เพราะ
    // ทั้งคู่ต้องเห็นข้อความเดียวกันทันที ต่างจาก notification ทั่วไปที่แยกคนรับ)
    this.events$.next({ ticket_id: saved.ticket_id, message: saved });
  }

  private addSenderNames(message: TicketMessageTb): TicketMessageTb {
    message.sender_admin_name = message.sender_admin?.full_name;
    message.sender_user_name = message.sender_user?.line_display_name ?? undefined;
    return message;
  }

  /** ส่ง message เต็มไปเลย (ต่างจาก notification ที่ส่งแค่ unread_count) เพราะหน้าต่างแชท
   *  ต้อง append ข้อความใหม่ทันทีโดยไม่ต้องยิง GET ซ้ำ */
  streamForTicket(ticket_id: string): Observable<{ data: TicketMessageTb }> {
    return this.events$.pipe(
      filter((event) => event.ticket_id === ticket_id),
      map((event) => ({ data: event.message })),
    );
  }
}

/** แปลง entity → response shape (ไม่ส่ง file_name ภายในออกไป ผู้ใช้เห็นเฉพาะชื่อเดิม+ลิงก์ที่ตรวจสิทธิ์) */
export function toMessageAttachment(attachment: TicketAttachmentTb): TicketMessageAttachment {
  return {
    ticket_attachment_id: attachment.ticket_attachment_id,
    original_name: attachment.original_name,
    file_path: attachment.file_path,
    download_url: `/tickets/chat/attachments/${attachment.ticket_attachment_id}`,
  };
}
