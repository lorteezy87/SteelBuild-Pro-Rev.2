import { describe, expect, it } from "vitest";
import { calcEVM } from "../projectKpis";
import { calculateEarnedValue, type EarnedValueWorkPackage } from "../earnedValue";

const workPackage = (actual: number, complete = 50): EarnedValueWorkPackage => ({
  budgeted_labor_value: 60000,
  budgeted_material_value: 40000,
  actual_labor_cost_to_date: actual,
  actual_material_cost_to_date: 0,
  percent_complete: complete,
});

describe("earned-value performance indices", () => {
  it("requires twice the remaining efficiency when 75% of budget earned 50% of scope", () => {
    const result = calcEVM([workPackage(75000)]);
    expect(result).toMatchObject({ bac: 100000, ev: 50000, ac: 75000, tcpi: 2, eac: 150000, vac: -50000 });
    expect(result.cpi).toBeCloseTo(2 / 3);
  });

  it("reports lower required efficiency when remaining budget exceeds remaining work", () => {
    expect(calcEVM([workPackage(25000)]).tcpi).toBeCloseTo(2 / 3);
  });

  it.each([100000, 120000])("does not report an achievable TCPI after spending %s of the budget", (actual) => {
    expect(calcEVM([workPackage(actual)]).tcpi).toBeNull();
  });

  it("has no to-complete requirement when all budgeted work is earned", () => {
    expect(calcEVM([workPackage(100000, 100)]).tcpi).toBeNull();
  });

  it("does not invent SPI from the completion percentage when planned value is unavailable", () => {
    expect(calcEVM([workPackage(50000)]).spi).toBeNull();
    expect(calculateEarnedValue([workPackage(50000)], undefined, null).spi).toBeNull();
  });

  it("compares earned value with explicit planned value for on-time, ahead and late work", () => {
    const packages = [workPackage(50000)];
    expect(calcEVM(packages, undefined, 50000).spi).toBe(1);
    expect(calcEVM(packages, undefined, 40000).spi).toBe(1.25);
    expect(calcEVM(packages, undefined, 62500).spi).toBe(0.8);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("does not divide by invalid planned value %s", (plannedValue) => {
    expect(calculateEarnedValue([workPackage(50000)], undefined, plannedValue).spi).toBeNull();
  });

  it("preserves the existing budget override and empty-input contract", () => {
    expect(calcEVM([], 5000)).toMatchObject({ bac: 5000, ev: 0, ac: 0, cpi: null, spi: null, tcpi: 1, eac: 5000, vac: 0 });
    expect(calcEVM([])).toMatchObject({ bac: 0, ev: 0, ac: 0, cpi: null, spi: null, tcpi: null });
  });
});
