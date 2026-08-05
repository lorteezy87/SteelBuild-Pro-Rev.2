import { describe, expect, it } from "vitest";
import {
  resolveEffectiveRetainage,
  filterSovLines,
  filterSovLinesForControlCenter,
  STATUS_CHIPS,
} from "../sovPageHelpers";

describe("sovPageHelpers", () => {
  it("resolves retainage modes", () => {
    expect(resolveEffectiveRetainage("per-row", 10)).toBeNull();
    expect(resolveEffectiveRetainage("custom", "12.5")).toBe(12.5);
    expect(resolveEffectiveRetainage("10", "")).toBe(10);
  });

  it("filters and sorts SOV lines", () => {
    const rows = [
      { line_item_number: 2, application_number: 1, status: "Approved", sov_id: "B", description: "Beams" },
      { line_item_number: 1, application_number: 1, status: "Draft", sov_id: "A", description: "Anchors", phase: "Fab", cost_code: "01" },
      { line_item_number: 3, application_number: 2, status: "Draft", sov_id: "C", description: "Columns" },
    ];
    expect(filterSovLines(rows, { appFilter: "1", statusFilter: "all" }).map((r) => r.sov_id)).toEqual(["A", "B"]);
    expect(filterSovLines(rows, { appFilter: "all", statusFilter: "Draft" }).map((r) => r.sov_id)).toEqual(["A", "C"]);
    expect(
      filterSovLinesForControlCenter(rows, { statusFilter: "All", ccSearch: "fab" }).map((r) => r.sov_id),
    ).toEqual(["A"]);
  });
});

describe("STATUS_CHIPS", () => {
  it("includes Certified", () => {
    expect(STATUS_CHIPS).toContain("Certified");
  });
});
