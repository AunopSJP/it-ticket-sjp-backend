require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addPolicyHours,
  firstResponseClock,
  resolveClock,
  holidayDates,
  policyFor,
} = require('../src/tickets/first-response-sla.util.ts');

const P3 = 'p3';
/** อังคาร 10 พ.ย. 2026 09:00 เวลาทำการ */
const tue0900 = new Date(2026, 10, 10, 9, 0, 0, 0);

function businessPolicy(priority = P3) {
  return policyFor(priority, {
    [priority]: { firstResponseHours: 8, resolveHours: 72, calendar: 'business' },
  });
}

test('business hours stop at 17:30 and continue the next workday', () => {
  assert.ok(businessPolicy());
  const due = addPolicyHours(tue0900, 8, 'business', new Set());
  // 09:00 + 8h = 17:00 วันเดียวกัน
  assert.equal(due.getFullYear(), 2026);
  assert.equal(due.getMonth(), 10);
  assert.equal(due.getDate(), 10);
  assert.equal(due.getHours(), 17);
  assert.equal(due.getMinutes(), 0);
});

test('a public holiday is skipped like a weekend', () => {
  // 10 พ.ย. 09:00 + 10h -> ถึง 17:30 = 8.5h เหลือ 1.5h ต้องไปวันทำการถัดไป
  const holidays = new Set(['2026-11-11']);
  const due = addPolicyHours(tue0900, 10, 'business', holidays);
  // 11 พ.ย. เป็นวันหยุด -> ข้ามไป 12 พ.ย. 08:30 + 1.5h = 10:00
  assert.equal(due.getMonth(), 10);
  assert.equal(due.getDate(), 12);
  assert.equal(due.getHours(), 10);
  assert.equal(due.getMinutes(), 0);
});

test('24/7 policy ignores business hours', () => {
  const due = addPolicyHours(tue0900, 8, 'always', new Set());
  assert.equal(due.getDate(), 10);
  assert.equal(due.getHours(), 17);
});

test('SLA_HOLIDAYS parses only valid ISO dates', () => {
  const previous = process.env.SLA_HOLIDAYS;
  process.env.SLA_HOLIDAYS = '2026-12-31, not-a-date , 2027-01-01';
  try {
    assert.deepEqual([...holidayDates()], ['2026-12-31', '2027-01-01']);
  } finally {
    process.env.SLA_HOLIDAYS = previous;
  }
});

// ------------------------------------------------------------ first response state

const base = {
  created_at: tue0900,
  triage_priority: P3,
  responded_at: null,
  overrides: { p3: { firstResponseHours: 2, resolveHours: 72, calendar: 'business' } },
  holidays: new Set(),
};

test('warning appears exactly at the 15 minute boundary and not before', () => {
  const due = addPolicyHours(tue0900, 2, 'business', new Set()); // 11:00
  const at16 = new Date(due.getTime() - 16 * 60_000);
  const at15 = new Date(due.getTime() - 15 * 60_000);

  assert.equal(firstResponseClock({ ...base, now: at16 }).state, 'pending');
  assert.equal(firstResponseClock({ ...base, now: at15 }).state, 'due_soon');
  assert.equal(firstResponseClock({ ...base, now: due }).state, 'overdue');
  assert.equal(firstResponseClock({ ...base, now: due }).remaining_ms, 0);
});

test('internal note does not close the first-response target', () => {
  const clock = firstResponseClock({ ...base, now: new Date(tue0900.getTime() + 30 * 60_000) });
  assert.equal(clock.state, 'pending', 'responded_at ยังเป็น null เพราะบันทึกภายในไม่ใช่การตอบผู้แจ้ง');
  assert.ok(clock.due_at instanceof Date);
});

test('pausing while waiting for the reporter pauses only the resolve target, not the first response', () => {
  const waitingSince = new Date(tue0900.getTime() + 30 * 60_000);

  // first response ไม่พัก: กำหนดยังเท่าเดิม
  const first = firstResponseClock({ ...base, now: waitingSince });
  assert.equal(first.state, 'pending');
  assert.equal(first.due_at.getTime(), addPolicyHours(tue0900, 2, 'business', new Set()).getTime());

  // resolve พัก และกำหนดเลื่อนออกไปตามเวลาที่พัก
  const resolveInput = {
    created_at: tue0900,
    triage_priority: P3,
    resolved_at: null,
    overrides: { p3: { firstResponseHours: 2, resolveHours: 4, calendar: 'business' } },
    holidays: new Set(),
  };
  const paused = resolveClock({ ...resolveInput, waiting_since: waitingSince, now: waitingSince });
  assert.equal(paused.state, 'paused');
  assert.equal(paused.paused, true);

  const afterResume = resolveClock({
    ...resolveInput, paused_ms: 60 * 60_000, waiting_since: null,
    now: new Date(tue0900.getTime() + 90 * 60_000),
  });
  const expected = addPolicyHours(tue0900, 4, 'business', new Set());
  assert.equal(afterResume.state, 'pending');
  assert.equal(afterResume.due_at.getTime(), expected.getTime() + 60 * 60_000);
});

