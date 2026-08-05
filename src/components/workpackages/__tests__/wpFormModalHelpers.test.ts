import { describe, expect, it } from "vitest";
import {
  buildDrawingSetOptions,
  filterDrawingSetOptions,
  buildLinkedSetGroups,
  hasApprovedLinkedDrawings,
  computeHourBurns,
  buildDrawingIdRecord,
} from "../wpFormModalHelpers";

describe("buildDrawingSetOptions", () => {
  it("groups by set name and puts unassigned last-ish", () => {
    const opts = buildDrawingSetOptions([
      { id: "1", drawing_set_name: "Set B" },
      { id: "2", drawing_set_name: "Set A" },
      { id: "3", drawing_set_name: "" },
      { id: null, drawing_set_name: "Skip" },
    ]);
    expect(opts.map((o) => o.set_name)).toContain("Set A");
    expect(opts.map((o) => o.set_name)).toContain("Unassigned");
    const un = opts.find((o) => o.isUngrouped);
    expect(un?.drawings).toHaveLength(1);
  });
});

describe("filterDrawingSetOptions", () => {
  it("hides fully linked sets and applies search", () => {
    const options = buildDrawingSetOptions([
      { id: "a", drawing_set_name: "Alpha", stage: "IFC" },
      { id: "b", drawing_set_name: "Alpha", stage: "Draft" },
      { id: "c", drawing_set_name: "Beta", stage: "Released" },
    ]);
    const linked = new Set(["a", "b"]);
    const filtered = filterDrawingSetOptions(options, linked, "bet");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].set_name).toBe("Beta");
    expect(filtered[0].approvedCount).toBe(1);
  });
});

describe("buildLinkedSetGroups", () => {
  it("groups linked ids and fills totals from options", () => {
    const drawings = [
      { id: "a", drawing_set_name: "Alpha" },
      { id: "b", drawing_set_name: "Alpha" },
      { id: "c", drawing_set_name: "Beta" },
    ];
    const options = buildDrawingSetOptions(drawings);
    const groups = buildLinkedSetGroups(["a", "c"], drawings, options);
    const alpha = groups.find((g) => g.set_name === "Alpha");
    expect(alpha?.ids).toEqual(["a"]);
    expect(alpha?.total).toBe(2);
  });
});

describe("hasApprovedLinkedDrawings", () => {
  it("detects approved stages among linked", () => {
    const drawings = [
      { id: "a", stage: "Draft" },
      { id: "b", status: "IFC" },
    ];
    expect(hasApprovedLinkedDrawings(["a"], drawings)).toBe(false);
    expect(hasApprovedLinkedDrawings(["b"], drawings)).toBe(true);
  });
});

describe("computeHourBurns", () => {
  it("computes shop/field/total burn percents", () => {
    const r = computeHourBurns({
      shop_hours_budget: 100,
      shop_hours_actual: 50,
      field_hours_budget: 50,
      field_hours_actual: 25,
    });
    expect(r.shopBurn).toBe(50);
    expect(r.fieldBurn).toBe(50);
    expect(r.totalBudget).toBe(150);
    expect(r.totalActual).toBe(75);
    expect(r.totalBurn).toBe(50);
  });

  it("returns 0 burn when budget is 0", () => {
    const r = computeHourBurns({ shop_hours_budget: 0, shop_hours_actual: 10 });
    expect(r.shopBurn).toBe(0);
  });
});

describe("buildDrawingIdRecord", () => {
  it("maps id to row", () => {
    expect(buildDrawingIdRecord([{ id: "x", name: "X" }]).x.name).toBe("X");
  });
});
