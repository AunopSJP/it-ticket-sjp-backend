import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminTb } from '../admin/admin.entity';
import { Role } from '../common/enums/role.enum';
import { TicketTb } from '../tickets/entities/ticket.entity';
import { TicketMessageSenderType, TicketMessageTb } from '../tickets/entities/ticket-message.entity';
import { TicketAttachmentTb } from '../tickets/entities/ticket-attachment.entity';

@Injectable()
export class TicketChatRepository {
  constructor(
    @InjectRepository(TicketMessageTb)
    private readonly messagesRepo: Repository<TicketMessageTb>,
    @InjectRepository(TicketTb)
    private readonly ticketsRepo: Repository<TicketTb>,
    @InjectRepository(AdminTb)
    private readonly adminsRepo: Repository<AdminTb>,
    @InjectRepository(TicketAttachmentTb)
    private readonly attachmentsRepo: Repository<TicketAttachmentTb>,
  ) {}

  findTicket(ticket_id: string): Promise<TicketTb | null> {
    return this.ticketsRepo.findOne({ where: { ticket_id } });
  }

  findAdmin(admin_id: number): Promise<AdminTb | null> {
    return this.adminsRepo.findOne({ where: { admin_id } });
  }

  findMessages(ticket_id: string): Promise<TicketMessageTb[]> {
    return this.messagesRepo.find({
      where: { ticket_id },
      relations: { sender_admin: true, sender_user: true },
      order: { created_at: 'ASC' },
    });
  }

  async findInboxTickets(admin: { admin_id: number; role: Role; department_id: number | null }): Promise<TicketTb[]> {
    const query = this.ticketsRepo
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.department', 'department')
      .leftJoinAndSelect('ticket.assignee', 'assignee')
      .leftJoinAndSelect('ticket.user', 'reporter')
      .where('ticket.assignee_id IS NOT NULL')
      .andWhere((subQuery) => {
        const latest = subQuery.subQuery().select('message.ticket_id').from(TicketMessageTb, 'message').distinct().getQuery();
        return `ticket.ticket_id IN ${latest}`;
      });

    // แชทเปิดได้เฉพาะ assignee หรือ super admin (ดู TicketChatService.assertAdminIsAssignee)
    // inbox จึงต้องแสดงเฉพาะที่เปิดได้จริง ไม่งั้นแอดมินแผนกเห็นข้อความล่าสุดแล้วกดเข้าไปเจอ 403
    if (admin.role !== Role.SUPER_ADMIN) {
      query.andWhere('ticket.assignee_id = :admin_id', { admin_id: admin.admin_id });
    }

    return query.orderBy('ticket.updated_at', 'DESC').getMany();
  }

  /** ข้อความล่าสุดของหลายตั๋วด้วย query เดียว (DISTINCT ON) แทนยิงทีละใบ */
  findLastMessagesByTickets(ticket_ids: string[]): Promise<TicketMessageTb[]> {
    if (ticket_ids.length === 0) return Promise.resolve([]);
    return this.messagesRepo
      .createQueryBuilder('message')
      .distinctOn(['message.ticket_id'])
      .where('message.ticket_id IN (:...ticket_ids)', { ticket_ids })
      .orderBy('message.ticket_id')
      .addOrderBy('message.created_at', 'DESC')
      .getMany();
  }

  /** จำนวนข้อความที่ผู้แจ้งส่งมาและแอดมินยังไม่อ่าน แยกตามตั๋ว ด้วย query เดียว (GROUP BY) */
  async countUnreadFromUserByTickets(ticket_ids: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (ticket_ids.length === 0) return counts;
    const rows = await this.messagesRepo
      .createQueryBuilder('message')
      .select('message.ticket_id', 'ticket_id')
      .addSelect('COUNT(*)', 'count')
      .where('message.ticket_id IN (:...ticket_ids)', { ticket_ids })
      .andWhere('message.sender_type = :sender_type', { sender_type: TicketMessageSenderType.REPORTER })
      .andWhere('message.is_read = false')
      .groupBy('message.ticket_id')
      .getRawMany<{ ticket_id: string; count: string }>();
    for (const row of rows) counts.set(row.ticket_id, Number(row.count));
    return counts;
  }

