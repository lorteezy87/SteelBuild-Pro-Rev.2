/**
 * calendarMath.js — pure date helpers for the Project Calendar page.
 *
 * Deliberately framework-free. Uses the local timezone everywhere so a
 * PM viewing the calendar in Phoenix sees Phoenix days, not UTC days.
 * Every "date" passed in / out of these helpers is either:
 *   - a JS Date (preferred for in-memory math)
 *   - a YYYY-MM-DD string (preferred for keys, query params, and DB row dates)
 *
 * No external date library — date-fns / luxon would be overkill for ~50
 * lines of arithmetic and we already commit to "no heavy calendar lib"
 * in the spec.
 */

// ── ISO "YYYY-MM-DD" helpers (LOCAL timezone, not UTC) ──────────────

export function toIsoDate(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return null;
  // Use local timezone components — toISOString() would shift overnight
  // dates by a day in any timezone west of UTC.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Parse YYYY-MM-DD into a Date at local midnight. */
export function fromIsoDate(s) {
  if (!s) return null;
  // schedule_tasks.start_date sometimes arrives as a full ISO timestamp
  // ('2026-04-27T00:00:00+00:00'); strip to date-only first.
  const str = String(s).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Today at local midnight. */
export function today() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

export function sameDay(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function addMonths(d, n) {
  const c = new Date(d);
  c.setMonth(c.getMonth() + n);
  return c;
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** Week starts on Sunday (US convention). */
export function startOfWeek(d) {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() - c.getDay());
  return c;
}

export function endOfWeek(d) {
  const s = startOfWeek(d);
  return addDays(s, 6);
}

/**
 * Build a 6-row × 7-col grid of Date objects covering the month that
 * contains `focus`. The first row starts on the Sunday of-or-before the
 * 1st; the grid extends 42 days. Standard month-view layout.
 */
export function buildMonthGrid(focus) {
  const start = startOfWeek(startOfMonth(focus));
  const days = [];
  for (let i = 0; i < 42; i += 1) days.push(addDays(start, i));
  return days;
}

/** 7-day list for week view. */
export function buildWeekGrid(focus) {
  const start = startOfWeek(focus);
  const days = [];
  for (let i = 0; i < 7; i += 1) days.push(addDays(start, i));
  return days;
}

export function isWeekend(d) {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/** True if [aStart, aEnd] overlaps [bStart, bEnd] (inclusive day comparison). */
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !bStart) return false;
  const aS = aStart instanceof Date ? aStart : fromIsoDate(aStart);
  const aE = aEnd ? (aEnd instanceof Date ? aEnd : fromIsoDate(aEnd)) : aS;
  const bS = bStart instanceof Date ? bStart : fromIsoDate(bStart);
  const bE = bEnd ? (bEnd instanceof Date ? bEnd : fromIsoDate(bEnd)) : bS;
  if (!aS || !bS) return false;
  return aE >= bS && aS <= bE;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_NAMES_LONG  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function monthName(d) { return MONTH_NAMES[d.getMonth()]; }
export function monthNameShort(d) { return MONTH_NAMES_SHORT[d.getMonth()]; }
export function dowShort(d) { return DOW_NAMES_SHORT[d.getDay()]; }
export function dowLong(d)  { return DOW_NAMES_LONG[d.getDay()]; }

/** Format a date label like "April 2026" / "Apr 27, 2026" / "Mon · Apr 27". */
export function formatMonthYear(d) {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
export function formatLongDate(d) {
  return `${DOW_NAMES_LONG[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
export function formatShortDate(d) {
  return `${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
export function formatWeekRange(d) {
  const s = startOfWeek(d);
  const e = endOfWeek(d);
  if (s.getMonth() === e.getMonth()) {
    return `${MONTH_NAMES_SHORT[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${MONTH_NAMES_SHORT[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES_SHORT[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
}

/** True if d is in the same calendar month as focus. */
export function inSameMonth(d, focus) {
  return d.getMonth() === focus.getMonth() && d.getFullYear() === focus.getFullYear();
}
