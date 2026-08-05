import { describe, expect, it } from "vitest";
import {
  REVISION_IMPACT_PANEL_GRID_COLS,
  REVISION_IMPACT_PANEL_COLUMNS,
} from "../revisionImpactPanelHelpers";
import {
  REV_DOWNSTREAM,
  REVISION_IMPACT_BOARD_GRID_COLS,
} from "../revisionImpactBoardHelpers";
import {
  LOOK_AHEAD_PHASE_COLORS,
  LOOK_AHEAD_STATUS_CONFIG,
  EMPTY_LOOK_AHEAD_ITEM,
} from "../../lookAheadSchedule/lookAheadScheduleHelpers";
import {
  NEW_RESOURCE_INPUT_STYLE,
  NEW_RESOURCE_BTN_PRIMARY,
} from "../../resourceScheduling/resourceSchedulingHelpers";
import {
  MARKUP_PDF_LABEL_STYLE,
  MARKUP_PDF_BTN_BASE,
} from "@/components/drawings/exportMarkupPdfHelpers";
import { PHOTO_STRIP_LABEL_STYLE } from "@/components/shared/photoStripUploaderHelpers";
import { MULTI_SELECT_LABEL_STYLE } from "@/components/shared/multiSelectChipsHelpers";

describe("revision/look-ahead/shared layout atoms", () => {
  it("revision impact panel grid and columns", () => {
    expect(REVISION_IMPACT_PANEL_COLUMNS).toHaveLength(8);
    expect(REVISION_IMPACT_PANEL_GRID_COLS.match(/minmax/g)?.length).toBe(8);
  });
  it("revision impact board", () => {
    expect(REV_DOWNSTREAM.critical.label).toBe("In field");
    expect(REVISION_IMPACT_BOARD_GRID_COLS.match(/minmax/g)?.length).toBe(8);
  });
  it("look-ahead catalogs", () => {
    expect(LOOK_AHEAD_PHASE_COLORS.Erection.color).toContain("erection");
    expect(LOOK_AHEAD_STATUS_CONFIG.Complete.icon).toBe("✓");
    expect(EMPTY_LOOK_AHEAD_ITEM.phase).toBe("Erection");
  });
  it("resource and shared styles", () => {
    expect(NEW_RESOURCE_INPUT_STYLE.borderRadius).toBe(6);
    expect(NEW_RESOURCE_BTN_PRIMARY.background).toBe("var(--accent)");
    expect(MARKUP_PDF_LABEL_STYLE.fontSize).toBe(10);
    expect(MARKUP_PDF_BTN_BASE.borderRadius).toBe(2);
    expect(PHOTO_STRIP_LABEL_STYLE.fontSize).toBe("9px");
    expect(MULTI_SELECT_LABEL_STYLE.letterSpacing).toBe("0.10em");
  });
});
