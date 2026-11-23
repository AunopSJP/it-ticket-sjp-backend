import { TICKET_TRIAGE_PRIORITIES, TicketTriagePriority } from '@it-ticket/shared';

export type SlaCalendar = 'business' | 'always';

/** นโยบายเวลาของแต่ละระดับคัดแยก - ค่าเริ่มต้นเป็นข้อเสนอ ต้องให้เจ้าของบริการ IT ยืนยันก่อนใช้จริง */
export interface SlaPolicy {
  firstResponseHours: number;
  resolveHours: number;
  calendar: SlaCalendar;
}

export const DEFAULT_TRIAGE_SLA_POLICY: Record<TicketTriagePriority, SlaPolicy> = {
  p1: { firstResponseHours: 1, resolveHours: 8, calendar: 'always' },
  p2: { firstResponseHours: 4, resolveHours: 24, calendar: 'business' },
  p3: { firstResponseHours: 8, resolveHours: 72, calendar: 'business' },
  p4: { firstResponseHours: 24, resolveHours: 120, calendar: 'business' },
};

/** เกณฑ์เตือนเริ่มต้น (นาที) - ปรับได้ตามนโยบาย */
export const FIRST_RESPONSE_WARNING_MINUTES = 15;

export type FirstResponseState = 'none' | 'met' | 'paused' | 'overdue' | 'due_soon' | 'pending';

export interface FirstResponseClock {
  due_at: Date | null;
  responded_at: Date | null;
  /** met | paused | overdue | due_soon | pending | none */
  state: FirstResponseState;
  remaining_ms: number | null;
  /** met แล้วแต่ช้ากว่ากำหนด */
  late: boolean;
  /** 0..1 = เวลาที่ใช้ไปเทียบงบเวลาตามนโยบาย (ไม่เกิน 1) */
  progress: number;
}

/** เป้าหมาย "แก้ไข" - นับจากรับเรื่องถึงสถานะรอผู้แจ้งยืนยัน/ปิดงาน */
export interface ResolveClock {
  due_at: Date | null;
  resolved_at: Date | null;
  state: FirstResponseState;
  remaining_ms: number | null;
  late: boolean;
  progress: number;
  /** กำลังพักเพราะรอข้อมูลผู้แจ้ง (พักเฉพาะเป้าหมายนี้) */
  paused: boolean;
}

