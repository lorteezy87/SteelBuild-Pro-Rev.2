import { describe, expect, it } from "vitest";
import { HEALTH_FILTERS } from "../portfolioControlCenterHelpers";

describe("portfolioControlCenterHelpers", () => {
  it("health filters", () => {
    expect([...HEALTH_FILTERS]).toEqual(["All", "On Track", "Watch", "At Risk"]);
  });
});
