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
