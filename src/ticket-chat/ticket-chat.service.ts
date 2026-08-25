import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Subject, Observable, filter, map } from 'rxjs';
import { TicketMessageTb, TicketMessageSenderType } from '../tickets/entities/ticket-message.entity';
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
  private readonly events$ = new Subject<TicketChatEvent>();

  constructor(
    private readonly repo: TicketChatRepository,
    private readonly notificationsService: NotificationsService,
    private readonly userNotificationsService: UserNotificationsService,
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
    return messages.map((message) => this.addSenderNames(message));
  }

  async getHistoryForAdmin(ticket_id: string, adminId: number): Promise<TicketMessageTb[]> {
    const ticket = await this.loadTicketOrThrow(ticket_id);
    const admin = await this.repo.findAdmin(adminId);
    if (admin?.role !== Role.SUPER_ADMIN) this.assertAdminIsAssignee(ticket, adminId);
    const messages = await this.repo.findMessages(ticket_id);
    return messages.map((message) => this.addSenderNames(message));
  }

  async getInbox(admin: { admin_id: number; role: Role; department_id: number | null }) {
    const tickets = await this.repo.findInboxTickets(admin);
    return Promise.all(tickets.map(async (ticket) => {
      const last = await this.repo.findLastMessage(ticket.ticket_id);
      const unread = await this.repo.countUnreadFromUser(ticket.ticket_id);
      return { ticket_id: ticket.ticket_id, ticket_no: ticket.ticket_no, subject: ticket.subject, status: ticket.status, department_id: ticket.department_id, department_name: ticket.department?.department_name_th ?? '', user_name: ticket.full_name, assignee_name: ticket.assignee?.full_name ?? '', last_message: last?.message ?? '', last_message_at: last?.created_at ?? ticket.updated_at, unread_count: unread };
    }));
  }

  async sendFromUser(ticket_id: string, user_id: number, message: string): Promise<TicketMessageTb> {
    const ticket = await this.loadTicketOrThrow(ticket_id);
    this.assertUserOwnsTicket(ticket, user_id);
    this.assertHasAssignee(ticket);
    this.assertNotClosed(ticket);

    const normalizedMessage = message.trim();
    if (!normalizedMessage) throw new BadRequestException('กรุณาพิมพ์ข้อความก่อนส่ง');

    const saved = await this.repo.save(
      this.repo.create({
        ticket_id,
        sender_type: TicketMessageSenderType.REPORTER,
        sender_user_id: user_id,
        sender_admin_id: null,
        message: normalizedMessage,
      }),
    );
    this.afterSave(saved, ticket);
    // แจ้งเตือน assignee (กระดิ่ง) แยกจาก SSE stream ของหน้าแชทที่เปิดอยู่ - เผื่อแอดมินไม่ได้เปิด
    // หน้าแชทของตั๋วนี้ค้างไว้ตอนนั้น ยังต้องเห็นแจ้งเตือนใหม่ผ่านกระดิ่งปกติ
    if (ticket.assignee_id) {
      void this.notificationsService.notifyAdmin(
        ticket.assignee_id,
        ticket_id,
        `ผู้แจ้งส่งข้อความใหม่ในตั๋ว ${ticket.ticket_no}`,
      );
    }
    return saved;
  }

  async sendFromAdmin(ticket_id: string, adminId: number, message: string): Promise<TicketMessageTb> {
    const ticket = await this.loadTicketOrThrow(ticket_id);
    const admin = await this.repo.findAdmin(adminId);
    if (admin?.role !== Role.SUPER_ADMIN) this.assertAdminIsAssignee(ticket, adminId);
    this.assertNotClosed(ticket);

    const normalizedMessage = message.trim();
    if (!normalizedMessage) throw new BadRequestException('กรุณาพิมพ์ข้อความก่อนส่ง');

    const saved = await this.repo.save(
      this.repo.create({
        ticket_id,
        sender_type: TicketMessageSenderType.ADMIN,
        sender_user_id: null,
        sender_admin_id: adminId,
        message: normalizedMessage,
      }),
    );
    saved.sender_admin_name = admin?.full_name ?? 'เจ้าหน้าที่';
    this.afterSave(saved, ticket);
    if (ticket.user_id) {
      void this.userNotificationsService.notifyUser(
        ticket.user_id,
        ticket_id,
        `เจ้าหน้าที่ตอบข้อความในตั๋ว ${ticket.ticket_no}`,
      );
    }
    return saved;
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
