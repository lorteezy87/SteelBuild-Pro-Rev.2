import { describe, it, expect } from "vitest";
import {
  parseNumericInput,
  isBlankInput,
  grossLoadForChart,
  angleFromSlingLength,
  fourLegHorizontalReach,
  offsetTwoLegBridle,
  wllUtilization,
  getRiggingStatus,
  boomGeometry,
  getCapacityStatusForLift,
  buildExtendedWarnings,
  type ExtendedWarningInput,
} from "../cranePickMath";
import { calculateSlingTension } from "../riggingCalculations";

describe("parseNumericInput", () => {
  // parseFloat("12,500") === 12 — the bug this function exists to prevent.
  it("reads US thousands separators as thousands, not a decimal cut-off", () => {
    expect(parseNumericInput("12,500")).toBe(12500);
    expect(parseNumericInput("1,234,567.5")).toBe(1234567.5);
    expect(parseNumericInput(" 180,000 ")).toBe(180000);
  });

  it("accepts plain numbers", () => {
    expect(parseNumericInput("12500")).toBe(12500);
    expect(parseNumericInput("60.5")).toBe(60.5);
    expect(parseNumericInput(".5")).toBe(0.5);
    expect(parseNumericInput("0")).toBe(0);
    expect(parseNumericInput(42)).toBe(42);
  });

  it("rejects ambiguous commas and trailing junk rather than guessing", () => {
    expect(parseNumericInput("12,5")).toBeNaN();      // European decimal? 125? refuse
    expect(parseNumericInput("1,23,456")).toBeNaN();
    expect(parseNumericInput("12k")).toBeNaN();        // parseFloat would say 12
    expect(parseNumericInput("12500 lb")).toBeNaN();
    expect(parseNumericInput("abc")).toBeNaN();
    expect(parseNumericInput("")).toBeNaN();
    expect(parseNumericInput(undefined)).toBeNaN();
  });

  it("distinguishes blank from invalid", () => {
    expect(isBlankInput("  ")).toBe(true);
    expect(isBlankInput("x")).toBe(false);
  });
});

describe("grossLoadForChart", () => {
  it("adds hook block and chart deductions to piece + rigging", () => {
    expect(grossLoadForChart({ pieceWeight: 10000, riggingWeight: 300, hookBlockWeight: 1200, otherDeductions: 500 })).toBe(12000);
  });

  it("returns NaN for a missing piece weight or a negative deduction", () => {
    expect(grossLoadForChart({ pieceWeight: 0, riggingWeight: 0, hookBlockWeight: 0, otherDeductions: 0 })).toBeNaN();
    expect(grossLoadForChart({ pieceWeight: 100, riggingWeight: 0, hookBlockWeight: -1, otherDeductions: 0 })).toBeNaN();
    expect(grossLoadForChart({ pieceWeight: 100, riggingWeight: NaN, hookBlockWeight: 0, otherDeductions: 0 })).toBeNaN();
  });
});

describe("angleFromSlingLength (sin θ = H / L)", () => {
  it("matches the reference angles", () => {
    expect(angleFromSlingLength(10, 10)).toBeCloseTo(90, 6);
    expect(angleFromSlingLength(10, 5)).toBeCloseTo(30, 6);
    expect(angleFromSlingLength(10, 10 * Math.sin(Math.PI / 3))).toBeCloseTo(60, 6);
  });

  it("returns NaN when H exceeds L or either is non-positive", () => {
    expect(angleFromSlingLength(10, 11)).toBeNaN();
    expect(angleFromSlingLength(0, 5)).toBeNaN();
    expect(angleFromSlingLength(10, 0)).toBeNaN();
  });
});

describe("fourLegHorizontalReach", () => {
  it("uses the half-diagonal, not half of one side", () => {
    expect(fourLegHorizontalReach(3, 4)).toBeCloseTo(5, 9);
  });

  it("gives a lower (worse) angle than measuring one side only", () => {
    const H = 6;
    const sideOnly = Math.atan(H / 4) * (180 / Math.PI);
    const corner = Math.atan(H / fourLegHorizontalReach(4, 3)) * (180 / Math.PI);
    expect(corner).toBeLessThan(sideOnly);
  });

  it("returns NaN for no geometry or negatives", () => {
    expect(fourLegHorizontalReach(0, 0)).toBeNaN();
    expect(fourLegHorizontalReach(-1, 2)).toBeNaN();
  });
});

