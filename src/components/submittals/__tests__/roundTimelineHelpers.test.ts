import { describe, expect, it } from "vitest";
import { ROUND_STATUS_COLORS, DEFAULT_COLOR, daysBetween } from "../roundTimelineHelpers";

describe("roundTimelineHelpers", () => {
  it("status colors", () => {
    expect(ROUND_STATUS_COLORS.Approved.color).toBe("var(--status-success)");
    expect(ROUND_STATUS_COLORS.Rejected.bg).toBe("var(--danger-muted)");
    expect(DEFAULT_COLOR.color).toBe("var(--text-muted)");
  });
  it("daysBetween", () => {
    expect(daysBetween("2026-01-01", "2026-01-03")).toBe(2);
    expect(daysBetween(null, "2026-01-01")).toBeNull();
  });
});
