import { describe, expect, it } from "vitest";
import {
  startOfLocalDay,
  weekEndFromToday,
  enrichTasksDueThisWeek,
  scopeTasksDue,
  filterAndSortTasksDue,
  computeTasksDueKpis,
} from "../tasksDueThisWeekHelpers";

describe("tasksDueThisWeekHelpers", () => {
  it("enriches scopes filters and KPIs", () => {
    const today = startOfLocalDay(new Date("2026-08-05T15:00:00"));
    const weekEnd = weekEndFromToday(today);
    const projectsById = new Map([
      ["p1", { name: "Alpha", project_number: "A1" }],
    ]);
    const enriched = enrichTasksDueThisWeek({
      tasks: [
        {
          id: "t1",
          project_id: "p1",
          task_name: "Bolt up",
          end_date: "2026-08-06",
          status: "In Progress",
          priority: "Critical",
          assigned_to: "Sam",
        },
        {
          id: "t2",
          project_id: "p1",
          task_name: "Late item",
          end_date: "2026-08-01",
          status: "In Progress",
          priority: "High",
        },
        {
          id: "t3",
          project_id: "p1",
          task_name: "Done",
          end_date: "2026-08-06",
          status: "Complete",
        },
      ],
      projectsById,
      today,
      weekEnd,
      buildParentIdSet: () => new Set(),
      isSummaryTask: () => false,
    });
    expect(enriched).toHaveLength(2);
    expect(enriched.find((r) => r.id === "t1")?.inWeek).toBe(true);
    expect(enriched.find((r) => r.id === "t2")?.overdue).toBe(true);

    expect(scopeTasksDue(enriched, "week")).toHaveLength(1);
    expect(scopeTasksDue(enriched, "overdue")).toHaveLength(1);
    expect(scopeTasksDue(enriched, "both")).toHaveLength(2);

    const sorted = filterAndSortTasksDue(enriched, "late");
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe("t2");

    const kpis = computeTasksDueKpis(enriched);
    expect(kpis.dueInWeekCount).toBe(1);
    expect(kpis.overdueCount).toBe(1);
    expect(kpis.criticalCount).toBe(1);
  });
});
