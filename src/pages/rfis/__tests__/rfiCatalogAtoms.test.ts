import { describe, expect, it } from "vitest";
import { RFI_STAGE_INDEX, RFI_DETAIL_STAGES } from "../rfiDetailModalHelpers";
import { RFI_LIST_GRID_COLS, RFI_LIST_ACTION_BTN } from "../listViewHelpers";
import { RFI_STATUS_FILTERS } from "../rfiFilterToolbarHelpers";
import { RFI_AGING_ROWS } from "../leftSidebarHelpers";
import { CONFIDENCE_COLOR } from "@/components/design-system/kpiTileHelpers";
import { CHEVRON_PHASE_MAP } from "@/components/design-system/phaseChevronHelpers";
import { AI_STATUS_META } from "@/components/drawings/drawingsTableChromeHelpers";
import { COST_CHART_LEGEND_STYLE } from "@/pages/costHub/costControlCenterHelpers";
import {
  PRODUCTION_IMPORT_ACCENT,
  PRODUCTION_IMPORT_MONO,
} from "@/components/production/productionStatusImportModalHelpers";
import { DEFAULT_HERO_PHOTO } from "@/components/command/pageHeroHelpers";

describe("rfi + design pure catalogs", () => {
  it("rfi stage index and detail stages", () => {
    expect(RFI_STAGE_INDEX.Open).toBe(0);
    expect(RFI_STAGE_INDEX.Closed).toBe(4);
    expect(RFI_DETAIL_STAGES).toHaveLength(5);
  });
  it("list grid and action btn", () => {
    expect(RFI_LIST_GRID_COLS.split(" ")).toHaveLength(10);
    expect(RFI_LIST_ACTION_BTN.fontSize).toBe(8);
  });
  it("filters and aging", () => {
    expect(RFI_STATUS_FILTERS[0][0]).toBe("all");
    expect(RFI_AGING_ROWS.map((r) => r.key)).toEqual(["fresh", "aging", "stale", "critical"]);
  });
  it("design and chrome tokens", () => {
    expect(CONFIDENCE_COLOR.high).toContain("success");
    expect(CHEVRON_PHASE_MAP.FAB).toBe("Fabrication");
    expect(AI_STATUS_META.Pending.label).toBe("QUEUED");
    expect(COST_CHART_LEGEND_STYLE.fontSize).toBe(9);
    expect(PRODUCTION_IMPORT_ACCENT).toContain("accent");
    expect(PRODUCTION_IMPORT_MONO.fontFamily).toContain("mono");
    expect(DEFAULT_HERO_PHOTO).toContain("hero");
  });
});
