import { GANTT_PHASE_HEX } from "@/lib/ganttTheme";
/**
 * Pure date/range/conflict helpers for WPGantt.
 */

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((Number(b) - Number(a)) / 86400000);
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtDateLong(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export type WpDateSource = {
  released_date?: string | null;
  created_date?: string | null;
  target_end_date?: string | null;
  status?: string | null;
  updated_date?: string | null;
  tonnage?: number | string | null;
};

export function getWPDates(wp: WpDateSource): { start: Date; end: Date } {
  const start = wp.released_date
    ? startOfDay(new Date(wp.released_date))
    : startOfDay(new Date(wp.created_date || Date.now()));

  const estDays = Math.max(3, Math.ceil((Number(wp.tonnage) || 0) / 2));

  let end: Date;
  if (wp.target_end_date) {
    end = startOfDay(new Date(wp.target_end_date));
  } else if (wp.status === "Complete" && wp.updated_date) {
    end = startOfDay(new Date(wp.updated_date));
  } else {
    end = addDays(start, estDays);
  }

  if (end <= start) end = addDays(start, Math.max(1, estDays));

  return { start, end };
}

export type ConflictWp = WpDateSource & {
  id?: string | null;
  phase?: string | null;
  name?: string | null;
};

export function detectConflicts(wps: ConflictWp[]) {
  const conflicts = new Set<string>();
  const conflictList: { wp1: ConflictWp; wp2: ConflictWp; type: string }[] = [];

  wps.forEach((wp) => {
    if (wp.phase === "Erection") {
      const deliveryWP = wps.find((w) => w.phase === "Delivery" && w.name === wp.name);
      if (deliveryWP && wp.released_date && deliveryWP.released_date) {
        const erectionStart = startOfDay(new Date(wp.released_date));
        const deliveryEnd = addDays(
          new Date(deliveryWP.released_date),
          Math.max(3, Math.ceil((Number(deliveryWP.tonnage) || 0) / 2)),
        );
        if (erectionStart < deliveryEnd) {
          if (wp.id) conflicts.add(wp.id);
          if (deliveryWP.id) conflicts.add(deliveryWP.id);
          conflictList.push({
            wp1: deliveryWP,
            wp2: wp,
            type: "Erection starts before delivery complete",
          });
        }
      }
    }
  });

  return { conflictSet: conflicts, conflictList };
}

export function buildGanttDateRange(
  wps: WpDateSource[],
  now: Date = new Date(),
): { rangeStart: Date; rangeEnd: Date; totalDays: number } {
  if (!wps.length) {
    const today = startOfDay(now);
    return {
      rangeStart: addDays(today, -30),
      rangeEnd: addDays(today, 60),
      totalDays: 90,
    };
  }
  let minDate: Date | null = null;
  let maxDate: Date | null = null;
  wps.forEach((wp) => {
    const { start, end } = getWPDates(wp);
    if (!minDate || start < minDate) minDate = start;
    if (!maxDate || end > maxDate) maxDate = end;
  });
  const rs = addDays(minDate as Date, -14);
  const re = addDays(maxDate as Date, 21);
  return { rangeStart: rs, rangeEnd: re, totalDays: daysBetween(rs, re) };
}

export function buildGanttTicks(
  rangeStart: Date,
  rangeEnd: Date,
  tickEvery: number,
): Date[] {
  const result: Date[] = [];
  let cursor = new Date(rangeStart);
  while (cursor < rangeEnd) {
    result.push(new Date(cursor));
    cursor = addDays(cursor, tickEvery);
  }
  return result;
}

export function buildWeekendBands(
  rangeStart: Date,
  rangeEnd: Date,
  pxPerDay: number,
): { x: number; width: number }[] {
  if (pxPerDay < 12) return [];
  const bands: { x: number; width: number }[] = [];
  let cursor = new Date(rangeStart);
  while (cursor < rangeEnd) {
    if (cursor.getDay() === 6) {
      bands.push({
        x: daysBetween(rangeStart, cursor) * pxPerDay,
        width: 2 * pxPerDay,
      });
      cursor = addDays(cursor, 2);
    } else {
      cursor = addDays(cursor, 1);
    }
  }
  return bands;
}

export const PHASE_COLOR: Record<string, string> = {
  Detailing: GANTT_PHASE_HEX.Detailing,
  Fabrication: GANTT_PHASE_HEX.Fabrication,
  Delivery: GANTT_PHASE_HEX.Delivery,
  Erection: GANTT_PHASE_HEX.Erection,
};

export const LEFT_COL = 340;
export const ROW_H = 38;
export const HEADER_H = 56;

export const ZOOM_LEVELS = [
  {
    id: "day",
    label: "Day",
    pxPerDay: 40,
    tickEvery: 1,
    fmt: (d: Date) => fmtDate(d),
  },
  {
    id: "week",
    label: "Week",
    pxPerDay: 18,
    tickEvery: 7,
    fmt: (d: Date) =>
      `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString("en-US", { month: "short" })}`,
  },
  {
    id: "month",
    label: "Month",
    pxPerDay: 6,
    tickEvery: 28,
    fmt: (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
  },
] as const;

