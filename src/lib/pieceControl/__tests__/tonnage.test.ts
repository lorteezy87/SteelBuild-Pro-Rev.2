import { describe, expect, it } from "vitest";
import { pieceTotalWeightLbs, pieceTons, sumPieceTons } from "../tonnage";

describe("piece weight and tonnage helpers", () => {
  it("uses total weight when it agrees with each × quantity", () => {
    expect(pieceTotalWeightLbs({ weight_each_lbs: 4, weight_total_lbs: 80, quantity: 20 })).toBe(80);
    expect(pieceTons({ weight_each_lbs: 4, weight_total_lbs: 80, quantity: 20 })).toBe(0.04);
  });

  it("prefers each × quantity when total weight conflicts", () => {
    expect(pieceTotalWeightLbs({ weight_each_lbs: 5, weight_total_lbs: 80, quantity: 20 })).toBe(100);
  });

  it("falls back to each-weight × quantity", () => {
    expect(pieceTotalWeightLbs({ weight_each_lbs: 12.5, quantity: 4 })).toBe(50);
    expect(pieceTons({ weight_each_lbs: 12.5, quantity: 4 })).toBe(0.025);
  });

  it("returns null for missing/invalid weight data", () => {
    expect(pieceTotalWeightLbs({ weight_each_lbs: 12.5, quantity: null })).toBeNull();
    expect(pieceTons({ weight_each_lbs: null, quantity: 1 })).toBeNull();
    expect(pieceTons({ weight_each_lbs: Infinity, quantity: 3 })).toBeNull();
  });

  it("sums known tonnage and ignores unknown rows", () => {
    expect(
      sumPieceTons([
        { weight_total_lbs: 2200 },
        { weight_each_lbs: 10, quantity: 2 },
        { weight_each_lbs: null, quantity: 3 },
      ]),
    ).toBe(1.11);
  });
});
