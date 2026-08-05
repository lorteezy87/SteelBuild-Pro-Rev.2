import { describe, expect, it } from "vitest";
import { STATUS_COLORS, PRIORITY_COLORS } from "../punchlistListHelpers";

describe("punchlistListHelpers", () => {
  it("status and priority tone maps", () => {
    expect(STATUS_COLORS.Open).toContain("error");
    expect(STATUS_COLORS.Completed).toContain("success");
    expect(PRIORITY_COLORS.Critical).toContain("error");
    expect(PRIORITY_COLORS.Low).toBe("var(--accent)");
  });
});
