import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThan, Not, Repository, SelectQueryBuilder } from 'typeorm';
import { TicketTb } from './entities/ticket.entity';
import { TicketImageTb } from './entities/ticket-image.entity';
import { TicketHistoryTb } from './entities/ticket-history.entity';
import { TicketCommentTb } from './entities/ticket-comment.entity';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketPriority } from '../common/enums/ticket-priority.enum';

export type AdminTicketSort = 'newest' | 'department' | 'priority' | 'oldest_pending';

export interface AdminTicketFilter {
  status?: TicketStatus;
  department_id?: number;
  /** null = กรองเฉพาะตั๋วที่ยังไม่มีผู้รับผิดชอบ (มาจากกดแท่ง "ยังไม่มอบหมาย" ในสรุปแยกตามผู้รับผิดชอบ) */
  assignee_id?: number | null;
  keyword?: string;
  priority?: TicketPriority;
  sort?: AdminTicketSort;
  /** true = กรองเฉพาะตั๋วที่ sla_breached = true และยังไม่ปิด (ใช้ตอนกดการ์ดสรุป "เกินกำหนด SLA" หน้า dashboard) */
  sla_breached_only?: boolean;
  /** กรองช่วงวันที่แจ้ง (ticket.created_at) - รับเป็น Date เที่ยงคืนของวันนั้นๆ ตาม timezone ที่ backend ตั้งไว้ */
  date_from?: Date;
  /** สิ้นสุดของวันนั้น (23:59:59.999) - ให้ครอบคลุมทั้งวันที่เลือกไม่ใช่แค่เที่ยงคืน */
  date_to?: Date;
}

export const DETAIL_RELATIONS = [
  'images',
  'history',
  'history.changed_by',
  'history.from_department',
  'history.to_department',
  'history.images',
];

export const ACTIVE_STATUSES = [
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
  TicketStatus.WAITING,
  TicketStatus.FORWARDED,
  TicketStatus.PENDING_CONFIRMATION,
];

export interface AdminTicketPage {
  items: TicketTb[];
  total: number;
  page: number;
  page_size: number;
}

/**
 * Separate Data Layer: รวม TypeORM access (Repository/QueryBuilder) ของ ticket ทั้งหมดไว้ที่นี่ที่เดียว
 * TicketsService (business logic) เรียกผ่าน repository นี้แทนที่จะยิง TypeORM ตรงๆ - ถ้าจะเปลี่ยน ORM/DB
 * ในอนาคตแก้ที่ไฟล์นี้ไฟล์เดียว ไม่ต้องไล่แก้ business logic
 *
 * ทุกเมธอดที่ใช้ในทรานแซคชัน (create/transition/confirmResolution ฯลฯ) รับ `manager` เสริมได้เสมอ -
 * ต้องใช้ manager ตัวเดียวกับที่ service เปิด transaction ไว้ ห้าม fallback ไป this.repo ของตัวเอง
 * (คนละ connection จาก pool) ไม่งั้นจะเห็นข้อมูลไม่ตรงกันหรือชน QueryRunnerAlreadyReleasedError
 * (ดูคอมเมนต์ยาวใน TicketsService.transition() เดิมสำหรับเหตุผลเต็ม)
 */
@Injectable()
export class TicketsRepository {
  constructor(
    @InjectRepository(TicketTb)
    private readonly ticketsRepo: Repository<TicketTb>,
    @InjectRepository(TicketImageTb)
    private readonly imagesRepo: Repository<TicketImageTb>,
    @InjectRepository(TicketCommentTb)
    private readonly commentsRepo: Repository<TicketCommentTb>,
  ) {}

  private repo(manager?: EntityManager): Repository<TicketTb> {
    return manager ? manager.getRepository(TicketTb) : this.ticketsRepo;
  }

  findByIdempotencyKey(idempotency_key: string, manager?: EntityManager): Promise<TicketTb | null> {
    return this.repo(manager).findOne({ where: { idempotency_key } });
  }

  /** ค้นหาตั๋วซ้ำ: ผู้แจ้งคนเดิม + แผนก + หัวข้อปัญหาเดียวกัน ที่ยังไม่ปิดงาน */
  findDuplicateByUser(
    user_id: number,
    department_id: number,
    subject: string,
    manager?: EntityManager,
  ): Promise<TicketTb | null> {
    return this.repo(manager)
      .createQueryBuilder('ticket')
      .where('ticket.user_id = :user_id', { user_id })
      .andWhere('ticket.department_id = :department_id', { department_id })
      .andWhere('LOWER(ticket.subject) = LOWER(:subject)', { subject })
      .andWhere('ticket.status IN (:...statuses)', { statuses: ACTIVE_STATUSES })
      .getOne();
  }

  createTicket(data: Partial<TicketTb>, manager: EntityManager): TicketTb {
    return manager.getRepository(TicketTb).create(data);
  }

  saveTicket(ticket: TicketTb, manager?: EntityManager): Promise<TicketTb> {
    return this.repo(manager).save(ticket);
  }

