/**
 * submittalAnalytics.test.js — Pure-function coverage for the helpers
 * that drive the Approval Matrix dashboards.
 */

import { describe, it, expect } from "vitest";
import {
  toEpochMs,
  diffDays,
  latestTimestamp,
  computeOneCycleTime,
  computeCycleTime,
  filterByDaysWindow,
  computeAverage,
  computePercentile,
  computeP50,
  computeP90,
  computeP50P90,
  computeAgingReport,
  computeLastActivityMs,
  computeFabReady,
  TERMINAL_STATUSES,
} from "../submittalAnalytics.js";

const NOW = new Date("2026-05-03T12:00:00Z").getTime();
const day = (n) => new Date(NOW - n * 86_400_000).toISOString();

describe("toEpochMs", () => {
  it("returns null for falsy input", () => {
    expect(toEpochMs(null)).toBeNull();
    expect(toEpochMs(undefined)).toBeNull();
    expect(toEpochMs("")).toBeNull();
  });
  it("parses ISO strings", () => {
    expect(toEpochMs("2026-01-01T00:00:00Z")).toBe(Date.UTC(2026, 0, 1));
  });
  it("accepts Date and number", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    expect(toEpochMs(d)).toBe(d.getTime());
    expect(toEpochMs(123456)).toBe(123456);
  });
  it("returns null for unparseable strings", () => {
    expect(toEpochMs("not a date")).toBeNull();
  });
});

describe("diffDays", () => {
  it("returns positive day delta", () => {
    expect(diffDays(day(10), day(0))).toBe(10);
  });
  it("clamps negatives to 0 (i.e. always positive)", () => {
    // Note: function uses (b - a) so day(0) - day(10) is negative.
    expect(diffDays(day(0), day(10))).toBe(0);
  });
  it("returns null for missing input", () => {
    expect(diffDays(null, day(0))).toBeNull();
    expect(diffDays(day(0), null)).toBeNull();
  });
});

describe("latestTimestamp", () => {
  it("returns the highest-valued timestamp", () => {
    expect(latestTimestamp(day(10), day(2), day(5))).toBe(toEpochMs(day(2)));
  });
  it("ignores nulls", () => {
    expect(latestTimestamp(null, undefined, day(3))).toBe(toEpochMs(day(3)));
  });
  it("returns null if all candidates are null", () => {
    expect(latestTimestamp(null, undefined, "")).toBeNull();
  });
});

describe("computeAverage", () => {
  it("returns 0 for empty", () => {
    expect(computeAverage([])).toBe(0);
  });
  it("rounds to one decimal", () => {
    expect(computeAverage([1, 2, 3])).toBe(2);
    expect(computeAverage([1, 2])).toBe(1.5);
    expect(computeAverage([1, 2, 4])).toBe(2.3);
  });
});

describe("computePercentile", () => {
  it("returns 0 for empty", () => {
    expect(computePercentile([], 0.5)).toBe(0);
  });
  it("returns the single value for length-1", () => {
    expect(computePercentile([7], 0.5)).toBe(7);
    expect(computePercentile([7], 0.9)).toBe(7);
  });
  it("computes p50 (median) on odd-count series", () => {
    expect(computeP50([1, 2, 3, 4, 5])).toBe(3);
  });
  it("interpolates p50 on even-count series", () => {
    expect(computeP50([1, 2, 3, 4])).toBe(2.5);
  });
  it("computes p90 with type-7 interpolation", () => {
    // 10 values 1..10 → rank = 0.9 * 9 = 8.1 → 9 + 0.1 * (10 - 9) = 9.1
    expect(computeP90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9.1);
  });
  it("computeP50P90 returns both", () => {
    const out = computeP50P90([1, 2, 3, 4, 5]);
    expect(out.p50).toBe(3);
    expect(out.p90).toBe(4.6);
  });
});

describe("computeOneCycleTime", () => {
  it("returns null for non-terminal status", () => {
    expect(
      computeOneCycleTime({
        status: "Submitted",
        submitted_date: day(10),
        returned_date: day(2),
      }),
    ).toBeNull();
  });
  it("returns null when submitted_date is missing", () => {
    expect(
      computeOneCycleTime({
        status: "Approved",
        returned_date: day(2),
      }),
    ).toBeNull();
  });
  it("computes days for a terminal submittal", () => {
    const out = computeOneCycleTime({
      status: "Approved",
      submitted_date: day(10),
      returned_date: day(2),
      ball_in_court: "EOR",
    });
    expect(out).toEqual({ days: 8, reviewer: "EOR" });
  });
  it("falls back to updated_at if returned_date is missing", () => {
    const out = computeOneCycleTime({
      status: "Released for Fabrication",
      submitted_date: day(20),
      updated_at: day(5),
      ball_in_court: "Fabricator",
    });
    expect(out.days).toBe(15);
    expect(out.reviewer).toBe("Fabricator");
  });
  it("uses 'Unassigned' when ball_in_court is empty", () => {
    const out = computeOneCycleTime({
      status: "Approved as Noted",
      submitted_date: day(7),
      returned_date: day(0),
    });
    expect(out.reviewer).toBe("Unassigned");
  });
  it("returns null on null input", () => {
    expect(computeOneCycleTime(null)).toBeNull();
  });
});

