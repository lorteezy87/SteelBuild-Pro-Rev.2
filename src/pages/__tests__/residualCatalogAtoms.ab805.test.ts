import { describe, expect, it } from "vitest";
import { rfiStatusBtnStyle } from "@/components/rfis/rfiFormModalStyleHelpers";

describe("residual catalog atoms batch AB", () => {
  it("rfi quick-status pill chrome for active vs idle", () => {
    const active = rfiStatusBtnStyle("Open", "Open");
    const idle = rfiStatusBtnStyle("Closed", "Open");
    expect(active.background).toBe("var(--accent)");
    expect(active.color).toBe("var(--on-accent)");
    expect(active.border).toContain("var(--accent)");
    expect(idle.background).toBe("var(--bg-surface)");
    expect(idle.color).toBe("var(--text-muted)");
    expect(idle.border).toContain("var(--border-default)");
    expect(active.fontSize).toBe(8);
    expect(active.textTransform).toBe("uppercase");
  });
});
