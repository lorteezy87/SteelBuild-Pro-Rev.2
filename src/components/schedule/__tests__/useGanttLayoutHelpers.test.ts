import { describe, expect, it } from "vitest";
import {
  buildGanttDateRange,
  ganttWeekPx,
  ganttDateToPx,
  ganttSpanPx,
  ganttTodayPx,
  ganttNowWeekStart,
} from "../useGanttLayoutHelpers";

describe("ganttWeekPx", () => {
  it("maps zoom levels", () => {
    expect(ganttWeekPx("month")).toBe(80);
    expect(ganttWeekPx("day")).toBe(420);
    expect(ganttWeekPx("week")).toBe(240);
  });
});

describe("buildGanttDateRange", () => {
  const today = new Date("2026-06-10T12:00:00"); // Wednesday
  const effStart = (t: any) => t.start_date;
  const effEnd = (t: any) => t.end_date;

  it("builds empty-task window around today", () => {
    const r = buildGanttDateRange({
      allTasks: [],
      deliveries: [],
      today,
      effStart,
      effEnd,
    });
    expect(r.weeks.length).toBeGreaterThan(0);
    // start is Sunday of week before today's week
    expect(r.start.getDay()).toBe(0);
  });

  it("spans tasks and deliveries, snaps to week boundaries", () => {
    const r = buildGanttDateRange({
      allTasks: [{ start_date: "2026-06-01", end_date: "2026-06-15" }],
      deliveries: [{ scheduled_date: "2026-06-20" }],
      today,
      effStart,
      effEnd,
    });
    expect(r.start.getDay()).toBe(0);
    expect(r.end.getDay()).toBe(6);
    expect(r.weeks.length).toBeGreaterThan(2);
  });
});

describe("pixel projection", () => {
  const start = new Date("2026-06-01T00:00:00");
  const pxPerDay = 240 / 7;
  it("ganttDateToPx / span / today", () => {
    expect(ganttDateToPx(null, start, pxPerDay)).toBe(0);
    const px = ganttDateToPx("2026-06-08", start, pxPerDay);
    expect(px).toBeCloseTo(7 * pxPerDay, 5);
    expect(ganttSpanPx("2026-06-01", "2026-06-03", pxPerDay)).toBeCloseTo(2 * pxPerDay, 5);
    expect(ganttSpanPx(null, "2026-06-03", pxPerDay)).toBe(0);
    const today = new Date("2026-06-08T00:00:00");
    expect(ganttTodayPx(today, start, pxPerDay)).toBeCloseTo(7 * pxPerDay, 5);
    expect(ganttNowWeekStart(today).getDay()).toBe(0);
  });
});
