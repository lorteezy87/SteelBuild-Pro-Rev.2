import { describe, expect, it } from "vitest";
import {
  monthKey,
  lastNMonthKeys,
  nextNMonthKeys,
  bucketMonthlyBilled,
  trailingAverage,
  buildRevenueForecastSeries,
  buildRevenueHistorySeries,
  sumSeriesValues,
  peakSeriesPoint,
} from "../revenueForecastHelpers";

describe("revenueForecastHelpers", () => {
  it("month keys and series", () => {
    const now = new Date(2026, 7, 5); // Aug 2026
    expect(monthKey(now)).toBe("2026-08");
    expect(lastNMonthKeys(3, now)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(nextNMonthKeys(2, now)).toEqual(["2026-09", "2026-10"]);

    const hist = lastNMonthKeys(3, now);
    const billed = bucketMonthlyBilled(
      [
        { periodTo: "2026-07-15", delta: 100 },
        { submittedDate: "2026-06-01", delta: 50 },
        { periodTo: "2025-01-01", delta: 999 },
      ],
      hist,
    );
    expect(billed["2026-07"]).toBe(100);
    expect(billed["2026-06"]).toBe(50);
    expect(billed["2026-08"]).toBe(0);

    expect(trailingAverage(hist, billed, 3)).toBeCloseTo(50);
    const series = buildRevenueForecastSeries(hist, nextNMonthKeys(1, now), billed, 50);
    expect(series.some((p) => p.forecast)).toBe(true);
    expect(series.filter((p) => !p.forecast)).toHaveLength(3);

    const histSeries = buildRevenueHistorySeries(hist, billed);
    expect(histSeries).toHaveLength(3);
    expect(sumSeriesValues(histSeries)).toBe(150);
    expect(peakSeriesPoint(histSeries).value).toBe(100);
  });
});
