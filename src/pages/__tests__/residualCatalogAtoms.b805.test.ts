import { describe, expect, it } from "vitest";
import {
  STATUS_COLOR,
  ANGLE_MODES,
  ANGLE_PRESETS,
  PICK_TAPE_KEY,
  cardStyle,
} from "../cranePickCalculator/cranePickCalculatorHelpers";
import { SOV_STATUS_COLORS } from "../financials/drawerHelpers";
import {
  DMS_FILTER_CATEGORIES,
  DMS_FILTER_DISCIPLINES,
  DMS_FILTER_STATUSES,
} from "@/components/dms/documentFiltersHelpers";
import { TASK_LIST_GRID } from "@/components/schedule/scheduleTaskListHelpers";
import { PROCUREMENT_LIST_GRID } from "../procurement/format";
import {
  IFC_HIGHLIGHT_HEX,
  IFC_MEASURE_COLOR,
} from "@/components/viewer3d/ifcModelViewerHelpers";
import {
  ALERT_SEVERITY_FILTERS,
  alertFilterBtnActive,
} from "../alertsCenter/alertsCenterPageHelpers";
import {
  SCOPE_TYPE_COLORS,
  scopeChipBtnStyle,
} from "../scopeExclusions/scopeExclusionsHelpers";
import { SUBPROCESSORS } from "../legal/subprocessorsHelpers";

describe("residual catalog atoms batch B", () => {
  it("crane pick catalogs", () => {
    expect(PICK_TAPE_KEY).toContain("crane");
    expect(STATUS_COLOR.red).toContain("error");
    expect(ANGLE_MODES.DEGREES).toBe("degrees");
    expect(ANGLE_PRESETS).toEqual([30, 45, 60, 90]);
    expect(cardStyle.borderRadius).toBe(8);
  });

  it("financials SOV status colors", () => {
    expect(SOV_STATUS_COLORS.Paid).toBe("var(--status-success)");
  });

  it("dms filter catalogs", () => {
    expect(DMS_FILTER_CATEGORIES).toContain("Blueprint");
    expect(DMS_FILTER_DISCIPLINES).toContain("Structural");
    expect(DMS_FILTER_STATUSES).toContain("Approved");
  });

  it("schedule and procurement grids", () => {
    expect(TASK_LIST_GRID.split(" ")).toHaveLength(9);
    expect(PROCUREMENT_LIST_GRID.split(" ")).toHaveLength(10);
  });

  it("ifc highlight tokens", () => {
    expect(IFC_HIGHLIGHT_HEX).toBe("#f5d90a");
    expect(IFC_MEASURE_COLOR).toBe(0xf5d90a);
  });

  it("alerts severity filters and styles", () => {
    expect(ALERT_SEVERITY_FILTERS).toContain("Critical");
    expect(alertFilterBtnActive.background).toBe("var(--accent-muted)");
  });

  it("scope type colors and chip style", () => {
    expect(SCOPE_TYPE_COLORS.Exclusion).toBe("var(--status-error)");
    expect(scopeChipBtnStyle.fontSize).toBe(10);
  });

  it("subprocessors catalog", () => {
    expect(SUBPROCESSORS.length).toBeGreaterThanOrEqual(4);
    expect(SUBPROCESSORS[0].name).toBe("Supabase");
    expect(SUBPROCESSORS.every((s) => s.purpose && s.region)).toBe(true);
  });
});
