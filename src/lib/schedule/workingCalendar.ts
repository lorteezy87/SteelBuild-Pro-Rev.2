/**
 * workingCalendar — which days the shop actually works.
 *
 * Audit §2.1 / §7.4. Every piece of Gantt and cascade math was calendar days:
 * `addDaysIso` adds raw days, so FS+1 off a Friday finish started the successor
 * on **Saturday**. 32 tasks in production start on a weekend.
 *
 * The repo already had two working-day libraries and the Gantt used neither:
 * `lib/workingDays.ts` (Mon–Fri, used by Submittals) and `lib/workweek.js`
 * (a WORKDAYS_PER_WEEK knob, used by Crew Scheduling). So Crew Scheduling and
 * the Gantt disagreed about how long a week is, in the same app, about the same
 * crews. Neither supports holidays or a per-project shift pattern, which is why
 * this is a third module rather than a fourth caller of one of those.
 *
 * ## What this drives, and what it deliberately does not
 *
 * Drives: predecessor LAG (counted in working days) and where a successor is
 * allowed to START (snapped forward off a non-working day).
 *
 * Does NOT drive: how long a task IS. A task's span stays inclusive CALENDAR
 * days — the convention chosen in §2.4 and the one the `duration` column and
 * its database trigger maintain. Making spans working-day-aware would redefine
 * duration a second time and decouple the column from the trigger, since
 * Postgres cannot know a project's calendar. That is the natural follow-on, not
 * this change: a 5-day task starting Monday still ends Saturday here.
 */

import { parseDateUTC, toDateOnly } from "@/components/schedule/scheduleDateUtils";

/** Mon–Fri. 0 = Sunday … 6 = Saturday, matching Date#getUTCDay. */
export const MON_FRI: readonly number[] = [1, 2, 3, 4, 5];
/** Mon–Sat, for a shop running scheduled Saturday overtime. */
export const MON_SAT: readonly number[] = [1, 2, 3, 4, 5, 6];
/** Every day — collapses this module back to plain calendar math. */
export const ALL_DAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

export interface WorkingCalendar {
  /** Weekdays that are working days, as Date#getUTCDay values. */
  workDays: ReadonlySet<number>;
  /** YYYY-MM-DD dates that are non-working regardless of weekday. */
  holidays: ReadonlySet<string>;
  /** Human label for the shift pattern, e.g. "5 × 8" or "4 × 10". */
  label: string;
}

/**
 * Mon–Fri, no holidays.
 *
 * A project with no `project_calendars` row gets this rather than nothing, so
 * every project benefits without setup. A shop that works Saturdays configures
 * one; a shop that genuinely works seven days sets ALL_DAYS and this module
 * becomes a no-op.
 */
export const DEFAULT_CALENDAR: WorkingCalendar = Object.freeze({
  workDays: new Set(MON_FRI),
  holidays: new Set<string>(),
  label: "5 × 8 (Mon–Fri)",
});

export interface ProjectCalendarRow {
  work_days?: number[] | null;
  holidays?: string[] | null;
  shift_label?: string | null;
}

/** Build a calendar from a `project_calendars` row, falling back to Mon–Fri. */
export function makeCalendar(row: ProjectCalendarRow | null | undefined): WorkingCalendar {
  if (!row) return DEFAULT_CALENDAR;

  const days = Array.isArray(row.work_days)
    ? row.work_days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];
  // An empty or unusable work_days would make every day non-working, and every
  // search below would run to its iteration cap and give up. Treat it as
  // unconfigured rather than as "this shop never works".
  const workDays = new Set<number>(days.length > 0 ? days : MON_FRI);

  const holidays = new Set<string>(
    (Array.isArray(row.holidays) ? row.holidays : [])
      .map((h) => toDateOnly(h))
      .filter((h): h is string => !!h),
  );

  return { workDays, holidays, label: row.shift_label || DEFAULT_CALENDAR.label };
}

/** Is this date a working day on the given calendar? */
export function isWorkingDay(
  iso: string | null | undefined,
  cal: WorkingCalendar = DEFAULT_CALENDAR,
): boolean {
  const d = parseDateUTC(iso);
  if (!d) return false;
  const day = toDateOnly(d);
  if (day && cal.holidays.has(day)) return false;
  return cal.workDays.has(d.getUTCDay());
}

