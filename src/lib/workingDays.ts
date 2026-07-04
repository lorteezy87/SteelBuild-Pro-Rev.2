/**
 * workingDays.ts — pure WORKING-DAY (Mon–Fri) date math.
 *
 * Ported from the SteelBuild Submittal Tracker (src/lib/workingDays.ts) so the
 * two apps compute due dates identically. Two things matter here:
 *
 *  1. Dates are parsed as LOCAL calendar days (local noon), never UTC. Arizona
 *     is UTC-7 with no DST, so `new Date('2026-07-03')` lands at 17:00 the
 *     previous local day and renders/counts a day early. Parsing at local noon
 *     dodges that. (Same local-noon technique as submittalForecast.ts, which
 *     keeps its own private parseLocalDate — see the note on `parseLocalDate`
 *     below for why this module keeps a matching one rather than sharing.)
 *  2. Due dates are computed in WORKING days (Mon–Fri) — weekends never inflate
 *     a turnaround deadline. There is no holiday calendar; editable due dates
 *     cover holidays.
 *
 * No React, no Supabase, no `new Date()`-for-today inside — callers inject
 * `today` as a 'YYYY-MM-DD' string so everything stays deterministic + testable.
 *
 * NOTE on duplication: submittalForecast.ts has a local-noon parse of its own
 * (a private `parseLocalDate` plus CALENDAR-day `addDays`/`diffDays`). This
 * module is the WORKING-day layer and is exported for reuse; the local-noon
 * anchor is identical on purpose (a shared 12:00 anchor), so the two never
 * disagree by a day. We do not re-export forecast's private helper because it
 * is calendar-day math (addDays) and file-private; keeping this parse here (a)
 * matches the tracker port 1:1 and (b) avoids a cross-module import cycle.
 */

/** Parse a 'YYYY-MM-DD' (or ISO) string to a Date at local noon. null if unparseable. */
export function parseLocalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = String(iso)
    .slice(0, 10)
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

/** Format a Date to 'YYYY-MM-DD' from its LOCAL fields (no UTC shift). */
export function formatISO(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** True for Saturday (6) or Sunday (0). */
export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Add `n` working days (Mon–Fri) to a date, returning 'YYYY-MM-DD'.
 * The start day is not counted; each increment steps to the next weekday.
 * `n = 0` returns the start date unchanged. Negative `n` is treated as 0.
 * null start → null.
 */
export function addWorkingDays(
  iso: string | null | undefined,
  n: number,
): string | null {
  const d = parseLocalDate(iso);
  if (!d) return null;
  let remaining = Math.max(0, Math.round(n));
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) remaining -= 1;
  }
  return formatISO(d);
}

/** Whole calendar days from a → b (b − a). null if either is unparseable. */
export function diffCalendarDays(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const da = parseLocalDate(a);
  const db = parseLocalDate(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/**
 * Count WORKING days (Mon–Fri) from `a` → `b`, signed:
 *   - positive when `b` is in the future relative to `a`,
 *   - negative when `b` is in the past,
 *   - 0 when both fall on the same day.
 *
 * Only working days between the two are counted; the START day is excluded and
 * the END day is included (so it is the working-day analogue of
 * diffCalendarDays). Weekends contribute nothing, so a Friday→Monday span is 1
 * working day, not 3. null if either date is unparseable.
 *
 * This is the working-day "days remaining" primitive: `workingDaysBetween(today,
 * dueDate)` gives working days LEFT (negative = working days overdue).
 */
export function workingDaysBetween(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const da = parseLocalDate(a);
  const db = parseLocalDate(b);
  if (!da || !db) return null;
  if (da.getTime() === db.getTime()) return 0;

  const forward = db.getTime() > da.getTime();
  const start = forward ? new Date(da.getTime()) : new Date(db.getTime());
  const end = forward ? db : da;

  let count = 0;
  const cursor = new Date(start.getTime());
  while (cursor.getTime() < end.getTime()) {
    cursor.setDate(cursor.getDate() + 1);
    if (!isWeekend(cursor)) count += 1;
  }
  return forward ? count : -count;
}
