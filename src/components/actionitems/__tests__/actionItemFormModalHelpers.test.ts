import { describe, expect, it } from "vitest";
import { PRIORITY_OPTIONS } from "../actionItemFormModalHelpers";

describe("actionItemFormModalHelpers", () => {
  it("priority options catalog", () => {
    expect(PRIORITY_OPTIONS.map((p) => p.value)).toEqual([
      "Low",
      "Medium",
      "High",
      "Critical",
    ]);
    expect(PRIORITY_OPTIONS[3].label).toContain("Crit");
  });
});
