import { describe, expect, it } from "vitest";
import {
  OPS,
  applyOp,
  formatNumber,
  computeDisplay,
  computeAux,
  parseEntryString,
  createInitialCalcState,
  applyDigit,
  applyBinaryOp,
  applyEquals,
  applyClearAll,
  applyClearEntry,
  applyBackspace,
  applyToggleSign,
  applyPercent,
  applyReciprocal,
  applySquare,
  applySqrt,
  displayedValue,
  applyMemoryRecall,
  applyTapeRecall,
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

  it("digit entry and post-equals restart", () => {
    let s = createInitialCalcState();
    s = applyDigit(s, "1");
    s = applyDigit(s, "2");
    expect(s.entry).toBe("12");
    s = applyDigit(s, ".");
    s = applyDigit(s, "5");
    expect(s.entry).toBe("12.5");
    // second decimal ignored
    expect(applyDigit(s, ".").entry).toBe("12.5");
    // replace leading zero
    s = createInitialCalcState();
    s = applyDigit(s, "0");
    s = applyDigit(s, "7");
    expect(s.entry).toBe("7");
    // after equals, digit starts fresh
    s = { accum: 99, pendingOp: null, entry: "", justEvaluated: true };
    s = applyDigit(s, "3");
    expect(s).toEqual({ accum: 0, pendingOp: null, entry: "3", justEvaluated: false });
    s = { accum: 99, pendingOp: null, entry: "", justEvaluated: true };
    s = applyDigit(s, ".");
    expect(s.entry).toBe("0.");
  });

  it("binary ops, equals, and divide-by-zero", () => {
    let s = createInitialCalcState();
    s = applyDigit(s, "8");
    let step = applyBinaryOp(s, OPS.DIV);
    s = step.state;
    s = applyDigit(s, "0");
    step = applyEquals(s);
    expect(step.error).toBe("divide_by_zero");
    expect(step.state.entry).toBe("0");

    s = createInitialCalcState();
    s = applyDigit(s, "6");
    step = applyBinaryOp(s, OPS.MUL);
    expect(step.tape).toBeUndefined();
    s = step.state;
    s = applyDigit(s, "7");
    step = applyEquals(s);
    expect(step.state.accum).toBe(42);
    expect(step.state.justEvaluated).toBe(true);
    expect(step.tape?.value).toBe(42);
    expect(step.tape?.expr).toContain("×");
  });

  it("chain ops record intermediate tape", () => {
    let s = createInitialCalcState();
    s = applyDigit(s, "2");
    s = applyBinaryOp(s, OPS.ADD).state;
    s = applyDigit(s, "3");
    const step = applyBinaryOp(s, OPS.ADD);
    expect(step.tape?.value).toBe(5);
    expect(step.state.accum).toBe(5);
    expect(step.state.pendingOp).toBe(OPS.ADD);
    expect(step.state.entry).toBe("");
  });

  it("clear / backspace / sign / percent / unary", () => {
    let s = { accum: 10, pendingOp: OPS.ADD, entry: "5", justEvaluated: false };
    expect(applyClearEntry(s).entry).toBe("");
    expect(applyClearAll(s)).toEqual(createInitialCalcState());

    s = { accum: 0, pendingOp: null, entry: "123", justEvaluated: false };
    expect(applyBackspace(s).entry).toBe("12");
    s = { accum: 1234, pendingOp: null, entry: "", justEvaluated: false };
    expect(applyBackspace(s).accum).toBe(123);

    s = { accum: 5, pendingOp: null, entry: "9", justEvaluated: false };
    expect(applyToggleSign(s).entry).toBe("-9");
    expect(applyToggleSign(applyToggleSign(s)).entry).toBe("9");
    s = { accum: 5, pendingOp: null, entry: "", justEvaluated: false };
    expect(applyToggleSign(s).accum).toBe(-5);

    s = { accum: 200, pendingOp: OPS.ADD, entry: "10", justEvaluated: false };
    expect(applyPercent(s).entry).toBe("20"); // 200 * 10 / 100
    s = { accum: 50, pendingOp: null, entry: "", justEvaluated: false };
    expect(applyPercent(s).accum).toBe(0.5);

    s = { accum: 4, pendingOp: null, entry: "", justEvaluated: false };
    expect(applySquare(s).accum).toBe(16);
    expect(applySqrt(s).state.accum).toBe(2);
    expect(applySqrt({ ...s, accum: -1 }).error).toBe("sqrt_negative");
    expect(applyReciprocal(s).state.accum).toBe(0.25);
    expect(applyReciprocal({ ...s, accum: 0 }).error).toBe("divide_by_zero");
  });

  it("memory/tape helpers", () => {
    const s = { accum: 10, pendingOp: null, entry: "3", justEvaluated: true };
    expect(displayedValue(s)).toBe(3);
    expect(displayedValue({ ...s, entry: "" })).toBe(10);
    expect(applyMemoryRecall(s, 99)).toEqual({
      accum: 10,
      pendingOp: null,
      entry: "99",
      justEvaluated: false,
    });
    expect(applyTapeRecall(s, { value: 7 }).entry).toBe("7");
    expect(applyTapeRecall(s, 8).entry).toBe("8");
  });
});
