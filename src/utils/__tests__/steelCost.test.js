import { describe, it, expect } from "vitest";
import { pieceCost, rollupCost, COST_UNITS } from "../steelCost";

describe("COST_UNITS", () => {
  it("exports the three standard pricing units in order", () => {
    expect(COST_UNITS).toEqual(["/lb", "/cwt", "/ton"]);
  });
});

describe("pieceCost", () => {
  it("calculates cost at /lb rate", () => {
    expect(pieceCost(1000, 0.85, "/lb")).toBeCloseTo(850);
  });

  it("calculates cost at /cwt rate (cwt = 100 lb)", () => {
    expect(pieceCost(1000, 65, "/cwt")).toBeCloseTo(650);
  });

  it("calculates cost at /ton rate (ton = 2000 lb)", () => {
    expect(pieceCost(1000, 1200, "/ton")).toBeCloseTo(600);
  });

  it("returns 0 when rate is 0", () => {
    expect(pieceCost(1000, 0, "/lb")).toBe(0);
  });

  it("returns 0 when weight is 0", () => {
    expect(pieceCost(0, 0.85, "/lb")).toBe(0);
  });

  it("returns 0 when rate is NaN", () => {
    expect(pieceCost(1000, NaN, "/lb")).toBe(0);
  });
});

describe("rollupCost", () => {
  it("sums the cost fields of each row", () => {
    expect(rollupCost([{ cost: 850 }, { cost: 600 }, { cost: 0 }])).toBeCloseTo(1450);
  });

  it("returns 0 for an empty array", () => {
    expect(rollupCost([])).toBe(0);
  });
});
