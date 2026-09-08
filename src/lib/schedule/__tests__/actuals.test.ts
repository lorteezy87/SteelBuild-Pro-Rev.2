import { describe, it, expect } from "vitest";
import {
  deriveActualsPatch,
  hasActualsPatch,
  computeFinishVariance,
  formatVariance,
  describeVariance,
  rollupVariance,
} from "../actuals";
import type { ActualsTaskLike } from "../actuals";

/**
 * Cover for audit §1.4 / §7.1 — there was nowhere to record what actually
 * happened, so 40 of 178 Complete tasks in production carry no date at all.
 *
 * The two invariants these tests exist to hold:
 *   1. An actual is never inferred from a plan (that manufactures evidence).
 *   2. An actual is never silently erased by a later status change.
 *
 * `today` is injected everywhere rather than read from the clock, so nothing
 * here depends on when it runs. The runner is pinned to TZ=UTC (vite.config.js);
 * production stamps LOCAL today, which is the point — Arizona is UTC-7, so a
 * UTC "today" would record tomorrow's date for the last 7 hours of every day.
 */

const TODAY = "2026-09-08";
const task = (over: Partial<ActualsTaskLike> = {}): ActualsTaskLike => ({
  status: "Not Started",
  start_date: "2026-09-01",
  end_date: "2026-09-10",
  ...over,
});

describe("deriveActualsPatch — stamping", () => {
  it("stamps an actual start when work begins", () => {
    expect(deriveActualsPatch({ task: task(), nextStatus: "In Progress", today: TODAY }))
      .toEqual({ actual_start_date: TODAY });
  });

  it("stamps both when a task goes straight to Complete", () => {
    // The common case on a short task nobody moved through In Progress. Without
    // the start stamp the task would have a finish and no beginning.
    expect(deriveActualsPatch({ task: task(), nextStatus: "Complete", today: TODAY }))
      .toEqual({ actual_start_date: TODAY, actual_finish_date: TODAY });
  });

  it("stamps only the finish when a start was already recorded", () => {
    const t = task({ status: "In Progress", actual_start_date: "2026-09-02" });
    expect(deriveActualsPatch({ task: t, nextStatus: "Complete", today: TODAY }))
      .toEqual({ actual_finish_date: TODAY });
  });

  it("treats Delayed as started — the work began, it is just behind", () => {
    expect(deriveActualsPatch({ task: task(), nextStatus: "Delayed", today: TODAY }))
      .toEqual({ actual_start_date: TODAY });
  });
});

describe("deriveActualsPatch — what it must NOT do", () => {
  it("never re-stamps a finish that is already recorded", () => {
    // A task bounced Complete → In Progress → Complete keeps its ORIGINAL
    // finish. The second transition corrects the status, it is not a 2nd finish.
    const t = task({ actual_start_date: "2026-09-02", actual_finish_date: "2026-09-05" });
    expect(deriveActualsPatch({ task: t, nextStatus: "Complete", today: TODAY })).toEqual({});
  });

  it("never erases a recorded actual when a task moves backwards", () => {
    const t = task({ actual_start_date: "2026-09-02", actual_finish_date: "2026-09-05" });
    for (const status of ["Not Started", "In Progress", "On Hold", "Cancelled"]) {
      expect(deriveActualsPatch({ task: t, nextStatus: status, today: TODAY })).toEqual({});
    }
  });

  it("never infers an actual from the planned dates", () => {
    // The whole point of §1.4. A plan is a promise; an actual is a fact.
    const t = task({ start_date: "2026-01-01", end_date: "2026-01-05" });
    const patch = deriveActualsPatch({ task: t, nextStatus: "Complete", today: TODAY });
    expect(patch.actual_start_date).toBe(TODAY);
    expect(patch.actual_finish_date).toBe(TODAY);
    expect(patch.actual_finish_date).not.toBe(t.end_date);
  });

  it("stamps nothing for a status that implies no work", () => {
    expect(deriveActualsPatch({ task: task(), nextStatus: "On Hold", today: TODAY })).toEqual({});
    expect(deriveActualsPatch({ task: task(), nextStatus: "Not Started", today: TODAY })).toEqual({});
  });

  it("clamps a finish that would land before a recorded start", () => {
    // A future-dated actual start is a typo, but the DB CHECK constraint would
    // reject the row and take the whole save down with it.
    const t = task({ actual_start_date: "2026-12-01" });
    const patch = deriveActualsPatch({ task: t, nextStatus: "Complete", today: TODAY });
    expect(patch.actual_finish_date).toBe("2026-12-01");
  });

  it("returns an empty patch rather than throwing on junk input", () => {
    expect(deriveActualsPatch({ task: null, nextStatus: "Complete", today: TODAY })).toEqual({});
    expect(deriveActualsPatch({ task: task(), nextStatus: null, today: TODAY })).toEqual({});
    expect(hasActualsPatch({})).toBe(false);
    expect(hasActualsPatch({ actual_start_date: TODAY })).toBe(true);
  });
});

