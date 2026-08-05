import { describe, expect, it } from "vitest";
import {
  lbOrDash,
  tonsOrDash,
  buildSummaryText,
  pickTapeExpr,
} from "../cranePickCalculatorHelpers";
// extended;

describe("crane pick formatters", () => {
  it("formats lb/tons or dash", () => {
    expect(lbOrDash(1000)).toContain("lb");
    expect(lbOrDash(NaN)).toBe("—");
    expect(tonsOrDash(2000)).toContain("T");
    expect(tonsOrDash(NaN)).toBe("—");
  });

  it("builds summary text with disclaimer", () => {
    const text = buildSummaryText({
      pieceWeight: 1000,
      riggingWeight: 100,
      totalLoad: 1100,
      numLegs: 2,
      angleDegrees: 60,
      tensionPerLeg: 635,
      laf: 1.15,
      utilization: 40,
      capacityStatus: "green",
      craneCapacity: 10000,
      craneModel: "RT",
      boomLength: "80",
      workingRadius: "40",
      counterweight: "0",
      warnings: [{ severity: "info", message: "demo" }],
    });
    expect(text).toContain("PICK SUMMARY");
    expect(text).toContain("OK");
    expect(text).toContain("demo");
  });

  it("formats pick tape expression", () => {
    expect(pickTapeExpr({ totalLoad: 2000, numLegs: 2, angleDegrees: 60 })).toBe("1.0T · 2-leg · 60°");
  });
});


import {
  buildCranePickValidationErrors,
  computeEffectiveSlingAngle,
  buildPickSnapshot,
} from "../cranePickCalculatorHelpers";

describe("crane pick validation/snapshot", () => {
  it("validates inputs", () => {
    expect(
      buildCranePickValidationErrors({
        pieceWeight: "",
        piece: NaN,
        rigging: 0,
        craneCapacity: "",
        cap: NaN,
        numLegs: 2,
        effectiveAngle: 60,
      }),
    ).toEqual([
      "Enter piece weight.",
      "Enter the crane's rated capacity at the planned radius.",
    ]);
    expect(
      buildCranePickValidationErrors({
        pieceWeight: "10",
        piece: 10,
        rigging: -1,
        craneCapacity: "100",
        cap: 100,
        numLegs: 2,
        effectiveAngle: 0,
      }),
    ).toContain("Rigging weight cannot be negative.");
  });

  it("effective angle and snapshot", () => {
    expect(
      computeEffectiveSlingAngle({
        numLegs: 1,
        angleMode: "degrees",
        heightSpanMode: "height_span",
        angleDeg: "45",
        hspanH: "10",
        hspanS: "10",
        angleFromHeightSpan: () => 30,
      }),
    ).toBe(90);
    expect(
      computeEffectiveSlingAngle({
        numLegs: 2,
        angleMode: "height_span",
        heightSpanMode: "height_span",
        angleDeg: "45",
        hspanH: "10",
        hspanS: "10",
        angleFromHeightSpan: (h, s) => h + s,
      }),
    ).toBe(20);
    const snap = buildPickSnapshot({
      piece: 1, rigging: 2, totalLoad: 3, numLegs: 2, effectiveAngle: 60,
      laf: 1.15, tensionPerLeg: 1.7, cap: 10, utilization: 30,
      capacityStatus: "green", angleStatus: "ok",
      craneModel: "M", boomLength: "100", workingRadius: "40", counterweight: "cw",
      warnings: [],
    });
    expect(snap.totalLoad).toBe(3);
    expect(snap.angleDegrees).toBe(60);
  });
});
