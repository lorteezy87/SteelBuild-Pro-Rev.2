import { describe, it, expect } from "vitest";
import {
  buildParentIdSet,
  isSummaryTask,
  isWorkTask,
  excludeSummaryTasks,
} from "../summaryTasks";

describe("buildParentIdSet", () => {
  it("collects every non-null parent_task_id", () => {
    const tasks = [
      { id: "p1" },
      { id: "c1", parent_task_id: "p1" },
      { id: "c2", parent_task_id: "p1" },
      { id: "p2" },
      { id: "c3", parent_task_id: "p2" },
      { id: "leaf" },
    ];
    const set = buildParentIdSet(tasks);
    expect(set.has("p1")).toBe(true);
    expect(set.has("p2")).toBe(true);
    expect(set.has("leaf")).toBe(false);
    expect(set.size).toBe(2);
  });

  it("ignores null/undefined parent_task_id and non-array input", () => {
    expect(buildParentIdSet([{ id: "a", parent_task_id: null }]).size).toBe(0);
    expect(buildParentIdSet(null).size).toBe(0);
    expect(buildParentIdSet(undefined).size).toBe(0);
  });
});

describe("isSummaryTask", () => {
  it("is true when the persisted is_summary flag is set", () => {
    expect(isSummaryTask({ id: "x", is_summary: true })).toBe(true);
  });

  it("is true when the Gantt enrichment flags are set", () => {
    expect(isSummaryTask({ id: "x", _hasChildren: true })).toBe(true);
    expect(isSummaryTask({ id: "x", _isRolledUpSummary: true })).toBe(true);
  });

  it("is true when the id appears as another task's parent (parentIds branch)", () => {
    // A parent whose is_summary hasn't been backfilled yet is still caught
    // through the parent-id linkage — the belt-and-suspenders branch.
    const parentIds = buildParentIdSet([
      { id: "parent", is_summary: false },
      { id: "child", parent_task_id: "parent" },
    ]);
    expect(isSummaryTask({ id: "parent", is_summary: false }, parentIds)).toBe(true);
  });

  it("is false for a leaf task with no flags and no children", () => {
    const parentIds = buildParentIdSet([
      { id: "parent" },
      { id: "leaf", parent_task_id: "parent" },
    ]);
    expect(isSummaryTask({ id: "leaf" }, parentIds)).toBe(false);
  });

  it("only consults flags when no parentIds set is provided", () => {
    // Without the parentIds set, a not-yet-flagged parent looks like a leaf.
    expect(isSummaryTask({ id: "parent", is_summary: false })).toBe(false);
  });

  it("is false for null/undefined task", () => {
    expect(isSummaryTask(null)).toBe(false);
    expect(isSummaryTask(undefined, new Set(["x"]))).toBe(false);
  });
});

describe("isWorkTask (negation)", () => {
  it("is the inverse of isSummaryTask", () => {
    const parentIds = new Set(["p"]);
    expect(isWorkTask({ id: "p" }, parentIds)).toBe(false);
    expect(isWorkTask({ id: "leaf" }, parentIds)).toBe(true);
  });
});

describe("excludeSummaryTasks", () => {
  it("drops parents (by flag OR by parent_task_id linkage), keeps leaves", () => {
    const tasks = [
      { id: "p1", is_summary: true },            // flagged parent
      { id: "p2", is_summary: false },           // parent by linkage only
      { id: "c1", parent_task_id: "p1" },
      { id: "c2", parent_task_id: "p2" },
      { id: "solo" },                            // true leaf
    ];
    const leaves = excludeSummaryTasks(tasks);
    const ids = leaves.map((t) => t.id).sort();
    expect(ids).toEqual(["c1", "c2", "solo"]);
  });

  it("returns [] for non-array input", () => {
    expect(excludeSummaryTasks(null)).toEqual([]);
  });
});
