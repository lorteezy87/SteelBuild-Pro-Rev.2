import { describe, expect, it } from "vitest";
import {
  OPS,
  computeFeetInchesCommit,
  createEmptyFeetInchesState,
} from "../feetInchesCalculatorHelpers";

const formatLength = (ticks: number) => `${ticks}t`;

describe("computeFeetInchesCommit", () => {
  it("loads first value", () => {
    const r = computeFeetInchesCommit({
      entry: "12",
      mulDivMode: true,
      accum: 0,
      pendingOp: null,
      precision: 16,
      nextOp: OPS.ADD,
      formatLength: (t) => formatLength(t),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nextAccum).toBe(12);
    expect(r.pendingOp).toBe(OPS.ADD);
    expect(r.mulDivMode).toBe(false);
    expect(r.tape?.expr).toBe("load");
  });

  it("applies pending op and records tape", () => {
    const r = computeFeetInchesCommit({
      entry: "3",
      mulDivMode: true,
      accum: 10,
      pendingOp: OPS.ADD,
      precision: 16,
      nextOp: null,
      formatLength: (t) => formatLength(t),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nextAccum).toBe(13);
    expect(r.pendingOp).toBeNull();
    expect(r.tape?.expr).toContain("+");
  });

  it("errors on bad parse and divide by zero", () => {
    expect(
      computeFeetInchesCommit({
        entry: "not-a-length",
        mulDivMode: false,
        accum: 0,
        pendingOp: null,
        precision: 16,
        nextOp: null,
        formatLength: (t) => formatLength(t),
      }).ok,
    ).toBe(false);

    const div = computeFeetInchesCommit({
      entry: "0",
      mulDivMode: true,
      accum: 100,
      pendingOp: OPS.DIV,
      precision: 16,
      nextOp: null,
      formatLength: (t) => formatLength(t),
    });
    expect(div.ok).toBe(false);
    if (div.ok) return;
    expect(div.error).toMatch(/zero/i);
  });

  it("empty clear state", () => {
    expect(createEmptyFeetInchesState()).toEqual({
      accum: 0,
      pendingOp: null,
      entry: "",
      mulDivMode: false,
    });
  });
});
