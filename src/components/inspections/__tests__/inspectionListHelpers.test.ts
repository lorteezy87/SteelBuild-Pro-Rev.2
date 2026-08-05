import { describe, expect, it } from "vitest";
import { STATUS_COLORS, SIGNOFF_COLORS } from "../inspectionListHelpers";

describe("inspectionListHelpers", () => {
  it("status and signoff colors", () => {
    expect(STATUS_COLORS.Completed).toBe("var(--status-success)");
    expect(SIGNOFF_COLORS.Rejected).toBe("var(--status-error)");
    expect(SIGNOFF_COLORS["Conditional Approval"]).toBe("var(--status-info)");
  });
});
