import { describe, it, expect } from "vitest";
import {
  calculateTotalLoad,
  calculateLAF,
  calculateSlingTension,
  calculateUtilization,
  getCapacityStatus,
  getAngleStatus,
  angleFromHeightSpan,
  buildWarnings,
  loadBearingLegs,
  isOverCapacity,
} from "../riggingCalculations";

// Pure crane-pick math (ASME B30.9 / B30.5, OSHA 1926.1400). Safety-relevant —
// these guard the documented reference points and the traffic-light thresholds
// so a refactor can't silently move a "green" lift into critical territory.

describe("calculateTotalLoad", () => {
  it("adds piece weight + rigging weight", () => {
    expect(calculateTotalLoad(5000, 200)).toBe(5200);
  });

  it("coerces numeric strings", () => {
    expect(calculateTotalLoad("5000", "200")).toBe(5200);
  });

  it("allows zero rigging weight", () => {
    expect(calculateTotalLoad(5000, 0)).toBe(5000);
  });

  it("returns NaN when an input is not a finite number", () => {
    expect(calculateTotalLoad(5000, "abc")).toBeNaN();
    expect(calculateTotalLoad(undefined, 200)).toBeNaN();
    expect(calculateTotalLoad(Infinity, 200)).toBeNaN();
  });
});

describe("calculateLAF (Load Angle Factor = 1/sin θ)", () => {
  it("matches the memorized reference points", () => {
    expect(calculateLAF(90)).toBeCloseTo(1.0, 3);
    expect(calculateLAF(60)).toBeCloseTo(1.155, 3);
    expect(calculateLAF(45)).toBeCloseTo(1.414, 3);
    expect(calculateLAF(30)).toBeCloseTo(2.0, 3); // industry minimum safe angle
  });

  it("returns NaN outside the valid 0 < θ ≤ 90 range", () => {
    expect(calculateLAF(0)).toBeNaN();
    expect(calculateLAF(-10)).toBeNaN();
    expect(calculateLAF(91)).toBeNaN();
    expect(calculateLAF("x")).toBeNaN();
  });
});

describe("calculateSlingTension (per leg, symmetric pick)", () => {
  it("a single-leg vertical pick carries the full load (LAF 1, angle ignored)", () => {
    expect(calculateSlingTension(10000, 1, 0)).toBe(10000);
    expect(calculateSlingTension(10000, 1, 45)).toBe(10000);
  });

  it("splits across 2 legs and applies the angle factor", () => {
    expect(calculateSlingTension(10000, 2, 90)).toBeCloseTo(5000, 3);
    expect(calculateSlingTension(10000, 2, 60)).toBeCloseTo(5773.5, 1);
    expect(calculateSlingTension(10000, 2, 30)).toBeCloseTo(10000, 1); // (10000/2)*2.0
  });

  // A 4-leg bridle on a RIGID load divides by TWO, not four. The load cannot
  // flex to bring all four legs into bearing, so sling-length tolerance and any
  // CG offset put the load into two diagonally opposite legs (ASME B30.9).
  //
  // This test previously asserted 3535.5 — the divide-by-four answer, which
  // under-predicted leg tension by exactly 2x and could have put a rigger on an
  // under-rated sling while the tool read green.
  it("assumes only 2 of 4 legs carry on a rigid load", () => {
    expect(calculateSlingTension(10000, 4, 45)).toBeCloseTo(7071.1, 1); // (10000/2)*1.4142
    expect(calculateSlingTension(10000, 4, 90)).toBeCloseTo(5000, 3);
    expect(calculateSlingTension(20000, 4, 60)).toBeCloseTo(11547.0, 1);
  });

  it("reports the same per-leg tension for a 2-leg and a 4-leg bridle", () => {
    for (const angle of [30, 45, 60, 90]) {
      expect(calculateSlingTension(10000, 4, angle)).toBeCloseTo(
        calculateSlingTension(10000, 2, angle),
        6,
      );
    }
  });

  it("loadBearingLegs encodes the rigid-load assumption", () => {
    expect(loadBearingLegs(1)).toBe(1);
    expect(loadBearingLegs(2)).toBe(2);
    expect(loadBearingLegs(4)).toBe(2);
    expect(loadBearingLegs(3)).toBeNaN();
  });

  it("returns NaN for an unsupported leg count or non-positive load", () => {
    expect(calculateSlingTension(10000, 3, 60)).toBeNaN();
    expect(calculateSlingTension(10000, 0, 60)).toBeNaN();
    expect(calculateSlingTension(0, 2, 60)).toBeNaN();
    expect(calculateSlingTension(-100, 2, 60)).toBeNaN();
  });

  it("returns NaN when the angle is invalid for a multi-leg pick", () => {
    expect(calculateSlingTension(10000, 2, 0)).toBeNaN();
    expect(calculateSlingTension(10000, 4, 95)).toBeNaN();
  });
});