test('a reply after the deadline is met but late, and reopening keeps the elapsed result', () => {
  const due = addPolicyHours(tue0900, 2, 'business', new Set());
  const respondedAt = new Date(due.getTime() + 30 * 60_000);
  const met = firstResponseClock({ ...base, responded_at: respondedAt, now: respondedAt });
  assert.equal(met.state, 'met');
  assert.equal(met.late, true);

  // เปิดเคสใหม่: responded_at ยังอยู่ -> ไม่เริ่มรอบตอบครั้งแรกใหม่
  const reopened = firstResponseClock({ ...base, responded_at: respondedAt, now: new Date(due.getTime() + 5 * 3_600_000) });
  assert.equal(reopened.state, 'met');
  assert.equal(reopened.due_at.getTime(), due.getTime());
  assert.equal(reopened.responded_at.getTime(), respondedAt.getTime());
});

test('an answered ticket inside the deadline is met and on time', () => {
  const due = addPolicyHours(tue0900, 2, 'business', new Set());
  const respondedAt = new Date(due.getTime() - 60 * 60_000);
  const clock = firstResponseClock({ ...base, responded_at: respondedAt, now: respondedAt });
  assert.equal(clock.state, 'met');
  assert.equal(clock.late, false);
  assert.equal(clock.remaining_ms, null);
});

// ------------------------------------------------------------ resolve target

const resolveBase = {
  created_at: tue0900,
  triage_priority: P3,
  resolved_at: null,
  overrides: { p3: { firstResponseHours: 2, resolveHours: 4, calendar: 'business' } },
  holidays: new Set(),
};

test('resolve target warns at the same 15 minute boundary', () => {
  const due = addPolicyHours(tue0900, 4, 'business', new Set()); // 13:00
  assert.equal(resolveClock({ ...resolveBase, now: new Date(due.getTime() - 16 * 60_000) }).state, 'pending');
  assert.equal(resolveClock({ ...resolveBase, now: new Date(due.getTime() - 15 * 60_000) }).state, 'due_soon');
  assert.equal(resolveClock({ ...resolveBase, now: due }).state, 'overdue');
});

test('resolve target skips public holidays through the same calendar', () => {
  const due = resolveClock({
    ...resolveBase,
    overrides: { p3: { firstResponseHours: 2, resolveHours: 10, calendar: 'business' } },
    holidays: new Set(['2026-11-11']),
  });
  assert.equal(due.due_at.getMonth(), 10);
  assert.equal(due.due_at.getDate(), 12);
  assert.equal(due.due_at.getHours(), 10);
});

test('closing late is met but late, and reopening does not restart the resolve target', () => {
  const due = addPolicyHours(tue0900, 4, 'business', new Set());
  const closedAt = new Date(due.getTime() + 2 * 3_600_000);
  const met = resolveClock({ ...resolveBase, resolved_at: closedAt, now: closedAt });
  assert.equal(met.state, 'met');
  assert.equal(met.late, true);
  assert.equal(met.progress, 1);

  const reopened = resolveClock({ ...resolveBase, resolved_at: closedAt, now: new Date(due.getTime() + 10 * 3_600_000) });
  assert.equal(reopened.state, 'met');
  assert.equal(reopened.due_at.getTime(), due.getTime());
  assert.equal(reopened.resolved_at.getTime(), closedAt.getTime());
});

test('progress reflects elapsed policy time and never exceeds 1', () => {
  const half = resolveClock({ ...resolveBase, now: new Date(tue0900.getTime() + 2 * 3_600_000) });
  assert.ok(Math.abs(half.progress - 0.5) < 0.02, `expected about 0.5, got ${half.progress}`);

  const late = resolveClock({ ...resolveBase, now: new Date(tue0900.getTime() + 8 * 3_600_000) });
  assert.equal(late.progress, 1);
  assert.equal(late.state, 'overdue');
});
