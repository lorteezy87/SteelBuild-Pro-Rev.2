import { describe, expect, it } from "vitest";
import {
  parseGanttDate,
  buildMonthTicks,
  mapProjectsToGanttRows,
  filterGanttRows,
  computeGanttWindow,
  computeTodayPct,
  computeGanttBarLayout,
  monthStart,
} from "../projectStatusGanttHelpers";

describe("projectStatusGanttHelpers", () => {
  it("parses dates and maps projects", () => {
    expect(parseGanttDate(null)).toBeNull();
    expect(parseGanttDate("not-a-date")).toBeNull();
    const d = parseGanttDate("2026-01-15T00:00:00Z");
    expect(d).toBeInstanceOf(Date);

    const rows = mapProjectsToGanttRows([
      {
        id: "p1",
        name: "Alpha",
        project_number: "A-1",
        health_status: "On Track",
        phase: "Detailing",
        start_date: "2026-01-01",
        target_completion_date: "2026-06-01",
      },
    ]);
    expect(rows[0].id).toBe("p1");
    expect(rows[0].number).toBe("A-1");
    expect(rows[0].name).toBe("Alpha");
    expect(rows[0].start).toBeInstanceOf(Date);
    expect(rows[0].end).toBeInstanceOf(Date);
  });

  it("filters by search and health", () => {
    const rows = mapProjectsToGanttRows([
      { id: "1", name: "Alpha", project_number: "A1", health_status: "On Track", start_date: "2026-01-01", target_completion_date: "2026-02-01" },
      { id: "2", name: "Beta", project_number: "B1", health_status: "At Risk", start_date: "2026-01-01", target_completion_date: "2026-02-01" },
    ]);
    expect(filterGanttRows(rows, { search: "bet" })).toHaveLength(1);
    expect(filterGanttRows(rows, { healthFilter: "At Risk" }).map((r) => r.id)).toEqual(["2"]);
  });

  it("window, ticks, today pct, bar layout", () => {
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 5, 1);
    const ticks = buildMonthTicks(from, to);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0].fraction).toBe(0);

    const rows = mapProjectsToGanttRows([
      { id: "1", name: "A", start_date: "2026-02-01", target_completion_date: "2026-04-01" },
    ]);
    const win = computeGanttWindow(rows, new Date("2026-03-01"));
    expect(win.from).toBeInstanceOf(Date);
    expect(win.to.getTime()).toBeGreaterThan(win.from.getTime());

    expect(computeTodayPct(from, to, new Date(2026, 2, 1))).not.toBeNull();
    expect(computeTodayPct(from, to, new Date(2025, 0, 1))).toBeNull();

    const layout = computeGanttBarLayout(rows[0], from, to);
    expect(layout).not.toBeNull();
    expect(layout!.leftPct).toBeGreaterThanOrEqual(0);
    expect(layout!.widthPct).toBeGreaterThan(0);

    expect(monthStart(new Date(2026, 3, 15)).getDate()).toBe(1);
  });
});
