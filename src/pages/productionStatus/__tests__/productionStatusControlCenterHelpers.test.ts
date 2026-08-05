import { describe, expect, it } from "vitest";
import { STAGE_FILTERS } from "../productionStatusControlCenterHelpers";

describe("productionStatusControlCenterHelpers", () => {
  it("stage filters start with All", () => {
    expect(STAGE_FILTERS[0]).toBe("All");
    expect(STAGE_FILTERS.length).toBeGreaterThan(1);
  });
});
