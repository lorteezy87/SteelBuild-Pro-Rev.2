import { describe, expect, it } from "vitest";
import { IBC_PRESUMPTIVE_BEARING, groundBearing } from "../groundBearing";

const base = { outriggerReaction: 60000, matWeight: 0, padLength: 4, padWidth: 4, allowableBearing: 4000 };

describe("groundBearing", () => {
  it("computes pressure over the mat footprint", () => {
    const r = groundBearing(base)!;
    expect(r.area).toBe(16);
    expect(r.pressure).toBe(3750);         // 60,000 / 16
    expect(r.utilization).toBeCloseTo(93.75, 6);
    expect(r.status).toBe("yellow");       // within 10% of allowable
  });

  it("adds the mat's own weight — the soil carries the mat too", () => {
    const r = groundBearing({ ...base, matWeight: 4000 })!;
    expect(r.totalLoad).toBe(64000);
    expect(r.pressure).toBe(4000);
    expect(r.status).toBe("yellow");       // exactly 100% is not over
  });

  it("goes red over the allowable", () => {
    const r = groundBearing({ ...base, allowableBearing: 2000 })!;
    expect(r.utilization).toBeCloseTo(187.5, 6);
    expect(r.status).toBe("red");
  });

  it("goes green with margin", () => {
    expect(groundBearing({ ...base, padLength: 8, padWidth: 8 })!.status).toBe("green");
  });

  it("gives the footprint needed at the allowable, and the equivalent square mat", () => {
    const r = groundBearing({ ...base, allowableBearing: 1500 })!;
    expect(r.requiredArea).toBe(40);        // 60,000 / 1,500
    expect(r.requiredSquareSide).toBeCloseTo(Math.sqrt(40), 10);
    // A mat of exactly the required area lands at 100%.
    const side = r.requiredSquareSide;
    expect(groundBearing({ ...base, allowableBearing: 1500, padLength: side, padWidth: side })!.utilization).toBeCloseTo(100, 8);
  });

  it.each([
    ["zero reaction", { outriggerReaction: 0 }],
    ["negative mat weight", { matWeight: -1 }],
    ["zero length", { padLength: 0 }],
    ["zero width", { padWidth: 0 }],
    ["zero allowable", { allowableBearing: 0 }],
    ["NaN reaction", { outriggerReaction: NaN }],
    ["infinite width", { padWidth: Infinity }],
  ])("refuses %s", (_label, patch) => {
    expect(groundBearing({ ...base, ...patch })).toBeNull();
  });
});

describe("IBC Table 1806.2 presumptive values", () => {
  it("lists the five soil classes from bedrock down to clay", () => {
    expect(IBC_PRESUMPTIVE_BEARING.map((r) => r.psf)).toEqual([12000, 4000, 3000, 2000, 1500]);
  });
});
