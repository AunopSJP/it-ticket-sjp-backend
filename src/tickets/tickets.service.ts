import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DEFAULT_TICKET_TRIAGE_PRIORITY, TicketTriagePriority, primaryStatusOf } from '@it-ticket/shared';
import { TicketTb } from './entities/ticket.entity';
import { TicketHistoryTb } from './entities/ticket-history.entity';
import { TicketCommentTb } from './entities/ticket-comment.entity';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { Role } from '../common/enums/role.enum';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AdminCreateTicketDto } from './dto/admin-create-ticket.dto';
import { ForwardTicketDto } from './dto/forward-ticket.dto';
import { ResolveTicketDto } from './dto/resolve-ticket.dto';
import { WaitTicketDto } from './dto/wait-ticket.dto';
import { CreateTicketCommentDto } from './dto/create-ticket-comment.dto';
import { DepartmentsService } from '../departments/departments.service';
import { AdminTb } from '../admin/admin.entity';
import { AdminsService } from '../admin/admins.service';
import { SymptomsService } from '../symptoms/symptoms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { UserNotificationsService } from '../users/user-notifications.service';
import { TicketStorageService } from '../storage/ticket-storage.service';
import { computeSlaDeadlines, RESOLUTION_CONFIRM_TIMEOUT_HOURS, SLA_WARNING_THRESHOLD } from './sla.util';
import { addPolicyHours, FirstResponseClock, firstResponseClock, policyFor, ResolveClock, resolveClock } from './first-response-sla.util';
import { AuditLogService } from '../audit/audit-log.service';
import { LineVerifyService } from '../line/line-verify.service';
import { TicketsRepository, AdminTicketFilter, AdminTicketSort } from './tickets.repository';
import { assertTicketManageableByAdmin, assertTicketReadableByAdmin } from './ticket-access.policy';
import { errorProperty, errorStack } from '../common/error-utils';
import { TICKET_DEPARTMENT_CODES } from '../common/constants/ticket.constants';

// re-export เพื่อไม่ให้ import path เดิมใน controller/ที่อื่นพัง (AdminTicketFilter/AdminTicketSort
// ย้ายไปอยู่ tickets.repository.ts แล้ว เพราะเป็นเรื่อง "query ตั๋วได้ยังไงบ้าง" ซึ่งเป็นหน้าที่ของ data layer)
export type { AdminTicketFilter, AdminTicketSort };

/** ผลลัพธ์จาก create() - เพิ่ม is_duplicate/isReplay ไว้บอก frontend ว่านี่คือตั๋วเดิม ไม่ใช่ตั๋วใหม่ */
export type CreateTicketResult = TicketTb & { is_duplicate?: boolean };

