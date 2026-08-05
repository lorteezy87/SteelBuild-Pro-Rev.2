import { describe, expect, it } from "vitest";
import { filterLiveRecords, filterQcRecords, computeQcStats } from "../qualityControlPageHelpers";

describe("qualityControlPageHelpers", () => {
  it("filters live and search/type", () => {
    expect(filterLiveRecords([{ id: "1" }, { id: "2", is_deleted: true }])).toHaveLength(1);
    const rows = [
      { test_type: "UT", result: "Pass", status: "Closed", material_or_component: "Beam", location: "Grid A" },
      { test_type: "MT", result: "Fail", status: "Open", notes: "retest" },
    ];
    expect(filterQcRecords(rows, { filterType: "UT", filterResult: "all", filterStatus: null, searchQuery: "" })).toHaveLength(1);
    expect(filterQcRecords(rows, { filterType: "all", filterResult: "all", filterStatus: "Open", searchQuery: "" })).toHaveLength(1);
    expect(filterQcRecords(rows, { filterType: "all", filterResult: "all", filterStatus: null, searchQuery: "grid" })).toHaveLength(1);
  });

  it("computes pass rate stats", () => {
    const s = computeQcStats([
      { result: "Pass", status: "Closed" },
      { result: "Fail", status: "Open" },
      { result: "Conditional Pass", status: "Pending" },
      { result: "Inconclusive", status: "Pending" },
    ]);
    expect(s.total).toBe(4);
    expect(s.passed).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.conditional).toBe(1);
    expect(s.pending).toBe(2);
    expect(s.passRate).toBe(67); // 2 of 3 conclusive
  });
});
