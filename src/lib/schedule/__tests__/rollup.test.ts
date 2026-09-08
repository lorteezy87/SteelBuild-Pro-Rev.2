import { describe, it, expect } from "vitest";
import { weightedPercentComplete, weightedCoverage } from "../rollup";
import { taskDurationDays } from "../duration";
import type { DurationTaskLike } from "../duration";

/**
 * Explicitly typed: every field on DurationTaskLike is optional, so an untyped
 * fixture like `{ percent_complete: 100 }` shares no properties with it and
 * TypeScript rejects the weight function. Naming the type once here also keeps
 * the undated fixtures below honest about what they are missing.
 */
type Row = DurationTaskLike & { percent_complete?: number; status?: string };

/**
 * Cover for audit §2.3 — summary and headline percent-complete were unweighted
 * means, so a one-day punch item counted the same as a sixty-day erection
 * sequence. The audit's own worked example is the first test below.
 *
 * This number is not cosmetic: it is the hero figure in the Schedule Command
 * Center and the one a PM reads off the screen and repeats to an owner.
 */

const pct = (t: Row) =>
  t.status === "Complete" ? 100 : Math.max(0, Math.min(100, Number(t.percent_complete) || 0));

/** A task spanning `days` inclusive days from a fixed Monday. */
const task = (days: number, percent: number): Row => ({
  start_date: "2026-03-02",
  end_date: new Date(Date.UTC(2026, 2, 2 + (days - 1))).toISOString().slice(0, 10),
  percent_complete: percent,
});

describe("weightedPercentComplete — the audit's worked example", () => {
  it("a 1-day task at 100% and a 60-day task at 0% is 2%, not 50%", () => {
    const children = [task(1, 100), task(60, 0)];
    expect(weightedPercentComplete(children, pct, taskDurationDays)).toBe(2);
  });

  it("the unweighted mean it replaces would have said 50%", () => {
    // Stated explicitly so the regression is legible: if someone reverts to a
    // plain mean, this documents exactly what breaks.
    const children = [task(1, 100), task(60, 0)];
    const plainMean = Math.round(children.reduce((s, c) => s + pct(c), 0) / children.length);
    expect(plainMean).toBe(50);
    expect(weightedPercentComplete(children, pct, taskDurationDays)).not.toBe(plainMean);
  });
});

describe("weightedPercentComplete", () => {
  it("equal durations reduce to the plain mean", () => {
    const children = [task(10, 100), task(10, 0)];
    expect(weightedPercentComplete(children, pct, taskDurationDays)).toBe(50);
  });

  it("weights proportionally in the middle of the range", () => {
    // 30 days at 100% + 10 days at 0% → 3000/40 = 75
    const children = [task(30, 100), task(10, 0)];
    expect(weightedPercentComplete(children, pct, taskDurationDays)).toBe(75);
  });

  it("counts a Complete status as 100 even with a stale percent column", () => {
    const children: Row[] = [{ ...task(10, 0), status: "Complete" }];
    expect(weightedPercentComplete(children, pct, taskDurationDays)).toBe(100);
  });

  it("clamps a percent outside 0-100 rather than letting it skew the mean", () => {
    const children = [task(10, 250), task(10, -40)];
    expect(weightedPercentComplete(children, pct, taskDurationDays)).toBe(50);
  });

  it("returns null for an empty set, so the caller decides what that means", () => {
    // A 0 here would render as "no progress" on a summary with no children.
    expect(weightedPercentComplete([], pct, taskDurationDays)).toBeNull();
    expect(weightedPercentComplete(null, pct, taskDurationDays)).toBeNull();
  });
});

describe("weightedPercentComplete — when weights are missing", () => {
  it("falls back to the plain mean when NO item has a duration", () => {
    // With no basis for weighting, the plain mean is the only honest answer.
    const undated: Row[] = [{ percent_complete: 100 }, { percent_complete: 0 }];
    expect(weightedPercentComplete(undated, pct, taskDurationDays)).toBe(50);
  });

  it("ignores unweighted items when SOME are weighted, rather than counting them as 1", () => {
    // Treating an undated child as weight 1 beside a 60-day sibling would
    // near-erase it — a different lie from the one being fixed. It is excluded
    // from the weighted average instead.
    const mixed: Row[] = [task(60, 0), { percent_complete: 100 }];
    expect(weightedPercentComplete(mixed, pct, taskDurationDays)).toBe(0);
  });

  it("treats a zero or negative weight as no weight", () => {
    const zero: Row[] = [{ start_date: null, end_date: null, duration: 0, percent_complete: 100 }];
    expect(weightedPercentComplete(zero, pct, taskDurationDays)).toBe(100);
  });
});

describe("weightedCoverage", () => {
  it("reports how much of the number is actually weighted", () => {
    // A weighted percentage over 2 of 400 tasks is technically correct and
    // practically meaningless; the UI needs to be able to say so.
    const items: Row[] = [task(5, 0), task(5, 0), { percent_complete: 0 }];
    expect(weightedCoverage(items, taskDurationDays)).toEqual({ weighted: 2, total: 3 });
  });

  it("handles empty and null input", () => {
    expect(weightedCoverage([], taskDurationDays)).toEqual({ weighted: 0, total: 0 });
    expect(weightedCoverage(null, taskDurationDays)).toEqual({ weighted: 0, total: 0 });
  });
});