describe("computeCycleTime", () => {
  it("groups by reviewer and computes per-bucket stats", () => {
    const subs = [
      { status: "Approved", submitted_date: day(10), returned_date: day(0), ball_in_court: "EOR" },
      { status: "Approved", submitted_date: day(20), returned_date: day(5), ball_in_court: "EOR" },
      { status: "Released for Fabrication", submitted_date: day(8), returned_date: day(2), ball_in_court: "GC" },
      // Open submittal — must be ignored
      { status: "Under Review", submitted_date: day(3), ball_in_court: "Architect" },
    ];
    const out = computeCycleTime(subs);
    expect(out.overall.count).toBe(3);
    expect(out.overall.avg).toBeGreaterThan(0);
    expect(out.byReviewer).toHaveLength(2);
    const eor = out.byReviewer.find((b) => b.reviewer === "EOR");
    expect(eor.count).toBe(2);
    expect(eor.avg).toBe(12.5); // (10 + 15) / 2
  });
  it("returns empty stats on empty input", () => {
    const out = computeCycleTime([]);
    expect(out.overall.count).toBe(0);
    expect(out.overall.avg).toBe(0);
    expect(out.byReviewer).toEqual([]);
  });
  it("ignores soft-deleted records", () => {
    const out = computeCycleTime([
      { status: "Approved", submitted_date: day(10), returned_date: day(0), ball_in_court: "X", is_deleted: true },
    ]);
    expect(out.overall.count).toBe(0);
  });
});

describe("filterByDaysWindow", () => {
  const subs = [
    { id: "a", submitted_date: day(2)  },
    { id: "b", submitted_date: day(45) },
    { id: "c", submitted_date: day(120) },
    { id: "d", submitted_date: null    },
  ];
  it("returns all when days is falsy", () => {
    expect(filterByDaysWindow(subs, 0).length).toBe(4);
    expect(filterByDaysWindow(subs, null).length).toBe(4);
  });
  it("filters to last N days", () => {
    const out = filterByDaysWindow(subs, 30, { now: NOW });
    expect(out.map((s) => s.id)).toEqual(["a"]);
  });
  it("includes records with submitted_date exactly at the cutoff", () => {
    const out = filterByDaysWindow(subs, 60, { now: NOW });
    expect(out.map((s) => s.id).sort()).toEqual(["a", "b"]);
  });
  it("returns [] for non-array input", () => {
    expect(filterByDaysWindow(null, 30)).toEqual([]);
  });
});

describe("computeLastActivityMs", () => {
  it("picks the most recent of all four fields", () => {
    const ms = computeLastActivityMs({
      created_at:    day(50),
      updated_at:    day(20),
      submitted_date: day(40),
      returned_date: day(10),
    });
    expect(ms).toBe(toEpochMs(day(10)));
  });
  it("works when only created_at is set", () => {
    const ms = computeLastActivityMs({ created_at: day(5) });
    expect(ms).toBe(toEpochMs(day(5)));
  });
});

describe("computeAgingReport", () => {
  const subs = [
    // open + stuck 12 days
    {
      id: "a", submittal_number: "S-001", title: "Beam shop drawings",
      status: "Submitted", ball_in_court: "EOR",
      submitted_date: day(12),
    },
    // open but only 3 days stale → below default threshold
    {
      id: "b", submittal_number: "S-002", title: "Connection details",
      status: "Under Review", ball_in_court: "Architect",
      submitted_date: day(3),
    },
    // terminal — never appears in aging report
    {
      id: "c", submittal_number: "S-003", title: "Released",
      status: "Released for Fabrication",
      submitted_date: day(40), returned_date: day(5),
    },
    // open + very stuck
    {
      id: "d", submittal_number: "S-004", title: "Stair",
      status: "Revise and Resubmit", ball_in_court: "Detailer",
      submitted_date: day(30),
    },
    // soft-deleted — ignored
    {
      id: "e", submittal_number: "S-005", title: "Deleted",
      status: "Submitted", submitted_date: day(20),
      is_deleted: true,
    },
  ];
  it("filters non-terminal + threshold + sorts by daysStuck desc", () => {
    const out = computeAgingReport(subs, { thresholdDays: 7, now: NOW });
    expect(out.map((r) => r.id)).toEqual(["d", "a"]);
    expect(out[0].daysStuck).toBeGreaterThan(out[1].daysStuck);
  });
  it("respects threshold parameter", () => {
    const out = computeAgingReport(subs, { thresholdDays: 0, now: NOW });
    expect(out.map((r) => r.id)).toContain("b");
  });
  it("never includes terminal statuses", () => {
    const ids = computeAgingReport(subs, { thresholdDays: 0, now: NOW }).map((r) => r.id);
    expect(ids).not.toContain("c");
    // sanity — TERMINAL_STATUSES set is the source of truth
    expect(TERMINAL_STATUSES.has("Released for Fabrication")).toBe(true);
  });
  it("returns [] for non-array input", () => {
    expect(computeAgingReport(null)).toEqual([]);
  });
  it("returns row shape with all expected fields", () => {
    const out = computeAgingReport(subs, { thresholdDays: 7, now: NOW });
    expect(out[0]).toMatchObject({
      id: expect.any(String),
      number: expect.any(String),
      title: expect.any(String),
      status: expect.any(String),
      bic: expect.any(String),
      daysStuck: expect.any(Number),
      lastActivityIso: expect.any(String),
    });
  });
});

