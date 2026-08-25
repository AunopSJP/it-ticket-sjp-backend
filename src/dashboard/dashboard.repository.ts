import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { AdminTb } from '../admin/admin.entity';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketHistoryTb } from '../tickets/entities/ticket-history.entity';
import { TicketTb } from '../tickets/entities/ticket.entity';

export interface DashboardSummaryRow {
  open: string;
  in_progress: string;
  waiting: string;
  forwarded: string;
  pending_confirmation: string;
  closed: string;
  total: string;
  sla_breached: string;
}

export interface DepartmentGroupRowData {
  department_id: number;
  department_name_th: string;
  active_count: string;
  total_count: string;
  open_count: string;
  in_progress_count: string;
  waiting_count: string;
  pending_confirmation_count: string;
}

export interface AssigneeGroupRowData {
  assignee_id: number | null;
  assignee_name: string | null;
  active_count: string;
  total_count: string;
  open_count: string;
  in_progress_count: string;
  waiting_count: string;
  pending_confirmation_count: string;
}

export interface DashboardAnalyticsRows {
  response: { avgMinutes: string | null; sampleSize: string } | undefined;
  resolution: { avgMinutes: string | null; sampleSize: string } | undefined;
}

export interface TrendRow {
  date: string;
  count: string;
}

const DEFAULT_TREND_WINDOW_DAYS = 29;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function countWhereStatusSql(parameter: string): string {
  return `COUNT(*) FILTER (WHERE ticket.status = :${parameter})`;
}

function countWhereStatusInSql(parameter: string): string {
  return `COUNT(*) FILTER (WHERE ticket.status IN (:...${parameter}))`;
}

const ACTIVE_COUNT_SQL = 'COUNT(*) FILTER (WHERE ticket.status <> :closed_status)';

interface DepartmentScopedQueryBuilder {
  andWhere(where: string, parameters?: ObjectLiteral): DepartmentScopedQueryBuilder;
}

@Injectable()
export class DashboardRepository {
  constructor(
    @InjectRepository(TicketTb)
    private readonly ticketsRepo: Repository<TicketTb>,
    @InjectRepository(TicketHistoryTb)
    private readonly historyRepo: Repository<TicketHistoryTb>,
  ) {}

  private applyDepartmentScope(qb: DepartmentScopedQueryBuilder, admin: AdminTb): void {
    if (admin.department_id === null || admin.department_id === undefined) return;
    qb.andWhere(
      `(ticket.department_id = :admin_department_id OR EXISTS (
        SELECT 1 FROM ticket_history_tb scope_history
        WHERE scope_history.ticket_id = ticket.ticket_id
          AND (scope_history.ticket_history_from_department_id = :admin_department_id
            OR scope_history.ticket_history_to_department_id = :admin_department_id)
      ))`,
      { admin_department_id: admin.department_id },
    );
  }

