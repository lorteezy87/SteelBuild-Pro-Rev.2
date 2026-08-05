import { describe, expect, it } from "vitest";
import { computeBulkParentOptions, filterEditableTasks } from "../scheduleTaskHelpers";
import type { ScheduleTask } from "../types";

describe("filterEditableTasks", () => {
  it("keeps leaf tasks and drops summary rows (children / rolled-up / explicit)", () => {
    const tasks: ScheduleTask[] = [
      { id: "leaf" },
      { id: "parent", _hasChildren: true },
      { id: "rollup", _isRolledUpSummary: true },
      { id: "summary", is_summary: true },
    ];
    expect(filterEditableTasks(tasks).map((t) => t.id)).toEqual(["leaf"]);
  });

  it("returns an empty array when all rows are summaries", () => {
    expect(filterEditableTasks([{ id: "x", is_summary: true }])).toEqual([]);
  });
});

describe("computeBulkParentOptions", () => {
  // Tree: root(r) → child(a), child(b); b → grandchild(g). A separate top-level t.
  const tasks: ScheduleTask[] = [
    { id: "r", parent_task_id: null },
    { id: "a", parent_task_id: "r" },
    { id: "b", parent_task_id: "r" },
    { id: "g", parent_task_id: "b" },
    { id: "t", parent_task_id: null },
  ];

  it("returns [] when nothing is selected", () => {
    expect(computeBulkParentOptions(tasks, new Set())).toEqual([]);
  });

  it("excludes the selected task and its descendants for a single selection", () => {
    // Selecting b: b itself and its descendant g are illegal parents.
    const opts = computeBulkParentOptions(tasks, new Set(["b"]));
    expect(opts.map((t) => t.id)).toEqual(["r", "a", "t"]);
  });

  it("intersects legal targets across multiple selections", () => {
    // Selecting a and g: valid-for-a excludes {a}; valid-for-g excludes {g}.
    // The selected ids themselves are then removed → both a and g dropped.
    const opts = computeBulkParentOptions(tasks, new Set(["a", "g"]));
    expect(opts.map((t) => t.id)).toEqual(["r", "b", "t"]);
  });

  it("preserves the input order of enrichedTasks", () => {
    const opts = computeBulkParentOptions(tasks, new Set(["t"]));
    expect(opts.map((t) => t.id)).toEqual(["r", "a", "b", "g"]);
  });
});
