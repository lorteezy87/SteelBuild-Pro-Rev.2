/**
 * Pure helpers for Production Notes page.
 */

export function toISODate(d: Date | string | number): string {
  const dt = d instanceof Date ? d : new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Default meeting date = the most recent Tuesday on or before today.
 * (User runs the meeting on Tuesdays per the OneNote example "4/21/2026"
 * which was a Tuesday.)
 */
export function mostRecentTuesday(now: Date = new Date()): string {
  const today = new Date(now);
  const dow = today.getDay(); // 0 = Sun, 2 = Tue
  const diff = (dow - 2 + 7) % 7;
  today.setDate(today.getDate() - diff);
  return toISODate(today);
}

export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    .toUpperCase()
    .replace(",", "");
}

export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toISODate(dt);
}

export function indexProjectsById<T extends { id?: string }>(
  projects: T[] | null | undefined,
): Record<string, T> {
  const map: Record<string, T> = {};
  for (const p of projects || []) {
    if (p?.id) map[p.id] = p;
  }
  return map;
}
