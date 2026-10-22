/**
 * cranePickAudit.test.ts — independent audit of the Crane Pick Calculator math.
 *
 * These tests do NOT restate what the implementation does. Each one checks an
 * external truth the code must satisfy:
 *
 *   - static equilibrium (ΣFx = 0, ΣFy = W) for the offset bridle, solved
 *     independently of the closed form the module uses
 *   - the three sling-angle entry modes must agree on the same geometry
 *   - a chart read must never exceed any bracketing cell, never extrapolate,
 *     and never rise when the radius goes out
 *   - threshold behaviour exactly ON each published boundary
 *
 * Randomised cases use a fixed seed so a failure is reproducible.
 */
import { describe, it, expect } from "vitest";
import {
  parseNumericInput,
  grossLoadForChart,
  angleFromSlingLength,
  fourLegHorizontalReach,
  offsetTwoLegBridle,
  wllUtilization,
  getRiggingStatus,
  boomGeometry,
  getCapacityStatusForLift,
} from "@/utils/cranePickMath";
import {
  calculateSlingTension,
  calculateLAF,
  calculateUtilization,
  getAngleStatus,
  angleFromHeightSpan,
  loadBearingLegs,
} from "@/utils/riggingCalculations";
import { lookupRatedCapacity, validateLoadChart, parseChartText, chartToText, type LoadChart } from "@/lib/crane/loadChart";
import { pickWarnings, buildSummaryText, type PickSnapshot } from "@/lib/crane/pickSummaryFormat";

const DEG = 180 / Math.PI;

