import { describe, expect, it } from "vitest";
import {
  chartToText,
  lookupRatedCapacity,
  parseChartText,
  validateLoadChart,
  type LoadChart,
} from "../loadChart";

/**
 * SYNTHETIC chart. Round numbers, no model: it exists to exercise the lookup
 * rules and must never be read as any real crane's capacities.
 *
 *            radius →  20      30      40      50
 *   boom 60           60,000  40,000  28,000    —
 *   boom 80           52,000  36,000  25,000  18,000
 *   boom 100          44,000  31,000  22,000  16,000
 */
const CHART: LoadChart = {
  boomLengths: [60, 80, 100],
  radii: [20, 30, 40, 50],
  capacities: [
    [60000, 40000, 28000, null],
    [52000, 36000, 25000, 18000],
    [44000, 31000, 22000, 16000],
  ],
};

const ok = (r: ReturnType<typeof lookupRatedCapacity>) => {
  if (r.ok === false) throw new Error(`expected a rating, got refusal: ${r.message}`);
  return r;
};
const refused = (r: ReturnType<typeof lookupRatedCapacity>) => {
  if (r.ok === true) throw new Error(`expected a refusal, got ${r.capacity}`);
  return r;
};

describe("reading a listed cell", () => {
  it("returns the exact cell when boom and radius are both listed", () => {
    const r = ok(lookupRatedCapacity(CHART, 80, 30));
    expect(r.capacity).toBe(36000);
    expect(r.exact).toBe(true);
    expect(r.governing).toEqual({ boomLength: 80, radius: 30, capacity: 36000 });
    expect(r.basis).toMatch(/read directly at 80 ft boom \/ 30 ft radius/);
  });
});

describe("between listed values — never interpolated upward", () => {
  it("uses the NEXT LONGER radius, not a straight-line blend", () => {
    // 35 ft sits between 30 ft (36,000) and 40 ft (25,000). Interpolation would
    // say 30,500 lb; the chart only guarantees 25,000 lb.
    const r = ok(lookupRatedCapacity(CHART, 80, 35));
    expect(r.capacity).toBe(25000);
    expect(r.exact).toBe(false);
    expect(r.governing.radius).toBe(40);
    expect(r.basis).toMatch(/Not interpolated/);
  });

  it("uses the lower of the bracketing boom lengths on a telescopic boom", () => {
    const r = ok(lookupRatedCapacity(CHART, 90, 30));
    expect(r.capacity).toBe(31000);
    expect(r.governing.boomLength).toBe(100);
  });

  it("takes the minimum over all four cells when BOTH are between", () => {
    const r = ok(lookupRatedCapacity(CHART, 70, 25));
    expect(r.bracketing).toHaveLength(4);
    expect(r.capacity).toBe(36000); // boom 80 / radius 30
  });

  it("stays conservative on a chart whose numbers are not monotonic", () => {
    // A typo'd or unusual chart where the LONGER radius reads higher. "Next
    // longer radius" alone would pick the higher value; the minimum does not.
    const odd: LoadChart = { boomLengths: [60], radii: [20, 30], capacities: [[30000, 45000]] };
    expect(ok(lookupRatedCapacity(odd, 60, 25)).capacity).toBe(30000);
  });
});

describe("outside the chart — never extrapolated", () => {
  it("refuses a radius past the last column", () => {
    const r = refused(lookupRatedCapacity(CHART, 80, 55));
    expect(r.reason).toBe("radius-beyond-chart");
    expect(r.message).toMatch(/never extrapolated/);
  });

  it("refuses a radius inside the minimum radius", () => {
    expect(refused(lookupRatedCapacity(CHART, 80, 15)).reason).toBe("radius-below-chart");
  });

  it("refuses a boom longer than the longest row", () => {
    expect(refused(lookupRatedCapacity(CHART, 110, 30)).reason).toBe("boom-beyond-chart");
  });

  it("refuses a boom shorter than the shortest row", () => {
    expect(refused(lookupRatedCapacity(CHART, 50, 30)).reason).toBe("boom-below-chart");
  });
});

describe("blank cells mean NOT RATED", () => {
  it("refuses a blank cell rather than reading it as zero or skipping it", () => {
    const r = refused(lookupRatedCapacity(CHART, 60, 50));
    expect(r.reason).toBe("not-rated");
    expect(r.message).toMatch(/does not rate that position/);
  });

  it("refuses when any BRACKETING cell is blank — no reading across a hole", () => {
    // 45 ft on a 70 ft boom brackets (60,50) which is blank. The other three
    // cells are rated; averaging past the gap would invent a rating.
    const r = refused(lookupRatedCapacity(CHART, 70, 45));
    expect(r.reason).toBe("not-rated");
    expect(r.message).toMatch(/never read across one/);
  });
});

describe("lattice booms", () => {
  it("rates a listed length", () => {
    expect(ok(lookupRatedCapacity(CHART, 80, 30, "lattice")).capacity).toBe(36000);
  });

  it("refuses an unlisted length instead of taking the more conservative neighbour", () => {
    const r = refused(lookupRatedCapacity(CHART, 90, 30, "lattice"));
    expect(r.reason).toBe("boom-not-listed");
    expect(r.message).toMatch(/rig 80 ft or 100 ft/);
  });
});

