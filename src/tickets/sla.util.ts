import { TicketPriority } from '../common/enums/ticket-priority.enum';

/** ระยะเวลา SLA (ชั่วโมง) ต่อระดับความเร่งด่วน - ปรับตัวเลขได้ตามนโยบายจริงของทีม */
export const SLA_HOURS: Record<TicketPriority, { assignHours: number; resolveHours: number }> = {
  [TicketPriority.URGENT]: { assignHours: 1, resolveHours: 4 },
  [TicketPriority.NORMAL]: { assignHours: 4, resolveHours: 24 },
};

/** ให้เตือนล่วงหน้าเมื่อใช้เวลาไปถึงสัดส่วนนี้ของ resolve SLA (เช่น 0.8 = เตือนเมื่อผ่านไป 80%) */
export const SLA_WARNING_THRESHOLD = 0.8;

/** จำนวนชั่วโมงที่รอผู้แจ้งยืนยันหลัง Resolve ก่อนจะ auto-close ให้เอง */
export const RESOLUTION_CONFIRM_TIMEOUT_HOURS = 72;

export function computeSlaDeadlines(
  priority: TicketPriority,
  created_at: Date,
): { assign_by: Date; resolve_by: Date } {
  const rule = SLA_HOURS[priority] ?? SLA_HOURS[TicketPriority.NORMAL];
  const urgent24x7 = process.env.SLA_URGENT_24_7 !== 'false';
  const addHours = priority === TicketPriority.URGENT && urgent24x7 ? addClockHours : addBusinessHours;
  const assign_by = addHours(created_at, rule.assignHours);
  const resolve_by = addHours(created_at, rule.resolveHours);
  return { assign_by, resolve_by };
}

export function addClockHours(start: Date, hours: number): Date {
  return new Date(start.getTime() + hours * 60 * 60 * 1000);
}

const WORK_START_HOUR = Number(process.env.SLA_WORK_START_HOUR ?? 8);
const WORK_START_MINUTE = Number(process.env.SLA_WORK_START_MINUTE ?? 30);
const WORK_END_HOUR = Number(process.env.SLA_WORK_END_HOUR ?? 17);
const WORK_END_MINUTE = Number(process.env.SLA_WORK_END_MINUTE ?? 30);

function isWorkday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function atWorkStart(date: Date): Date {
  const next = new Date(date);
  next.setHours(WORK_START_HOUR, WORK_START_MINUTE, 0, 0);
  return next;
}

function atWorkEnd(date: Date): Date {
  const next = new Date(date);
  next.setHours(WORK_END_HOUR, WORK_END_MINUTE, 0, 0);
  return next;
}

function nextWorkStart(date: Date): Date {
  const next = atWorkStart(date);
  next.setDate(next.getDate() + 1);
  while (!isWorkday(next)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function addBusinessHours(start: Date, hours: number): Date {
  let cursor = new Date(start);
  let remainingMs = hours * 60 * 60 * 1000;

  while (!isWorkday(cursor) || cursor >= atWorkEnd(cursor)) {
    cursor = nextWorkStart(cursor);
  }
  if (cursor < atWorkStart(cursor)) {
    cursor = atWorkStart(cursor);
  }

  while (remainingMs > 0) {
    const workEnd = atWorkEnd(cursor);
    const availableMs = workEnd.getTime() - cursor.getTime();
    if (remainingMs <= availableMs) {
      return new Date(cursor.getTime() + remainingMs);
    }
    remainingMs -= availableMs;
    cursor = nextWorkStart(cursor);
  }

  return cursor;
}
