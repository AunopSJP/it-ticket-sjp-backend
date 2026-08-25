import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminTb } from '../admin/admin.entity';
import { Role } from '../common/enums/role.enum';
import { TicketTb } from '../tickets/entities/ticket.entity';
import { TicketMessageSenderType, TicketMessageTb } from '../tickets/entities/ticket-message.entity';

@Injectable()
export class TicketChatRepository {
  constructor(
    @InjectRepository(TicketMessageTb)
    private readonly messagesRepo: Repository<TicketMessageTb>,
    @InjectRepository(TicketTb)
    private readonly ticketsRepo: Repository<TicketTb>,
    @InjectRepository(AdminTb)
    private readonly adminsRepo: Repository<AdminTb>,
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

    if (admin.role !== Role.SUPER_ADMIN) {
      query.andWhere(
        '(ticket.department_id = :department_id OR ticket.assignee_id = :admin_id)',
        { department_id: admin.department_id, admin_id: admin.admin_id },
      );
    }

    return query.orderBy('ticket.updated_at', 'DESC').getMany();
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
}
