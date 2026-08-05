import { describe, expect, it } from "vitest";
import { MATCH_BADGE, ACCENT, mono } from "../modelElementImportModalHelpers";

describe("modelElementImportModalHelpers", () => {
  it("match badge and tokens", () => {
    expect(MATCH_BADGE.matched.label).toBe("linked");
    expect(MATCH_BADGE.ambiguous.color).toBe("var(--status-warning)");
    expect(ACCENT).toContain("accent");
    expect(mono.fontFamily).toBe("var(--font-mono)");
  });
});
