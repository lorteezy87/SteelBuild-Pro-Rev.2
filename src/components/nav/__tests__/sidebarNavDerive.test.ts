import { describe, expect, it } from "vitest";
import {
  collapseAroundActivePage,
  createInitialCollapseState,
  createToggleAllCollapseState,
  deriveFavoriteItems,
  deriveRecentItems,
  filterVisibleSidebarGroups,
  isDashboardSidebarItemActive,
  type SidebarNavGroup,
} from "../sidebarNavDerive";

const groups: SidebarNavGroup[] = [
  {
    label: "OVERVIEW",
    collapsible: false,
    items: [{ label: "Dashboard", page: "Dashboard" }],
  },
  {
    label: "DETAILING",
    collapsible: true,
    items: [{ label: "Detailing", page: "DrawingSubmittalHub" }],
  },
  {
    label: "FIELD",
    collapsible: true,
    items: [
      { label: "Daily Logs", page: "DailyLogs" },
      { label: "Photos", page: "Photos" },
    ],
  },
];

describe("sidebar navigation derivations", () => {
  it("removes gated items and drops groups left empty", () => {
    expect(filterVisibleSidebarGroups(groups, (page) => page !== "Dashboard" && page !== "Photos"))
      .toEqual([
        groups[1],
        { ...groups[2], items: [groups[2].items[0]] },
      ]);
  });

  it("keeps favorites in preference order and ignores unavailable pages", () => {
    expect(deriveFavoriteItems(groups, ["Photos", "Missing", "Dashboard"])).toEqual([
      { ...groups[2].items[1], _group: "FIELD" },
      { ...groups[0].items[0], _group: "OVERVIEW" },
    ]);
  });

  it("filters the current and unavailable pages from recents before applying the limit", () => {
    expect(deriveRecentItems(
      groups,
      ["Photos", "DailyLogs", "Missing", "Dashboard"],
      "DailyLogs",
      2,
    )).toEqual([
      { ...groups[2].items[1], _group: "FIELD" },
      { ...groups[0].items[0], _group: "OVERVIEW" },
    ]);
  });

  it("derives theme defaults and accordion state without changing equivalent state", () => {
    expect(createInitialCollapseState(groups, true)).toEqual({
      DETAILING: true,
      FIELD: true,
    });

    const previous = { DETAILING: true, FIELD: false };
    expect(collapseAroundActivePage(groups, "Photos", previous)).toBe(previous);
    expect(collapseAroundActivePage(groups, "DrawingSubmittalHub", previous)).toEqual({
      DETAILING: false,
      FIELD: true,
    });
    expect(collapseAroundActivePage(groups, "Dashboard", previous)).toEqual({
      DETAILING: true,
      FIELD: true,
    });
  });

  it("toggles every collapsible group based on whether any group is expanded", () => {
    expect(createToggleAllCollapseState(groups, { DETAILING: true, FIELD: true })).toEqual({
      DETAILING: false,
      FIELD: false,
    });
    expect(createToggleAllCollapseState(groups, { DETAILING: true, FIELD: false })).toEqual({
      DETAILING: true,
      FIELD: true,
    });
  });

  it("preserves the dashboard alias for drawing and submittal routes", () => {
    expect(isDashboardSidebarItemActive("DrawingSubmittalHub", "Drawings")).toBe(true);
    expect(isDashboardSidebarItemActive("DrawingSubmittalHub", "Submittals")).toBe(true);
    expect(isDashboardSidebarItemActive("DrawingSubmittalHub", "Documents")).toBe(false);
    expect(isDashboardSidebarItemActive("RFIs", "RFIs")).toBe(true);
  });
});