describe("computeFinishVariance", () => {
  it("reports a late finish in days", () => {
    const v = computeFinishVariance(task({ end_date: "2026-09-10", actual_finish_date: "2026-09-14" }));
    expect(v.state).toBe("late");
    expect(v.days).toBe(4);
  });

  it("reports an early finish as a negative", () => {
    const v = computeFinishVariance(task({ end_date: "2026-09-10", actual_finish_date: "2026-09-08" }));
    expect(v.state).toBe("early");
    expect(v.days).toBe(-2);
  });

  it("distinguishes 'no actual recorded' from 'finished on time'", () => {
    // This is the §1.4 trap. Both render as a bare dash if the state is dropped,
    // and one of them is a claim the data does not support.
    const unknown = computeFinishVariance(task({ actual_finish_date: null }));
    const onTime = computeFinishVariance(task({ end_date: "2026-09-10", actual_finish_date: "2026-09-10" }));

    expect(unknown.state).toBe("unknown");
    expect(unknown.days).toBeNull();
    expect(onTime.state).toBe("on-time");
    expect(onTime.days).toBe(0);
    expect(describeVariance(unknown)).toMatch(/not the same as finished on time/);
  });

  it("prefers a baseline over the current plan when one is supplied", () => {
    // Variance against a plan that was dragged to meet the actual reads zero and
    // flatters every slip — which is exactly what a baseline is for.
    const t = task({ end_date: "2026-09-14", actual_finish_date: "2026-09-14" });
    expect(computeFinishVariance(t).state).toBe("on-time");

    const vsBaseline = computeFinishVariance(t, "2026-09-10");
    expect(vsBaseline.state).toBe("late");
    expect(vsBaseline.days).toBe(4);
  });

  it("says so when there is nothing to compare against", () => {
    const v = computeFinishVariance({ end_date: null, actual_finish_date: "2026-09-08" });
    expect(v.state).toBe("no-plan");
    expect(v.days).toBeNull();
    expect(formatVariance(v)).toBe("—");
  });
});

describe("formatVariance", () => {
  it("signs the number and uses a true minus for column alignment", () => {
    expect(formatVariance(computeFinishVariance(task({ end_date: "2026-09-10", actual_finish_date: "2026-09-14" })))).toBe("+4d");
    expect(formatVariance(computeFinishVariance(task({ end_date: "2026-09-10", actual_finish_date: "2026-09-08" })))).toBe("−2d");
    expect(formatVariance(computeFinishVariance(task({ end_date: "2026-09-10", actual_finish_date: "2026-09-10" })))).toBe("On time");
    expect(formatVariance(null)).toBe("—");
  });
});

describe("rollupVariance", () => {
  const tasks: ActualsTaskLike[] = [
    task({ end_date: "2026-09-10", actual_finish_date: "2026-09-14" }), // +4 late
    task({ end_date: "2026-09-10", actual_finish_date: "2026-09-12" }), // +2 late
    task({ end_date: "2026-09-10", actual_finish_date: "2026-09-08" }), // -2 early
    task({ end_date: "2026-09-10", actual_finish_date: "2026-09-10" }), // on time
    task({ end_date: "2026-09-10", actual_finish_date: null }),          // unmeasured
    task({ end_date: null, actual_finish_date: "2026-09-10" }),          // unmeasured
  ];

  it("counts each bucket and the worst single slip", () => {
    const r = rollupVariance(tasks);
    expect(r).toMatchObject({ measured: 4, unmeasured: 2, late: 2, early: 1, onTime: 1, worstDays: 4 });
    expect(r.averageDays).toBe(1); // (4 + 2 - 2 + 0) / 4
  });

  it("reports the unmeasured count so a headline cannot hide its denominator", () => {
    // "+1d average" across 4 of 400 tasks is not a project one day late.
    const r = rollupVariance([...tasks, ...Array.from({ length: 50 }, () => task({ actual_finish_date: null }))]);
    expect(r.measured).toBe(4);
    expect(r.unmeasured).toBe(52);
  });

  it("returns nulls rather than 0 when nothing is measured", () => {
    // averageDays: 0 would read as "dead on plan" for a project with no actuals.
    const r = rollupVariance([task({ actual_finish_date: null })]);
    expect(r.measured).toBe(0);
    expect(r.averageDays).toBeNull();
    expect(r.worstDays).toBeNull();
  });

  it("applies a per-task baseline when one is provided", () => {
    const baselines: Record<string, string> = { a: "2026-09-10" };
    const withIds = [{ ...task({ end_date: "2026-09-14", actual_finish_date: "2026-09-14" }), id: "a" }];
    const r = rollupVariance(withIds, (t) => baselines[(t as { id?: string }).id ?? ""]);
    expect(r.late).toBe(1);
    expect(r.worstDays).toBe(4);
  });

  it("tolerates empty and null input", () => {
    expect(rollupVariance([]).measured).toBe(0);
    expect(rollupVariance(null).unmeasured).toBe(0);
  });
});
