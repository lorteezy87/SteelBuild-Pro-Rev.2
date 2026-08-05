
import { describe, expect, it } from "vitest";
import { filterQuickNavModules, buildSearchDisplayItems } from "../globalSearchHelpers";

const NAV = [
  { name: "Projects", page: "Projects", group: "Core" },
  { name: "Drawings", page: "Drawings", group: "Docs" },
];

describe("filterQuickNavModules", () => {
  it("returns all when empty query", () => {
    expect(filterQuickNavModules(NAV, "")).toHaveLength(2);
  });
  it("filters by name under 2 chars", () => {
    expect(filterQuickNavModules(NAV, "p").map((m) => m.name)).toEqual(["Projects"]);
  });
  it("clears modules when query length >= 2", () => {
    expect(filterQuickNavModules(NAV, "pr")).toEqual([]);
  });
});

describe("buildSearchDisplayItems", () => {
  it("prefers search results", () => {
    const results = [{ id: "1", title: "Hit" }];
    expect(buildSearchDisplayItems(results as any, NAV)).toEqual(results);
  });
  it("maps modules when no results", () => {
    const items = buildSearchDisplayItems([], NAV) as any[];
    expect(items[0]).toMatchObject({ type: "Module", title: "Projects", page: "Projects" });
  });
});
