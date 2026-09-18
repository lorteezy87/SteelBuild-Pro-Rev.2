import { describe, expect, it } from "vitest";
import { PRIMARY_TABS, SIDEBAR_GROUPS } from "@/config/moduleRegistry";

type NavItem = { page: string };
type NavGroup = { label: string; items: NavItem[] };
type PrimaryTab = { pages: string[] };

const sidebarGroups = SIDEBAR_GROUPS as NavGroup[];
const primaryTabs = PRIMARY_TABS as PrimaryTab[];
const labels = sidebarGroups.map((group) => group.label);

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
    const pages = new Set(sidebarGroups.flatMap((group) => group.items.map((item) => item.page)));
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
    expect(primaryTabs.every((tab) => tab.pages.length > 0)).toBe(true);
  });
});
