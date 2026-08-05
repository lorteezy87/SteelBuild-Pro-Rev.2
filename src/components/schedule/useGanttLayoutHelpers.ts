/**
 * Pure date-range / pixel projection helpers for useGanttLayout.
 * Bodies match the original hook logic (byte-identical behavior).
 */
import { MIN_YEAR, MAX_YEAR, parseDateUTC } from "./scheduleDateUtils";

export type GanttDateRange = {
  start: Date;
  end: Date;
  weeks: Date[];
};

export function buildGanttDateRange(args: {
  allTasks: any[];
  deliveries: any[];
  today: Date;
  effStart: (task: any) => unknown;
  effEnd: (task: any) => unknown;
}): GanttDateRange {
  const { allTasks, deliveries, today, effStart, effEnd } = args;
  if (allTasks.length === 0) {
    // Even with no tasks, build a 4-week window around today
    const s = new Date(today);
    s.setDate(s.getDate() - s.getDay() - 7); // 1 week before
    const e = new Date(today);
    e.setDate(e.getDate() + (6 - e.getDay()) + 21); // 3 weeks after
    const weeks: Date[] = [];
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 7)) weeks.push(new Date(d));
    return { start: s, end: e, weeks };
  }
  const dates = allTasks
    .flatMap((t) => [parseDateUTC(effStart(t)), parseDateUTC(effEnd(t))])
    .filter(Boolean) as Date[];
  // Include delivery dates so the timeline stretches to cover them
  deliveries.forEach((d) => {
    const sd = parseDateUTC(d.scheduled_date);
    if (sd) dates.push(sd);
    const rd = parseDateUTC(d.required_date);
    if (rd) dates.push(rd);
    const ad = parseDateUTC(d.actual_date);
    if (ad) dates.push(ad);
  });
  // Always include today in the range so the TODAY line is always visible
  dates.push(today);
  let start = new Date(Math.min(...dates.map((d) => d.getTime())));
  let end = new Date(Math.max(...dates.map((d) => d.getTime())));
  // Belt-and-suspenders: parseDateUTC already clamps to [1900,2200], but if
  // a rogue date somehow lands here and we ended up with NaN or a wild
  // year, fall back to a today-centred window rather than generating a
  // million weeks and freezing the browser.
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  if (
    isNaN(start.getTime()) ||
    isNaN(end.getTime()) ||
    startYear < MIN_YEAR ||
    endYear > MAX_YEAR
  ) {
    start = new Date(today);
    start.setDate(start.getDate() - start.getDay() - 7);
    end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()) + 21);
  }
  start.setDate(start.getDate() - start.getDay());
  end.setDate(end.getDate() + (6 - end.getDay()) + 7);
  const weeks: Date[] = [];
  // Hard cap at ~10 years of weeks (520). If someone's data actually
  // legitimately spans more than that, the gantt is the wrong tool.
  const MAX_WEEKS = 520;
  let d = new Date(start);
  while (d <= end && weeks.length < MAX_WEEKS) {
    weeks.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  if (weeks.length >= MAX_WEEKS) end = new Date(weeks[weeks.length - 1]);
  return { start, end, weeks };
}

export function ganttWeekPx(zoom: string): number {
  return zoom === "month" ? 80 : zoom === "day" ? 420 : 240;
}

export function ganttDayCount(dateRange: GanttDateRange): number {
  return Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / 86400000);
}

export function ganttTotalWidth(dayCount: number, pxPerDay: number, weekCount: number, weekPx: number): number {
  return Math.max(dayCount * pxPerDay, weekCount * weekPx);
}

export function ganttDateToPx(
  dateStr: unknown,
  dateRangeStart: Date,
  pxPerDay: number,
): number {
  const d = parseDateUTC(dateStr);
  if (!d) return 0;
  return Math.max(0, ((d.getTime() - dateRangeStart.getTime()) / 86400000) * pxPerDay);
}

export function ganttSpanPx(
  start: unknown,
  end: unknown,
  pxPerDay: number,
): number {
  const s = parseDateUTC(start);
  const e = parseDateUTC(end);
  if (!s || !e) return 0;
  return Math.max(4, ((e.getTime() - s.getTime()) / 86400000) * pxPerDay);
}

export function ganttTodayPx(today: Date, dateRangeStart: Date, pxPerDay: number): number {
  return ((today.getTime() - dateRangeStart.getTime()) / 86400000) * pxPerDay;
}

export function ganttNowWeekStart(today: Date): Date {
  const nowWeekStart = new Date(today);
  nowWeekStart.setDate(today.getDate() - today.getDay());
  return nowWeekStart;
}