describe("computeFabReady", () => {
  it("returns zeros when there are no active drawings", () => {
    expect(computeFabReady([], [])).toEqual({ numerator: 0, denominator: 0, percent: 0 });
  });
  it("excludes superseded / deleted / void from denominator", () => {
    const drawings = [
      { id: "d1", stage: "BFA" },
      { id: "d2", stage: "Released", is_superseded: true },
      { id: "d3", stage: "Void" },
      { id: "d4", stage: "Rejected" },
      { id: "d5", stage: "Released", is_deleted: true },
    ];
    const out = computeFabReady(drawings, []);
    expect(out.denominator).toBe(1);
  });
  it("counts a drawing as fab-ready when its latest submittal is Released for Fabrication", () => {
    const drawings = [
      { id: "d1", stage: "Released" },
      { id: "d2", stage: "BFA" },
    ];
    const submittals = [
      { id: "s1", drawing_id: "d1", round_number: 1, status: "Approved",                    submitted_date: day(20) },
      { id: "s2", drawing_id: "d1", round_number: 2, status: "Released for Fabrication",   submitted_date: day(2)  },
      { id: "s3", drawing_id: "d2", round_number: 1, status: "Under Review",                submitted_date: day(5)  },
    ];
    const out = computeFabReady(drawings, submittals);
    expect(out.numerator).toBe(1);
    expect(out.denominator).toBe(2);
    expect(out.percent).toBe(50);
  });
  it("uses drawing_set_ids fallback when no direct drawing_id link exists", () => {
    const drawings = [
      { id: "d1", stage: "BFA", drawing_set_id: "setA" },
      { id: "d2", stage: "BFA", drawing_set_id: "setA" },
    ];
    const submittals = [
      { id: "s1", drawing_set_ids: ["setA"], status: "Released for Fabrication", round_number: 1, submitted_date: day(1) },
    ];
    const out = computeFabReady(drawings, submittals);
    expect(out.numerator).toBe(2);
    expect(out.denominator).toBe(2);
    expect(out.percent).toBe(100);
  });
  it("uses round_number then submitted_date to pick latest", () => {
    const drawings = [{ id: "d1", stage: "BFA" }];
    const submittals = [
      { id: "s1", drawing_id: "d1", round_number: 2, status: "Released for Fabrication", submitted_date: day(10) },
      { id: "s2", drawing_id: "d1", round_number: 3, status: "Revise and Resubmit",      submitted_date: day(2)  },
    ];
    const out = computeFabReady(drawings, submittals);
    // Latest is round 3 (Revise and Resubmit), so NOT fab-ready.
    expect(out.numerator).toBe(0);
  });
  it("ignores Void submittals when picking latest", () => {
    const drawings = [{ id: "d1", stage: "BFA" }];
    const submittals = [
      { id: "s1", drawing_id: "d1", round_number: 1, status: "Released for Fabrication", submitted_date: day(20) },
      { id: "s2", drawing_id: "d1", round_number: 2, status: "Void",                     submitted_date: day(1)  },
    ];
    const out = computeFabReady(drawings, submittals);
    // Void is ignored; latest non-void is Released for Fabrication.
    expect(out.numerator).toBe(1);
  });
  it("ignores soft-deleted submittals", () => {
    const drawings = [{ id: "d1", stage: "BFA" }];
    const submittals = [
      { id: "s1", drawing_id: "d1", round_number: 1, status: "Released for Fabrication", submitted_date: day(5), is_deleted: true },
    ];
    const out = computeFabReady(drawings, submittals);
    expect(out.numerator).toBe(0);
  });
  it("handles drawings array via drawing_ids", () => {
    const drawings = [
      { id: "d1", stage: "BFA" },
      { id: "d2", stage: "BFA" },
    ];
    const submittals = [
      { id: "s1", drawing_ids: ["d1", "d2"], round_number: 1, status: "Released for Fabrication", submitted_date: day(1) },
    ];
    const out = computeFabReady(drawings, submittals);
    expect(out.numerator).toBe(2);
  });
  it("rounds percent to one decimal", () => {
    const drawings = [
      { id: "d1", stage: "BFA" },
      { id: "d2", stage: "BFA" },
      { id: "d3", stage: "BFA" },
    ];
    const submittals = [
      { id: "s1", drawing_id: "d1", round_number: 1, status: "Released for Fabrication", submitted_date: day(1) },
    ];
    const out = computeFabReady(drawings, submittals);
    expect(out.percent).toBeCloseTo(33.3, 1);
  });
});
