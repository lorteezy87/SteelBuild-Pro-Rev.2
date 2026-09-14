import { describe, it, expect } from "vitest";
import {
  durationFromDates,
  finishFromDuration,
  taskDurationDays,
  formatDuration,
  durationIsStale,
} from "../duration";

/**
 * Cover for audit §2.4 — three duration conventions disagreed about the same
 * row, and 199 of 338 dated rows in production carried a stored `duration` that
 * matched neither of their own dates.
 *
 *   | source                              | Mon → Fri | same-day |
 *   |-------------------------------------|-----------|----------|
 *   | calcDuration (Gantt, Task List)     | "4d"      | "0d"     |
 *   | calculateTaskDuration (drawer)      | 4         | 1        |
 *
 * The convention is now INCLUSIVE days — what P6 and MS Project mean, what a PM
 * means by "a five-day pour", and what this project's own data already mostly
 * said (139 rows matched inclusive vs 76 exclusive).
 */

// 2026-03-02 is a Monday; 2026-03-06 the Friday of the same week.
const MON = "2026-03-02";
const FRI = "2026-03-06";

describe("durationFromDates — inclusive", () => {
  it("Monday to Friday is five days, not four", () => {
    expect(durationFromDates(MON, FRI)).toBe(5);
  });

  it("a same-day task is one day, not zero", () => {
    // "0d" for a real day of work is what made the Gantt disagree with the
    // drawer, and reads wrong on a printed schedule.
    expect(durationFromDates(MON, MON)).toBe(1);
  });

  it("spans two weeks correctly", () => {
    expect(durationFromDates(MON, "2026-03-13")).toBe(12);
  });

  it("returns null — not 0 — when a date is missing", () => {
    // 0 would read as "no work"; the honest answer is "unknown".
    expect(durationFromDates(MON, null)).toBeNull();
    expect(durationFromDates(null, FRI)).toBeNull();
    expect(durationFromDates(null, null)).toBeNull();
    expect(durationFromDates("not-a-date", FRI)).toBeNull();
  });

  it("returns null for an inverted window rather than a negative duration", () => {
    // Two such rows exist in production, pre-validator. A negative duration
    // would propagate into the roll-up weighting as a nonsense weight.
    expect(durationFromDates(FRI, MON)).toBeNull();
  });
});

describe("finishFromDuration — the exact inverse", () => {
  it("five days from Monday finishes Friday", () => {
    expect(finishFromDuration(MON, 5)).toBe(FRI);
  });

  it("one day starts and finishes the same day", () => {
    expect(finishFromDuration(MON, 1)).toBe(MON);
  });

  it("round-trips against durationFromDates", () => {
    // The off-by-one that would silently stretch every task by a day on every
    // bulk edit. Checked across a range so a fencepost cannot hide.
    for (let days = 1; days <= 30; days++) {
      const finish = finishFromDuration(MON, days)!;
      expect(durationFromDates(MON, finish)).toBe(days);
    }
  });

  it("rejects a duration below one day", () => {
    // Under the inclusive convention there is no such thing as a zero-day task.
    expect(finishFromDuration(MON, 0)).toBeNull();
    expect(finishFromDuration(MON, -3)).toBeNull();
    expect(finishFromDuration(MON, null)).toBeNull();
    expect(finishFromDuration(MON, "abc")).toBeNull();
  });

  it("returns null on an unparseable start rather than inventing a finish", () => {
    expect(finishFromDuration(null, 5)).toBeNull();
    expect(finishFromDuration("garbage", 5)).toBeNull();
  });
});

describe("taskDurationDays — dates win over the stored column", () => {
  it("derives from the dates and ignores a stale stored value", () => {
    // This is the defect: bulk duration read the stored column, then rewrote
    // end_date from it, moving a finish using a number the UI never showed.
    expect(taskDurationDays({ start_date: MON, end_date: FRI, duration: 99 })).toBe(5);
  });

  it("falls back to the stored column when the window is incomplete", () => {
    // The only case where the column carries information the dates do not.
    expect(taskDurationDays({ start_date: MON, end_date: null, duration: 7 })).toBe(7);
    expect(taskDurationDays({ start_date: null, end_date: null, duration: 3 })).toBe(3);
  });

  it("returns null when neither source says anything usable", () => {
    expect(taskDurationDays({ start_date: null, end_date: null, duration: null })).toBeNull();
    expect(taskDurationDays({ duration: 0 })).toBeNull();
    expect(taskDurationDays({ duration: -5 })).toBeNull();
    expect(taskDurationDays(null)).toBeNull();
  });

  it("does not fall back to a stored value on an INVERTED window", () => {
    // The dates are present and broken. Falling through to the column would
    // paper over a row that needs fixing.
    expect(taskDurationDays({ start_date: FRI, end_date: MON, duration: 4 })).toBe(4);
  });
});

describe("formatDuration", () => {
  it("renders TBD, never 0d, when the duration is unknown", () => {
    expect(formatDuration({ start_date: MON, end_date: FRI })).toBe("5d");
    expect(formatDuration({ start_date: MON, end_date: null })).toBe("TBD");
    expect(formatDuration(null)).toBe("TBD");
  });
});

describe("durationIsStale", () => {
  it("flags a stored value that disagrees with the dates", () => {
    expect(durationIsStale({ start_date: MON, end_date: FRI, duration: 4 })).toBe(true);
    expect(durationIsStale({ start_date: MON, end_date: FRI, duration: 5 })).toBe(false);
  });

  it("flags a fully dated row with no stored duration at all", () => {
    // 105 production rows have a NULL duration; on a dated row that is a gap.
    expect(durationIsStale({ start_date: MON, end_date: FRI, duration: null })).toBe(true);
  });

  it("does not flag a row with nothing to disagree with", () => {
    expect(durationIsStale({ start_date: MON, end_date: null, duration: 7 })).toBe(false);
    expect(durationIsStale(null)).toBe(false);
  });
});