  createHistory(data: Partial<TicketHistoryTb>, manager: EntityManager): TicketHistoryTb {
    return manager.getRepository(TicketHistoryTb).create(data);
  }

  saveHistory(history: TicketHistoryTb, manager: EntityManager): Promise<TicketHistoryTb> {
    return manager.getRepository(TicketHistoryTb).save(history);
  }

  createImages(data: Partial<TicketImageTb>[]): TicketImageTb[] {
    return this.imagesRepo.create(data);
  }

  saveImages(images: TicketImageTb[]): Promise<TicketImageTb[]> {
    return this.imagesRepo.save(images);
  }

  countByTicketNoPrefix(prefix: string): Promise<number> {
    return this.ticketsRepo
      .createQueryBuilder('ticket')
      .where('ticket.ticket_no ILIKE :prefix', { prefix: `${prefix}%` })
      .getCount();
  }

  findByTicketNo(ticket_no: string): Promise<TicketTb | null> {
    return this.ticketsRepo.findOne({ where: { ticket_no } });
  }

  /** เวอร์ชันเต็มพร้อม relations (images/history) - รับ manager เสริมได้เผื่อเรียกจากภายใน transaction เดียวกัน */
  async findByIdWithDetail(ticket_id: string, manager?: EntityManager): Promise<TicketTb | null> {
    const ticket = await this.repo(manager).findOne({
      where: { ticket_id },
      relations: DETAIL_RELATIONS,
    });
    ticket?.history?.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    return ticket;
  }

  findById(ticket_id: string, manager?: EntityManager): Promise<TicketTb | null> {
    return this.repo(manager).findOne({ where: { ticket_id } });
  }

  async findAllForAdmin(
    admin_department_id: number | null | undefined,
    filter: AdminTicketFilter,
    page = 1,
    page_size = 30,
  ): Promise<AdminTicketPage> {
    const qb = this.ticketsRepo
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.department', 'department')
      .leftJoinAndSelect('ticket.assignee', 'assignee')
      .leftJoin('ticket.history', 'history')
      // ไม่ join 'images' - หน้า dashboard ไม่แสดงรูปในรายการ (ใช้ findByIdWithDetail ตอนเปิดทีละใบแทน)
      ;

    if (admin_department_id !== null && admin_department_id !== undefined) {
      qb.andWhere(
        '(ticket.department_id = :admin_department_id OR history.from_department_id = :admin_department_id OR history.to_department_id = :admin_department_id)',
        { admin_department_id },
      );
    } else if (filter.department_id) {
      qb.andWhere('ticket.department_id = :department_id', { department_id: filter.department_id });
    }

    qb.distinct(true);

    if (filter.assignee_id !== undefined) {
      if (filter.assignee_id === null) {
        qb.andWhere('ticket.assignee_id IS NULL');
      } else {
        qb.andWhere('ticket.assignee_id = :assignee_id', { assignee_id: filter.assignee_id });
      }
    }
    if (filter.status) {
      qb.andWhere('ticket.status = :status', { status: filter.status });
    }
    if (filter.priority) {
      qb.andWhere('ticket.priority = :priority', { priority: filter.priority });
    }
    if (filter.keyword) {
      qb.andWhere(
        '(ticket.ticket_no ILIKE :kw OR ticket.full_name ILIKE :kw OR ticket.subject ILIKE :kw)',
        { kw: `%${filter.keyword}%` },
      );
    }
    if (filter.sla_breached_only) {
      // sla_breached เป็น flag ทางเดียว (ไม่รีเซ็ตแม้ปิดเคสแล้ว) จึงต้องกรอง status <> closed ควบคู่ไปด้วย
      qb.andWhere('ticket.sla_breached = true').andWhere('ticket.ticket_status <> :closed_status', {
        closed_status: TicketStatus.CLOSED,
      });
    }
    if (filter.date_from) {
      qb.andWhere('ticket.created_at >= :date_from', { date_from: filter.date_from });
    }
    if (filter.date_to) {
      qb.andWhere('ticket.created_at <= :date_to', { date_to: filter.date_to });
    }

    this.applySort(qb, filter.sort);
    const [items, total] = await qb
      .skip((page - 1) * page_size)
      .take(page_size)
      .getManyAndCount();
    return { items, total, page, page_size };
  }

