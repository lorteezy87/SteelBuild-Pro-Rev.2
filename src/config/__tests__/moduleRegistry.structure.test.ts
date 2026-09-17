import { describe, expect, it } from "vitest";
import { PRIMARY_TABS, SIDEBAR_GROUPS } from "@/config/moduleRegistry";

const labels = SIDEBAR_GROUPS.map((group) => group.label);

describe("SteelBuild navigation hierarchy", () => {
  it("uses the approved operating hierarchy", () => {
    expect(labels.slice(0, 7)).toEqual([
      "COMMAND",
      "PROJECTS",
      "DETAILING",
      "PRODUCTION",
      "FIELD",
      "COMMERCIAL",
      "REPORTS",
    ]);
  });

  it("keeps core project routes reachable", () => {
    const pages = new Set(SIDEBAR_GROUPS.flatMap((group) => group.items.map((item) => item.page)));
    [
      "Dashboard",
      "CommandCenter",
      "RFIs",
      "DrawingSubmittalHub",
      "WorkPackages",
      "PieceRegister",
      "Deliveries",
      "FieldHub",
      "CostHub",
      "ReportsHub",
    ].forEach((page) => expect(pages.has(page)).toBe(true));
  });

  it("keeps every primary tab non-empty", () => {
    expect(PRIMARY_TABS.every((tab) => tab.pages.length > 0)).toBe(true);
  });
});
