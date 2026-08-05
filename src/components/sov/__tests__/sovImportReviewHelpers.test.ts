import { describe, expect, it } from "vitest";
import { summarizeSovStaged, formatSovCostLabel } from "../sovImportReviewHelpers";

describe("summarizeSovStaged", () => {
  it("counts valid/invalid/autoMapped", () => {
    const s = summarizeSovStaged([
      { valid: true, autoMapped: true, record: { a: 1 } },
      { valid: true, autoMapped: false, record: { a: 2 } },
      { valid: false, reason: "x", record: { a: 3 } },
    ]);
    expect(s.valid).toBe(2);
    expect(s.invalid).toBe(1);
    expect(s.autoMapped).toBe(1);
    expect(s.validRecords).toHaveLength(2);
  });
});

describe("formatSovCostLabel", () => {
  it("formats code and name", () => {
    expect(formatSovCostLabel({ cost_code: "05", cost_code_name: "Steel" })).toBe("05 — Steel");
    expect(formatSovCostLabel({})).toBe("—");
  });
});
