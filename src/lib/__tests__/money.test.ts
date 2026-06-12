import { describe, expect, it } from "vitest";
import {
  addMoney,
  clampPercent,
  formatMoney,
  moneyEquals,
  pctOf,
  percentComplete,
  subMoney,
  sumMoney,
  toCents,
  toDollars,
  valueAtPercent,
} from "../money";

describe("toCents / toDollars", () => {
  it("rounds half-up at the cent and round-trips", () => {
    expect(toCents(12.345)).toBe(1235);
    expect(toCents("0.005")).toBe(1); // 0.5 cent → 1
    expect(toDollars(1235)).toBe(12.35);
    expect(toCents(null)).toBe(0);
    expect(toCents("abc")).toBe(0);
  });
});

describe("sumMoney (no float drift)", () => {
  it("0.1 + 0.2 sums to exactly 0.30", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the float trap this guards against
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });
  it("sums many lines without penny drift", () => {
    expect(sumMoney(Array(10).fill(0.1))).toBe(1);
    expect(sumMoney([100.01, 200.02, 50.5, null, "25.25"])).toBe(375.78);
  });
});

describe("addMoney / subMoney", () => {
  it("are exact via cents", () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(subMoney(1000.0, 333.33)).toBe(666.67);
  });
});

describe("pctOf (retainage)", () => {
  it("computes percent of an amount to the cent", () => {
    expect(pctOf(10000, 10)).toBe(1000);
    expect(pctOf(1234.56, 5)).toBe(61.73); // 61.728 → 61.73
    expect(pctOf(0, 10)).toBe(0);
  });
});

describe("valueAtPercent / percentComplete (inverse)", () => {
  it("valueAtPercent is scheduled × percent", () => {
    expect(valueAtPercent(50000, 40)).toBe(20000);
    expect(valueAtPercent(1000, 33.333)).toBe(333.33);
  });
  it("percentComplete is completed ÷ scheduled, 0 when scheduled is 0", () => {
    expect(percentComplete(20000, 50000)).toBe(40);
    expect(percentComplete(100, 0)).toBe(0);
    expect(percentComplete(333.33, 1000)).toBe(33.333);
  });
});

describe("clampPercent / moneyEquals / formatMoney", () => {
  it("clamps to [0,100]", () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(42.5)).toBe(42.5);
  });
  it("moneyEquals compares to the cent", () => {
    expect(moneyEquals(0.1 + 0.2, 0.3)).toBe(true);
    expect(moneyEquals(1.0, 1.004)).toBe(true); // both round to 100 cents
    expect(moneyEquals(1.0, 1.01)).toBe(false);
  });
  it("formats with thousands + 2dp, accounting negatives", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatMoney(-99.9, { accounting: true })).toBe("($99.90)");
    expect(formatMoney(null)).toBe("$0.00");
  });
});
