import { describe, expect, it } from "vitest";
import {
  parseLengthFeet,
  LENGTH_MODES,
  csvCell,
  parsePositiveRate,
  computeWeightTotals,
  buildTakeoffCsv,
  buildShapeLabel,
  resolveCurrentLbPerFt,
  tryCalculateWeight,
  sumRunningWeight,
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

describe("steelWeight shape/calc helpers", () => {
  it("builds shape labels for rolled and dynamic families", () => {
    expect(
      buildShapeLabel({
        family: { key: "w" },
        designation: "W12×26",
        plateThickness: "",
        plateWidth: "",
        roundDiameter: "",
        squareSide: "",
        flatThickness: "",
        flatWidth: "",
      }),
    ).toBe("W12×26");
    expect(
      buildShapeLabel({
        family: { key: "pl", dynamic: "plate" },
        designation: "",
        plateThickness: "0.5",
        plateWidth: "12",
        roundDiameter: "",
        squareSide: "",
        flatThickness: "",
        flatWidth: "",
      }),
    ).toBe('PL 0.5" × 12"');
  });

  it("tryCalculateWeight validates and computes", () => {
    const bad = tryCalculateWeight({
      lbPerFt: null,
      lengthRaw: "10",
      lengthMode: LENGTH_MODES.DECIMAL,
      qty: "1",
      shapeLabel: "X",
      rateNum: 0,
      costUnit: "/lb",
    });
    expect(bad.ok).toBe(false);

    const ok = tryCalculateWeight({
      lbPerFt: 10,
      lengthRaw: "10",
      lengthMode: LENGTH_MODES.DECIMAL,
      qty: "2",
      shapeLabel: "W10",
      rateNum: 1,
      costUnit: "/lb",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.result.pieceWeight).toBe(100);
      expect(ok.result.totalWeight).toBe(200);
      expect(ok.result.totalTons).toBeCloseTo(0.1);
    }
  });

  it("sums running weight", () => {
    expect(sumRunningWeight([{ totalWeight: 10 }, { totalWeight: 5 }])).toBe(15);
  });
});


import { appendRunningTotalRow, removeRunningTotalById } from "../steelWeightCalculatorHelpers";

describe("running total mutators", () => {
  it("appends and removes", () => {
    const next = appendRunningTotalRow([], { shape: "W12", totalWeight: 10, qty: 1 }, () => "id1");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("id1");
    expect(removeRunningTotalById(next, "id1")).toEqual([]);
  });
});

import { designationForFamily, resolveShapeFamily } from "../steelWeightCalculatorHelpers";

describe("shape family helpers", () => {
  it("resolves family and first designation", () => {
    const families = [
      { key: "w", shapes: [{ designation: "W12x26" }] },
      { key: "plate", shapes: [] },
    ];
    expect(resolveShapeFamily(families, "plate").key).toBe("plate");
    expect(resolveShapeFamily(families, "missing").key).toBe("w");
    expect(designationForFamily(families[0])).toBe("W12x26");
    expect(designationForFamily(families[1])).toBe("");
    expect(designationForFamily(null)).toBe("");
  });
});

import { resolveCostUnit } from "../steelWeightCalculatorHelpers";

describe("resolveCostUnit", () => {
  it("keeps allowed units and falls back", () => {
    expect(resolveCostUnit("lb", ["lb", "ton"])).toBe("lb");
    expect(resolveCostUnit("nope", ["lb", "ton"])).toBe("lb");
  });
});

import {
  formatWeightLb,
  formatWeightTons,
  formatLbPerFt,
  formatGrandTotalClipboard,
  formatResultAux,
  formatFixed2,
} from "../steelWeightCalculatorHelpers";

describe("steel weight display formatters", () => {
  it("formats weights and clipboard", () => {
    expect(formatWeightLb(12.3)).toBe("12.30 lb");
    expect(formatWeightTons(1.2)).toBe("1.200 T");
    expect(formatLbPerFt(45.6)).toBe("45.600 lb/ft");
    expect(formatGrandTotalClipboard(10)).toBe("10.00 lb");
    expect(formatResultAux({ totalTons: 0.5, qty: 3 })).toBe("0.500 T · 3 pc");
    expect(formatFixed2(1.2)).toBe("1.20");
  });
});