  findLastMessage(ticket_id: string): Promise<TicketMessageTb | null> {
    return this.messagesRepo.findOne({ where: { ticket_id }, order: { created_at: 'DESC' } });
  }

  countUnreadFromUser(ticket_id: string): Promise<number> {
    return this.messagesRepo.count({
      where: { ticket_id, sender_type: TicketMessageSenderType.REPORTER, is_read: false },
    });
  }

  create(data: Partial<TicketMessageTb>): TicketMessageTb {
    return this.messagesRepo.create(data);
  }

  save(message: TicketMessageTb): Promise<TicketMessageTb> {
    return this.messagesRepo.save(message);
  }

  markReadFromAdmin(ticket_id: string): Promise<void> {
    return this.messagesRepo
      .update({ ticket_id, sender_type: TicketMessageSenderType.ADMIN, is_read: false }, { is_read: true })
      .then(() => undefined);
  }

  markReadFromUser(ticket_id: string): Promise<void> {
    return this.messagesRepo
      .update({ ticket_id, sender_type: TicketMessageSenderType.REPORTER, is_read: false }, { is_read: true })
      .then(() => undefined);
  }

  countUnreadFromAdmin(ticket_id: string): Promise<number> {
    return this.messagesRepo.count({ where: { ticket_id, sender_type: TicketMessageSenderType.ADMIN, is_read: false } });
  }

  countUnreadFromReporter(ticket_id: string): Promise<number> {
    return this.messagesRepo.count({ where: { ticket_id, sender_type: TicketMessageSenderType.REPORTER, is_read: false } });
  }

  /** retry ด้วยคีย์เดิม = คืนข้อความเดิม (กันส่งซ้ำเมื่อ network ค้างแล้วผู้ใช้กดซ้ำ) */
  findByIdempotencyKey(ticket_id: string, idempotency_key: string): Promise<TicketMessageTb | null> {
    return this.messagesRepo.findOne({ where: { ticket_id, idempotency_key } });
  }

  saveAttachments(rows: Partial<TicketAttachmentTb>[]): Promise<TicketAttachmentTb[]> {
    return this.attachmentsRepo.save(this.attachmentsRepo.create(rows));
  }

  /** ดึงไฟล์แนบของข้อความหลายข้อความด้วย query เดียว */
  async findAttachmentsByMessageIds(messageIds: number[]): Promise<TicketAttachmentTb[]> {
    if (messageIds.length === 0) return [];
    return this.attachmentsRepo.find({ where: messageIds.map((ticket_message_id) => ({ ticket_message_id })) });
  }

  findAttachment(ticket_attachment_id: number): Promise<TicketAttachmentTb | null> {
    return this.attachmentsRepo.findOne({ where: { ticket_attachment_id } });
  }

  /** ใช้ update เฉพาะคอลัมน์ กัน stale entity เขียนทับสถานะ/ผู้รับผิดชอบล่าสุด (ดู CLAUDE.md) */
  async updateFirstRespondedAt(ticket_id: string, responded_at: Date): Promise<void> {
    await this.ticketsRepo
      .createQueryBuilder()
      .update(TicketTb)
      .set({ first_responded_at: responded_at })
      .where('ticket_id = :ticket_id AND first_responded_at IS NULL', { ticket_id })
      .execute();
  }

  /** เคลียร์ due ของเป้าหมายที่บรรลุแล้ว - คิวเรียงเฉพาะเป้าหมายที่ยังเปิด */
  async clearSlaDue(ticket_id: string, target: 'first_response' | 'resolve'): Promise<void> {
    const column = target === 'first_response' ? 'first_response_due_at' : 'resolve_due_at';
    await this.ticketsRepo
      .createQueryBuilder()
      .update(TicketTb)
      .set({ [column]: null } as never)
      .where('ticket_id = :ticket_id', { ticket_id })
      .execute();
  }
}
