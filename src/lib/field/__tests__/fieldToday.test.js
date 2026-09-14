import { describe, it, expect } from "vitest";
import {
  clampPercent,
  statusForPercent,
  progressPatch,
  taskUrgency,
  partitionFieldTasks,
  tasksForToday,
  taskLabel,
  taskCrew,
  PROGRESS_STEPS,
} from "../fieldToday";

const TODAY = "2026-06-12";
const ago = (n) => {
  const d = new Date(TODAY + "T00:00:00");
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const ahead = (n) => ago(-n);

describe("clampPercent", () => {
  it("rounds and clamps into [0,100]", () => {
    expect(clampPercent(49.6)).toBe(50);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent("75")).toBe(75);
  });
  it("treats junk as 0", () => {
    expect(clampPercent(undefined)).toBe(0);
    expect(clampPercent(null)).toBe(0);
    expect(clampPercent("abc")).toBe(0);
  });
});

describe("statusForPercent (mirrors Schedule.tsx canonical rule)", () => {
  it("maps the boundaries", () => {
    expect(statusForPercent(0)).toBe("Not Started");
    expect(statusForPercent(1)).toBe("In Progress");
    expect(statusForPercent(99)).toBe("In Progress");
    expect(statusForPercent(100)).toBe("Complete");
    expect(statusForPercent(150)).toBe("Complete"); // clamped first
  });
});

describe("progressPatch", () => {
  it("returns the percent + derived status patch", () => {
    expect(progressPatch(50)).toEqual({ percent_complete: 50, status: "In Progress" });
    expect(progressPatch(100)).toEqual({ percent_complete: 100, status: "Complete" });
    expect(progressPatch(0)).toEqual({ percent_complete: 0, status: "Not Started" });
  });
});

describe("taskUrgency", () => {
  it("excludes completed work", () => {
    expect(taskUrgency({ percent_complete: 100, end_date: ago(1) }, TODAY)).toBe("done");
    expect(taskUrgency({ status: "Complete", end_date: ahead(1) }, TODAY)).toBe("done");
  });
  it("flags overdue and due-today by end date", () => {
    expect(taskUrgency({ end_date: ago(1), percent_complete: 40 }, TODAY)).toBe("overdue");
    expect(taskUrgency({ end_date: TODAY, percent_complete: 0 }, TODAY)).toBe("due-today");
  });
  it("treats in-window / open-ended started work as active", () => {
    expect(taskUrgency({ start_date: ago(2), end_date: ahead(3) }, TODAY)).toBe("active");
    expect(taskUrgency({ start_date: ago(2) }, TODAY)).toBe("active"); // no end
  });
  it("keeps unscheduled (TBD) work visible", () => {
    expect(taskUrgency({ percent_complete: 0 }, TODAY)).toBe("unscheduled");
  });
  it("marks future-start work upcoming", () => {
    expect(taskUrgency({ start_date: ahead(2), end_date: ahead(5) }, TODAY)).toBe("upcoming");
  });
});

describe("tasksForToday", () => {
  const tasks = [
    { id: "done", task_name: "Done", percent_complete: 100, end_date: ago(1) },
    { id: "overdue", task_name: "Overdue", percent_complete: 30, end_date: ago(2) },
    { id: "today", task_name: "Due today", percent_complete: 0, end_date: TODAY },
    { id: "active", task_name: "Active", percent_complete: 10, start_date: ago(1), end_date: ahead(4) },
    { id: "tbd", task_name: "TBD" },
    { id: "soon", task_name: "Soon", start_date: ahead(3), end_date: ahead(6) },
    { id: "far", task_name: "Far", start_date: ahead(30), end_date: ahead(40) },
    { id: "gone", task_name: "Deleted", end_date: ago(1), is_deleted: true },
  ];

  it("drops completed, deleted, and far-future tasks", () => {
    const ids = tasksForToday(tasks, TODAY).map((t) => t.id);
    expect(ids).not.toContain("done");
    expect(ids).not.toContain("gone");
    expect(ids).not.toContain("far");
  });

  it("keeps overdue work out of today's plan and puts it in recovery", () => {
    const result = partitionFieldTasks(tasks, TODAY);
    expect(result.today.map((t) => t.id)).toEqual(["today", "active"]);
    expect(result.recovery.map((t) => t.id)).toEqual(["overdue"]);
    expect(tasksForToday(tasks, TODAY).map((t) => t.id)).toEqual(["today", "active"]);
  });

  it("classifies undated work and missing-start future work as planning gaps", () => {
    const result = partitionFieldTasks([
      { id: "tbd", percent_complete: 0 },
      { id: "gap", end_date: ahead(3), percent_complete: 0 },
    ], TODAY);
    expect(result.unscheduled.map((t) => t.id)).toEqual(
      expect.arrayContaining(["gap", "tbd"]),
    );
    expect(result.unscheduled).toHaveLength(2);
  });

  it("keeps all future-start work in upcoming without calling it today", () => {
    const result = partitionFieldTasks([
      { id: "soon", start_date: ahead(3), end_date: ahead(6), percent_complete: 0 },
      { id: "far", start_date: ahead(30), end_date: ahead(40), percent_complete: 0 },
    ], TODAY);
    expect(result.upcoming.map((t) => t.id)).toEqual(["soon", "far"]);
    expect(result.today).toEqual([]);
  });

  it("is safe on empty / non-array input", () => {
    expect(tasksForToday(null, TODAY)).toEqual([]);
    expect(tasksForToday(undefined, TODAY)).toEqual([]);
  });

  it("drops complete, deleted, summary, and parent rows from every bucket", () => {
    const withSummaries = [
      { id: "done", task_name: "Done", percent_complete: 100, end_date: ago(1) },
      { id: "gone", task_name: "Deleted", end_date: ago(1), is_deleted: true },
      // Flagged summary parent, overdue — must be dropped.
      { id: "sum", task_name: "Erection (phase)", is_summary: true, end_date: ago(2) },
      // Unflagged parent detected by linkage (has a child) — must be dropped.
      { id: "parent", task_name: "Bay A", end_date: ago(2) },
      // The real leaf work items — kept.
      { id: "child", task_name: "Set column A-1", parent_task_id: "parent", end_date: ago(2) },
      { id: "solo", task_name: "Weld splice", end_date: ago(1) },
    ];
    const ids = Object.values(partitionFieldTasks(withSummaries, TODAY))
      .flat()
      .map((t) => t.id);
    expect(ids).toEqual(["child", "solo"]);
  });
});

describe("display helpers", () => {
  it("taskLabel falls back across column names", () => {
    expect(taskLabel({ task_name: "Set columns" })).toBe("Set columns");
    expect(taskLabel({ name: "Bolt-up" })).toBe("Bolt-up");
    expect(taskLabel({})).toBe("(untitled task)");
  });
  it("taskCrew prefers resource_names then assigned_to", () => {
    expect(taskCrew({ resource_names: "Crew A", assigned_to: "x" })).toBe("Crew A");
    expect(taskCrew({ assigned_to: "Crew B" })).toBe("Crew B");
    expect(taskCrew({})).toBe("");
  });
  it("exposes the quick-set steps", () => {
    expect(PROGRESS_STEPS).toEqual([0, 25, 50, 75, 100]);
  });
});
