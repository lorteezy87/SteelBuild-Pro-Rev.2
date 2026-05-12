import { describe, it, expect } from "vitest";
import { buildTreeOrder } from "../scheduleTree";

describe("buildTreeOrder", () => {
  it("returns empty list for empty input", () => {
    expect(buildTreeOrder([])).toEqual([]);
  });

  it("flattens parent → children in DFS order with depth flags", () => {
    const tasks = [
      { id: "a", sort_order: 1, parent_task_id: null },
      { id: "b", sort_order: 2, parent_task_id: null },
      { id: "a1", sort_order: 1, parent_task_id: "a" },
    ];
    const out = buildTreeOrder(tasks);
    expect(out.map((t) => t.id)).toEqual(["a", "a1", "b"]);
    expect(out[0]._depth).toBe(0);
    expect(out[0]._hasChildren).toBe(true);
    expect(out[1]._depth).toBe(1);
    expect(out[1]._hasChildren).toBe(false);
    expect(out[2]._hasChildren).toBe(false);
  });

  it("respects sort_order ahead of start_date", () => {
    const tasks = [
      { id: "a", sort_order: 2, start_date: "2026-01-01" },
      { id: "b", sort_order: 1, start_date: "2026-06-01" },
    ];
    expect(buildTreeOrder(tasks).map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("derives display WBS codes from the current hierarchy", () => {
    const tasks = [
      { id: "parent", sort_order: 1, wbs_code: "WRONG", parent_task_id: null },
      { id: "child-a", sort_order: 1, wbs_code: "OLD-1", parent_task_id: "parent" },
      { id: "child-b", sort_order: 2, wbs_code: "OLD-2", parent_task_id: "parent" },
    ];
    const out = buildTreeOrder(tasks, { rootPrefix: 2 });
    expect(out.map((task) => [task.id, task.wbs_code])).toEqual([
      ["parent", "2.1"],
      ["child-a", "2.1.1"],
      ["child-b", "2.1.2"],
    ]);
    expect(out[0]._stored_wbs_code).toBe("WRONG");
  });

  it("rolls summary task dates, duration, and percent complete from children", () => {
    const tasks = [
      {
        id: "summary",
        sort_order: 1,
        start_date: "2026-01-15",
        end_date: "2026-01-16",
        percent_complete: 0,
        parent_task_id: null,
      },
      {
        id: "child-a",
        sort_order: 1,
        start_date: "2026-01-01",
        end_date: "2026-01-05",
        percent_complete: 100,
        parent_task_id: "summary",
      },
      {
        id: "child-b",
        sort_order: 2,
        start_date: "2026-01-10",
        end_date: "2026-01-20",
        percent_complete: 50,
        parent_task_id: "summary",
      },
    ];
    const [summary] = buildTreeOrder(tasks, { rootPrefix: 4 });
    expect(summary._isRolledUpSummary).toBe(true);
    expect(summary.start_date).toBe("2026-01-01");
    expect(summary.end_date).toBe("2026-01-20");
    expect(summary.duration).toBe(19);
    expect(summary.percent_complete).toBe(75);
    expect(summary._stored_start_date).toBe("2026-01-15");
    expect(summary._summaryTaskCount).toBe(2);
  });

  it("falls back to start_date when sort_order is missing on both", () => {
    const tasks = [
      { id: "later", start_date: "2026-06-01" },
      { id: "earlier", start_date: "2026-01-01" },
    ];
    expect(buildTreeOrder(tasks).map((t) => t.id)).toEqual([
      "earlier",
      "later",
    ]);
  });
});