describe("offsetTwoLegBridle", () => {
  it("reduces to the symmetric formula when the CG is centred", () => {
    const H = 10 * Math.tan(Math.PI / 3); // 60° legs on a 10-unit half-span
    const r = offsetTwoLegBridle(10000, H, 10, 10);
    expect(r).not.toBeNull();
    expect(r!.tension1).toBeCloseTo(calculateSlingTension(10000, 2, 60), 6);
    expect(r!.tension2).toBeCloseTo(r!.tension1, 9);
    expect(r!.angle1).toBeCloseTo(60, 9);
  });

  it("puts more load on the leg nearer the CG, and satisfies equilibrium", () => {
    // W = 12,000 lb, H = 8 ft, CG 4 ft from pick point 1 and 12 ft from pick point 2.
    const W = 12000;
    const r = offsetTwoLegBridle(W, 8, 4, 12)!;
    // Hand check: L1 = √80 = 8.944, L2 = √208 = 14.422
    //   T1 = 12000·12·8.944 / (8·16) = 10,062.3 lb
    //   T2 = 12000·4·14.422 / (8·16) =  5,408.3 lb
    expect(r.tension1).toBeCloseTo(10062.3, 1);
    expect(r.tension2).toBeCloseTo(5408.3, 1);
    expect(r.tension1).toBeGreaterThan(r.tension2);
    expect(r.share1).toBeCloseTo(0.75, 9);
    const rad = Math.PI / 180;
    // Σ vertical = W, Σ horizontal = 0
    expect(r.tension1 * Math.sin(r.angle1 * rad) + r.tension2 * Math.sin(r.angle2 * rad)).toBeCloseTo(W, 6);
    expect(r.tension1 * Math.cos(r.angle1 * rad) - r.tension2 * Math.cos(r.angle2 * rad)).toBeCloseTo(0, 6);
  });

  it("returns null for non-positive geometry or load", () => {
    expect(offsetTwoLegBridle(0, 8, 4, 12)).toBeNull();
    expect(offsetTwoLegBridle(1000, 0, 4, 12)).toBeNull();
    expect(offsetTwoLegBridle(1000, 8, 0, 12)).toBeNull();
  });
});

describe("wllUtilization / getRiggingStatus", () => {
  it("computes percent of WLL and bands it with no critical-lift zone", () => {
    expect(wllUtilization(8000, 10000)).toBe(80);
    expect(getRiggingStatus(80)).toBe("green");
    expect(getRiggingStatus(80.1)).toBe("yellow");
    expect(getRiggingStatus(100)).toBe("yellow");
    expect(getRiggingStatus(100.1)).toBe("red");
    expect(wllUtilization(1, 0)).toBeNaN();
    expect(getRiggingStatus(NaN)).toBeNull();
  });
});

describe("boomGeometry", () => {
  it("derives boom angle and tip height from length and radius", () => {
    const g = boomGeometry(100, 50)!;
    expect(g.boomAngle).toBeCloseTo(60, 6);
    expect(g.tipHeightAboveFoot).toBeCloseTo(86.603, 3);
  });

  it("accounts for the boom-foot offset from the centre of rotation", () => {
    expect(boomGeometry(100, 55, 5)!.boomAngle).toBeCloseTo(60, 6);
  });

  it("returns null when the radius is out of reach", () => {
    expect(boomGeometry(100, 120)).toBeNull();
    expect(boomGeometry(100, 3, 5)).toBeNull();
    expect(boomGeometry(0, 50)).toBeNull();
  });
});

describe("getCapacityStatusForLift", () => {
  it("keeps the 75 / 90 bands for a standard lift", () => {
    expect(getCapacityStatusForLift(74.9, "standard")).toBe("green");
    expect(getCapacityStatusForLift(90, "standard")).toBe("yellow");
    expect(getCapacityStatusForLift(90.1, "standard")).toBe("red");
  });

  it("applies the 50% personnel-hoisting limit (29 CFR 1926.1431)", () => {
    expect(getCapacityStatusForLift(39.9, "personnel")).toBe("green");
    expect(getCapacityStatusForLift(45, "personnel")).toBe("yellow");
    expect(getCapacityStatusForLift(50, "personnel")).toBe("yellow");
    expect(getCapacityStatusForLift(50.1, "personnel")).toBe("red");
  });
});

describe("buildExtendedWarnings", () => {
  const base: ExtendedWarningInput = { slingUtilization: NaN, shackleUtilization: NaN, hookBlockEntered: true, offset: null };

  it("is silent when nothing is entered that can fail", () => {
    expect(buildExtendedWarnings(base)).toEqual([]);
  });

  it("flags an overloaded sling red and a near-limit shackle yellow, reds first", () => {
    const w = buildExtendedWarnings({ ...base, slingUtilization: 112, shackleUtilization: 90 });
    expect(w.map((x) => x.severity)).toEqual(["red", "yellow"]);
    expect(w[0].message).toContain("Sling OVERLOADED");
    expect(w[1].message).toContain("Shackle at 90.0%");
  });

  it("reminds the user when no hook block weight was entered", () => {
    const w = buildExtendedWarnings({ ...base, hookBlockEntered: false });
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain("hook block");
  });

  it("calls out the heavy leg and a flat long leg on an offset CG", () => {
    const offset = offsetTwoLegBridle(10000, 5, 3, 12)!;
    const w = buildExtendedWarnings({ ...base, offset });
    expect(w[0].severity).toBe("red");
    expect(w[0].message).toContain("below 30°");
    expect(w.some((x) => x.message.includes("leg 1 carries 80%"))).toBe(true);
  });
});
