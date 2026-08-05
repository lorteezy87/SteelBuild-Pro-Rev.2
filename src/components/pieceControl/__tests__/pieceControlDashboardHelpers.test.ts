import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pieceControl/canonicalRollups", () => ({
  rollupCanonicalPieces: () => ({ pieceCount: 10, knownTons: 5 }),
}));

import { computeShadowComparison } from "../pieceControlDashboardHelpers";

describe("computeShadowComparison", () => {
  it("returns null outside shadow mode", () => {
    expect(computeShadowComparison({ mode: "pilot", pieces: [], legacyProduction: [] })).toBeNull();
  });
  it("returns deltas when register differs from legacy", () => {
    const r = computeShadowComparison({
      mode: "shadow",
      pieces: [{ id: "1" }],
      legacyProduction: [{ quantity: 2, weight: 2000 }],
    });
    // existing pieces 2, tons = 2000*2/2000 = 2; register 10 / 5
    expect(r?.pieceDelta).toBe(8);
    expect(r?.tonsDelta).toBe(3);
  });
});
