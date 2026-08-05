import { describe, expect, it } from "vitest";
import { MODEL_ELEMENT_HEADER_ALIASES } from "@/lib/importModelElementsHelpers";
import {
  RFI_AGENDA_URGENCY_RANK,
  RFI_AGENDA_GROUP_LABEL,
  RFI_AGENDA_URGENCIES,
  FEED_SORT_URGENCY_RANK,
  FEED_AGG_URGENCY_RANK,
} from "@/lib/commandCenter/commandCenterCatalogHelpers";
import { STATUS_THRESHOLDS } from "@/lib/drawingHub/statusEngineHelpers";
import { defaultFeedSort, URGENCY_LABELS } from "@/lib/commandCenter/sortLogic";

describe("residual catalog atoms batch N", () => {
  it("model element header aliases", () => {
    expect(MODEL_ELEMENT_HEADER_ALIASES.piece_mark).toContain("mark");
    expect(MODEL_ELEMENT_HEADER_ALIASES.element_guid).toContain("guid");
    expect(MODEL_ELEMENT_HEADER_ALIASES.drawing_no).toContain("sheet");
  });

  it("command center urgency catalogs", () => {
    expect(RFI_AGENDA_URGENCY_RANK.overdue).toBe(0);
    expect(RFI_AGENDA_GROUP_LABEL["due-soon"]).toBe("Due Soon");
    expect(RFI_AGENDA_URGENCIES.has("blocking")).toBe(true);
    expect(FEED_SORT_URGENCY_RANK.normal).toBe(4);
    expect(FEED_AGG_URGENCY_RANK.overdue).toBe(5);
    expect(URGENCY_LABELS.overdue).toBe("Overdue");
    // sort: overdue before normal
    expect(
      defaultFeedSort({ urgency: "overdue", daysValue: 1 }, { urgency: "normal", daysValue: 99 }),
    ).toBeLessThan(0);
  });

  it("status engine thresholds", () => {
    expect(STATUS_THRESHOLDS.RFI_DUE_SOON_DAYS).toBe(3);
    expect(STATUS_THRESHOLDS.DELIVERY_DUE_SOON_DAYS).toBe(2);
    expect(STATUS_THRESHOLDS.AI_WARN_CONFIDENCE).toBe(0.8);
  });
});