/**
 * Hard cap on any day-by-day search, so a pathological calendar (say, a
 * holiday list covering every working day for a year) degrades to "give up and
 * return null" rather than hanging the render thread.
 */
const MAX_STEPS = 3650; // ten years

/**
 * The first working day on or after `iso`. Returns `iso` unchanged when it is
 * already a working day, so this is safe to apply unconditionally.
 */
export function snapToWorkingDay(
  iso: string | null | undefined,
  cal: WorkingCalendar = DEFAULT_CALENDAR,
): string | null {
  const start = toDateOnly(iso);
  if (!start) return null;
  const d = parseDateUTC(start);
  if (!d) return null;

  for (let i = 0; i <= MAX_STEPS; i++) {
    const candidate = toDateOnly(d);
    if (candidate && isWorkingDay(candidate, cal)) return candidate;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

/**
 * `n` working days after `iso`.
 *
 * n = 0 snaps without advancing: a non-working input moves forward to the next
 * working day, a working input is returned unchanged. That is what lets the
 * cascade apply this unconditionally — zero working days after a Friday is that
 * Friday, while zero working days after a Saturday is the following Monday.
 *
 * Negative `n` walks backwards, which the backward pass needs.
 */
export function addWorkingDays(
  iso: string | null | undefined,
  n: number,
  cal: WorkingCalendar = DEFAULT_CALENDAR,
): string | null {
  if (!Number.isFinite(n)) return null;
  const steps = Math.trunc(n);

  // n = 0 is the only case that snaps. For n != 0 the count runs from the RAW
  // anchor: "one working day after Saturday" is Monday, because Monday is the
  // first working day strictly after it. Snapping the anchor to Monday first
  // and then stepping once would land on Tuesday — the snap counted twice.
  if (steps === 0) return snapToWorkingDay(iso, cal);

  const start = toDateOnly(iso);
  if (!start) return null;
  const d = parseDateUTC(start);
  if (!d) return null;

  const step = steps > 0 ? 1 : -1;
  let remaining = Math.abs(steps);

  for (let i = 0; remaining > 0 && i <= MAX_STEPS; i++) {
    d.setUTCDate(d.getUTCDate() + step);
    const candidate = toDateOnly(d);
    if (candidate && isWorkingDay(candidate, cal)) remaining -= 1;
  }
  return remaining === 0 ? toDateOnly(d) : null;
}

/**
 * Working days in the inclusive range [start, end].
 *
 * Inclusive, matching the §2.4 duration convention: Mon → Fri is 5 working
 * days. Returns null on unparseable input or an inverted window, never 0 —
 * absence is not evidence.
 */
export function workingDaysBetween(
  start: string | null | undefined,
  end: string | null | undefined,
  cal: WorkingCalendar = DEFAULT_CALENDAR,
): number | null {
  const s = toDateOnly(start);
  const e = toDateOnly(end);
  if (!s || !e || e < s) return null;

  const d = parseDateUTC(s);
  if (!d) return null;
  let count = 0;

  for (let i = 0; i <= MAX_STEPS; i++) {
    const candidate = toDateOnly(d);
    if (!candidate || candidate > e) return count;
    if (isWorkingDay(candidate, cal)) count += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

/** How many non-working days fall inside an inclusive range. */
export function nonWorkingDaysBetween(
  start: string | null | undefined,
  end: string | null | undefined,
  cal: WorkingCalendar = DEFAULT_CALENDAR,
): number | null {
  const s = toDateOnly(start);
  const e = toDateOnly(end);
  if (!s || !e || e < s) return null;
  const working = workingDaysBetween(s, e, cal);
  if (working === null) return null;
  const total = Math.round(
    (Date.parse(`${e}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / 86_400_000,
  ) + 1;
  return total - working;
}

/** Does this calendar treat every day as a working day? */
export function isSevenDayCalendar(cal: WorkingCalendar = DEFAULT_CALENDAR): boolean {
  return cal.workDays.size >= 7 && cal.holidays.size === 0;
}
