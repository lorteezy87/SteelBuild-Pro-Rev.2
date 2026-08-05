import { describe, expect, it } from "vitest";
import { groupProcurementByCategory, sumWeightTons, sortWorkPackagesByNumber } from "../format";

describe("groupProcurementByCategory", () => {
  it("buckets by category, defaults Other, sorts keys", () => {
    const items = [
      { id: "1", procurement_category: "Bolts" },
      { id: "2", procurement_category: null },
      { id: "3", procurement_category: "Bolts" },
      { id: "4", procurement_category: "Angles" },
    ];
    const groups = groupProcurementByCategory(items);
    expect(groups.map(([k]) => k)).toEqual(["Angles", "Bolts", "Other"]);
    expect(groups.find(([k]) => k === "Bolts")?.[1].map((r) => r.id)).toEqual(["1", "3"]);
    expect(groups.find(([k]) => k === "Other")?.[1].map((r) => r.id)).toEqual(["2"]);
  });

  it("handles empty", () => {
    expect(groupProcurementByCategory([])).toEqual([]);
  });
});

describe("sumWeightTons", () => {
  it("sums numeric weight_tons", () => {
    expect(sumWeightTons([{ weight_tons: 1.5 }, { weight_tons: "2" }, { weight_tons: null }])).toBe(3.5);
    expect(sumWeightTons([])).toBe(0);
  });
});

describe("sortWorkPackagesByNumber", () => {
  it("sorts by wp_number string", () => {
    const wps = [{ wp_number: "10" }, { wp_number: "2" }, { wp_number: "1" }];
    expect(sortWorkPackagesByNumber(wps).map((w) => w.wp_number)).toEqual(["1", "10", "2"]);
  });
});
