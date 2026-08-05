import { describe, expect, it } from "vitest";
import {
  filterVisibleSidebarGroups,
  resolveFavoriteItems,
  resolveRecentItems,
  RAIL_LS_KEY,
  RECENTS_LS_KEY,
  MAX_RECENTS,
  FAVORITES_LS_KEY,
} from "../sidebarNavHelpers";

const groups = [
  {
    label: "Core",
    items: [
      { page: "Projects", name: "Projects" },
      { page: "Hidden", name: "Hidden" },
    ],
  },
];

describe("sidebar nav pure", () => {
  it("filters visible pages", () => {
    const v = filterVisibleSidebarGroups(groups as any, (p) => p !== "Hidden");
    expect(v[0].items.map((i) => i.page)).toEqual(["Projects"]);
  });
  it("resolves favorites and recents", () => {
    const v = filterVisibleSidebarGroups(groups as any, () => true);
    expect(resolveFavoriteItems(v as any, ["Projects"], ["Hidden"]).map((i: any) => i.page)).toEqual([
      "Projects",
      "Hidden",
    ]);
    expect(
      resolveRecentItems(v as any, ["Projects", "Hidden"], "Projects", 3).map((i: any) => i.page),
    ).toEqual(["Hidden"]);
  });
});

describe("sidebar storage keys", () => {
  it("keys and max recents", () => {
    expect(RAIL_LS_KEY).toContain("sidebar-rail");
    expect(RECENTS_LS_KEY).toContain("recents");
    expect(MAX_RECENTS).toBe(4);
    expect(FAVORITES_LS_KEY).toContain("favorites");
  });
});
