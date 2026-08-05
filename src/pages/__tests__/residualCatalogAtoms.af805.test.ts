import { describe, expect, it } from "vitest";
import {
  hoursBudgetColor,
  hoursBudgetPct,
} from "@/components/workpackages/workPackageListHelpers";
import { approvalChainIconBtnStyle } from "@/components/submittals/approvalChainTemplatesHelpers";
import {
  PERM_BADGE_CONFIG,
  ROLE_DESCRIPTIONS,
  permBadgeStyle,
} from "@/components/settings/settingsTabStyleHelpers";

describe("residual catalog atoms batch AF", () => {
  it("hours budget color and percent", () => {
    expect(hoursBudgetColor(10, 20)).toBe("var(--status-success)");
    expect(hoursBudgetColor(30, 20)).toBe("var(--status-error)");
    expect(hoursBudgetColor(5, 0)).toBe("var(--text-muted)");
    expect(hoursBudgetPct(25, 50)).toBe(50);
    expect(hoursBudgetPct(100, 50)).toBe(100);
    expect(hoursBudgetPct(10, null)).toBe(0);
  });

  it("approval chain icon button chrome", () => {
    const enabled = approvalChainIconBtnStyle(false);
    const disabled = approvalChainIconBtnStyle(true);
    expect(enabled.cursor).toBe("pointer");
    expect(enabled.opacity).toBe(1);
    expect(disabled.cursor).toBe("default");
    expect(disabled.opacity).toBe(0.4);
    expect(disabled.color).toContain("text-disabled");
  });

  it("roles permission badge catalog and chrome", () => {
    expect(PERM_BADGE_CONFIG.create.color).toBe("var(--status-success)");
    expect(PERM_BADGE_CONFIG.delete.text).toContain("Delete");
    expect(ROLE_DESCRIPTIONS.admin.permissions).toContain("delete");
    expect(ROLE_DESCRIPTIONS.user.permissions).not.toContain("delete");
    const style = permBadgeStyle("var(--accent)");
    expect(style.background).toBe("var(--accent)22");
    expect(style.border).toContain("var(--accent)44");
    expect(style.fontSize).toBe(10);
  });
});
