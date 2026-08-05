import { describe, expect, it } from "vitest";
import {
  FILTER_LS_KEY,
  VIEW_OPTIONS,
  loadFilters,
  saveFilters,
  defaultFilters,
  parseInitialView,
  parseInitialFocus,
  filterCalendarEvents,
  computeVisibleRange,
  computeHeaderLabel,
  shiftFocus,
  countEventsByType,
  buildIcsFilename,
  collectIcsEventsForRange,
} from "../projectCalendarHelpers";

function memStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    _map: map,
  };
}

describe("projectCalendarHelpers", () => {
  it("exposes three view options", () => {
    expect(VIEW_OPTIONS.map((v) => v.key)).toEqual(["month", "week", "day"]);
  });

  it("loads and saves filters via injectable storage", () => {
    const store = memStorage();
    expect(loadFilters(store)).toBeNull();
    saveFilters({ task: true, rfi: false }, store);
    expect(store.getItem(FILTER_LS_KEY)).toContain("rfi");
    expect(loadFilters(store)).toEqual({ task: true, rfi: false });
  });

  it("returns null for invalid stored filters", () => {
    const store = memStorage({ [FILTER_LS_KEY]: "not-json" });
    expect(loadFilters(store)).toBeNull();
    const store2 = memStorage({ [FILTER_LS_KEY]: "null" });
    expect(loadFilters(store2)).toBeNull();
  });

  it("builds default all-on filters", () => {
    expect(defaultFilters([{ key: "a" }, { key: "b" }])).toEqual({ a: true, b: true });
  });

  it("parses initial view from URL param", () => {
    expect(parseInitialView("week")).toBe("week");
    expect(parseInitialView("bogus")).toBe("month");
    expect(parseInitialView(null)).toBe("month");
  });

  it("parses initial focus date or falls back to today", () => {
    const fixed = new Date(2026, 0, 15);
    const focus = parseInitialFocus("2026-03-10", () => fixed);
    expect(focus.getFullYear()).toBe(2026);
    expect(focus.getMonth()).toBe(2);
    expect(focus.getDate()).toBe(10);
    const fallback = parseInitialFocus(null, () => fixed);
    expect(fallback).toEqual(fixed);
  });

  it("filters events; project_anchor always visible", () => {
    const events = [
      { type: "task", id: 1 },
      { type: "rfi", id: 2 },
      { type: "project_anchor", id: 3 },
    ];
    const filtered = filterCalendarEvents(events, { task: true, rfi: false });
    expect(filtered.map((e) => e.id)).toEqual([1, 3]);
  });

  it("computes visible range for day/week/month", () => {
    const focus = new Date(2026, 5, 10); // Wed Jun 10 2026
    const day = computeVisibleRange("day", focus, "sunday");
    expect(day.start).toEqual(focus);
    expect(day.end).toEqual(focus);

    const week = computeVisibleRange("week", focus, "sunday"); // Sunday start
    expect(week.start.getDay()).toBe(0);
    expect((week.end.getTime() - week.start.getTime()) / 86400000).toBe(6);

    const month = computeVisibleRange("month", focus, "sunday");
    expect((month.end.getTime() - month.start.getTime()) / 86400000).toBe(41);
  });

  it("shifts focus by view unit", () => {
    const focus = new Date(2026, 5, 15);
    const prevMonth = shiftFocus("month", focus, -1);
    expect(prevMonth.getMonth()).toBe(4);
    const nextWeek = shiftFocus("week", focus, 1);
    expect(nextWeek.getDate()).toBe(22);
    const prevDay = shiftFocus("day", focus, -1);
    expect(prevDay.getDate()).toBe(14);
  });

  it("counts events by type", () => {
    expect(
      countEventsByType(
        [{ type: "rfi" }, { type: "task" }, { type: "rfi" }],
        "rfi",
      ),
    ).toBe(2);
  });

  it("builds ics filename", () => {
    const range = {
      start: new Date(2026, 0, 1),
      end: new Date(2026, 0, 31),
    };
    expect(buildIcsFilename("P-100", range)).toBe(
      "project-P-100-calendar-2026-01-01-to-2026-01-31.ics",
    );
    expect(buildIcsFilename(null, range)).toContain("project-calendar-");
  });

  it("header label is non-empty for each view", () => {
    const focus = new Date(2026, 0, 15);
    expect(computeHeaderLabel("month", focus, "sunday").length).toBeGreaterThan(0);
    expect(computeHeaderLabel("week", focus, "sunday").length).toBeGreaterThan(0);
    expect(computeHeaderLabel("day", focus, "sunday").length).toBeGreaterThan(0);
  });

  it("collectIcsEventsForRange returns empty for empty inputs", () => {
    const range = {
      start: new Date(2026, 0, 1),
      end: new Date(2026, 0, 31),
    };
    expect(
      collectIcsEventsForRange({
        visibleRange: range,
        projectNumber: "X",
      }),
    ).toEqual([]);
  });
});
