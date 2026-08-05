import { describe, expect, it } from "vitest";
import { pageFilterChipStyle } from "@/components/shared/pageFilterChipHelpers";
import { sequenceFilterChipStyle } from "@/components/shared/sequenceFilterHelpers";

describe("residual catalog atoms batch AC", () => {
  it("shared page filter chip chrome active vs idle", () => {
    const active = pageFilterChipStyle(true);
    const idle = pageFilterChipStyle(false);
    expect(active.background).toBe("var(--accent)");
    expect(active.color).toBe("white");
    expect(idle.background).toBe("var(--bg-surface-low)");
    expect(idle.color).toBe("var(--text-secondary)");
    expect(active.fontSize).toBe("8px");
    expect(active.textTransform).toBe("uppercase");
  });

  it("sequence filter chip chrome active vs idle", () => {
    const active = sequenceFilterChipStyle(true);
    const idle = sequenceFilterChipStyle(false);
    expect(active.color).toBe("var(--accent)");
    expect(active.border).toContain("var(--accent)");
    expect(idle.color).toBe("var(--text-secondary)");
    expect(idle.border).toContain("var(--divider)");
    expect(active.borderRadius).toBe(14);
    expect(active.fontWeight).toBe(800);
  });
});
