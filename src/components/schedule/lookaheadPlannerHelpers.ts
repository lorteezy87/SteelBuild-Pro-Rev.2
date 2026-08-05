/**
 * Pure week-window builders for LookaheadPlanner.
 */

export type LookaheadWeek = { start: Date; end: Date; num: number };

/** Six Monday-anchored UTC weeks starting at the Monday on/before todayUtc. */
export function buildLookaheadWeeks(todayUtc: Date, count = 6): LookaheadWeek[] {
  const offset = (todayUtc.getUTCDay() + 6) % 7;
  const week1Start = new Date(todayUtc);
  week1Start.setUTCDate(week1Start.getUTCDate() - offset);
  const result: LookaheadWeek[] = [];
  for (let i = 0; i < count; i++) {
    const start = new Date(week1Start);
    start.setUTCDate(start.getUTCDate() + i * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    result.push({ start, end, num: i + 1 });
  }
  return result;
}

export function parseTaskDate(s: unknown): Date | null {
  if (!s) return null;
  if (s instanceof Date) return isNaN(s.getTime()) ? null : s;
  const str = String(s).trim();
  if (!str) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T00:00:00Z` : str;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function tasksIntersectingWeek<
  T extends { start_date?: string | null; end_date?: string | null },
>(
  tasks: T[] | null | undefined,
  weekStart: Date,
  weekEnd: Date,
  parse: (raw: unknown) => Date | null = parseTaskDate,
): T[] {
  return (tasks || []).filter((task) => {
    const s = parse(task.start_date);
    const e = parse(task.end_date);
    const taskStart = s || e;
    const taskEnd = e || s;
    if (!taskStart || !taskEnd) return false;
    return taskStart <= weekEnd && taskEnd >= weekStart;
  });
}