interface WorkWindow {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function workWindow(): WorkWindow {
  return {
    startHour: envNumber('SLA_WORK_START_HOUR', 8),
    startMinute: envNumber('SLA_WORK_START_MINUTE', 30),
    endHour: envNumber('SLA_WORK_END_HOUR', 17),
    endMinute: envNumber('SLA_WORK_END_MINUTE', 30),
  };
}

/** วันหยุดจาก env SLA_HOLIDAYS=Csv YYYY-MM-DD (เช่น 2026-12-31,2027-01-01) */
export function holidayDates(): Set<string> {
  return new Set(
    (process.env.SLA_HOLIDAYS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
  );
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isWorkday(date: Date, holidays: Set<string>): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6 && !holidays.has(dateKey(date));
}

function atTime(date: Date, hour: number, minute: number): Date {
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function nextWorkStart(date: Date, holidays: Set<string>): Date {
  const window = workWindow();
  const next = atTime(date, window.startHour, window.startMinute);
  next.setDate(next.getDate() + 1);
  while (!isWorkday(next, holidays)) next.setDate(next.getDate() + 1);
  return next;
}

/** บวกชั่วโมงตามปฏิทินนโยบาย - business = เฉพาะวันทำการและเวลาทำการ, always = 24/7 */
export function addPolicyHours(
  start: Date,
  hours: number,
  calendar: SlaCalendar,
  holidays: Set<string> = holidayDates(),
): Date {
  if (hours <= 0) return new Date(start);
  if (calendar === 'always') return new Date(start.getTime() + hours * 3_600_000);

  const window = workWindow();
  let cursor = new Date(start);
  let remaining = hours * 3_600_000;

  while (!isWorkday(cursor, holidays) || cursor >= atTime(cursor, window.endHour, window.endMinute)) {
    cursor = nextWorkStart(cursor, holidays);
  }
  const startOfDay = atTime(cursor, window.startHour, window.startMinute);
  if (cursor < startOfDay) cursor = startOfDay;

  while (remaining > 0) {
    const endOfDay = atTime(cursor, window.endHour, window.endMinute);
    const available = endOfDay.getTime() - cursor.getTime();
    if (remaining <= available) return new Date(cursor.getTime() + remaining);
    remaining -= available;
    cursor = nextWorkStart(cursor, holidays);
  }
  return cursor;
}

/** override จาก SLA_POLICY_JSON เช่น {"p2":{"firstResponseHours":2,"resolveHours":12,"calendar":"business"}} */
export function policyFor(priority: TicketTriagePriority, overrides?: Partial<Record<TicketTriagePriority, Partial<SlaPolicy>>>): SlaPolicy | null {
  const base = DEFAULT_TRIAGE_SLA_POLICY[priority];
  if (!base) return null;
  const override = overrides?.[priority];
  return { ...base, ...(override ?? {}) };
}

function policyOverridesFromEnv(): Partial<Record<TicketTriagePriority, Partial<SlaPolicy>>> {
  const raw = process.env.SLA_POLICY_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<SlaPolicy>>;
    const result: Partial<Record<TicketTriagePriority, Partial<SlaPolicy>>> = {};
    for (const priority of TICKET_TRIAGE_PRIORITIES) {
      const value = parsed[priority];
      if (value && typeof value === 'object') result[priority] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export interface FirstResponseInput {
  created_at: Date;
  triage_priority: TicketTriagePriority;
  responded_at: Date | null;
  now?: Date;
  warning_minutes?: number;
  overrides?: Partial<Record<TicketTriagePriority, Partial<SlaPolicy>>>;
  holidays?: Set<string>;
}

/**
 * คำนวณเป้าหมาย "ตอบผู้แจ้งครั้งแรก" ฝั่งเซิร์ฟเวอร์
 * - เริ่มนับจากรับเรื่องถึงข้อความแรกที่เจ้าหน้าที่ส่งถึงผู้แจ้ง (บันทึกภายในไม่นับ)
 * - **ไม่พัก** ระหว่างรอข้อมูลผู้แจ้ง: สเปก 2.3 ให้พักเฉพาะเป้าหมายแก้ไข
 * - เปิดเคสใหม่ไม่เริ่มรอบตอบครั้งแรกใหม่ (responded_at คงอยู่)
 */
export function firstResponseClock(input: FirstResponseInput): FirstResponseClock {
  const policy = policyFor(input.triage_priority, input.overrides ?? policyOverridesFromEnv());
  if (!policy) {
    return { due_at: null, responded_at: input.responded_at, state: 'none', remaining_ms: null, late: false, progress: 0 };
  }

  const now = input.now ?? new Date();
  const holidays = input.holidays ?? holidayDates();
  const dueAt = addPolicyHours(input.created_at, policy.firstResponseHours, policy.calendar, holidays);
  const budgetMs = Math.max(dueAt.getTime() - input.created_at.getTime(), 1);

  if (input.responded_at) {
    const usedMs = input.responded_at.getTime() - input.created_at.getTime();
    return {
      due_at: dueAt,
      responded_at: input.responded_at,
      state: 'met',
      remaining_ms: null,
      late: input.responded_at.getTime() > dueAt.getTime(),
      progress: clampProgress(usedMs / budgetMs),
    };
  }

  const remaining = dueAt.getTime() - now.getTime();
  const warningMs = (input.warning_minutes ?? FIRST_RESPONSE_WARNING_MINUTES) * 60_000;
  const state: FirstResponseState = remaining <= 0 ? 'overdue' : remaining <= warningMs ? 'due_soon' : 'pending';

  return {
    due_at: dueAt,
    responded_at: null,
    state,
    remaining_ms: remaining,
    late: false,
    progress: clampProgress((now.getTime() - input.created_at.getTime()) / budgetMs),
  };
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export interface ResolveInput {
  created_at: Date;
  triage_priority: TicketTriagePriority;
  /** เวลาที่ไปถึงสถานะรอผู้แจ้งยืนยัน/ปิดงาน - null = ยังไม่เสร็จ */
  resolved_at: Date | null;
  /** เวลาที่พักไปแล้วจากรอบก่อนๆ */
  paused_ms?: number;
  /** กำลังพักอยู่ (status = waiting) - พักเฉพาะเป้าหมายแก้ไข */
  waiting_since?: Date | null;
  now?: Date;
  warning_minutes?: number;
  overrides?: Partial<Record<TicketTriagePriority, Partial<SlaPolicy>>>;
  holidays?: Set<string>;
}

/**
 * เป้าหมาย "แก้ไข" ตามนโยบายเดียวกับตอบครั้งแรก
 * - นับถึงสถานะรอผู้แจ้งยืนยัน/ปิดงาน (ไม่ใช่ตอนกด resolve เฉยๆ)
 * - พัก时钟ระหว่างรอข้อมูลผู้แจ้ง แล้วนับต่อ
 * - เปิดเคสใหม่ไม่เริ่มรอบใหม่: resolved_at คงอยู่และ due_at ไม่ถูกคำนวณใหม่
 */
export function resolveClock(input: ResolveInput): ResolveClock {
  const policy = policyFor(input.triage_priority, input.overrides ?? policyOverridesFromEnv());
  if (!policy) {
    return { due_at: null, resolved_at: input.resolved_at, state: 'none', remaining_ms: null, late: false, progress: 0, paused: false };
  }

  const now = input.now ?? new Date();
  const holidays = input.holidays ?? holidayDates();
  const pausedMs = (input.paused_ms ?? 0) +
    (input.waiting_since ? Math.max(0, now.getTime() - input.waiting_since.getTime()) : 0);
  const baseDue = addPolicyHours(input.created_at, policy.resolveHours, policy.calendar, holidays);
  const dueAt = new Date(baseDue.getTime() + pausedMs);
  const budgetMs = Math.max(dueAt.getTime() - input.created_at.getTime(), 1);

  if (input.resolved_at) {
    return {
      due_at: dueAt,
      resolved_at: input.resolved_at,
      state: 'met',
      remaining_ms: null,
      late: input.resolved_at.getTime() > dueAt.getTime(),
      progress: clampProgress((input.resolved_at.getTime() - input.created_at.getTime()) / budgetMs),
      paused: false,
    };
  }

  const remaining = dueAt.getTime() - now.getTime();
  const warningMs = (input.warning_minutes ?? FIRST_RESPONSE_WARNING_MINUTES) * 60_000;
  const state: FirstResponseState = input.waiting_since
    ? 'paused'
    : remaining <= 0
      ? 'overdue'
      : remaining <= warningMs
        ? 'due_soon'
        : 'pending';

  return {
    due_at: dueAt,
    resolved_at: null,
    state,
    remaining_ms: remaining,
    late: false,
    progress: clampProgress((now.getTime() - input.created_at.getTime() - pausedMs) / budgetMs),
    paused: input.waiting_since !== null && input.waiting_since !== undefined,
  };
}
