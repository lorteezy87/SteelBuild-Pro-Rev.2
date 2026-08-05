import { describe, expect, it } from "vitest";
import { TONE_COLORS } from "../submittalReviewStripHelpers";

describe("submittalReviewStripHelpers", () => {
  it("tone colors", () => {
    expect(TONE_COLORS.success.text).toBe("var(--status-success)");
    expect(TONE_COLORS.error.border).toBe("var(--danger-border)");
    expect(TONE_COLORS.muted.bg).toBe("var(--bg-surface-low)");
  });
});