describe("bad input", () => {
  it.each([
    [0, 30], [-80, 30], [80, 0], [NaN, 30], [80, Infinity],
  ])("refuses boom %s / radius %s", (boom, radius) => {
    expect(refused(lookupRatedCapacity(CHART, boom, radius)).reason).toBe("invalid-input");
  });

  it("refuses to read a chart that fails validation", () => {
    const broken: LoadChart = { boomLengths: [80, 60], radii: [20], capacities: [[1000], [2000]] };
    expect(refused(lookupRatedCapacity(broken, 60, 20)).reason).toBe("invalid-input");
  });
});

describe("validateLoadChart", () => {
  it("passes the synthetic chart cleanly", () => {
    expect(validateLoadChart(CHART)).toEqual({ errors: [], warnings: [] });
  });

  it("requires ascending, unique axes", () => {
    const v = validateLoadChart({ boomLengths: [60, 60], radii: [30, 20], capacities: [[1, 1], [1, 1]] });
    expect(v.errors.map((e) => e.message).join(" ")).toMatch(/shortest to longest/);
    expect(v.errors.map((e) => e.message).join(" ")).toMatch(/closest to farthest/);
  });

  it("rejects a row whose width does not match the radii", () => {
    const v = validateLoadChart({ boomLengths: [60], radii: [20, 30], capacities: [[1000]] });
    expect(v.errors[0].message).toMatch(/expected 2 capacities, found 1/);
  });

  it("rejects zero and negative capacities — blank is how 'not rated' is written", () => {
    const v = validateLoadChart({ boomLengths: [60], radii: [20], capacities: [[0]] });
    expect(v.errors[0].message).toMatch(/or blank for not rated/);
  });

  it("rejects a chart that rates nothing", () => {
    const v = validateLoadChart({ boomLengths: [60], radii: [20], capacities: [[null]] });
    expect(v.errors[0].message).toMatch(/rates nothing/);
  });

  it("WARNS (does not block) when capacity rises with radius — the dropped-zero typo", () => {
    // 3,600 was meant; 36,000 typed at the longer radius would rate a 10x load.
    const typo: LoadChart = { boomLengths: [80], radii: [30, 40], capacities: [[3600, 36000]] };
    const v = validateLoadChart(typo);
    expect(v.errors).toEqual([]);
    expect(v.warnings[0].message).toMatch(/rises from 3,600 lb at 30 ft to 36,000 lb at 40 ft/);
  });
});

describe("parseChartText", () => {
  it("parses tab-separated text pasted from a spreadsheet, thousands separators and all", () => {
    const text = "Boom \\ Radius\t20\t30\t40\t50\n60\t60,000\t40,000\t28,000\t-\n80\t52,000\t36,000\t25,000\t18,000\n100\t44,000\t31,000\t22,000\t16,000";
    const { chart, errors } = parseChartText(text);
    expect(errors).toEqual([]);
    expect(chart).toEqual(CHART);
  });

  it("parses plain CSV", () => {
    const { chart, errors } = parseChartText("r,20,30\n60,60000,40000\n80,52000,");
    expect(errors).toEqual([]);
    expect(chart?.capacities).toEqual([[60000, 40000], [52000, null]]);
  });

  it.each(["-", "–", "—", "N/A", "NR", "*", ""])("reads %j as not rated", (token) => {
    const { chart } = parseChartText(`r\t20\t30\n60\t50000\t${token}`);
    expect(chart?.capacities[0][1]).toBeNull();
  });

  it("catches a CSV thousands comma as an extra column instead of shifting the row", () => {
    // "12,500" in CSV becomes "12" and "500" — both valid numbers. Taking the
    // first two cells would rate 30 ft at 12 lb and 40 ft at 500 lb.
    const { chart, errors } = parseChartText("r,30,40\n60,12,500,9000");
    expect(chart).toBeNull();
    expect(errors[0]).toMatch(/thousands comma \(12,500\), it split in two/);
  });

  it("rejects a non-numeric capacity with its row and column", () => {
    const { chart, errors } = parseChartText("r\t20\t30\n60\t50000\t12k");
    expect(chart).toBeNull();
    expect(errors[0]).toMatch(/Row 2 \(boom 60 ft\), column 3: "12k" is not a capacity/);
  });

  it("rejects a bad boom length and a bad radius", () => {
    expect(parseChartText("r\t20\tforty\n60\t1\t1").errors[0]).toMatch(/Header row, column 3: "forty" is not a radius/);
    expect(parseChartText("r\t20\nsixty\t1").errors[0]).toMatch(/Row 2: "sixty" is not a boom length/);
  });

  it("runs the chart through validation, so an out-of-order axis is refused", () => {
    const { chart, errors } = parseChartText("r\t30\t20\n60\t1\t1");
    expect(chart).toBeNull();
    expect(errors.join(" ")).toMatch(/closest to farthest/);
  });

  it("needs a header and at least one row", () => {
    expect(parseChartText("r\t20").errors[0]).toMatch(/at least one row/);
    expect(parseChartText("").chart).toBeNull();
  });

  it("round-trips through chartToText", () => {
    expect(parseChartText(chartToText(CHART)).chart).toEqual(CHART);
  });
});