  async summary(admin: AdminTb): Promise<DashboardSummaryRow | undefined> {
    const query = this.ticketsRepo
      .createQueryBuilder('ticket')
      .select(countWhereStatusSql('open_status'), 'open')
      .addSelect(countWhereStatusSql('in_progress_status'), 'in_progress')
      .addSelect(countWhereStatusSql('waiting_status'), 'waiting')
      .addSelect(countWhereStatusSql('forwarded_status'), 'forwarded')
      .addSelect(countWhereStatusSql('pending_confirmation_status'), 'pending_confirmation')
      .addSelect(countWhereStatusSql('closed_status'), 'closed')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        'COUNT(*) FILTER (WHERE ticket.sla_breached = true AND ticket.status <> :closed_status)',
        'sla_breached',
      )
      .setParameters({
        open_status: TicketStatus.OPEN,
        in_progress_status: TicketStatus.IN_PROGRESS,
        waiting_status: TicketStatus.WAITING,
        forwarded_status: TicketStatus.FORWARDED,
        pending_confirmation_status: TicketStatus.PENDING_CONFIRMATION,
        closed_status: TicketStatus.CLOSED,
      });
    this.applyDepartmentScope(query, admin);
    return query.getRawOne<DashboardSummaryRow>();
  }

  async groupByDepartment(admin: AdminTb): Promise<DepartmentGroupRowData[]> {
    const query = this.ticketsRepo
      .createQueryBuilder('ticket')
      .innerJoin('ticket.department', 'department')
      .select('department.department_id', 'department_id')
      .addSelect('department.department_name_th', 'department_name_th')
      .addSelect(ACTIVE_COUNT_SQL, 'active_count')
      .addSelect('COUNT(*)', 'total_count')
      .addSelect(countWhereStatusSql('open_status'), 'open_count')
      .addSelect(countWhereStatusSql('in_progress_status'), 'in_progress_count')
      .addSelect(countWhereStatusInSql('waiting_statuses'), 'waiting_count')
      .addSelect(countWhereStatusSql('pending_confirmation_status'), 'pending_confirmation_count')
      .setParameters({
        open_status: TicketStatus.OPEN,
        in_progress_status: TicketStatus.IN_PROGRESS,
        waiting_statuses: [TicketStatus.WAITING, TicketStatus.FORWARDED],
        pending_confirmation_status: TicketStatus.PENDING_CONFIRMATION,
        closed_status: TicketStatus.CLOSED,
      });
    query
      .groupBy('department.department_id')
      .addGroupBy('department.department_name_th')
      .orderBy(ACTIVE_COUNT_SQL, 'DESC')
      .addOrderBy('COUNT(*)', 'DESC');
    this.applyDepartmentScope(query, admin);
    return query.getRawMany<DepartmentGroupRowData>();
  }

  async groupByAssignee(admin: AdminTb): Promise<AssigneeGroupRowData[]> {
    const query = this.ticketsRepo
      .createQueryBuilder('ticket')
      .leftJoin('ticket.assignee', 'assignee')
      .select('ticket.assignee_id', 'assignee_id')
      .addSelect('assignee.full_name', 'assignee_name')
      .addSelect(ACTIVE_COUNT_SQL, 'active_count')
      .addSelect('COUNT(*)', 'total_count')
      .addSelect(countWhereStatusSql('open_status'), 'open_count')
      .addSelect(countWhereStatusSql('in_progress_status'), 'in_progress_count')
      .addSelect(countWhereStatusInSql('waiting_statuses'), 'waiting_count')
      .addSelect(countWhereStatusSql('pending_confirmation_status'), 'pending_confirmation_count')
      .setParameters({
        open_status: TicketStatus.OPEN,
        in_progress_status: TicketStatus.IN_PROGRESS,
        waiting_statuses: [TicketStatus.WAITING, TicketStatus.FORWARDED],
        pending_confirmation_status: TicketStatus.PENDING_CONFIRMATION,
        closed_status: TicketStatus.CLOSED,
      });
    query
      .groupBy('ticket.assignee_id')
      .addGroupBy('assignee.full_name')
      .orderBy(ACTIVE_COUNT_SQL, 'DESC')
      .addOrderBy('COUNT(*)', 'DESC');
    this.applyDepartmentScope(query, admin);
    return query.getRawMany<AssigneeGroupRowData>();
  }

  async analytics(admin: AdminTb, from?: Date, to?: Date): Promise<DashboardAnalyticsRows> {
    const responseQuery = this.historyRepo
      .createQueryBuilder('history')
      .innerJoin('history.ticket', 'ticket')
      .select('AVG(EXTRACT(EPOCH FROM (history.created_at - ticket.created_at)) / 60)', 'avgMinutes')
      .addSelect('COUNT(*)', 'sampleSize')
      .where('history.to_status = :in_progress', { in_progress: TicketStatus.IN_PROGRESS })
      .andWhere(`history.ticket_history_id = (
        SELECT MIN(h2.ticket_history_id) FROM ticket_history_tb h2
        WHERE h2.ticket_id = history.ticket_id AND h2.ticket_history_to_status = :in_progress
      )`);
    this.applyDepartmentScope(responseQuery, admin);
    if (from) responseQuery.andWhere('ticket.created_at >= :from', { from });
    if (to) responseQuery.andWhere('ticket.created_at <= :to', { to });

    const resolutionQuery = this.ticketsRepo
      .createQueryBuilder('ticket')
      .select('AVG(EXTRACT(EPOCH FROM (ticket.resolved_at - ticket.created_at)) / 60)', 'avgMinutes')
      .addSelect('COUNT(*)', 'sampleSize')
      .where('ticket.resolved_at IS NOT NULL');
    this.applyDepartmentScope(resolutionQuery, admin);
    if (from) resolutionQuery.andWhere('ticket.created_at >= :from', { from });
    if (to) resolutionQuery.andWhere('ticket.created_at <= :to', { to });

    const [response, resolution] = await Promise.all([
      responseQuery.getRawOne<{ avgMinutes: string | null; sampleSize: string }>(),
      resolutionQuery.getRawOne<{ avgMinutes: string | null; sampleSize: string }>(),
    ]);
    return { response, resolution };
  }

  async trend(admin: AdminTb, from?: Date, to?: Date): Promise<TrendRow[]> {
    const effectiveFrom = from ?? new Date(Date.now() - DEFAULT_TREND_WINDOW_DAYS * MS_PER_DAY);
    const effectiveTo = to ?? new Date();
    const query = this.ticketsRepo
      .createQueryBuilder('ticket')
      .select("TO_CHAR(ticket.created_at, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('ticket.created_at >= :from', { from: effectiveFrom })
      .andWhere('ticket.created_at <= :to', { to: effectiveTo })
      .groupBy("TO_CHAR(ticket.created_at, 'YYYY-MM-DD')")
      .orderBy("TO_CHAR(ticket.created_at, 'YYYY-MM-DD')", 'ASC');
    this.applyDepartmentScope(query, admin);
    return query.getRawMany<TrendRow>();
  }
}
