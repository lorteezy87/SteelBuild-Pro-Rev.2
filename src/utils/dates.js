/**
 * dates.js — Shared date helpers.
 *
 * Arizona does not observe DST, so local time is always UTC-7 (MST).
 * Using `new Date().toISOString().slice(0,10)` returns the UTC date,
 * which is wrong after 5 PM MST (midnight UTC). These helpers use
 * the local clock instead.
 */

/**
 * Return today's date as a YYYY-MM-DD string in the browser's local timezone.
 */
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Parse a date input to a LOCAL-midnight Date, reading a date-only string
 * ("2026-06-10") as the calendar day written — NOT as UTC midnight.
 *
 * The naive `new Date("2026-06-10")` parses the string as UTC midnight, which
 * in Arizona (MST, UTC-7) is 17:00 the PREVIOUS day. Anything that then renders
 * it with the local clock (toLocaleDateString) shows the date one day early.
 * Use this for any `date` column (due_date, required_date, scheduled_start_date,
 * etc.) so display and day-math agree.
 *
 * @param {string|number|Date|null|undefined} input
 * @returns {Date|null} local-midnight Date, or null if unparseable
 */
export function toLocalDay(input) {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) return null;
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  if (typeof input === "string") {
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/**
 * Format a date-only value as a short, timezone-safe label (e.g. "Jun 10, 26").
 * Routes through {@link toLocalDay} so a `date` column never renders a day early.
 * Returns the em dash for empty / invalid input.
 *
 * @param {string|number|Date|null|undefined} input
 * @param {{ withYear?: boolean }} [opts] include a 2-digit year (default true)
 * @returns {string}
 */
export function formatShortDate(input, { withYear = true } = {}) {
  const local = toLocalDay(input);
  if (!local) return "—";
  return local.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "2-digit" } : {}),
  });
}

/**
 * Timezone-safe drop-in for `new Date(input).toLocaleDateString(...)`.
 *
 * Parses `input` through {@link toLocalDay} (so a date-only string is read as a
 * LOCAL calendar day, not UTC midnight — the Arizona one-day-early bug) and then
 * applies the SAME locale + Intl options the caller would have passed to
 * toLocaleDateString, so the displayed FORMAT is preserved exactly while the
 * parse is fixed. Returns the em dash for empty / invalid input.
 *
 * @param {string|number|Date|null|undefined} input
 * @param {string} [locale] e.g. "en-US" (omit for the runtime default)
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatLocalDate(input, locale, options) {
  const local = toLocalDay(input);
  if (!local) return "—";
  return local.toLocaleDateString(locale, options);
}
