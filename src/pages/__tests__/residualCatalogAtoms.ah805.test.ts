import { describe, expect, it } from "vitest";
import {
  fileTypeBadgeStyle,
  formatDocsListDate,
} from "@/pages/documents/documentsControlCenterHelpers";
import { payAppStatusLabel } from "@/pages/payApplications/payApplicationsPageHelpers";
import { siteMapMono } from "@/components/workpackages/siteMapHelpers";
import { fieldPlanTaskBorderColor } from "@/pages/fieldPlan/fieldPlanStyleHelpers";

describe("residual catalog atoms batch AH", () => {
  it("documents list badge chrome and date format", () => {
    const style = fileTypeBadgeStyle("red", "white");
    expect(style.background).toBe("red");
    expect(style.color).toBe("white");
    expect(style.fontSize).toBe(9);
    expect(style.textTransform).toBe("uppercase");
    expect(formatDocsListDate(null)).toBe("—");
    expect(formatDocsListDate("not-a-date")).toBe("—");
    expect(formatDocsListDate("2026-04-15")).toMatch(/2026/);
  });

  it("pay app status label", () => {
    expect(payAppStatusLabel(null)).toBe("Draft");
    expect(payAppStatusLabel("")).toBe("Draft");
    expect(typeof payAppStatusLabel("submitted")).toBe("string");
  });

  it("site map mono merge and field plan task border colors", () => {
    expect(siteMapMono({ fontSize: 10 }).fontFamily).toBe("var(--font-mono)");
    expect(siteMapMono({ fontSize: 10 }).fontSize).toBe(10);
    expect(fieldPlanTaskBorderColor({ status: "Complete" })).toBe("var(--status-success)");
    expect(fieldPlanTaskBorderColor({ status: "Open", _isBlocked: true })).toBe("var(--status-error)");
    expect(fieldPlanTaskBorderColor({ status: "In Progress" })).toBe("var(--accent)");
    expect(fieldPlanTaskBorderColor({ status: "Open" })).toBe("var(--border-strong)");
  });
});
