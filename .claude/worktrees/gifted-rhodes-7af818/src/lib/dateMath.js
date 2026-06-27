/**
 * dateMath.js — shared date arithmetic, one convention.
 *
 * Every user-visible "due date" in the app lives in a Postgres DATE column,
 * which is timezone-naive. The user thinks of the date in their local
 * timezone (a PDT user looking at 2025-01-15 means "the day that is
 * Jan 15 in Phoenix," not "UTC midnight 2025-01-15"). We therefore do
 * ALL day-math against **local midnight** — otherwise the user sees an
 * item flip between "due today" and "due tomorrow" depending on the
 * hour of day.
 *
 * Historical bug: urgencyEngine parsed 'YYYY-MM-DD' as UTC midnight
 * (`T00:00:00Z`) while todayView parsed it as local midnight
 * (`T00:00:00`). In the morning hours of negative-UTC timezones, the
 * two disagreed about what "today" was, causing items to land in the
 * wrong 48h / 10-day window.
 *
 * Anything that does day-math should import from here. Display
 * formatting can still use toLocaleDateString / formatters.jsx.
 */

const MS_PER_DAY = 86_400_000;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse any value into a Date anchored to **local midnight** of the
 * corresponding day. Returns null on invalid input.
 *
 * Accepts:
 *   - 'YYYY-MM-DD' → local midnight of that day (most common case)
 *   - Full ISO timestamp → local midnight of that instant's local day
 *   - Date object → local midnight of its local day
 *   - number (ms) → local midnight of that instant's local day
 */
export function toLocalMidnight(value) {
  if (value == null || value === "") return null;

  let d;
  if (value instanceof Date) {
    d = new Date(value.getTime());
  } else if (typeof value === "number") {
    d = new Date(value);
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (DATE_ONLY_RE.test(trimmed)) {
      const [y, m, dd] = trimmed.split("-").map(Number);
      // Constructing via (year, monthIndex, day) uses local TZ — exactly
      // what we want. No string parsing, no UTC conversion.
      return new Date(y, m - 1, dd, 0, 0, 0, 0);
    }
    d = new Date(trimmed);
  } else {
    return null;
  }
  if (isNaN(d)) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Local midnight of today. */
export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Integer day difference using local midnights.
 * Positive if `to` is later than `from`.
 */
export function daysBetween(from, to) {
  const a = toLocalMidnight(from);
  const b = toLocalMidnight(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * Days from today until the given date.
 * Positive if the date is in the future, negative if in the past,
 * 0 if today. Returns `Infinity` on a null/invalid input (preserves
 * urgencyEngine's existing "no date" sentinel behavior).
 */
export function daysUntil(value) {
  const target = toLocalMidnight(value);
  if (!target) return Infinity;
  return Math.round((target.getTime() - startOfToday().getTime()) / MS_PER_DAY);
}

/**
 * Days since the given date.
 * Positive if the date is in the past, negative if in the future,
 * 0 if today. Returns 0 on null/invalid (preserves urgencyEngine's
 * existing `|| 0` fallback).
 */
export function daysSince(value) {
  const source = toLocalMidnight(value);
  if (!source) return 0;
  return Math.round((startOfToday().getTime() - source.getTime()) / MS_PER_DAY);
}

/** True if the given value is today in local time. */
export function isToday(value) {
  return daysUntil(value) === 0;
}

/** YYYY-MM-DD string for today in local time. */
export function todayLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