interface TransitionResult {
  to_status: TicketStatus;
  history_note?: string | null;
  from_department_id?: number | null;
  to_department_id?: number | null;
  /** ข้อความแจ้งเตือนที่จะส่งให้ user ของตั๋วนี้ (ถ้ามี user ผูกอยู่) - ไม่ส่ง = ไม่แจ้งเตือน */
  user_message?: string | null;
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly ticketsRepo: TicketsRepository,
    private readonly departmentsService: DepartmentsService,
    private readonly symptomsService: SymptomsService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly userNotificationsService: UserNotificationsService,
    private readonly storageService: TicketStorageService,
    private readonly auditLogService: AuditLogService,
    private readonly lineVerifyService: LineVerifyService,
    private readonly dataSource: DataSource,
    private readonly adminsService: AdminsService,
  ) {}

  /** Hook สำหรับการเปลี่ยนแปลงตั๋วภายในระบบ */
  private emitTicketChanged(_ticket: TicketTb): void {}

  async create(dto: CreateTicketDto, files: Express.Multer.File[]): Promise<CreateTicketResult> {
    // verify identity ก่อนอ่าน idempotency record เสมอ ไม่เช่นนั้นคนที่รู้ key อาจขอตั๋วเดิมพร้อม PII ได้
    const [line_user_id, line_display_name, line_picture] = await this.verifyLineProfile(dto.line_id_token);
    const user = await this.usersService.findOrCreateFromLineProfile(line_user_id, line_display_name, line_picture);

    // 1) Idempotency key: กันกดส่งซ้ำ/network retry สร้างตั๋วซ้อนกัน - ถ้าเคยส่งคีย์นี้มาแล้วคืนตั๋วเดิมไปเลย
    if (dto.idempotency_key) {
      const existingByKey = await this.ticketsRepo.findByIdempotencyKey(dto.idempotency_key);
      if (existingByKey) {
        if (existingByKey.user_id !== user.user_id) {
          throw new ForbiddenException('รหัสป้องกันการส่งซ้ำนี้ไม่ได้เป็นของผู้แจ้งปัจจุบัน');
        }
        const full = await this.findByIdInternal(existingByKey.ticket_id);
        return { ...this.withFirstResponse(full), is_duplicate: true };
      }
    }

    // ตรวจแผนกปลายทางมีอยู่จริงก่อน จะได้ error message ที่อ่านรู้เรื่องกว่าปล่อยให้ FK constraint ล้ม
    // ผู้แจ้งไม่ต้องเลือกแผนก - ค่าเริ่มต้นคือ "ไม่แน่ใจ" (แผนก other) ให้เจ้าหน้าที่คัดแยกทีหลัง
    const department = dto.department_id
      ? await this.departmentsService.findById(dto.department_id)
      : await this.departmentsService.findFallback();

    // แผนก "อื่นๆ" (department_code = 'other') เก็บชื่อที่พิมพ์เองเป็นข้อความอิสระผูกกับตั๋วใบนี้
    // ไม่บังคับแล้ว เพราะค่าเริ่มต้นของฟอร์มคือ "ไม่แน่ใจ"
    const custom_department_note =
      department.department_code === 'other' ? dto.custom_department_note?.trim() : undefined;

    // 2) เช็คตั๋วซ้ำ: ผู้แจ้งคนเดิม + แผนก + หัวข้อปัญหาเดียวกัน ที่ยังไม่ปิดงาน - พาไปตั๋วเดิมแทนสร้างใหม่
    // (ข้ามการเช็คนี้ไปเลยถ้าไม่มี user identity ที่เชื่อถือได้ - กรณี fallback ไม่มี LINE)
    const dup = await this.ticketsRepo.findDuplicateByUser(
      user.user_id,
      department.department_id,
      dto.subject.trim(),
    );
    if (dup) {
      const full = await this.findByIdInternal(dup.ticket_id);
      return { ...this.withFirstResponse(full), is_duplicate: true };
    }

    const created_at = new Date();
    // ผู้แจ้งไม่ตั้ง Priority - ใช้ระดับปกติเป็นค่าตั้งต้นของ SLA จนกว่าเจ้าหน้าที่จะคัดแยกด้วย P1-P4
    const { assign_by, resolve_by } = computeSlaDeadlines(TicketPriority.NORMAL, created_at);

    // สร้างตั๋ว + history แถวแรกในทรานแซคชันเดียวกัน พร้อม retry ถ้าเลขที่ตั๋วชนกัน (ticket_no มี unique
    // constraint ที่ DB กันซ้ำอยู่แล้ว แต่ retry ให้อัตโนมัติแทนที่จะโยน 500 ตรงๆ เวลาชนกันพอดี)
    const MAX_TICKET_NO_RETRIES = 3;
    let saved: TicketTb | undefined;
    for (let retry = 0; retry < MAX_TICKET_NO_RETRIES; retry++) {
      const ticket_no = await this.generateTicketNo(department.department_code, created_at);
      try {
        saved = await this.dataSource.transaction(async (manager) => {
          const ticket = this.ticketsRepo.createTicket(
            {
              ticket_no,
              full_name: dto.full_name?.trim() || line_display_name?.trim() || 'ผู้แจ้ง',
              contact: dto.contact?.trim() ?? '',
              location: dto.location ?? null,
              department_id: department.department_id,
              priority: TicketPriority.NORMAL,
              triage_priority: DEFAULT_TICKET_TRIAGE_PRIORITY,
              first_response_due_at: this.computePolicyDue(DEFAULT_TICKET_TRIAGE_PRIORITY, created_at).first,
              first_responded_at: null,
              resolve_due_at: this.computePolicyDue(DEFAULT_TICKET_TRIAGE_PRIORITY, created_at).resolve,
              urgent_detail: null,
              impact_level: null,
              deadline_note: null,
              deadline_date: null,
              urgent_phone: null,
              selected_symptoms: dto.selected_symptoms ?? [],
              user_id: user?.user_id ?? null,
              subject: dto.subject,
              description: dto.description,
              custom_department_note: custom_department_note ?? null,
              status: TicketStatus.OPEN,
              assign_by,
              resolve_by,
              idempotency_key: dto.idempotency_key ?? null,
            },
            manager,
          );
          const savedTicket = await this.ticketsRepo.saveTicket(ticket, manager);

          await this.ticketsRepo.saveHistory(
            this.ticketsRepo.createHistory(
              {
                ticket_id: savedTicket.ticket_id,
                from_status: TicketStatus.OPEN,
                to_status: TicketStatus.OPEN,
                to_department_id: department.department_id,
                note: 'สร้างตั๋วงานใหม่เข้าสู่ระบบ',
              },
              manager,
            ),
            manager,
          );

          return savedTicket;
        });
        break; // สำเร็จ - ออกจาก retry loop
      } catch (err) {
        const isTicketNoConflict =
          errorProperty(err, 'code') === '23505' &&
          errorProperty(err, 'constraint')?.includes('ticket_no');
        if (!isTicketNoConflict || retry === MAX_TICKET_NO_RETRIES - 1) {
          throw err;
        }
        this.logger.warn(`เลขที่ตั๋ว ${ticket_no} ชนกับตั๋วอื่นที่เพิ่งถูกสร้างพร้อมกัน - ลองเลขใหม่ (retry ${retry + 1})`);
      }
    }
    if (!saved) {
      throw new BadRequestException('สร้างตั๋วงานไม่สำเร็จ (เลขที่ตั๋วชนกันซ้ำหลายครั้ง) กรุณาลองใหม่อีกครั้ง');
    }

    await this.symptomsService.recordOccurrences(department.department_id, [
      ...(dto.selected_symptoms ?? []),
      dto.subject,
    ]);

    await this.notificationsService.notifyAllAdmins(
      saved.ticket_id,
      `🆕 ตั๋วใหม่ ${saved.ticket_no}: ${dto.subject}`,
      department.department_id,
    );

    // 3) แนบรูป/ไฟล์ประกอบ (ไม่บังคับ) - เขียนลง local disk เสมอ
    if (files?.length) {
      try {
        const uploaded = await Promise.all(
          files.map((file) => this.storageService.uploadTicketImage(file)),
        );
        const images = this.ticketsRepo.createImages(
          uploaded.map(({ file_name, public_url }, index) => ({
            ticket_id: saved.ticket_id,
            file_name,
            original_name: files[index].originalname,
            file_path: public_url,
          })),
        );
        const savedImages = await this.ticketsRepo.saveImages(images);
      } catch (err) {
        this.logger.error(`บันทึกรูปแนบของตั๋ว ${saved.ticket_no} ไม่สำเร็จ (ตัวตั๋วยังสร้างสำเร็จตามปกติ):`, errorStack(err));
      }
    }

    const created = this.withFirstResponse(await this.findByIdInternal(saved.ticket_id));
    this.emitTicketChanged(created);
    return created;
  }

  /**
   * แอดมินสร้างตั๋วแทนผู้แจ้งเอง (เช่น รับแจ้งทางโทรศัพท์/walk-in) - ใช้ JWT ของแอดมินเป็น identity
   * แทน LINE token จึงไม่มี user ผูกกับตั๋วนี้ (user_id = null) ผลคือ:
   *  - ข้าม verify LINE / ข้าม idempotency key (แอดมินกดซ้ำเองไม่ใช่ network retry ของ user)
   *  - ข้ามเช็คตั๋วซ้ำแบบ per-user เพราะไม่มี user ให้เทียบ
   *  - ตั๋วนี้จะไม่โผล่ในแท็บ "ติดตามสถานะ"/"ทิคเก็ตของฉัน" ของผู้แจ้งคนไหน และปิดงานได้ทางแอดมิน resolve
   *    ตามปกติเท่านั้น (ไม่มีปุ่มยืนยันปิดงานจากฝั่งผู้แจ้ง เพราะไม่รู้ว่าใครคือผู้แจ้งตัวจริง)
   */
  async createByAdmin(dto: AdminCreateTicketDto, files: Express.Multer.File[], admin: AdminTb): Promise<CreateTicketResult> {
    const department = await this.departmentsService.findById(dto.department_id);

    const custom_department_note =
      department.department_code === 'other' ? dto.custom_department_note?.trim() : undefined;
    if (department.department_code === 'other' && !custom_department_note) {
      throw new BadRequestException('กรุณาระบุชื่อแผนกที่ต้องการ');
    }

    const created_at = new Date();
    const { assign_by, resolve_by } = computeSlaDeadlines(dto.priority, created_at);

    const MAX_TICKET_NO_RETRIES = 3;
    let saved: TicketTb | undefined;
    for (let retry = 0; retry < MAX_TICKET_NO_RETRIES; retry++) {
      const ticket_no = await this.generateTicketNo(department.department_code, created_at);
      try {
        saved = await this.dataSource.transaction(async (manager) => {
          const ticket = this.ticketsRepo.createTicket(
            {
              ticket_no,
              full_name: dto.full_name,
              contact: dto.contact,
              location: dto.location ?? null,
              department_id: dto.department_id,
              priority: dto.priority,
              triage_priority: DEFAULT_TICKET_TRIAGE_PRIORITY,
              first_response_due_at: this.computePolicyDue(DEFAULT_TICKET_TRIAGE_PRIORITY, created_at).first,
              first_responded_at: null,
              resolve_due_at: this.computePolicyDue(DEFAULT_TICKET_TRIAGE_PRIORITY, created_at).resolve,
              urgent_detail: dto.urgent_detail ?? null,
              impact_level: dto.impact_level ?? null,
              deadline_note: dto.deadline_note ?? null,
              deadline_date: dto.deadline_date ?? null,
              urgent_phone: dto.urgent_phone ?? null,
              selected_symptoms: dto.selected_symptoms ?? [],
              user_id: null,
              subject: dto.subject,
              description: dto.description ?? null,
              custom_department_note: custom_department_note ?? null,
              status: TicketStatus.OPEN,
              assign_by,
              resolve_by,
              idempotency_key: null,
            },
            manager,
          );
          const savedTicket = await this.ticketsRepo.saveTicket(ticket, manager);

          await this.ticketsRepo.saveHistory(
            this.ticketsRepo.createHistory(
              {
                ticket_id: savedTicket.ticket_id,
                from_status: TicketStatus.OPEN,
                to_status: TicketStatus.OPEN,
                to_department_id: dto.department_id,
                changed_by_id: admin.admin_id,
                note: `สร้างตั๋วงานใหม่โดยแอดมิน (${admin.full_name}) แทนผู้แจ้ง`,
              },
              manager,
            ),
            manager,
          );

          return savedTicket;
        });
        break;
      } catch (err) {
        const isTicketNoConflict =
          errorProperty(err, 'code') === '23505' &&
          errorProperty(err, 'constraint')?.includes('ticket_no');
        if (!isTicketNoConflict || retry === MAX_TICKET_NO_RETRIES - 1) {
          throw err;
        }
        this.logger.warn(`เลขที่ตั๋ว ${ticket_no} ชนกับตั๋วอื่นที่เพิ่งถูกสร้างพร้อมกัน - ลองเลขใหม่ (retry ${retry + 1})`);
      }
    }
    if (!saved) {
      throw new BadRequestException('สร้างตั๋วงานไม่สำเร็จ (เลขที่ตั๋วชนกันซ้ำหลายครั้ง) กรุณาลองใหม่อีกครั้ง');
    }

    await this.symptomsService.recordOccurrences(dto.department_id, [
      ...(dto.selected_symptoms ?? []),
      dto.subject,
    ]);

    await this.notificationsService.notifyAllAdmins(
      saved.ticket_id,
      `🆕 ตั๋วใหม่ ${saved.ticket_no}: ${dto.subject} (สร้างโดยแอดมิน)`,
      dto.department_id,
    );

    if (files?.length) {
      try {
        const uploaded = await Promise.all(
          files.map((file) => this.storageService.uploadTicketImage(file)),
        );
        const images = this.ticketsRepo.createImages(
          uploaded.map(({ file_name, public_url }, index) => ({
            ticket_id: saved.ticket_id,
            file_name,
            original_name: files[index].originalname,
            file_path: public_url,
          })),
        );
        const savedImages = await this.ticketsRepo.saveImages(images);
      } catch (err) {
        this.logger.error(`บันทึกรูปแนบของตั๋ว ${saved.ticket_no} ไม่สำเร็จ (ตัวตั๋วยังสร้างสำเร็จตามปกติ):`, errorStack(err));
      }
    }

    const created = this.withFirstResponse(await this.findByIdInternal(saved.ticket_id));
    this.emitTicketChanged(created);
    return created;
  }

  /** รายการตั๋วสำหรับหน้า Dashboard แอดมิน - แอดมินแผนก (department_id ไม่ null) ถูก force filter
   *  ให้เห็นเฉพาะตั๋วแผนกตัวเองเสมอ ไม่สนใจ filter.department_id ที่ client ส่งมา */
  findAllForAdmin(admin: AdminTb, filter: AdminTicketFilter = {}, page = 1, page_size = 30) {
    return this.ticketsRepo.findAllForAdmin(admin.department_id, filter, page, page_size)
      .then((result) => ({ ...result, items: result.items.map((ticket) => this.withFirstResponse(ticket)) }));
  }

  async findByIdForAdmin(ticket_id: string, admin: AdminTb): Promise<TicketTb> {
    const ticket = await this.findByIdInternal(ticket_id);
    assertTicketReadableByAdmin(ticket, admin);
    return this.withFirstResponse(ticket);
  }

  /** คำนวณสถานะ SLA ตอบครั้งแรกฝั่งเซิร์ฟเวอร์ (UI ไม่คำนวณเอง) */
  withFirstResponse(ticket: TicketTb): TicketTb {
    const waitingSince = ticket.status === TicketStatus.WAITING ? (ticket.wait_started_at ?? null) : null;    const firstClock = firstResponseClock({
      created_at: ticket.created_at,
      triage_priority: ticket.triage_priority,
      responded_at: ticket.first_responded_at ?? null,
    });
    const resolveTarget = resolveClock({
      created_at: ticket.created_at,
      triage_priority: ticket.triage_priority,
      resolved_at: ticket.resolved_at ?? null,
      paused_ms: ticket.sla_paused_ms ?? 0,
      waiting_since: waitingSince,
    });
    (ticket as TicketTb & { first_response?: FirstResponseClock }).first_response = firstClock;
    (ticket as TicketTb & { resolve?: ResolveClock }).resolve = resolveTarget;
    (ticket as TicketTb & { primary_status?: string }).primary_status = primaryStatusOf(ticket.status);
    ticket.first_response_due_at = firstClock.due_at ?? ticket.first_response_due_at ?? null;
    ticket.resolve_due_at = resolveTarget.due_at ?? ticket.resolve_due_at ?? null;
    return ticket;
  }

  /** เป้าหมายตอบครั้งแรก/แก้ไขตอนสร้าง - คำนวณจากนโยบายของ triage priority */
  private computePolicyDue(priority: TicketTb['triage_priority'], created_at: Date): { first: Date | null; resolve: Date | null } {
    const policy = policyFor(priority);
    if (!policy) return { first: null, resolve: null };
    return {
      first: addPolicyHours(created_at, policy.firstResponseHours, policy.calendar),
      resolve: addPolicyHours(created_at, policy.resolveHours, policy.calendar),
    };
  }

  async changeTriagePriority(ticket_id: string, priority: TicketTriagePriority, admin: AdminTb): Promise<TicketTb> {
    const result = await this.dataSource.transaction(async (manager) => {
      if (await this.ticketsRepo.lockStatus(manager, ticket_id) === null) {
        throw new NotFoundException('ไม่พบตั๋วงานนี้');
      }
      const ticket = await this.ticketsRepo.findById(ticket_id, manager);
      if (!ticket) throw new NotFoundException('ไม่พบตั๋วงานนี้');
      assertTicketManageableByAdmin(ticket, admin);
      const previous = ticket.triage_priority;
      if (previous !== priority) {
        const due = this.computePolicyDue(priority, ticket.created_at);
        const fields: Partial<TicketTb> = { triage_priority: priority };
        // เป้าหมายที่ยังไม่ปิดจึงเปลี่ยนตามนโยบายของ Priority ใหม่
        if (!ticket.first_responded_at) fields.first_response_due_at = due.first;
        if (!ticket.resolved_at) fields.resolve_due_at = due.resolve;
        await this.ticketsRepo.updateFields(ticket_id, fields, manager);
      }
      return { previous, ticket: await this.findByIdInternal(ticket_id, manager) };
    });
    if (result.previous !== priority) {
      await this.recordTicketAudit(admin, 'ticket.priority', result.ticket,
        `เปลี่ยน Priority ${result.previous.toUpperCase()} → ${priority.toUpperCase()} ในตั๋ว ${result.ticket.ticket_no}`);
      this.emitTicketChanged(result.ticket);
    }
    return this.withFirstResponse(result.ticket);
  }

  /** เวอร์ชันภายในที่ไม่เช็คสิทธิ์แผนก - รับ manager เสริมได้เผื่อเรียกจากภายใน transaction เดียวกัน
   *  (ไม่งั้นจะอ่านจาก connection นอกที่ยังไม่เห็นข้อมูลที่เพิ่ง save ในทรานแซคชันที่ยังไม่ commit) */
  private async findByIdInternal(ticket_id: string, manager?: EntityManager): Promise<TicketTb> {
    const ticket = await this.ticketsRepo.findByIdWithDetail(ticket_id, manager);
    if (!ticket) {
      throw new NotFoundException('ไม่พบตั๋วงานนี้');
    }
    return ticket;
  }

  /** ค้นหาสาธารณะสำหรับแท็บ "ติดตามสถานะ" - คืน is_own_ticket ต่อรายการเพื่อให้ frontend
   *  รู้ว่าตั๋วใบไหนโชว์ปุ่มยืนยันได้ (ห้ามคืนตั๋วของทุกคนเมื่อไม่ได้ login - จะรั่ว PII) */
  async searchPublic(keyword: string, line_id_token?: string) {
    const trimmedKeyword = keyword?.trim();
    // เลขตั๋วเป็นเลขเรียงและไล่เดาได้ จึงปิดการค้นหา anonymous และค้นได้เฉพาะตั๋วของ LINE ตนเอง
    if (!line_id_token?.trim()) return [];
    const line_user_id = await this.tryVerifyLineUserId(line_id_token);
    const user = line_user_id ? await this.userNotificationsService.findByLineUserId(line_user_id) : null;
    if (!user || (trimmedKeyword?.length ?? 0) > 100) return [];
    const tickets = await this.ticketsRepo.searchByUser(user.user_id, trimmedKeyword);

    // endpoint สาธารณะ ไม่ต้อง login - ส่งข้อมูลอ่อนไหว (ชื่อ/เบอร์ติดต่อ/รายละเอียด/บันทึกแก้ไข)
    // เฉพาะตั๋วของผู้ค้นเองเท่านั้น กันรั่ว PII ของคนอื่น
    return tickets.map((t) => {
      const is_own_ticket = t.user_id !== null && t.user_id === user.user_id;
      return {
        ticket_id: t.ticket_id,
        ticket_no: t.ticket_no,
        full_name: is_own_ticket ? t.full_name : null,
        contact: is_own_ticket ? t.contact : null,
        department: t.department,
        custom_department_note: t.custom_department_note,
        priority: t.priority,
        selected_symptoms: t.selected_symptoms ?? [],
        subject: t.subject,
        description: is_own_ticket ? t.description : null,
        status: t.status,
        resolution_note: is_own_ticket ? t.resolution_note : null,
        created_at: t.created_at,
        is_own_ticket,
        assignee_name: t.assignee?.full_name ?? null,
        has_assignee: t.assignee_id !== null,
        updated_at: t.updated_at,
      };
    });
  }

  /** สาธารณะ: เปิดเฉพาะจำนวนรวม ห้ามเปิดชื่อพนักงานหรือเลขตั๋ว */
  async getPublicActivityFeed() {
    const rawTickets = await this.ticketsRepo.getPublicActivityFeedRows();
    const grouped = new Map<string, string[]>();
    for (const ticket of rawTickets) {
      const assignee_name = ticket.assignee_name?.trim() || 'เจ้าหน้าที่ผู้รับผิดชอบ';
      const ticket_nos = grouped.get(assignee_name) ?? [];
      ticket_nos.push(ticket.ticket_no);
      grouped.set(assignee_name, ticket_nos);
    }

    return {
      active_count: rawTickets.length,
      admins: Array.from(grouped, ([assignee_name, ticket_nos]) => ({ assignee_name, ticket_nos })),
    };
  }

  /** สาธารณะ: รายการตั๋วที่เคยแจ้งของผู้แจ้งคนนี้ - ต้อง verify line_id_token ก่อนเสมอ
   *  กันคนอื่นปลอม admin_id มาดูรายการตั๋ว/PII ของคนอื่น */
  async findMineByLineUserId(line_id_token: string) {
    if (!line_id_token?.trim()) {
      return [];
    }
    const line_user_id = await this.tryVerifyLineUserId(line_id_token);
    if (!line_user_id) {
      return [];
    }
    const tickets = await this.ticketsRepo.findMineByUser(line_user_id);

    return tickets.map((t) => ({
      ticket_id: t.ticket_id,
      ticket_no: t.ticket_no,
      subject: t.subject,
      selected_symptoms: t.selected_symptoms ?? [],
      status: t.status,
      department: t.department,
      created_at: t.created_at,
    }));
  }

  async assign(ticket_id: string, admin: AdminTb, targetUserId?: number, images?: Express.Multer.File[]): Promise<TicketTb> {
    const assignee = targetUserId ? await this.adminsService.findById(targetUserId) : admin;
    if (!assignee.is_active) throw new BadRequestException('บัญชีผู้รับผิดชอบถูกปิดใช้งานแล้ว');
    if (admin.role === Role.HEAD_ADMIN && assignee.role !== Role.ADMIN) {
      throw new ForbiddenException('head admin มอบหมายได้เฉพาะแอดมินในแผนกตนเอง');
    }
    if (admin.department_id !== null && assignee.department_id !== admin.department_id) {
      throw new ForbiddenException('แอดมินแผนกมอบหมายได้เฉพาะเจ้าหน้าที่ในแผนกตนเอง');
    }
    const ticket = await this.transition(ticket_id, admin, {
      clearWaitPause: true,
      images,
      mutate: (ticket) => {
        ticket.assignee_id = assignee.admin_id;
        return {
          to_status: TicketStatus.IN_PROGRESS,
          history_note: `${admin.full_name} มอบหมายเคสให้ ${assignee.full_name}`,
          user_message: 'เจ้าหน้าที่รับเรื่องของคุณแล้ว กำลังดำเนินการ',
        };
      },
    });
    await this.recordTicketAudit(admin, 'ticket.assign', ticket, `${admin.full_name} รับเคส ${ticket.ticket_no}`);
    return ticket;
  }

  /**
   * แอดมินกด Resolve -> ตั๋วเข้าสถานะ "รอผู้แจ้งยืนยัน" (ยังไม่ปิดจริง) ตามสเปก
   * ผู้แจ้งกดยืนยันเองที่แท็บติดตามสถานะ หรือถ้าไม่กดภายใน RESOLUTION_CONFIRM_TIMEOUT_HOURS
   * background job จะ auto-close ให้ (ดู autoCloseUnconfirmedTickets())
   */
  async resolve(ticket_id: string, dto: ResolveTicketDto, admin: AdminTb, images?: Express.Multer.File[]): Promise<TicketTb> {
    const ticket = await this.transition(ticket_id, admin, {
      clearWaitPause: true,
      images,
      mutate: (ticket) => {
        const now = new Date();
        ticket.resolution_note = dto.resolution_note;
        ticket.resolved_at = now;
        // เป้าหมายแก้ไขบรรลุแล้ว - เคลียร์ due เพื่อให้คิวเหลือเฉพาะเป้าหมายที่ยังเปิด (UI คำนวณ due จากนโยบายเอง)
        ticket.resolve_due_at = null;
        ticket.confirmation_deadline = new Date(
          now.getTime() + RESOLUTION_CONFIRM_TIMEOUT_HOURS * 60 * 60 * 1000,
        );
        return {
          to_status: TicketStatus.PENDING_CONFIRMATION,
          history_note: dto.resolution_note,
          user_message: 'ปัญหาของคุณได้รับการแก้ไขแล้ว กรุณายืนยันผลที่หน้าติดตามสถานะ',
        };
      },
    });
    await this.recordTicketAudit(admin, 'ticket.resolve', ticket, `${admin.full_name} บันทึกแก้ไขเคส ${ticket.ticket_no}`);
    return ticket;
  }

  /** ผู้แจ้งกดยืนยันว่าแก้ไขแล้ว -> ปิดงานจริง
   *  fail-closed: token ไม่ถูกต้อง throw ทันที เพราะนี่คือ authorization gate ตัวจริงของการปิดงาน */
  async confirmResolution(ticket_id: string, line_id_token: string): Promise<TicketTb> {
    const preCheckTicket = await this.getTicketOrThrow(ticket_id);
    if (preCheckTicket.status !== TicketStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException('ตั๋วนี้ไม่ได้อยู่ในสถานะรอยืนยัน');
    }

    const { sub: line_user_id } = await this.lineVerifyService.verifyIdToken(line_id_token);
    const user = await this.userNotificationsService.findByLineUserId(line_user_id);
    if (!user || preCheckTicket.user_id === null || preCheckTicket.user_id !== user.user_id) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์ยืนยันตั๋วนี้ (ไม่ใช่ผู้แจ้งตัวจริง)');
    }

    // ห่อใน transaction + row lock กันชนกับ autoCloseUnconfirmedTickets() (background job) ที่อาจ
    // auto-close ตั๋วใบเดียวกันพร้อมๆ กับที่ผู้แจ้งกดยืนยันเอง
    // สำคัญ: fetch ticket ใหม่ในทรานแซคชันนี้เสมอ (ไม่ใช้ preCheckTicket ที่ query มาก่อนเข้า transaction)
    // กันเขียนทับฟิลด์อื่นที่อาจถูกแก้ไประหว่างช่วงเวลานั้นด้วยค่าเก่าที่ query มาตั้งแต่แรก
    const closedTicket = await this.dataSource.transaction(async (manager) => {
      const lockedStatus = await this.ticketsRepo.lockStatus(manager, ticket_id);
      if (lockedStatus !== TicketStatus.PENDING_CONFIRMATION) {
        throw new BadRequestException('ตั๋วนี้ไม่ได้อยู่ในสถานะรอยืนยัน (อาจถูกปิดไปแล้วก่อนหน้านี้)');
      }

      const ticket = await this.ticketsRepo.findById(ticket_id, manager);
      if (!ticket) {
        throw new NotFoundException('ไม่พบตั๋วงานนี้');
      }

      ticket.status = TicketStatus.CLOSED;
      ticket.closed_at = new Date();
      await this.ticketsRepo.saveTicket(ticket, manager);

      await this.ticketsRepo.saveHistory(
        this.ticketsRepo.createHistory(
          {
            ticket_id: ticket.ticket_id,
            from_status: TicketStatus.PENDING_CONFIRMATION,
            to_status: TicketStatus.CLOSED,
            note: 'ผู้แจ้งยืนยันว่าแก้ไขเรียบร้อยแล้ว - ปิดงาน',
          },
          manager,
        ),
        manager,
      );

      return this.findByIdInternal(ticket_id, manager);
    });

    const closed = this.withFirstResponse(closedTicket);
    this.emitTicketChanged(closed);
    await this.auditLogService.record({
      action: 'ticket.confirm_resolution',
      entity_type: 'ticket',
      entity_id: closed.ticket_id,
      summary: `ผู้แจ้งยืนยันปิดเคส ${closed.ticket_no}`,
      metadata: { ticket_no: closed.ticket_no, user_id: user.user_id },
    });
    return closed;
  }

  /**
   * เปิดเคสที่ "แก้ไขแล้ว" (รอยืนยัน) กลับไป "กำลังดำเนินการ" ตามสเปก 2.2
   * - เวลาที่ตั๋วอยู่รอยืนยันถูกพัก (บวกเข้า sla_paused_ms) เพื่อไม่ให้นับเป็นเวลาทำงานของเป้าหมายแก้ไข
   * - first_responded_at ไม่ถูกล้าง: เปิดใหม่ไม่เริ่มรอบตอบครั้งแรกใหม่
   */
  async reopen(ticket_id: string, admin: AdminTb): Promise<TicketTb> {
    const result = await this.dataSource.transaction(async (manager) => {
      const lockedStatus = await this.ticketsRepo.lockStatus(manager, ticket_id);
      if (lockedStatus === null) throw new NotFoundException('ไม่พบตั๋วงานนี้');
      if (lockedStatus !== TicketStatus.PENDING_CONFIRMATION) {
        throw new BadRequestException('เปิดเคสใหม่ได้เฉพาะตั๋วที่รอผู้แจ้งยืนยันเท่านั้น');
      }
      const ticket = await this.ticketsRepo.findById(ticket_id, manager);
      if (!ticket) throw new NotFoundException('ไม่พบตั๋วงานนี้');
      assertTicketManageableByAdmin(ticket, admin);

      const confirmedAt = ticket.resolved_at ?? new Date();
      const pausedMs = (ticket.sla_paused_ms ?? 0) + Math.max(0, Date.now() - confirmedAt.getTime());
      const due = this.computePolicyDue(ticket.triage_priority, ticket.created_at).resolve;
      await this.ticketsRepo.updateFields(ticket_id, {
        status: TicketStatus.IN_PROGRESS,
        resolved_at: null,
        confirmation_deadline: null,
        sla_paused_ms: pausedMs,
        // เปิดเป้าหมายแก้ไขอีกครั้ง: due กลับมาและเลื่อนตามเวลาที่ถูกพัก
        resolve_due_at: due ? new Date(due.getTime() + pausedMs) : null,
      }, manager);
      await this.ticketsRepo.saveHistory(
        this.ticketsRepo.createHistory({
          ticket_id,
          from_status: TicketStatus.PENDING_CONFIRMATION,
          to_status: TicketStatus.IN_PROGRESS,
          changed_by_id: admin.admin_id,
          note: 'เปิดเคสใหม่หลังผู้แจ้งแจ้งว่าแก้ไขไม่ครบ',
        }, manager),
        manager,
      );
      return this.findByIdInternal(ticket_id, manager);
    });
    await this.recordTicketAudit(admin, 'ticket.reopen', result, `${admin.full_name} เปิดเคส ${result.ticket_no} ใหม่`);
    this.emitTicketChanged(result);
    return this.withFirstResponse(result);
  }

  /**
   * ผู้แจ้งตอบกลับในสถานะ "รอข้อมูลผู้แจ้ง" = กลับมาดำเนินการอัตโนมัติ (สเปก 2.2)
   * เรียกจากแชทฝั่งผู้แจ้ง ไม่ใช่แอดมิน จึงไม่ผ่าน transition() (ที่บังคับสิทธิ์แอดมิน)
   */
  async resumeFromWaiting(ticket_id: string): Promise<TicketTb | null> {
    const resumed = await this.dataSource.transaction(async (manager) => {
      const lockedStatus = await this.ticketsRepo.lockStatus(manager, ticket_id);
      if (lockedStatus === null) throw new NotFoundException('ไม่พบตั๋วงานนี้');
      if (lockedStatus !== TicketStatus.WAITING) return null;
      const ticket = await this.ticketsRepo.findById(ticket_id, manager);
      if (!ticket) return null;

      const pausedMs = (ticket.sla_paused_ms ?? 0) +
        (ticket.wait_started_at ? Math.max(0, Date.now() - ticket.wait_started_at.getTime()) : 0);
      await this.ticketsRepo.updateFields(ticket_id, {
        status: TicketStatus.IN_PROGRESS,
        wait_started_at: null,
        sla_paused_ms: pausedMs,
      }, manager);
      await this.ticketsRepo.saveHistory(
        this.ticketsRepo.createHistory({
          ticket_id,
          from_status: TicketStatus.WAITING,
          to_status: TicketStatus.IN_PROGRESS,
          note: 'ผู้แจ้งตอบกลับ - กลับมาดำเนินการอัตโนมัติ',
        }, manager),
        manager,
      );
      return this.findByIdInternal(ticket_id, manager);
    });
    return resumed ? this.withFirstResponse(resumed) : null;
  }

  async wait(ticket_id: string, dto: WaitTicketDto, admin: AdminTb, images?: Express.Multer.File[]): Promise<TicketTb> {
    const ticket = await this.transition(ticket_id, admin, {
      images,
      mutate: (ticket) => {
        ticket.wait_started_at = new Date(); // เริ่มพัก SLA clock
        return {
          to_status: TicketStatus.WAITING,
          history_note: dto.note ?? 'รออุปกรณ์ / รอข้อมูลเพิ่มเติม',
          user_message: 'เจ้าหน้าที่กำลังรอข้อมูล/อุปกรณ์เพิ่มเติมเพื่อดำเนินการต่อ',
        };
      },
    });
    await this.recordTicketAudit(admin, 'ticket.wait', ticket, `${admin.full_name} พักเคส ${ticket.ticket_no}`);
    return ticket;
  }

  async forward(ticket_id: string, dto: ForwardTicketDto, admin: AdminTb, images?: Express.Multer.File[]): Promise<TicketTb> {
    const ticket = await this.transition(ticket_id, admin, {
      clearWaitPause: true,
      images,
      mutate: async (ticket) => {
        const targetDept = await this.departmentsService.findById(dto.department_id);
        if (targetDept.department_id === ticket.department_id) {
          throw new BadRequestException('แผนกปลายทางต้องไม่ใช่แผนกเดิม');
        }

        const from_department_id = ticket.department_id;
        // ต้องอัปเดตทั้ง FK column และ relation object คู่กันเสมอ - entity ที่โหลดมามี relation
        // (department/assignee เป็น eager) ติดมาด้วย ถ้าแก้แค่ department_id ตอน manager.save()
        // TypeORM จะเอาค่าจาก relation object เดิม (แผนกเก่า/ผู้รับผิดชอบเก่า) เขียนทับ FK ที่แก้ไว้
        // ทำให้ตั๋ว "ไม่ย้ายแผนกจริง" ทั้งที่ status เปลี่ยนเป็น forwarded แล้ว
        ticket.department_id = targetDept.department_id;
        ticket.department = targetDept;
        ticket.assignee_id = null; // ให้ทีมใหม่กดรับเรื่องเอง
        ticket.assignee = null;

        return {
          to_status: TicketStatus.FORWARDED,
          history_note: dto.note ?? `ส่งต่อเคสไปยัง ${targetDept.department_name_th}`,
          from_department_id,
          to_department_id: targetDept.department_id,
          user_message: 'เรื่องของคุณถูกส่งต่อไปยังแผนกที่เหมาะสมกว่า',
        };
      },
    });
    await this.recordTicketAudit(admin, 'ticket.forward', ticket, `${admin.full_name} ส่งต่อเคส ${ticket.ticket_no}`);
    return ticket;
  }

  async listComments(ticket_id: string, admin: AdminTb): Promise<TicketCommentTb[]> {
    const ticket = await this.getTicketOrThrow(ticket_id);
    assertTicketManageableByAdmin(ticket, admin);
    const comments = await this.ticketsRepo.listComments(ticket_id);
    const withFiles = await this.ticketsRepo.listCommentAttachments(comments.map((c) => c.ticket_comment_id));
    const byComment = new Map<number, { ticket_attachment_id: number; original_name: string; download_url: string }[]>();
    for (const attachment of withFiles) {
      if (attachment.ticket_comment_id === null) continue;
      const list = byComment.get(attachment.ticket_comment_id) ?? [];
      list.push({
        ticket_attachment_id: attachment.ticket_attachment_id,
        original_name: attachment.original_name,
        download_url: `/tickets/chat/attachments/${attachment.ticket_attachment_id}`,
      });
      byComment.set(attachment.ticket_comment_id, list);
    }
    return comments.map((comment) => {
      (comment as TicketCommentTb & { attachments?: unknown }).attachments =
        byComment.get(comment.ticket_comment_id) ?? [];
      return comment;
    });
  }

  async addComment(ticket_id: string, dto: CreateTicketCommentDto, admin: AdminTb, files: Express.Multer.File[] = []): Promise<TicketCommentTb> {
    const ticket = await this.getTicketOrThrow(ticket_id);
    assertTicketManageableByAdmin(ticket, admin);
    const comment = await this.ticketsRepo.saveComment(
      this.ticketsRepo.createComment({
        ticket_id,
        admin_id: admin.admin_id,
        note: dto.note.trim(),
        is_internal: dto.is_internal ?? true,
      }),
    );
    if (files?.length) {
      try {
        const uploaded = await Promise.all(files.map((file) => this.storageService.uploadTicketImage(file)));
        const saved = await this.ticketsRepo.saveAttachments(
          uploaded.map(({ file_name, public_url }, index) => ({
            ticket_id,
            ticket_message_id: null,
            ticket_comment_id: comment.ticket_comment_id,
            file_name,
            original_name: files[index].originalname,
            file_path: public_url,
          })),
        );
        (comment as TicketCommentTb & { attachments?: unknown }).attachments = saved.map((attachment) => ({
          ticket_attachment_id: attachment.ticket_attachment_id,
          original_name: attachment.original_name,
          download_url: `/tickets/chat/attachments/${attachment.ticket_attachment_id}`,
        }));
      } catch (err) {
        this.logger.error(`บันทึกไฟล์แนบของบันทึกภายในไม่สำเร็จ (บันทึกถูกสร้างแล้ว):`, errorStack(err));
        throw new BadRequestException('แนบไฟล์ไม่สำเร็จ กรุณาลองบันทึกใหม่');
      }
    }
    await this.recordTicketAudit(admin, 'ticket.comment', ticket, `${admin.full_name} เพิ่มบันทึกในเคส ${ticket.ticket_no}`);
    return comment;
  }

  /**
   * รวม pattern ที่ซ้ำกันในทุกการเปลี่ยนสถานะตั๋วโดยแอดมิน (assign/resolve/wait/forward):
   *   หาตั๋ว -> เช็คสิทธิ์แผนก -> เช็คว่ายังไม่ปิด -> (ถ้าต้อง) พัก SLA clock ที่ค้างจาก Wait -> mutate()
   *   แก้ไขฟิลด์เฉพาะ action นั้น -> save -> บันทึก history -> แจ้งเตือน user -> คืนตั๋วเต็มกลับไป
   *
   * เช็คสิทธิ์แผนกก่อน mutate() เสมอ เพราะ forward() เปลี่ยน department_id ของตั๋วเอง - ถ้าเช็คทีหลัง
   * จะกลายเป็นเช็คกับแผนกปลายทางใหม่แทนแผนกเดิมที่แอดมินต้องมีสิทธิ์อยู่ก่อน
   */
  private async transition(
    ticket_id: string,
    admin: AdminTb,
    options: {
      /** true = ถ้าตั๋วกำลังอยู่สถานะ Wait อยู่ ให้ปิดช่วงพัก SLA ก่อน mutate (ทุก action ยกเว้น wait() เอง) */
      clearWaitPause?: boolean;
      mutate: (ticket: TicketTb) => Promise<TransitionResult> | TransitionResult;
      /** รูปประกอบการดำเนินการ (ไม่บังคับ) - แนบตอน assign/resolve/wait/forward ผูกกับ history แถวที่สร้างครั้งนี้ */
      images?: Express.Multer.File[];
    },
  ): Promise<TicketTb> {
    // ป้องกัน race condition ถ้าแอดมิน 2 คนกด action พร้อมกันบนตั๋วใบเดียวกัน: ห่อทั้งขั้นตอนใน
    // transaction เดียว + row lock เป็น optimistic lock ก่อน save จริง (เช็คด้านล่าง)
    //
    // สำคัญ: ทุก query ที่ต้องอยู่ใน transaction นี้ (รวมถึง findByIdInternal ตอนท้าย) ต้องเรียกด้วย
    // `manager` ตัวเดียวกันนี้เท่านั้น (ผ่าน TicketsRepository ที่รับ manager เสริม) และต้องเสร็จสิ้นก่อน
    // callback return - ถ้าเรียก service อื่นที่ใช้ repository ของตัวเอง (connection คนละอันจาก pool)
    // แทรกอยู่ตรงกลาง แล้วยังใช้ manager ต่อหลังจากนั้น จะเกิด QueryRunnerAlreadyReleasedError แบบสุ่มได้
    // เพราะ TypeORM อาจ commit + release connection ของ transaction ไปพร้อมๆ กับที่ query แยกนั้นยังทำงานไม่เสร็จ
    // (เคยเกิดจริงกับ notifyUser())
    let user_id: number | null = null;
    let user_message: string | undefined;
    let ticket_no = '';
    let historyId = 0;

    const savedTicket = await this.dataSource.transaction(async (manager) => {
      // ล็อกแถวตั๋ว (FOR UPDATE) ก่อนอ่านข้อมูล เพื่อให้แอดมินที่กดพร้อมกันรอคิวกัน และอ่านค่าล่าสุดเสมอ
      // ถ้าล็อกหลังอ่าน (แบบเดิม) การเปลี่ยนที่สถานะไม่เปลี่ยน เช่น มอบหมายซ้ำตอน IN_PROGRESS
      // จะผ่านเช็คสถานะทั้งคู่แล้วคนที่เขียนทีหลังเขียนทับของอีกคนด้วยข้อมูลเก่า
      const lockedStatus = await this.ticketsRepo.lockStatus(manager, ticket_id);
      if (lockedStatus === null) {
        throw new NotFoundException('ไม่พบตั๋วงานนี้');
      }
      const ticket = await this.ticketsRepo.findById(ticket_id, manager);
      if (!ticket) {
        throw new NotFoundException('ไม่พบตั๋วงานนี้');
      }
      assertTicketManageableByAdmin(ticket, admin);
      this.assertNotClosed(ticket);
      if (options.clearWaitPause) {
        this.clearWaitPauseIfNeeded(ticket);
      }

      const from_status = ticket.status;
      user_id = ticket.user_id;
      const result = await options.mutate(ticket);
      ticket.status = result.to_status;

      // ยืนยันว่าสถานะใน DB ตอนนี้ยังตรงกับตอนที่อ่านมา (from_status) ก่อน save จริง - ถ้าไม่ตรง
      // แปลว่ามีคนอื่นเปลี่ยนไปแล้วระหว่างนี้ ยกเลิกและให้ transaction rollback
      const currentStatus = await this.ticketsRepo.lockStatus(manager, ticket.ticket_id);
      if (currentStatus !== from_status) {
        throw new ConflictException(
          'ตั๋วนี้ถูกเปลี่ยนสถานะไปแล้วโดยผู้ใช้อื่นในเวลาไล่เลี่ยกัน กรุณารีเฟรชแล้วลองใหม่อีกครั้ง',
        );
      }

      await this.ticketsRepo.saveTicket(ticket, manager);

      const savedHistory = await this.ticketsRepo.saveHistory(
        this.ticketsRepo.createHistory(
          {
            ticket_id: ticket.ticket_id,
            from_status,
            to_status: result.to_status,
            changed_by_id: admin.admin_id,
            note: result.history_note ?? null,
            from_department_id: result.from_department_id ?? null,
            to_department_id: result.to_department_id ?? null,
          },
          manager,
        ),
        manager,
      );
      historyId = savedHistory.ticket_history_id;

      user_message = result.user_message ?? undefined;
      ticket_no = ticket.ticket_no;

      // แนบ first_response/resolve/primary_status ให้ response ของ action ทุกตัวเหมือน list/detail
      // (เดิมคืน entity ดิบ ทำให้ UI ได้ primary_status ว่างหลังกดเปลี่ยนสถานะ)
      return this.withFirstResponse(await this.findByIdInternal(ticket_id, manager));
    });

    // แจ้งเตือนผู้แจ้งปัญหา (ถ้ามี user ผูกกับตั๋วนี้อยู่ - บาง ticket user_id เป็น null กรณี
    // fallback ไม่ login LINE ให้ข้ามไปเงียบๆ ไม่ error) - จงใจทำหลัง transaction commit เสร็จแล้วจริงๆ
    // (คนละ connection จาก pool กับ transaction ข้างบน) ถ้าล้มเหลวไม่ควรกระทบการเปลี่ยนสถานะตั๋วซึ่ง
    // สำเร็จไปแล้ว
    if (user_id && user_message) {
      try {
        await this.userNotificationsService.notifyUser(user_id, ticket_id, user_message);
      } catch (err) {
      this.logger.error(`แจ้งเตือนผู้แจ้งของตั๋ว ${ticket_no} ไม่สำเร็จ (ไม่กระทบการเปลี่ยนสถานะตั๋ว):`, errorStack(err));
      }
    }

    // แนบรูปประกอบการดำเนินการ (ไม่บังคับ) - อัปโหลดหลัง transaction commit เสร็จแล้วเท่านั้น เหมือน
    // pattern เดียวกับตอนสร้างตั๋ว: ล้มเหลวแค่ log ไว้ ไม่ทำให้การเปลี่ยนสถานะที่สำเร็จไปแล้วต้อง rollback
    if (options.images?.length) {
      try {
        const uploaded = await Promise.all(
          options.images.map((file) => this.storageService.uploadTicketImage(file)),
        );
        const images = this.ticketsRepo.createImages(
          uploaded.map(({ file_name, public_url }, index) => ({
            ticket_id,
            ticket_history_id: historyId,
            file_name,
            original_name: options.images![index].originalname,
            file_path: public_url,
          })),
        );
        const savedImages = await this.ticketsRepo.saveImages(images);
        // ต้อง fetch ใหม่อีกรอบ - savedTicket ที่ได้จาก transaction ข้างบนยังไม่มีรูปที่เพิ่งอัปโหลดเสร็จทีหลัง
        const refreshed = this.withFirstResponse(await this.findByIdInternal(ticket_id));
        this.emitTicketChanged(refreshed);
        return refreshed;
      } catch (err) {
      this.logger.error(`บันทึกรูปแนบการดำเนินการของตั๋ว ${ticket_no} ไม่สำเร็จ (การเปลี่ยนสถานะยังสำเร็จตามปกติ):`, errorStack(err));
      }
    }

    const ticketOut = this.withFirstResponse(savedTicket);
    this.emitTicketChanged(ticketOut);
    return ticketOut;
  }

  private async getTicketOrThrow(ticket_id: string): Promise<TicketTb> {
    const ticket = await this.ticketsRepo.findById(ticket_id);
    if (!ticket) {
      throw new NotFoundException('ไม่พบตั๋วงานนี้');
    }
    return ticket;
  }

  /** fail-closed - ใช้เฉพาะตอนสร้างตั๋วที่ต้องการ identity ที่เชื่อถือได้จริง */
  private async verifyLineProfile(
    line_id_token: string,
  ): Promise<[string, string | undefined, string | undefined]> {
    const payload = await this.lineVerifyService.verifyIdToken(line_id_token);
    return [payload.sub, payload.name, payload.picture];
  }

  /** fail-open - ใช้กับ endpoint อ่านอย่างเดียว คืน null เงียบๆ ถ้า verify ไม่ผ่าน
   *  ห้ามใช้กับ endpoint ที่เป็น authorization gate จริง (ปิดงาน/ให้คะแนน) */
  private async tryVerifyLineUserId(line_id_token: string): Promise<string | null> {
    try {
      const payload = await this.lineVerifyService.verifyIdToken(line_id_token);
      return payload.sub;
    } catch {
      return null;
    }
  }

  private assertNotClosed(ticket: TicketTb): void {
    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException('ตั๋วงานนี้ปิดแล้ว ไม่สามารถแก้ไขสถานะเพิ่มเติมได้');
    }
    if (ticket.status === TicketStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException('ตั๋วงานนี้แก้ไขเสร็จแล้ว กำลังรอผู้แจ้งยืนยัน ไม่สามารถแก้ไขสถานะเพิ่มเติมได้');
    }
  }

  private recordTicketAudit(admin: AdminTb, action: string, ticket: TicketTb, summary: string) {
    return this.auditLogService.record({
      admin,
      action,
      entity_type: 'ticket',
      entity_id: ticket.ticket_id,
      summary,
      metadata: { ticket_no: ticket.ticket_no, status: ticket.status },
    });
  }

  /** ถ้าตั๋วกำลังอยู่ในสถานะ Wait อยู่ ให้บวกเวลาที่พักไว้เข้า sla_paused_ms ก่อนเปลี่ยนสถานะอื่น (mutate in-memory เฉยๆ ยังไม่ save) */
  private clearWaitPauseIfNeeded(ticket: TicketTb): void {
    if (ticket.status === TicketStatus.WAITING && ticket.wait_started_at) {
      const pausedMs = Date.now() - ticket.wait_started_at.getTime();
      ticket.sla_paused_ms = (ticket.sla_paused_ms ?? 0) + Math.max(0, pausedMs);
      ticket.wait_started_at = null;
    }
  }

  /**
   * สร้างเลขที่ตั๋วตามแผนกต้นทางและเดือนที่สร้าง เช่น TK-IT-2026-08-0001
   * ใช้แผนกต้นทางเป็นส่วนหนึ่งของเลขถาวร จึงไม่เปลี่ยนเมื่อมีการส่งตั๋วต่อไปแผนกอื่น
   */
  private async generateTicketNo(department_code: string, created_at: Date): Promise<string> {
    const normalizedDepartmentCode = department_code.trim().toLowerCase();
    const departmentCode = TICKET_DEPARTMENT_CODES[normalizedDepartmentCode] ?? 'OTHER';
    const year = created_at.getFullYear();
    const month = String(created_at.getMonth() + 1).padStart(2, '0');
    const prefix = `TK-${departmentCode}-${year}-${month}-`;

    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await this.ticketsRepo.countByTicketNoPrefix(prefix);
      const candidate = `${prefix}${String(count + 1 + attempt).padStart(4, '0')}`;
      const exists = await this.ticketsRepo.findByTicketNo(candidate);
      if (!exists) {
        return candidate;
      }
    }
    return `${prefix}${Date.now().toString().slice(-6)}`;
  }

  /** เช็ค SLA ของทุกตั๋วที่ยังไม่ปิด: ใกล้ครบ/เกินกำหนด -> แจ้งเตือน + ขึ้น flag แดง
   *  แต่ละใบดักจับ error แยกกัน กันตั๋วใบหนึ่งพังแล้วทำให้ทั้งรอบไม่ถูกเช็คต่อ */
  async checkSlaForActiveTickets(): Promise<void> {
    const tickets = await this.ticketsRepo.findAllActive();

    const now = Date.now();
    for (const ticket of tickets) {
      try {
        if (ticket.status === TicketStatus.PENDING_CONFIRMATION) continue; // มีตัวจับเวลาแยกของตัวเอง
        // เวลาที่หยุดนับสะสมจาก Wait ที่จบไปแล้ว + ช่วง Wait ปัจจุบัน (ถ้ากำลังอยู่)
        const ongoingPauseMs =
          ticket.status === TicketStatus.WAITING && ticket.wait_started_at
            ? now - ticket.wait_started_at.getTime()
            : 0;
        const pausedMs = (ticket.sla_paused_ms ?? 0) + ongoingPauseMs;
        const effectiveNow = new Date(now - pausedMs);

        // เตือนงานที่ยังไม่มีผู้รับผิดชอบเพียงครั้งเดียวเมื่อเลยกำหนดมอบหมาย
        if (
          !ticket.assignee_id &&
          ticket.assign_by &&
          new Date(now) >= ticket.assign_by &&
          !ticket.assign_breach_notified_at
        ) {
          ticket.assign_breach_notified_at = new Date(now);
          await this.ticketsRepo.updateFields(ticket.ticket_id, {
            assign_breach_notified_at: ticket.assign_breach_notified_at,
          });
          await this.notificationsService.notifyAllAdmins(
            ticket.ticket_id,
            `⚠️ ตั๋ว ${ticket.ticket_no} ยังไม่มีผู้รับผิดชอบและเลยกำหนดมอบหมายงานแล้ว`,
            ticket.department_id,
          );
        }

        // deadline_date ถือว่าสิ้นสุดเวลา 23:59:59.999 ของวันที่ผู้แจ้งเลือก
        if (ticket.deadline_date) {
          const deadlineAt = new Date(`${ticket.deadline_date}T23:59:59.999`);
          const warningAt = new Date(`${ticket.deadline_date}T00:00:00`);
          if (new Date(now) >= deadlineAt && !ticket.deadline_breach_notified_at) {
            ticket.deadline_breach_notified_at = new Date(now);
            await this.ticketsRepo.updateFields(ticket.ticket_id, {
              deadline_breach_notified_at: ticket.deadline_breach_notified_at,
            });
            await this.notificationsService.notifyAllAdmins(
              ticket.ticket_id,
              `🚨 ตั๋ว ${ticket.ticket_no} เลยกำหนดวันที่ผู้แจ้งระบุแล้ว (${ticket.deadline_date})`,
              ticket.department_id,
            );
          } else if (new Date(now) >= warningAt && new Date(now) < deadlineAt && !ticket.deadline_warning_notified_at) {
            ticket.deadline_warning_notified_at = new Date(now);
            await this.ticketsRepo.updateFields(ticket.ticket_id, {
              deadline_warning_notified_at: ticket.deadline_warning_notified_at,
            });
            await this.notificationsService.notifyAllAdmins(
              ticket.ticket_id,
              `⏰ ตั๋ว ${ticket.ticket_no} อยู่ในวันที่ครบกำหนดตามที่ผู้แจ้งระบุ (${ticket.deadline_date})`,
              ticket.department_id,
            );
          }
        }

        if (!ticket.resolve_by) continue;

        const resolveWindowMs = ticket.resolve_by.getTime() - ticket.created_at.getTime();
        const warningAt = new Date(ticket.created_at.getTime() + resolveWindowMs * SLA_WARNING_THRESHOLD);

        if (effectiveNow >= ticket.resolve_by && !ticket.sla_breached) {
          ticket.sla_breached = true;
          ticket.sla_breach_notified_at = new Date();
          await this.ticketsRepo.updateFields(ticket.ticket_id, {
            sla_breached: true,
            sla_breach_notified_at: ticket.sla_breach_notified_at,
          });
          await this.notificationsService.notifyAllAdmins(
            ticket.ticket_id,
            `🚩 ตั๋ว ${ticket.ticket_no} เกินกำหนด SLA แล้ว ("${ticket.subject}")`,
            ticket.department_id,
          );
        } else if (effectiveNow >= warningAt && !ticket.sla_warning_notified_at && !ticket.sla_breached) {
          ticket.sla_warning_notified_at = new Date();
          await this.ticketsRepo.updateFields(ticket.ticket_id, {
            sla_warning_notified_at: ticket.sla_warning_notified_at,
          });
          await this.notificationsService.notifyAllAdmins(
            ticket.ticket_id,
            `⏰ ตั๋ว ${ticket.ticket_no} ใกล้ครบกำหนด SLA แล้ว ("${ticket.subject}")`,
            ticket.department_id,
          );
        }
      } catch (err) {
        this.logger.error(`เช็ค SLA ของตั๋ว ${ticket.ticket_no} ไม่สำเร็จ (ข้ามไปทำใบถัดไปต่อ):`, errorStack(err));
      }
    }
  }

  /** auto-close ตั๋วที่รอผู้แจ้งยืนยันเกินเวลา - แต่ละใบทำใน transaction+lock แยกกัน
   *  กันชนกับ confirmResolution() ที่ผู้แจ้งอาจกดยืนยันพร้อมกันพอดี */
  async autoCloseUnconfirmedTickets(): Promise<void> {
    const overdue = await this.ticketsRepo.findOverdueUnconfirmed();

    for (const ticket of overdue) {
      try {
        const closedTicket = await this.dataSource.transaction(async (manager) => {
          const lockedStatus = await this.ticketsRepo.lockStatus(manager, ticket.ticket_id);
          // อาจมีคนกดยืนยันเองไปแล้วพอดีก่อนรอบนี้จะมาถึงตั๋วใบนี้ - ข้ามไปเงียบๆ ไม่ถือเป็น error
          if (lockedStatus !== TicketStatus.PENDING_CONFIRMATION) {
            return null;
          }

          // อัปเดตเฉพาะ status/closed_at - ไม่ save ทั้ง entity เพราะ `ticket` เป็น snapshot เก่าจากก่อนเข้า transaction
          await this.ticketsRepo.updateFields(
            ticket.ticket_id,
            { status: TicketStatus.CLOSED, closed_at: new Date() },
            manager,
          );

          await this.ticketsRepo.saveHistory(
            this.ticketsRepo.createHistory(
              {
                ticket_id: ticket.ticket_id,
                from_status: TicketStatus.PENDING_CONFIRMATION,
                to_status: TicketStatus.CLOSED,
                note: `หมดเวลารอผู้แจ้งยืนยัน (${RESOLUTION_CONFIRM_TIMEOUT_HOURS} ชม.) - ระบบปิดงานอัตโนมัติ`,
              },
              manager,
            ),
            manager,
          );

          return this.findByIdInternal(ticket.ticket_id, manager);
        });

        if (closedTicket) {
          const closed = this.withFirstResponse(closedTicket);
          this.emitTicketChanged(closed);
        }
      } catch (err) {
        this.logger.error(`auto-close ตั๋ว ${ticket.ticket_no} ไม่สำเร็จ (ข้ามไปทำใบถัดไปต่อ):`, errorStack(err));
      }
    }
  }
}
