import { describe, expect, it } from "vitest";
import {
  DOCUMENTS_LIST_GRID,
  DOCUMENTS_SORTABLE_COLUMNS,
} from "../documents/listViewHelpers";
import {
  EMPTY_BACKCHARGE_FORM,
  EMPTY_TM_TICKET,
  BACKCHARGE_BTN_PRIMARY_STYLE,
  bcMono,
} from "../backcharges/backchargesUiHelpers";
import {
  CONSTRAINT_FILTER_STATUS_OPTIONS,
  CONSTRAINT_FORM_STATUS_OPTIONS,
  CONSTRAINT_ACTION_TONES,
  CONSTRAINT_MINI_TONES,
} from "../constraints/constraintsChromeHelpers";
import { RFI_ROW_GRID } from "../rfis/rfiRowHelpers";
import { FINANCIALS_VIEW_TABS } from "../financials/filterBarHelpers";
import { STOCK_PRESETS } from "../feetInchesCalculator/feetInchesCalculatorHelpers";
import {
  DECIMAL_MODES,
  SUB_MODES,
  SUB_MODE_TABS,
  COMMON_FRACTIONS,
} from "../decimalFractionConverter/decimalFractionConverterHelpers";
import { CO_ROW_GRID } from "../changeOrders/coRowHelpers";
import { STATUS_PILL_TONES } from "@/components/desktop/module/statusPillHelpers";

describe("residual catalog atoms", () => {
  it("documents list grid and sortable columns", () => {
    expect(DOCUMENTS_LIST_GRID.split(" ")).toHaveLength(8);
    expect(DOCUMENTS_SORTABLE_COLUMNS).toHaveLength(7);
    expect(DOCUMENTS_SORTABLE_COLUMNS[0].sort).toBe("name-asc");
  });

  it("backcharge empties and styles", () => {
    expect(EMPTY_BACKCHARGE_FORM.status).toBe("draft");
    expect(EMPTY_TM_TICKET.labor_hours).toBe("");
    expect(BACKCHARGE_BTN_PRIMARY_STYLE.color).toBe("var(--accent)");
    expect(bcMono.fontFamily).toContain("mono");
  });

  it("constraints chrome catalogs", () => {
    expect(CONSTRAINT_FILTER_STATUS_OPTIONS).toContain("open");
    expect(CONSTRAINT_FORM_STATUS_OPTIONS).toContain("Open");
    expect(CONSTRAINT_ACTION_TONES.success.color).toBe("var(--status-success)");
    expect(CONSTRAINT_MINI_TONES.muted.border).toBe("var(--border-default)");
  });

  it("rfi and co row grids", () => {
    expect(RFI_ROW_GRID.match(/minmax/g)?.length).toBe(5);
    expect(CO_ROW_GRID.split(" ")).toHaveLength(10);
  });

  it("financials view tabs", () => {
    expect(FINANCIALS_VIEW_TABS.map((t) => t.key)).toEqual([
      "summary",
      "sov",
      "budget",
      "unmapped",
    ]);
  });

  it("feet stock presets", () => {
    expect(STOCK_PRESETS).toHaveLength(3);
    expect(STOCK_PRESETS[0].label).toBe("20'");
    expect(STOCK_PRESETS[1].ticks).toBeGreaterThan(STOCK_PRESETS[0].ticks);
  });

  it("decimal fraction catalogs", () => {
    expect(DECIMAL_MODES.FEET).toBe("feet");
    expect(SUB_MODES.UNITS).toBe("units");
    expect(SUB_MODE_TABS).toHaveLength(3);
    expect(COMMON_FRACTIONS).toHaveLength(16);
    expect(COMMON_FRACTIONS[1]).toEqual({ num: 1, den: 16 });
  });

  it("status pill tones", () => {
    expect(STATUS_PILL_TONES.has("open")).toBe(true);
    expect(STATUS_PILL_TONES.has("blocked")).toBe(true);
    expect(STATUS_PILL_TONES.has("neutral")).toBe(false);
  });
});
