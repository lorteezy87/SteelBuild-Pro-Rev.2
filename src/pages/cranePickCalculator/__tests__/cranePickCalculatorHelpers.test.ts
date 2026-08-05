import { describe, expect, it } from "vitest";
import {
  lbOrDash,
  tonsOrDash,
  buildSummaryText,
  pickTapeExpr,
} from "../cranePickCalculatorHelpers";

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
