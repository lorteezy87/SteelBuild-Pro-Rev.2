import { describe, expect, it } from "vitest";
import { IMPACT_COLOR, REVISION_SUMMARY_MONO } from "../revisionSummaryCardHelpers";

describe("revisionSummaryCardHelpers", () => {
  it("impact colors and mono", () => {
    expect(IMPACT_COLOR.high).toBe("#F85149");
    expect(IMPACT_COLOR.none).toContain("muted");
    expect(REVISION_SUMMARY_MONO).toContain("mono");
  });
});
