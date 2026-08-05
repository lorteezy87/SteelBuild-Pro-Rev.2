import { describe, expect, it } from "vitest";
import {
  OPS,
  applyOp,
  formatNumber,
  computeDisplay,
  computeAux,
  parseEntryString,
} from "../regularCalculatorHelpers";

describe("regularCalculatorHelpers", () => {
  it("ops and format", () => {
    expect(applyOp(3, OPS.ADD, 2)).toBe(5);
    expect(applyOp(3, OPS.SUB, 2)).toBe(1);
    expect(applyOp(3, OPS.MUL, 2)).toBe(6);
    expect(applyOp(6, OPS.DIV, 2)).toBe(3);
    expect(applyOp(1, OPS.DIV, 0)).toBeNull();
    expect(applyOp(1, null, 9)).toBe(9);
    expect(formatNumber(1000000)).toBe("1,000,000");
    expect(formatNumber(1.25)).toBe("1.25");
    expect(formatNumber(Number.NaN)).toBe("—");
  });

  it("display/aux/parse", () => {
    expect(computeDisplay("12", 0)).toBe("12");
    expect(computeDisplay("", 42)).toBe("42");
    expect(computeAux("+", 10, "")).toBe("10 +");
    expect(computeAux(null, 5, "")).toBe("ANS");
    expect(computeAux(null, 0, "")).toBe("");
    expect(parseEntryString("1234.5")).toBe(1234.5);
    expect(parseEntryString("")).toBeNull();
  });
});