describe("calculateUtilization", () => {
  it("computes percent of rated capacity", () => {
    expect(calculateUtilization(8000, 10000)).toBe(80);
    expect(calculateUtilization("8000", "10000")).toBe(80);
  });

  it("treats a zero load as 0% (still on the hook math, just empty)", () => {
    expect(calculateUtilization(0, 10000)).toBe(0);
  });

  it("returns NaN for non-positive capacity or negative load", () => {
    expect(calculateUtilization(8000, 0)).toBeNaN();
    expect(calculateUtilization(8000, -5)).toBeNaN();
    expect(calculateUtilization(-1, 10000)).toBeNaN();
    expect(calculateUtilization(8000, "x")).toBeNaN();
  });
});

describe("getCapacityStatus thresholds (75% / 90%)", () => {
  it("is green below 75%", () => {
    expect(getCapacityStatus(74.99)).toBe("green");
    expect(getCapacityStatus(0)).toBe("green");
  });

  it("is yellow on the inclusive 75–90% band", () => {
    expect(getCapacityStatus(75)).toBe("yellow");
    expect(getCapacityStatus(90)).toBe("yellow");
  });

  it("is red above 90% (OSHA critical-lift territory)", () => {
    expect(getCapacityStatus(90.01)).toBe("red");
    expect(getCapacityStatus(150)).toBe("red");
  });

  it("returns null for a non-finite input", () => {
    expect(getCapacityStatus(NaN)).toBeNull();
    expect(getCapacityStatus("x")).toBeNull();
  });
});

describe("getAngleStatus thresholds (30° / 45°)", () => {
  it("is red below 30°", () => {
    expect(getAngleStatus(29.99)).toBe("red");
    // 0 is asserted null in "guards non-physical angles" below, not red: a
    // sling at 0 deg from horizontal has no evaluable tension (sin 0 = 0), so
    // the status is "not evaluable", not "evaluated and unsafe". The UI blocks
    // it at input validation ("Sling angle must be > 0 deg and <= 90 deg") and
    // renders no results, so nothing is hidden by returning null.
  });

  it("is yellow on the inclusive 30–45° band", () => {
    expect(getAngleStatus(30)).toBe("yellow");
    expect(getAngleStatus(45)).toBe("yellow");
  });

  it("is green above 45°", () => {
    expect(getAngleStatus(45.01)).toBe("green");
    expect(getAngleStatus(90)).toBe("green");
  });

  it("returns null for a non-finite input", () => {
    expect(getAngleStatus(NaN)).toBeNull();
  });
});

describe("angleFromHeightSpan (arctan H/S, degrees from horizontal)", () => {
  it("maps the classic height:span ratios to angles", () => {
    expect(angleFromHeightSpan(10, 10)).toBeCloseTo(45, 3);
    expect(angleFromHeightSpan(Math.sqrt(3), 1)).toBeCloseTo(60, 3);
    expect(angleFromHeightSpan(1, Math.sqrt(3))).toBeCloseTo(30, 3);
  });

  it("treats zero half-span as a purely vertical 90° pick", () => {
    expect(angleFromHeightSpan(5, 0)).toBe(90);
  });

  it("treats zero height (with span) as a flat 0°", () => {
    expect(angleFromHeightSpan(0, 5)).toBeCloseTo(0, 6);
  });

  it("returns NaN for no geometry, negatives, or non-finite inputs", () => {
    expect(angleFromHeightSpan(0, 0)).toBeNaN();
    expect(angleFromHeightSpan(-1, 5)).toBeNaN();
    expect(angleFromHeightSpan(5, -1)).toBeNaN();
    expect(angleFromHeightSpan(Infinity, 5)).toBeNaN();
  });
});

