import { describe, expect, it } from "vitest";
import { applyOp, OPS, fracLabel } from "../feetInchesCalculatorHelpers";

describe("applyOp", () => {
  it("adds subtracts multiplies divides ticks", () => {
    expect(applyOp(100, OPS.ADD, 50)).toBe(150);
    expect(applyOp(100, OPS.SUB, 40)).toBe(60);
    expect(applyOp(100, OPS.MUL, 2)).toBe(200);
    expect(applyOp(100, OPS.DIV, 2)).toBe(50);
    expect(applyOp(100, OPS.DIV, 0)).toBeNull();
  });

  it("labels fractions", () => {
    expect(fracLabel(16)).toBe("1/16");
  });
});
