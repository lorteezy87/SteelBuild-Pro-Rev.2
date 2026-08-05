import { describe, expect, it } from "vitest";
import { buildLookaheadWeeks, tasksIntersectingWeek } from "../lookaheadPlannerHelpers";

function parseIso(raw: unknown): Date | null {
  if (!raw || typeof raw !== "string") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

describe("buildLookaheadWeeks", () => {
  it("anchors six Monday-start UTC weeks", () => {
    // Wednesday 2026-08-05 UTC
    const today = new Date(Date.UTC(2026, 7, 5));
    const weeks = buildLookaheadWeeks(today, 6);
    expect(weeks).toHaveLength(6);
    expect(weeks[0].num).toBe(1);
    // Monday on/before Wed Aug 5 is Aug 3
    expect(weeks[0].start.getUTCFullYear()).toBe(2026);
    expect(weeks[0].start.getUTCMonth()).toBe(7);
    expect(weeks[0].start.getUTCDate()).toBe(3);
    expect(weeks[0].end.getUTCDate()).toBe(9);
    expect(weeks[1].start.getUTCDate()).toBe(10);
    expect(weeks[5].num).toBe(6);
  });

  it("handles Monday as week start with no backshift", () => {
    const monday = new Date(Date.UTC(2026, 7, 3));
    const weeks = buildLookaheadWeeks(monday, 1);
    expect(weeks[0].start.getUTCDate()).toBe(3);
  });
});

describe("tasksIntersectingWeek", () => {
  const weekStart = new Date(Date.UTC(2026, 7, 3));
  const weekEnd = new Date(Date.UTC(2026, 7, 9));

  it("includes overlapping tasks", () => {
    const tasks = [
      { id: "in", start_date: "2026-08-01T00:00:00.000Z", end_date: "2026-08-05T00:00:00.000Z" },
      { id: "out", start_date: "2026-08-15T00:00:00.000Z", end_date: "2026-08-20T00:00:00.000Z" },
      { id: "touch", start_date: "2026-08-09T00:00:00.000Z", end_date: "2026-08-12T00:00:00.000Z" },
    ];
    const result = tasksIntersectingWeek(tasks, weekStart, weekEnd, parseIso);
    expect(result.map((t) => t.id)).toEqual(["in", "touch"]);
  });

  it("uses single date when start or end missing", () => {
    const tasks = [
      { id: "s-only", start_date: "2026-08-05T00:00:00.000Z", end_date: null },
      { id: "none", start_date: null, end_date: null },
    ];
    const result = tasksIntersectingWeek(tasks, weekStart, weekEnd, parseIso);
    expect(result.map((t) => t.id)).toEqual(["s-only"]);
  });

  it("handles null tasks", () => {
    expect(tasksIntersectingWeek(null, weekStart, weekEnd, parseIso)).toEqual([]);
  });
});
