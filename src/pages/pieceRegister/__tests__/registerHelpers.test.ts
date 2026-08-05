import { describe, expect, it } from "vitest";
import {
  applyAttentionFocus,
  presentImportReconciliationText,
  uniqueValues,
} from "../registerHelpers";

describe("uniqueValues", () => {
  it("dedupes, drops nullish/empty, and natural-sorts", () => {
    expect(uniqueValues(["B10", null, "A2", "", "A10", "A2", undefined])).toEqual([
      "A2",
      "A10",
      "B10",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(uniqueValues([])).toEqual([]);
  });
});

describe("presentImportReconciliationText", () => {
  it("rewrites the split-lots warning to plain language", () => {
    expect(
      presentImportReconciliationText(
        "mark has split lots but no active ALL root",
      ),
    ).toBe("This piece mark has split lots but no active parent record.");
  });

  it("passes through other messages unchanged", () => {
    expect(presentImportReconciliationText("qty mismatch")).toBe("qty mismatch");
  });
});

describe("applyAttentionFocus", () => {
  const rows = [
    { id: "1", work_package_id: null, on_hold: false, weight_each_lbs: 10 },
    { id: "2", work_package_id: "wp-1", on_hold: true, weight_each_lbs: 20 },
    { id: "3", work_package_id: "wp-2", on_hold: false, weight_each_lbs: null },
  ];

  it("returns the same rows when focus is null", () => {
    expect(applyAttentionFocus(rows, null)).toEqual(rows);
  });

  it("filters unassigned", () => {
    expect(applyAttentionFocus(rows, "unassigned").map((r) => r.id)).toEqual([
      "1",
    ]);
  });

  it("filters held", () => {
    expect(applyAttentionFocus(rows, "held").map((r) => r.id)).toEqual(["2"]);
  });
});
