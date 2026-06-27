/**
 * workweek.js
 *
 * Work-day (non-calendar-day) arithmetic. A 160-hour WP at 8 h/day is
 * 20 workdays of effort — which on a 5-day week spans ~4 calendar
 * weeks (28 calendar days), not 20 calendar days. Previously the
 * scheduling code treated every day as a work day, compressing 4
 * weeks of real-world work into 20 calendar days on the board.
 *
 * WORKDAYS_PER_WEEK is the single knob. Default is 5 (Mon–Fri). Set
 * to 6 if the shop runs Saturdays, or 7 to collapse back to the old
 * behaviour. Could be promoted to a per-project setting later.
 */

export const WORKDAYS_PER_WEEK = 5;
export const HOURS_PER_WORKDAY = 8;

function isWorkday(date, workDaysPerWeek = WORKDAYS_PER_WEEK) {
  const dow = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  if (workDaysPerWeek >= 7) return true;
  if (workDaysPerWeek === 6) return dow !== 0;          // Sun off
  return dow >= 1 && dow <= 5;                           // Mon–Fri only
}

/**
 * Add N workdays to a date. The returned date is the calendar date
 * that represents "N workdays of effort starting the day after start".
 * If start itself is a workday, the first workday "counts" as start
 * + 1 business-day convention.
 */
export function addWorkdays(start, n, workDaysPerWeek = WORKDAYS_PER_WEEK) {
  const d = new Date(start);
  if (workDaysPerWeek >= 7 || n <= 0) {
    d.setDate(d.getDate() + Math.max(0, n));
    return d;
  }
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (isWorkday(d, workDaysPerWeek)) added++;
  }
  return d;
}

/**
 * How many workdays fall in the inclusive [start, end] range.
 */
export function workdaysBetween(start, end, workDaysPerWeek = WORKDAYS_PER_WEEK) {
  const s = new Date(start);
  const e = new Date(end);
  if (workDaysPerWeek >= 7) {
    return Math.max(0, Math.floor((e - s) / 86400000) + 1);
  }
  let count = 0;
  const cur = new Date(s);
  cur.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  while (cur.getTime() <= e.getTime()) {
    if (isWorkday(cur, workDaysPerWeek)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/**
 * Convert budget hours → whole workdays at the configured day-length.
 * Ceiling so a 9-hour job still shows as 2 workdays of effort.
 */
export function hoursToWorkdays(hours, hoursPerDay = HOURS_PER_WORKDAY) {
  const h = Number(hours) || 0;
  if (h <= 0) return 0;
  return Math.max(1, Math.ceil(h / (hoursPerDay || 8)));
}

/**
 * Workdays → calendar days span (for durationMs-style timeline math).
 * 20 workdays @ 5/wk = 28 calendar days.
 */
export function workdaysToCalendarDays(workdays, workDaysPerWeek = WORKDAYS_PER_WEEK) {
  const w = Number(workdays) || 0;
  if (w <= 0) return 0;
  if (workDaysPerWeek >= 7) return w;
  return Math.ceil((w * 7) / workDaysPerWeek);
}
