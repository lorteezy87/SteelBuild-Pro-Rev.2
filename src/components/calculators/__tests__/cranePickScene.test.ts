import { describe, it, expect } from "vitest";
import { computeCraneLayout, BOOM_FOOT_HEIGHT_FT, LOAD_CLEARANCE_FT, LOAD_DEPTH_FT, type CraneSceneSpec } from "../cranePickScene";
import { boomGeometry } from "@/utils/cranePickMath";

const spec = (over: Partial<CraneSceneSpec> = {}): CraneSceneSpec => ({
  boomLength: 100, radius: 50, legHeight: 8, pickPoints: [], loadLength: 20, loadWidth: 1,
  capacityStatus: null, illustrative: false, ...over,
});

describe("computeCraneLayout", () => {
  it("draws the boom at the same angle the calculator reports", () => {
    const l = computeCraneLayout(spec())!;
    expect((l.boomAngleRad * 180) / Math.PI).toBeCloseTo(boomGeometry(100, 50)!.boomAngle, 9);
    expect(l.tipY - BOOM_FOOT_HEIGHT_FT).toBeCloseTo(boomGeometry(100, 50)!.tipHeightAboveFoot, 9);
    expect(l.hookX).toBe(50);
  });

  it("hangs the load just off grade with the hook H above the pick points", () => {
    const l = computeCraneLayout(spec())!;
    expect(l.loadBottomY).toBe(LOAD_CLEARANCE_FT);
    expect(l.pickY).toBe(LOAD_CLEARANCE_FT + LOAD_DEPTH_FT);
    expect(l.hookY - l.pickY).toBeCloseTo(8, 9);
    expect(l.headroomLimited).toBe(false);
  });

  it("keeps H honest and flags headroom when the rigging won't fit under the tip", () => {
    const l = computeCraneLayout(spec({ boomLength: 100, radius: 98, legHeight: 40 }))!;
    expect(l.headroomLimited).toBe(true);
    expect(l.hookY - l.pickY).toBeCloseTo(40, 9);
    expect(l.hookY).toBeLessThan(l.tipY);
  });

  it("returns null when the radius is out of reach", () => {
    expect(computeCraneLayout(spec({ radius: 120 }))).toBeNull();
    expect(computeCraneLayout(spec({ boomLength: 0 }))).toBeNull();
  });
});