/** Deterministic LCG so a randomised failure reproduces exactly. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("offset two-leg bridle — static equilibrium", () => {
  it("satisfies ΣFx = 0 and ΣFy = W for 500 random geometries", () => {
    const rand = rng(20261021);
    for (let i = 0; i < 500; i++) {
      const W = 500 + rand() * 120000;
      const H = 1 + rand() * 60;
      const d1 = 0.5 + rand() * 40;
      const d2 = 0.5 + rand() * 40;
      const r = offsetTwoLegBridle(W, H, d1, d2);
      expect(r).not.toBeNull();
      const { tension1: T1, tension2: T2, angle1, angle2 } = r!;

      // Resolve the reported tensions back into components from the reported
      // angles. Both equations must close for the result to be a real solution.
      const fx1 = T1 * Math.cos(angle1 / DEG);
      const fx2 = T2 * Math.cos(angle2 / DEG);
      const fy1 = T1 * Math.sin(angle1 / DEG);
      const fy2 = T2 * Math.sin(angle2 / DEG);

      expect(Math.abs(fx1 - fx2)).toBeLessThan(Math.max(1e-6, W * 1e-9));
      expect(Math.abs(fy1 + fy2 - W)).toBeLessThan(Math.max(1e-6, W * 1e-9));
    }
  });

  it("puts the larger share and the larger tension on the leg nearer the CG", () => {
    const rand = rng(7);
    for (let i = 0; i < 200; i++) {
      const H = 2 + rand() * 30;
      const d1 = 0.5 + rand() * 25;
      const d2 = 0.5 + rand() * 25;
      const r = offsetTwoLegBridle(10000, H, d1, d2)!;
      if (Math.abs(d1 - d2) < 1e-9) continue;
      const nearerIsOne = d1 < d2;
      expect(r.share1 > r.share2).toBe(nearerIsOne);
      expect(r.tension1 > r.tension2).toBe(nearerIsOne);
      // the nearer leg is also the steeper one
      expect(r.angle1 > r.angle2).toBe(nearerIsOne);
      expect(r.share1 + r.share2).toBeCloseTo(1, 12);
    }
  });

  it("reduces exactly to the symmetric W/(2·sinθ) when d1 = d2", () => {
    const rand = rng(99);
    for (let i = 0; i < 200; i++) {
      const W = 1000 + rand() * 80000;
      const H = 1 + rand() * 40;
      const d = 0.5 + rand() * 30;
      const r = offsetTwoLegBridle(W, H, d, d)!;
      const theta = Math.atan(H / d) * DEG;
      const symmetric = calculateSlingTension(W, 2, theta);
      expect(r.tension1).toBeCloseTo(symmetric, 6);
      expect(r.tension2).toBeCloseTo(symmetric, 6);
      expect(r.tension1).toBeCloseTo(W / (2 * Math.sin(theta / DEG)), 6);
    }
  });

  it("never reports a leg tension below the vertical share it must carry", () => {
    const rand = rng(1234);
    for (let i = 0; i < 300; i++) {
      const W = 1000 + rand() * 50000;
      const r = offsetTwoLegBridle(W, 1 + rand() * 20, 0.5 + rand() * 30, 0.5 + rand() * 30)!;
      expect(r.tension1).toBeGreaterThanOrEqual(W * r.share1 - 1e-9);
      expect(r.tension2).toBeGreaterThanOrEqual(W * r.share2 - 1e-9);
    }
  });
});

describe("the three angle-entry modes describe the same geometry", () => {
  it("sling-length and height-over-span agree for the same triangle", () => {
    const rand = rng(555);
    for (let i = 0; i < 300; i++) {
      const L = 2 + rand() * 40;        // sling length
      const H = 0.1 + rand() * (L - 0.2); // vertical drop, strictly < L
      const reach = Math.sqrt(L * L - H * H);
      const fromSling = angleFromSlingLength(L, H);
      const fromSpan = angleFromHeightSpan(H, reach);
      expect(fromSling).toBeCloseTo(fromSpan, 9);
      // and both must agree with the LAF the tension uses
      expect(calculateLAF(fromSling)).toBeCloseTo(L / H, 9);
    }
  });

  it("a 4-leg plan reach is the half-diagonal, not the half-side", () => {
    expect(fourLegHorizontalReach(3, 4)).toBeCloseTo(5, 12);
    // Using a half-side instead would overstate the angle and understate tension.
    const diagAngle = angleFromHeightSpan(6, fourLegHorizontalReach(3, 4));
    const wrongAngle = angleFromHeightSpan(6, 3);
    expect(diagAngle).toBeLessThan(wrongAngle);
    expect(calculateSlingTension(10000, 4, diagAngle)).toBeGreaterThan(
      calculateSlingTension(10000, 4, wrongAngle),
    );
  });

  it("a 4-leg bridle reports the same per-leg tension as a 2-leg at equal angle", () => {
    // ASME B30.9 rigid-load rule: only two legs may be assumed to carry.
    for (const angle of [30, 45, 60, 90]) {
      expect(calculateSlingTension(20000, 4, angle)).toBeCloseTo(
        calculateSlingTension(20000, 2, angle), 9,
      );
    }
    expect(loadBearingLegs(4)).toBe(2);
  });

  it("matches the LAF values printed in rigging handbooks", () => {
    expect(calculateLAF(90)).toBeCloseTo(1.0, 3);
    expect(calculateLAF(60)).toBeCloseTo(1.155, 3);
    expect(calculateLAF(45)).toBeCloseTo(1.414, 3);
    expect(calculateLAF(30)).toBeCloseTo(2.0, 3);
  });
});

describe("boom geometry", () => {
  it("round-trips: radius = footOffset + L·cos(angle)", () => {
    const rand = rng(31337);
    for (let i = 0; i < 300; i++) {
      const L = 30 + rand() * 200;
      const off = rand() * 8;
      const R = off + 0.5 + rand() * (L - 1);
      const g = boomGeometry(L, R, off);
      expect(g).not.toBeNull();
      const back = off + L * Math.cos(g!.boomAngle / DEG);
      expect(back).toBeCloseTo(R, 6);
      expect(g!.tipHeightAboveFoot).toBeCloseTo(Math.sqrt(L * L - (R - off) ** 2), 6);
    }
  });

  it("refuses a radius the boom cannot reach instead of returning a value", () => {
    expect(boomGeometry(100, 120)).toBeNull();
    expect(boomGeometry(100, 100.0001)).toBeNull();
    expect(boomGeometry(100, 0)).toBeNull();
    // radius inside the foot offset has no geometry either
    expect(boomGeometry(100, 3, 5)).toBeNull();
  });

  it("is fully vertical at radius = offset + 0 and horizontal at radius = L", () => {
    expect(boomGeometry(100, 100)!.boomAngle).toBeCloseTo(0, 9);
    expect(boomGeometry(100, 100)!.tipHeightAboveFoot).toBeCloseTo(0, 6);
  });
});

describe("load chart — conservative reading", () => {
  const chart: LoadChart = {
    boomLengths: [40, 60, 80],
    radii: [10, 20, 30],
    capacities: [
      [100000, 60000, 40000],
      [90000, 55000, 35000],
      [80000, 50000, 30000],
    ],
  };

  it("reads an exact cell exactly", () => {
    const r = lookupRatedCapacity(chart, 60, 20);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.capacity).toBe(55000);
      expect(r.exact).toBe(true);
    }
  });

  it("never returns more than the lowest bracketing cell", () => {
    const rand = rng(424242);
    for (let i = 0; i < 400; i++) {
      const b = 40 + rand() * 40;
      const rad = 10 + rand() * 20;
      const r = lookupRatedCapacity(chart, b, rad);
      if (!r.ok) continue;
      const lowest = Math.min(...r.bracketing.map((c) => c.capacity));
      expect(r.capacity).toBe(lowest);
      // and it is one of the real cells, never a computed in-between value
      const all = chart.capacities.flat().filter((c): c is number => c !== null);
      expect(all).toContain(r.capacity);
    }
  });

  it("is monotonically non-increasing as the radius goes out", () => {
    let prev = Infinity;
    for (let rad = 10; rad <= 30; rad += 0.25) {
      const r = lookupRatedCapacity(chart, 60, rad);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.capacity).toBeLessThanOrEqual(prev);
        prev = r.capacity;
      }
    }
  });

  it("is monotonically non-increasing as the boom gets longer", () => {
    let prev = Infinity;
    for (let b = 40; b <= 80; b += 0.5) {
      const r = lookupRatedCapacity(chart, b, 20);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.capacity).toBeLessThanOrEqual(prev);
        prev = r.capacity;
      }
    }
  });

  it("refuses rather than extrapolates at every edge", () => {
    expect(lookupRatedCapacity(chart, 80.1, 20).ok).toBe(false);
    expect(lookupRatedCapacity(chart, 39.9, 20).ok).toBe(false);
    expect(lookupRatedCapacity(chart, 60, 30.1).ok).toBe(false);
    expect(lookupRatedCapacity(chart, 60, 9.9).ok).toBe(false);
  });

  it("will not read across a blank cell", () => {
    const holed: LoadChart = {
      boomLengths: [40, 60],
      radii: [10, 20],
      capacities: [[100000, null], [90000, 55000]],
    };
    // exact on the blank cell
    const a = lookupRatedCapacity(holed, 40, 20);
    expect(a.ok).toBe(false);
    if (a.ok === false) expect(a.reason).toBe("not-rated");
    // bracketing a blank cell
    const b = lookupRatedCapacity(holed, 50, 15);
    expect(b.ok).toBe(false);
    if (b.ok === false) expect(b.reason).toBe("not-rated");
  });

  it("refuses an unlisted length on a lattice boom but allows it on telescopic", () => {
    expect(lookupRatedCapacity(chart, 50, 20, "lattice").ok).toBe(false);
    expect(lookupRatedCapacity(chart, 50, 20, "telescopic").ok).toBe(true);
    expect(lookupRatedCapacity(chart, 60, 20, "lattice").ok).toBe(true);
  });

  it("flags a capacity that rises with radius as a probable typo", () => {
    const typo: LoadChart = {
      boomLengths: [40],
      radii: [10, 20],
      capacities: [[6000, 60000]], // dropped zero on the first cell
    };
    const v = validateLoadChart(typo);
    expect(v.errors).toHaveLength(0);
    expect(v.warnings.length).toBeGreaterThan(0);
  });

  it("treats a short pasted row as not-rated, never shifting the remaining cells", () => {
    // Header lists 3 radii, the row supplies 2 capacities. Reading the row
    // short must not slide 80,000 lb from the 20 ft column into the 30 ft one.
    const r = parseChartText("Boom\\Radius,10,20,30\n40,100000,80000");
    expect(r.errors).toEqual([]);
    expect(r.chart!.capacities[0]).toEqual([100000, 80000, null]);
    // and the unrated far column refuses rather than returning a number
    expect(lookupRatedCapacity(r.chart!, 40, 30).ok).toBe(false);
  });

  it("refuses a row with MORE capacities than radii rather than truncating it", () => {
    // "12,500" in CSV splits into two cells; taking the first N would rate
    // every radius at its neighbour's value.
    const r = parseChartText("Boom\\Radius,10,20\n40,12,500,80000");
    expect(r.chart).toBeNull();
    expect(r.errors.join(" ")).toMatch(/thousands comma|capacities but the header/i);
  });

  it("round-trips through text", () => {
    const text = chartToText(chart);
    const back = parseChartText(text);
    expect(back.errors).toEqual([]);
    expect(back.chart).toEqual(chart);
  });
});

describe("thresholds — behaviour exactly on each published boundary", () => {
  it("standard lift: 75 is caution, 90 is caution, above 90 is critical", () => {
    expect(getCapacityStatusForLift(74.99, "standard")).toBe("green");
    expect(getCapacityStatusForLift(75, "standard")).toBe("yellow");
    expect(getCapacityStatusForLift(90, "standard")).toBe("yellow");
    expect(getCapacityStatusForLift(90.01, "standard")).toBe("red");
  });

  it("personnel lift: 50% of rated capacity is the regulatory ceiling", () => {
    expect(getCapacityStatusForLift(39.99, "personnel")).toBe("green");
    expect(getCapacityStatusForLift(40, "personnel")).toBe("yellow");
    expect(getCapacityStatusForLift(50, "personnel")).toBe("yellow");
    expect(getCapacityStatusForLift(50.01, "personnel")).toBe("red");
  });

  it("a personnel lift is never rated more permissively than a standard one", () => {
    const rank = { green: 0, yellow: 1, red: 2 } as const;
    for (let p = 0; p <= 150; p += 0.5) {
      const s = getCapacityStatusForLift(p, "standard")!;
      const q = getCapacityStatusForLift(p, "personnel")!;
      expect(rank[q]).toBeGreaterThanOrEqual(rank[s]);
    }
  });

  it("sling angle: below 30 is red, 30–45 caution, above 45 ok", () => {
    expect(getAngleStatus(29.99)).toBe("red");
    expect(getAngleStatus(30)).toBe("yellow");
    expect(getAngleStatus(45)).toBe("yellow");
    expect(getAngleStatus(45.01)).toBe("green");
  });

  it("an impossible sling angle has no status rather than the safest one", () => {
    expect(getAngleStatus(0)).toBeNull();
    expect(getAngleStatus(-10)).toBeNull();
    expect(getAngleStatus(91)).toBeNull();
    expect(getAngleStatus(NaN)).toBeNull();
  });

  it("rigging gear: over its WLL is red with no critical-lift band", () => {
    expect(getRiggingStatus(80)).toBe("green");
    expect(getRiggingStatus(80.01)).toBe("yellow");
    expect(getRiggingStatus(100)).toBe("yellow");
    expect(getRiggingStatus(100.01)).toBe("red");
  });
});

describe("gross load and utilization", () => {
  it("the chart basis includes the block — omitting it understates utilization", () => {
    const withBlock = grossLoadForChart({ pieceWeight: 20000, riggingWeight: 800, hookBlockWeight: 2400, otherDeductions: 0 });
    const without = grossLoadForChart({ pieceWeight: 20000, riggingWeight: 800, hookBlockWeight: 0, otherDeductions: 0 });
    expect(withBlock).toBe(23200);
    expect(without).toBe(20800);
    expect(calculateUtilization(withBlock, 30000)).toBeGreaterThan(calculateUtilization(without, 30000));
  });

  it("refuses a negative deduction rather than crediting it against the load", () => {
    expect(grossLoadForChart({ pieceWeight: 20000, riggingWeight: -500, hookBlockWeight: 0, otherDeductions: 0 })).toBeNaN();
    expect(grossLoadForChart({ pieceWeight: 20000, riggingWeight: 0, hookBlockWeight: -1, otherDeductions: 0 })).toBeNaN();
    expect(grossLoadForChart({ pieceWeight: 0, riggingWeight: 0, hookBlockWeight: 0, otherDeductions: 0 })).toBeNaN();
  });

  it("utilization is NaN, never Infinity, when no capacity is known", () => {
    expect(calculateUtilization(20000, 0)).toBeNaN();
    expect(calculateUtilization(20000, NaN)).toBeNaN();
    expect(calculateUtilization(20000, -5)).toBeNaN();
  });

  it("WLL utilization scales linearly and rejects a zero rating", () => {
    expect(wllUtilization(5000, 10000)).toBeCloseTo(50, 9);
    expect(wllUtilization(10000, 10000)).toBeCloseTo(100, 9);
    expect(wllUtilization(5000, 0)).toBeNaN();
  });
});

describe("strict numeric entry", () => {
  it("accepts US thousands groups and plain numbers", () => {
    expect(parseNumericInput("12,500")).toBe(12500);
    expect(parseNumericInput("1,234,567.5")).toBe(1234567.5);
    expect(parseNumericInput("12500")).toBe(12500);
    expect(parseNumericInput(".5")).toBe(0.5);
  });

  it("rejects anything whose value would be a guess", () => {
    // "12,5" is 12.5 in Europe and a malformed group in the US — a 1000x error.
    expect(parseNumericInput("12,5")).toBeNaN();
    expect(parseNumericInput("1,23")).toBeNaN();
    expect(parseNumericInput("12k")).toBeNaN();
    expect(parseNumericInput("12 500 lb")).toBeNaN();
    expect(parseNumericInput("")).toBeNaN();
    expect(parseNumericInput("--5")).toBeNaN();
    expect(parseNumericInput("Infinity")).toBeNaN();
    expect(parseNumericInput(null)).toBeNaN();
  });

  it("never silently truncates the way parseFloat does", () => {
    // The bug this parser exists to prevent.
    expect(Number.parseFloat("12,500")).toBe(12);
    expect(parseNumericInput("12,500")).toBe(12500);
  });
});

describe("summary artifacts degrade safely on an old snapshot", () => {
  it("treats a snapshot with no warnings array as no warnings, not a crash", () => {
    const legacy = { numLegs: 2, totalLoad: 1000 } as PickSnapshot;
    expect(pickWarnings(legacy)).toEqual([]);
    expect(() => buildSummaryText(legacy)).not.toThrow();
    expect(buildSummaryText(legacy)).not.toContain("WARNINGS");
  });

  it("labels a pre-fix 4-leg pick as understated rather than silently re-rating it", () => {
    const legacy = { numLegs: 4, tensionPerLeg: 5774, totalLoad: 20000 } as PickSnapshot;
    const text = buildSummaryText(legacy);
    expect(text).toMatch(/RECORDED BEFORE THE 4-LEG CORRECTION/);
    // the recorded figure is reported as recorded — a saved pick is not rewritten
    expect(text).toContain("5,774 lb");
  });
});
