import { describe, expect, it } from "vitest";
import {
  WP_STATUS_COLOR,
  WP_PHASE_COLORS,
  SCHEDULE_STATUS_COLOR,
  DRAWING_STAGE_COLOR,
  RFI_STATUS_COLOR,
  RFI_PRIO_COLOR,
  DELIVERY_STATUS_COLOR,
  CO_STATUS_COLOR,
  WP_TAB_GRID,
  DRAWINGS_TAB_GRID,
  RFIS_TAB_GRID,
} from "@/components/projects/projectDetailViewHelpers";
import { PAY_APP_STATUS_FILTERS } from "../payApplications/payApplicationsPageHelpers";
import { VALID_RELATED_FIELDS } from "@/components/shared/relatedScheduleTasksChipsHelpers";
import {
  DELIVERY_FORM_STATUSES,
  DELIVERY_PHASE_RANK,
  isWorkPackageFabComplete,
} from "@/components/deliveries/deliveryFormModalHelpers";
import { BUTTON_SIZES, BUTTON_VARIANTS } from "@/components/design-system/buttonHelpers";

describe("residual catalog atoms batch C", () => {
  it("project detail status/phase color maps", () => {
    expect(WP_STATUS_COLOR.Complete).toBe("var(--status-success)");
    expect(WP_PHASE_COLORS.Detailing).toBe("#0D9488");
    expect(SCHEDULE_STATUS_COLOR.Delayed).toBe("var(--status-error)");
    expect(DRAWING_STAGE_COLOR.IFC).toBe("var(--status-success)");
    expect(RFI_STATUS_COLOR.Open).toBe("var(--status-warning)");
    expect(RFI_PRIO_COLOR.Critical).toBe("var(--status-error)");
    expect(DELIVERY_STATUS_COLOR.Delivered).toBe("var(--status-success)");
    expect(CO_STATUS_COLOR.Approved).toBe("var(--status-success)");
    expect(WP_TAB_GRID.split(" ")).toHaveLength(6);
    expect(DRAWINGS_TAB_GRID.split(" ")).toHaveLength(5);
    expect(RFIS_TAB_GRID.split(" ")).toHaveLength(5);
  });

  it("pay app status filters", () => {
    expect(PAY_APP_STATUS_FILTERS.map((f) => f.key)).toEqual([
      "all",
      "draft",
      "submitted",
      "approved",
      "paid",
      "void",
    ]);
  });

  it("related schedule fields", () => {
    expect(VALID_RELATED_FIELDS.has("related_rfi_ids")).toBe(true);
    expect(VALID_RELATED_FIELDS.has("related_change_order_ids")).toBe(true);
  });

  it("delivery form pure helpers", () => {
    expect(DELIVERY_FORM_STATUSES).toContain("Delivered");
    expect(DELIVERY_PHASE_RANK.Fabrication).toBe(1);
    expect(isWorkPackageFabComplete(null)).toBe(true);
    expect(isWorkPackageFabComplete({ phase: "Delivery" })).toBe(true);
    expect(isWorkPackageFabComplete({ phase: "Fabrication", status: "Complete" })).toBe(true);
    expect(isWorkPackageFabComplete({ phase: "Fabrication", status: "In Progress" })).toBe(false);
    expect(isWorkPackageFabComplete({ phase: "Detailing" })).toBe(false);
  });

  it("button size and variant tokens", () => {
    expect(BUTTON_SIZES.md.h).toBe(30);
    expect(BUTTON_VARIANTS.primary.fg).toBe("#061018");
    expect(BUTTON_VARIANTS.danger.fg).toBeTruthy();
  });
});
