import { describe, expect, it } from "vitest";
import { formatLbs } from "@/components/deliveries/shippingTicketImportModalHelpers";
import { resolveLabelPlacement } from "@/components/schedule/scheduleGanttHelpers";
import {
  readinessTone,
  topBlockerLabel,
  formatFabTons,
} from "@/pages/fabRelease/fabReleasePageHelpers";
import {
  isShipDateOverdue,
  shipDateCellStyle,
  formatShipDateLabel,
} from "@/pages/productionStatus/productionStatusControlCenterHelpers";
import {
  vendorExpiryTone,
  vendorExpiryCellStyle,
  formatVendorExpiryLabel,
} from "@/pages/vendors/vendorsPageHelpers";
import {
  needByTone,
  needByCellStyle,
  formatNeedByLabel,
} from "@/pages/procurement/procurementControlCenterHelpers";

describe("residual catalog atoms batch AJ", () => {
  it("formatLbs and gantt label placement", () => {
    expect(formatLbs(null)).toBe("—");
    expect(formatLbs(1200)).toMatch(/#$/);
    expect(formatLbs("x")).toBe("x");
    expect(resolveLabelPlacement("AB", 200)).toBe("inside");
    expect(resolveLabelPlacement("Very Long Task Name Here", 20)).toBe("outside");
  });

  it("fab readiness tone, blocker label, tons", () => {
    expect(readinessTone(90)).toBe("good");
    expect(readinessTone(60)).toBe("warn");
    expect(readinessTone(10)).toBe("danger");
    expect(
      topBlockerLabel({
        _signals: { flags: [{ severity: "high", label: "Missing IFC" }] },
      }),
    ).toBe("Missing IFC");
    expect(topBlockerLabel({ _signals: { flags: [] } })).toBe("-");
    expect(formatFabTons(12.34)).toBe("12.3T");
    expect(formatFabTons(0)).toBe("-");
  });

  it("production ship date and vendor expiry pure", () => {
    expect(isShipDateOverdue("Fabricating", "2020-01-01", "2026-01-01")).toBe(true);
    expect(isShipDateOverdue("Shipped", "2020-01-01", "2026-01-01")).toBe(false);
    expect(formatShipDateLabel("2020-01-01", true)).toContain("late");
    expect(shipDateCellStyle(true).color).toBe("var(--cmd-danger)");
    expect(vendorExpiryTone(-1)).toBe("expired");
    expect(vendorExpiryTone(10)).toBe("soon");
    expect(vendorExpiryTone(90)).toBe("ok");
    expect(vendorExpiryCellStyle("expired")?.color).toBe("var(--status-error)");
    expect(formatVendorExpiryLabel("Jan 1", -5, "expired")).toContain("expired");
  });

  it("procurement need-by pure tone/style/label", () => {
    const overdue = (item: any) => Boolean(item.overdue);
    const daysUntil = (d: string) => (d === "soon" ? 3 : 20);
    expect(needByTone({ required_date: null }, overdue, daysUntil)).toBe("none");
    expect(needByTone({ required_date: "x", overdue: true }, overdue, daysUntil)).toBe("overdue");
    expect(needByTone({ required_date: "soon" }, overdue, daysUntil)).toBe("soon");
    expect(needByCellStyle("overdue").color).toBe("var(--status-error)");
    expect(formatNeedByLabel("2026-01-01", "overdue", 5)).toContain("late");
    expect(formatNeedByLabel(null, "none", 0)).toBe("No date");
  });
});
