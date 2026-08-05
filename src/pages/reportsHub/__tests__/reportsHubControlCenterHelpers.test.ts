import { describe, expect, it } from "vitest";
import { CATEGORY_FILTERS } from "../reportsHubControlCenterHelpers";

describe("CATEGORY_FILTERS", () => {
  it("starts with All", () => {
    expect(CATEGORY_FILTERS[0]).toBe("All");
    expect(CATEGORY_FILTERS).toContain("Financial");
  });
});
