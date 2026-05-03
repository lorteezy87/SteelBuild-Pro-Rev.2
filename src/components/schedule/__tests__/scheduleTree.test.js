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
