import { describe, it, expect } from "vitest";
import {
  metersToTicks,
  formatMeasureDistance,
  distanceMeters,
  METERS_TO_FEET,
} from "../viewerMeasure";

describe("viewerMeasure", () => {
  it("metersToTicks converts 1 foot exactly", () => {
    const oneFootM = 1 / METERS_TO_FEET;
    expect(metersToTicks(oneFootM)).toBe(384); // TICKS_PER_FOOT
  });

  it("formatMeasureDistance shows 10'-0\" for ~3.048 m", () => {
    const tenFeetM = 10 / METERS_TO_FEET;
    const f = formatMeasureDistance(tenFeetM);
    expect(f.ftIn).toMatch(/^10'-0"$/);
    expect(f.decimalFeet).toBeCloseTo(10, 4);
    expect(f.meters).toBeCloseTo(tenFeetM, 6);
  });

  it("distanceMeters is Euclidean", () => {
    expect(distanceMeters({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
  });

  it("handles null distance", () => {
    expect(formatMeasureDistance(null).ftIn).toBe("—");
    expect(distanceMeters(null, { x: 1, y: 0, z: 0 })).toBeNull();
  });
});
