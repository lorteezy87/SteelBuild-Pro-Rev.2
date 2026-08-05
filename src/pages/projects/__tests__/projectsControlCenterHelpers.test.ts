import { describe, expect, it } from "vitest";
import { PROJECT_PHASE_FILTERS, PROJECT_HEALTH_VALUES } from "../projectsControlCenterHelpers";

describe("project phase/health filters", () => {
  it("includes Fabrication and At Risk", () => {
    expect(PROJECT_PHASE_FILTERS).toContain("Fabrication");
    expect(PROJECT_HEALTH_VALUES).toContain("At Risk");
  });
});
