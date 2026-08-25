import { ForbiddenException } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { TicketTb } from './entities/ticket.entity';
import { AdminTb } from '../admin/admin.entity';

export type TicketAccess = 'full' | 'origin-read' | 'denied';

/**
 * Ticket visibility rules shared by detail, comments, actions and protected images.
 * Origin departments retain read access for handover/data collection, but do not
 * receive case-management or internal-comment access.
 */
export function ticketAccessForAdmin(ticket: TicketTb, admin: AdminTb): TicketAccess {
  if (admin.role === Role.SUPER_ADMIN || admin.department_id === null) return 'full';
  if (ticket.assignee_id === admin.admin_id) return 'full';
  if (ticket.department_id === admin.department_id) return 'full';

  const wasInOriginDepartment = (ticket.history ?? []).some(
    (history) =>
      history.from_department_id === admin.department_id ||
      history.to_department_id === admin.department_id,
  );
  return wasInOriginDepartment ? 'origin-read' : 'denied';
}

export function assertTicketReadableByAdmin(ticket: TicketTb, admin: AdminTb): TicketAccess {
  const access = ticketAccessForAdmin(ticket, admin);
  if (access === 'denied') throw new ForbiddenException('คุณไม่มีสิทธิ์เข้าถึงตั๋วนี้');
  return access;
}

export function assertTicketManageableByAdmin(ticket: TicketTb, admin: AdminTb): void {
  if (ticketAccessForAdmin(ticket, admin) !== 'full') {
    throw new ForbiddenException('เฉพาะผู้รับผิดชอบ แผนกปัจจุบัน หรือ Super Admin เท่านั้นที่จัดการตั๋วนี้ได้');
  }
}

export function assertTicketImageReadableByAdmin(ticket: TicketTb, admin: AdminTb): void {
  if (ticketAccessForAdmin(ticket, admin) !== 'full') {
    throw new ForbiddenException('คุณไม่มีสิทธิ์ดูรูปแนบของตั๋วนี้');
  }
}
