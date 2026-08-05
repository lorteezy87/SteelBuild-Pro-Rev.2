import { describe, expect, it } from "vitest";
import {
  parseLengthFeet,
  LENGTH_MODES,
  csvCell,
  parsePositiveRate,
  computeWeightTotals,
  buildTakeoffCsv,
} from "../steelWeightCalculatorHelpers";

describe("parseLengthFeet", () => {
  it("parses decimal feet", () => {
    expect(parseLengthFeet("12.5", LENGTH_MODES.DECIMAL)).toBe(12.5);
    expect(parseLengthFeet("", LENGTH_MODES.DECIMAL)).toBeNull();
    expect(parseLengthFeet("-1", LENGTH_MODES.DECIMAL)).toBeNull();
  });

  it("parses feet-inches shorthand", () => {
    const ft = parseLengthFeet("12'-0\"", LENGTH_MODES.FT_IN);
    expect(ft).toBeCloseTo(12, 3);
  });
});

describe("csv / weight helpers", () => {
  it("escapes csv cells", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("parses rates and weights", () => {
    expect(parsePositiveRate("12.5")).toBe(12.5);
    expect(parsePositiveRate("0")).toBe(0);
    expect(computeWeightTotals(10, 12, 2)).toEqual({ piece: 120, total: 240 });
  });

  it("builds takeoff csv with original field names", () => {
    const csv = buildTakeoffCsv([
      {
        shape: "W12x26",
        qty: 2,
        lengthDisplay: "12'-0\"",
        lbPerFt: 26,
        totalWeight: 624,
        cost: 100,
      },
    ]);
    expect(csv.split("\n")[0]).toBe("shape,qty,length,lb_per_ft,weight_lb,cost");
    expect(csv.split("\n")[1]).toContain("W12x26");
    expect(csv.split("\n")[1]).toContain("26.000");
    expect(csv.split("\n")[1]).toContain("624.00");
  });
});
