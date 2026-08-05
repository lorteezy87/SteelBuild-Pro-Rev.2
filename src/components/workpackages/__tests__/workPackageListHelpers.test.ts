import { describe, expect, it } from "vitest";
import { PHASE_COLORS, STATUS_COLORS, STAGE_STYLES } from "../workPackageListHelpers";

describe("workPackageListHelpers", () => {
  it("phase colors", () => {
    expect(PHASE_COLORS.Detailing).toBe("var(--status-info)");
    expect(PHASE_COLORS.Erection).toBe("var(--status-success)");
  });
  it("status colors", () => {
    expect(STATUS_COLORS.Complete).toBe("var(--status-success)");
  });
  it("stage styles cover 7-stage flow", () => {
    for (const k of ["Not Started", "IFA", "OFA", "BFA", "OFS", "IFC", "Released"]) {
      expect(STAGE_STYLES[k]?.color).toBeTruthy();
    }
  });
});
