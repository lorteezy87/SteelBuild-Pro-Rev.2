import { describe, expect, it } from "vitest";
import {
  filterLiveRecords,
  filterPunchlist,
  computePunchlistStats,
  toggleIdInList,
} from "../punchlistPageHelpers";

describe("punchlistPageHelpers", () => {
  it("filters and stats", () => {
    expect(filterLiveRecords([{ id: 1 }, { id: 2, is_deleted: true }])).toHaveLength(1);
    const rows = [
      { status: "Open", category: "Structural", priority: "Critical" },
      { status: "Completed", category: "Hardware", priority: "Low" },
      { status: "In Progress", category: "Structural", priority: "High" },
    ];
    expect(filterPunchlist(rows, { filterStatus: "Open", filterCategory: "all", filterPriority: "all" })).toHaveLength(1);
    expect(filterPunchlist(rows, { filterStatus: "all", filterCategory: "Structural", filterPriority: "all" })).toHaveLength(2);
    const s = computePunchlistStats(rows);
    expect(s.total).toBe(3);
    expect(s.completed).toBe(1);
    expect(s.critical).toBe(1);
    expect(s.completionRate).toBe(33);
    expect(toggleIdInList(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleIdInList(["a"], "a")).toEqual([]);
  });
});