  // หมายเหตุ CASE expression: ต้องใช้ชื่อคอลัมน์จริงในฐานข้อมูล (ticket_priority/ticket_status)
  // เพราะ query builder ไม่แปลง property name ให้เหมือน orderBy() ปกติ
  private applySort(qb: SelectQueryBuilder<TicketTb>, sort: AdminTicketSort | undefined): void {
    switch (sort) {
      case 'department':
        qb.orderBy('department.department_name_th', 'ASC').addOrderBy('ticket.created_at', 'DESC');
        break;
      case 'priority':
        // ค่ามาจาก TicketPriority.URGENT เสมอ (ไม่พิมพ์ string ตรงๆ ซ้ำ) แต่ยังต้องเป็น SQL string literal
        // ในนี้เพราะ TypeORM ไม่รองรับ parameter binding ใน orderBy() ราว (CASE expression)
        qb
          .orderBy('CASE ticket.ticket_priority WHEN :urgent_priority THEN 0 ELSE 1 END', 'ASC')
          .setParameter('urgent_priority', TicketPriority.URGENT)
          .addOrderBy(
          'ticket.created_at',
          'DESC',
          );
        break;
      case 'oldest_pending':
        qb
          .orderBy('CASE WHEN ticket.ticket_status = :closed_status THEN 1 ELSE 0 END', 'ASC')
          .setParameter('closed_status', TicketStatus.CLOSED)
          .addOrderBy('ticket.created_at', 'ASC');
        break;
      case 'newest':
      default:
        qb.orderBy('ticket.created_at', 'DESC');
        break;
    }
  }

  searchByUser(user_id: number, keyword?: string): Promise<TicketTb[]> {
    const qb = this.ticketsRepo
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.department', 'department')
      .orderBy('ticket.created_at', 'DESC')
      .limit(30)
      .where('ticket.user_id = :user_id', { user_id });
    if (keyword) {
      qb.andWhere('(ticket.ticket_no ILIKE :kw OR ticket.subject ILIKE :kw OR ticket.full_name ILIKE :kw)', {
        kw: `%${keyword}%`,
      });
    }
    return qb.getMany();
  }

  searchByTicketNoExact(ticket_no: string): Promise<TicketTb[]> {
    return this.ticketsRepo
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.department', 'department')
      .orderBy('ticket.created_at', 'DESC')
      .limit(30)
      .where('LOWER(ticket.ticket_no) = LOWER(:ticket_no)', { ticket_no })
      .getMany();
  }

  getPublicActivityFeedRows(): Promise<{ ticket_no: string; updated_at: Date; assignee_name: string }[]> {
    const activeStatuses = [TicketStatus.IN_PROGRESS, TicketStatus.WAITING, TicketStatus.FORWARDED];
    // ใช้ query builder + select ดิบแทน .find({select}) เพราะ select บางส่วนจะ trigger eager relations
    // (department/assignee/user เป็น eager: true) ให้พยายาม join ทั้งที่ query ไม่ได้ join มาด้วย
    return this.ticketsRepo
      .createQueryBuilder('ticket')
      .leftJoin('ticket.assignee', 'assignee')
      .select('ticket.ticket_no', 'ticket_no')
      .addSelect('ticket.updated_at', 'updated_at')
      .addSelect('assignee.full_name', 'assignee_name')
      .where('ticket.status IN (:...statuses)', { statuses: activeStatuses })
      .andWhere('ticket.assignee_id IS NOT NULL')
      .orderBy('ticket.updated_at', 'DESC')
      .limit(50)
      .getRawMany<{ ticket_no: string; updated_at: Date; assignee_name: string }>();
  }

  findMineByUser(line_user_id: string): Promise<TicketTb[]> {
    return this.ticketsRepo
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.user', 'user')
      .leftJoinAndSelect('ticket.department', 'department')
      .where('user.line_user_id = :line_user_id', { line_user_id })
      .orderBy('ticket.created_at', 'DESC')
      .limit(20)
      .getMany();
  }

  listComments(ticket_id: string): Promise<TicketCommentTb[]> {
    return this.commentsRepo.find({
      where: { ticket_id },
      order: { created_at: 'ASC' },
    });
  }

  createComment(data: Partial<TicketCommentTb>): TicketCommentTb {
    return this.commentsRepo.create(data);
  }

  saveComment(comment: TicketCommentTb): Promise<TicketCommentTb> {
    return this.commentsRepo.save(comment);
  }

  /** ล็อกแถวตั๋ว (pessimistic_write) แล้วอ่านสถานะปัจจุบันจาก DB - ต้องอยู่ใน transaction manager เดียวกับ
   *  operation ที่เรียกใช้เสมอ (ดูคอมเมนต์หัวไฟล์) */
  async lockStatus(manager: EntityManager, ticket_id: string): Promise<TicketStatus | null> {
    const locked = await manager
      .createQueryBuilder(TicketTb, 'ticket')
      .select('ticket.status')
      .where('ticket.ticket_id = :ticket_id', { ticket_id })
      .setLock('pessimistic_write')
      .getOne();
    return locked?.status ?? null;
  }

  findAllActive(): Promise<TicketTb[]> {
    return this.ticketsRepo.find({ where: { status: Not(TicketStatus.CLOSED) } });
  }

  findOverdueUnconfirmed(): Promise<TicketTb[]> {
    return this.ticketsRepo.find({
      where: {
        status: TicketStatus.PENDING_CONFIRMATION,
        confirmation_deadline: LessThan(new Date()),
      },
    });
  }
}
