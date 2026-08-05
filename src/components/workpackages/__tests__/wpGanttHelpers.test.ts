import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  getWPDates,
  detectConflicts,
  buildGanttDateRange,
  buildGanttTicks,
  buildWeekendBands,
  startOfDay,
  PHASE_COLOR,
  LEFT_COL,
  ROW_H,
  HEADER_H,
  ZOOM_LEVELS,
} from "../wpGanttHelpers";

describe("getWPDates", () => {
  it("uses released_date and tonnage estimate", () => {
    const { start, end } = getWPDates({
      released_date: "2026-01-01",
      tonnage: 10,
    });
    expect(startOfDay(start).toISOString().slice(0, 10)).toBe(
      startOfDay(new Date("2026-01-01")).toISOString().slice(0, 10),
    );
    expect(daysBetween(start, end)).toBeGreaterThanOrEqual(3);
  });
});

describe("detectConflicts", () => {
  it("flags erection before delivery complete", () => {
    const wps = [
      { id: "d1", name: "Bay1", phase: "Delivery", released_date: "2026-02-01", tonnage: 20 },
      { id: "e1", name: "Bay1", phase: "Erection", released_date: "2026-02-02", tonnage: 20 },
    ];
    const { conflictSet, conflictList } = detectConflicts(wps);
    expect(conflictSet.has("d1")).toBe(true);
    expect(conflictSet.has("e1")).toBe(true);
    expect(conflictList[0].type).toMatch(/Erection/);
  });
});

describe("buildGanttDateRange", () => {
  it("defaults empty to 90-day window", () => {
    const now = new Date("2026-06-15T12:00:00");
    const r = buildGanttDateRange([], now);
    expect(r.totalDays).toBe(90);
  });

  it("pads min/max from WPs", () => {
    const r = buildGanttDateRange([
      { released_date: "2026-01-10", target_end_date: "2026-01-20", tonnage: 1 },
    ]);
    expect(r.totalDays).toBeGreaterThan(10);
  });
});

describe("buildGanttTicks / weekendBands", () => {
  it("ticks every N days", () => {
    const start = startOfDay(new Date("2026-01-01"));
    const end = addDays(start, 14);
    expect(buildGanttTicks(start, end, 7)).toHaveLength(2);
  });

  it("weekend bands only when pxPerDay >= 12", () => {
    const start = startOfDay(new Date("2026-01-03")); // Saturday
    const end = addDays(start, 7);
    expect(buildWeekendBands(start, end, 6)).toEqual([]);
    expect(buildWeekendBands(start, end, 18).length).toBeGreaterThan(0);
  });
});

describe("wp gantt chrome", () => {
  it("phase colors and layout constants", () => {
    expect(PHASE_COLOR.Detailing).toBeTruthy();
    expect(LEFT_COL).toBe(340);
    expect(ROW_H).toBe(38);
    expect(HEADER_H).toBe(56);
  });
});

describe("ZOOM_LEVELS", () => {
  it("has day/week/month", () => {
    expect(ZOOM_LEVELS.map((z) => z.id)).toEqual(["day", "week", "month"]);
    expect(ZOOM_LEVELS[0].fmt(new Date("2026-01-15"))).toBeTruthy();
  });
});
