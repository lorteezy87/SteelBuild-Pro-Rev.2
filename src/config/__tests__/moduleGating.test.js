import { describe, it, expect } from "vitest";
import {
  gateFlagForPage,
  isGatedPage,
  PAGE_TO_GATE,
  MODULE_GATES,
} from "../moduleGating";

describe("moduleGating", () => {
  it("leaves core detailing/schedule/field pages un-gated", () => {
    for (const page of [
      "Dashboard",
      "DrawingSubmittalHub",
      "Drawings",
      "RFIs",
      "WorkPackages",
      "ScheduleHub",
      "FieldToday",
      "Settings",
    ]) {
      expect(isGatedPage(page)).toBe(false);
      expect(gateFlagForPage(page)).toBeNull();
    }
  });

  it("maps cost pages to module_cost", () => {
    expect(gateFlagForPage("CostHub")).toBe("module_cost");
    expect(gateFlagForPage("ChangeOrders")).toBe("module_cost");
    expect(isGatedPage("SOV")).toBe(true);
  });

  it("builds a reverse PAGE_TO_GATE without collisions", () => {
    const pages = Object.values(MODULE_GATES).flat();
    expect(Object.keys(PAGE_TO_GATE).sort()).toEqual([...new Set(pages)].sort());
  });
});
