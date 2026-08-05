import { describe, it, expect } from "vitest";
import {
  DEFAULT_CYCLE_DAYS,
  diffDays,
  addDays,
  percentile,
  computeCycleStats,
  forecastSubmittal,
  forecastPortfolio,
} from "@/lib/submittalForecast";

describe("submittalForecast — date helpers", () => {
  it("diffDays returns whole calendar days (b − a), null on bad input", () => {
    expect(diffDays("2026-01-01", "2026-01-15")).toBe(14);
    expect(diffDays("2026-01-15", "2026-01-01")).toBe(-14);
    expect(diffDays(null, "2026-01-01")).toBeNull();
    expect(diffDays("2026-01-01", "")).toBeNull();
  });
  it("addDays adds across month boundaries", () => {
    expect(addDays("2026-01-25", 10)).toBe("2026-02-04");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays(null, 5)).toBeNull();
  });
});

describe("submittalForecast — percentile", () => {
  it("interpolates linearly", () => {
    expect(percentile([10], 0.5)).toBe(10);
    expect(percentile([10, 20], 0.5)).toBe(15);
    expect(percentile([10, 20, 30, 40], 0.75)).toBe(32.5);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("submittalForecast — computeCycleStats", () => {
  it("mines submittal-level cycles (submitted→returned, else approved)", () => {
    const stats = computeCycleStats({
      submittals: [
        { id: "s1", submitted_date: "2026-01-01", returned_date: "2026-01-11", reviewer: "EOR", discipline: "Structural" },
        { id: "s2", submitted_date: "2026-01-01", approved_date: "2026-01-21", reviewer: "EOR", discipline: "Structural" },
        { id: "s3", submitted_date: "2026-01-01", returned_date: "2025-12-01" }, // negative → dropped
      ],
    });
    expect(stats.sampleCount).toBe(2);
    expect(stats.overall.count).toBe(2);
    expect(stats.byReviewer.get("EOR")?.count).toBe(2);
    expect(stats.byDiscipline.get("Structural")?.count).toBe(2);
  });

  it("prefers round samples and never double-counts a submittal's cycle", () => {
    const stats = computeCycleStats({
      rounds: [
        { submittal_id: "s1", submitted_date: "2026-01-01", returned_date: "2026-01-08", reviewer: "GC" },
      ],
      submittals: [
        // s1 already has a completed round → its submittal-level pair is ignored
        { id: "s1", submitted_date: "2026-01-01", returned_date: "2026-01-30", reviewer: "GC" },
        { id: "s2", submitted_date: "2026-01-01", returned_date: "2026-01-15", reviewer: "GC" },
      ],
    });
    expect(stats.sampleCount).toBe(2); // round s1 (7d) + submittal s2 (14d), NOT s1's 29d
    expect(stats.overall.p50).toBe(10.5);
  });

  it("is safe on empty input", () => {
    const stats = computeCycleStats({});
    expect(stats.sampleCount).toBe(0);
    expect(stats.overall.count).toBe(0);
  });
});

describe("submittalForecast — forecastSubmittal", () => {
  // 6 structural samples, median 10 days, p75 ~12.25
  const stats = computeCycleStats({
    submittals: Array.from({ length: 6 }, (_, i) => ({
      id: `h${i}`,
      submitted_date: "2026-01-01",
      returned_date: addDays("2026-01-01", [8, 9, 10, 10, 11, 14][i]),
      discipline: "Structural",
    })),
  });

  it("skips submittals that aren't under review", () => {
    const f = forecastSubmittal({
      submittal: { id: "s", status: "Approved", submitted_date: "2026-03-01" },
      stats,
      today: "2026-03-05",
    });
    expect(f.forecastable).toBe(false);
  });

  it("needs a sent date", () => {
    const f = forecastSubmittal({
      submittal: { id: "s", status: "Under Review" },
      stats,
      today: "2026-03-05",
    });
    expect(f.forecastable).toBe(false);
  });

  it("projects expected + worst-case return from the discipline cycle", () => {
    const f = forecastSubmittal({
      submittal: { id: "s", status: "Submitted", submitted_date: "2026-03-01", discipline: "Structural", required_date: "2026-04-01" },
      stats,
      today: "2026-03-05",
    });
    expect(f.forecastable).toBe(true);
    expect(f.cycleP50).toBe(10);
    expect(f.expectedReturn).toBe("2026-03-11");
    expect(f.basis).toContain("Structural");
    expect(f.risk).toBe("low");
    expect(f.label).toBe("On track");
  });

  it("flags 'Review overdue' when today is past the expected return", () => {
    const f = forecastSubmittal({
      submittal: { id: "s", status: "Under Review", submitted_date: "2026-03-01", discipline: "Structural" },
      stats,
      today: "2026-03-20", // well past 03-11
    });
    expect(f.risk).toBe("high");
    expect(f.label).toBe("Review overdue");
  });

  it("flags 'Forecast late' when the expected return lands after the required date", () => {
    const f = forecastSubmittal({
      submittal: { id: "s", status: "Submitted", submitted_date: "2026-03-01", discipline: "Structural", required_date: "2026-03-05" },
      stats,
      today: "2026-03-02",
    });
    expect(f.risk).toBe("high");
    expect(f.label).toBe("Forecast late");
  });

  it("falls back to the default cycle and marks fab impact when sets are linked", () => {
    const f = forecastSubmittal({
      submittal: {
        id: "s",
        status: "Submitted",
        submitted_date: "2026-03-01",
        required_date: "2026-03-05", // sooner than the 14d default → late
        drawing_set_ids: ["set-1"],
      },
      stats: computeCycleStats({}), // no history
      today: "2026-03-02",
    });
    expect(f.cycleP50).toBe(DEFAULT_CYCLE_DAYS);
    expect(f.basis).toContain("default");
    expect(f.risk).toBe("high");
    expect(f.fabImpact).toBe(true);
    expect(f.basisCount).toBe(0);
    expect(f.lowConfidence).toBe(true); // no history → rough placeholder, not an authoritative ETA
  });

  it("lowConfidence is FALSE once the bucket has enough history (≥ MIN_BUCKET_SAMPLES)", () => {
    const f = forecastSubmittal({
      submittal: { id: "s", status: "Submitted", submitted_date: "2026-03-01", discipline: "Structural" },
      stats, // 6 structural samples
      today: "2026-03-05",
    });
    expect(f.basisCount).toBe(6);
    expect(f.lowConfidence).toBe(false);
  });

  it("lowConfidence is TRUE on a thin overall bucket (1–2 samples, no matching reviewer/discipline)", () => {
    const thin = computeCycleStats({
      submittals: [
        { id: "a", submitted_date: "2026-01-01", returned_date: "2026-01-09" },
        { id: "b", submitted_date: "2026-01-01", returned_date: "2026-01-13" },
      ],
    });
    const f = forecastSubmittal({
      submittal: { id: "s", status: "Submitted", submitted_date: "2026-03-01", discipline: "Electrical" },
      stats: thin,
      today: "2026-03-05",
    });
    expect(f.basisCount).toBe(2); // falls back to the 2-sample overall bucket
    expect(f.lowConfidence).toBe(true);
  });
});

describe("submittalForecast — forecastPortfolio", () => {
  it("summarizes pending reviews by risk", () => {
    const submittals = [
      { id: "done", status: "Approved", submitted_date: "2026-01-01", returned_date: "2026-01-10", discipline: "Structural" },
      { id: "ontrack", status: "Submitted", submitted_date: "2026-03-01", discipline: "Structural", required_date: "2026-12-01" },
      { id: "late", status: "Under Review", submitted_date: "2026-03-01", discipline: "Structural", required_date: "2026-03-02", drawing_set_ids: ["x"] },
    ];
    const pf = forecastPortfolio({ submittals, today: "2026-03-03" });
    expect(pf.summary.pending).toBe(2); // only the two under-review
    expect(pf.summary.late).toBe(1);
    expect(pf.summary.onTrack).toBe(1);
    expect(pf.summary.fabImpact).toBe(1);
  });
});
