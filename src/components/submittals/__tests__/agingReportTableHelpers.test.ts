import { describe, expect, it } from "vitest";
import { td, stuckColor } from "../agingReportTableHelpers";

describe("aging report pure styles", () => {
  it("td merges align and extra", () => {
    expect(td("right", { fontWeight: 700 }).textAlign).toBe("right");
    expect(td("left").fontVariantNumeric).toBe("tabular-nums");
  });
  it("stuckColor thresholds", () => {
    expect(stuckColor(30)).toBe("var(--status-error)");
    expect(stuckColor(14)).toBe("var(--status-warning)");
    expect(stuckColor(3)).toBe("var(--text-primary)");
  });
});
