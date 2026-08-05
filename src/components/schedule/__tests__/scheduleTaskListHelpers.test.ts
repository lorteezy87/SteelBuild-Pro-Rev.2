import { describe, expect, it } from "vitest";
import {
  filterScheduleTasksByPriorityStatus,
  sortByStartDate,
  groupScheduleTasksByPhase,
} from "../scheduleTaskListHelpers";

describe("filterScheduleTasksByPriorityStatus", () => {
  const tasks = [
    { id: "1", priority: "High", status: "In Progress", start_date: "2026-01-02" },
    { id: "2", priority: "Low", status: "Complete", start_date: "2026-01-01" },
  ];
  it("filters by priority and status", () => {
    expect(filterScheduleTasksByPriorityStatus(tasks, { filterPriority: "High" }).map((t) => t.id)).toEqual(["1"]);
    expect(filterScheduleTasksByPriorityStatus(tasks, { filterStatus: "Complete" }).map((t) => t.id)).toEqual(["2"]);
  });
});

describe("sortByStartDate", () => {
  it("orders by start_date null last", () => {
    const a = { start_date: "2026-01-02" };
    const b = { start_date: "2026-01-01" };
    const c = { start_date: null };
    expect([a, b, c].sort(sortByStartDate).map((t) => t.start_date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      null,
    ]);
  });
});

describe("groupScheduleTasksByPhase", () => {
  it("returns phase groups with tree visibility", () => {
    const tasks = [
      { id: "p", name: "Parent", phase: "Fabrication", priority: "High", start_date: "2026-01-01", parent_task_id: null },
      { id: "c", name: "Child", phase: "Fabrication", priority: "Low", start_date: "2026-01-02", parent_task_id: "p" },
    ];
    const groups = groupScheduleTasksByPhase(tasks as any, { sortBy: "priority", collapsedTasks: {} });
    const fab = groups.find((g) => g.phase === "Fabrication");
    expect(fab?.totalTasks).toBeGreaterThan(0);
    const collapsed = groupScheduleTasksByPhase(tasks as any, { sortBy: "phase", collapsedTasks: { p: true } });
    const fab2 = collapsed.find((g) => g.phase === "Fabrication");
    // child hidden when parent collapsed
    expect(fab2?.tasks.every((t: any) => t.id !== "c")).toBe(true);
  });
});