describe("buildWarnings", () => {
  it("returns nothing when everything is green", () => {
    expect(buildWarnings({ angleStatus: "green", capacityStatus: "green" })).toEqual([]);
  });

  it("emits a red angle warning with the formatted angle", () => {
    const w = buildWarnings({ angleStatus: "red", capacityStatus: "green", angleDegrees: 28.4 });
    expect(w).toHaveLength(1);
    expect(w[0].severity).toBe("red");
    expect(w[0].message).toContain("28.4°");
    expect(w[0].message).toContain("below 30");
  });

  it("emits a red capacity warning citing the OSHA critical-lift rule", () => {
    const w = buildWarnings({ capacityStatus: "red", angleStatus: "green", utilizationPercent: 93.2 });
    expect(w).toHaveLength(1);
    expect(w[0].severity).toBe("red");
    expect(w[0].message).toContain("93.2%");
    expect(w[0].message).toContain("1926.1431(k)");
  });

  it("orders reds before yellows when both fire", () => {
    const w = buildWarnings({
      angleStatus: "yellow",
      capacityStatus: "red",
      angleDegrees: 40,
      utilizationPercent: 95,
    });
    expect(w.map((x) => x.severity)).toEqual(["red", "yellow"]);
  });

  it("emits both yellow warnings in angle-then-capacity order", () => {
    const w = buildWarnings({
      angleStatus: "yellow",
      capacityStatus: "yellow",
      angleDegrees: 38,
      utilizationPercent: 82,
    });
    expect(w.map((x) => x.severity)).toEqual(["yellow", "yellow"]);
    expect(w[0].message).toContain("38.0°");
    expect(w[1].message).toContain("82.0%");
  });
});

describe("isOverCapacity", () => {
  it("separates an outright overload from a 90-100% critical lift", () => {
    expect(isOverCapacity(95)).toBe(false);
    expect(isOverCapacity(100)).toBe(false);
    expect(isOverCapacity(100.1)).toBe(true);
    expect(isOverCapacity(NaN)).toBe(false);
  });
});

describe("getAngleStatus guards non-physical angles", () => {
  it("returns null rather than green above 90 degrees or at/below zero", () => {
    // Previously these fell through to "green" — the safest possible reading
    // for an input the tension math refuses to evaluate.
    expect(getAngleStatus(120)).toBeNull();
    expect(getAngleStatus(0)).toBeNull();
    expect(getAngleStatus(-15)).toBeNull();
    expect(getAngleStatus(90)).toBe("green");
  });
});

describe("buildWarnings", () => {
  it("flags an overload distinctly from a critical lift", () => {
    const over = buildWarnings({ capacityStatus: "red", utilizationPercent: 115, numLegs: 2 });
    expect(over.some((w) => w.message.includes("OVERLOAD"))).toBe(true);
    expect(over.some((w) => w.message.includes("critical lift"))).toBe(false);

    const critical = buildWarnings({ capacityStatus: "red", utilizationPercent: 95, numLegs: 2 });
    expect(critical.some((w) => w.message.includes("OVERLOAD"))).toBe(false);
    expect(critical.some((w) => w.message.includes("critical lift"))).toBe(true);
  });

  it("discloses the two-leg assumption on a 4-leg bridle", () => {
    const w = buildWarnings({ capacityStatus: "green", utilizationPercent: 40, numLegs: 4 });
    expect(w.some((x) => x.message.includes("TWO legs carry"))).toBe(true);
    const w2 = buildWarnings({ capacityStatus: "green", utilizationPercent: 40, numLegs: 2 });
    expect(w2.some((x) => x.message.includes("TWO legs carry"))).toBe(false);
  });
});
