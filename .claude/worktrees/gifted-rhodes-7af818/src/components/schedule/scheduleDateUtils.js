// ── Date / format helpers extracted from ScheduleGantt.jsx ──────────────
//
// A single robust parser for date-like inputs. Schedule tasks *should* all
// store YYYY-MM-DD date-only strings, but real data gets messy: some rows
// come back as full ISO timestamps ("2026-04-23T12:00:00Z"), some as Date
// objects, some as junk. The old code blindly did `new Date(str + "T00:00:00Z")`
// which produces an Invalid Date when `str` already has a T, and then any
// downstream `.toISOString()` throws "RangeError: Invalid time value" — that
// crashes the ENTIRE Gantt via the effectiveDates useMemo.
//
// parseDateUTC returns a valid UTC Date or null. toDateOnly returns a
// YYYY-MM-DD string or null. All date math below funnels through these.
//
// Year clamp: a data-entry typo like "0026-06-15" (year 26 AD) or
// "12026-06-15" (year 12026) parses successfully in JS but then makes the
// gantt build a timeline spanning *thousands* of years worth of weeks —
// hundreds of thousands of DOM nodes, browser freeze. We reject any year
// outside [1900, 2200] so one bad row can't nuke the view.
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2200;

export function parseDateUTC(input) {
  if (!input) return null;
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    const y = input.getUTCFullYear();
    return (y < MIN_YEAR || y > MAX_YEAR) ? null : input;
  }
  const s = String(input).trim();
  if (!s) return null;
  // Treat pure YYYY-MM-DD as UTC midnight; anything with time info parse as-is.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  return (y < MIN_YEAR || y > MAX_YEAR) ? null : d;
}

export function toDateOnly(input) {
  const d = parseDateUTC(input);
  return d ? d.toISOString().slice(0, 10) : null;
}

export function fmtDate(d) {
  const dt = parseDateUTC(d);
  if (!dt) return "TBD";
  return dt.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit", timeZone: "UTC" });
}

export function calcDuration(start, end) {
  const s = parseDateUTC(start);
  const e = parseDateUTC(end);
  if (!s || !e) return "TBD";
  const days = Math.round((e - s) / 86400000);
  return days >= 0 ? `${days}d` : "TBD";
}
