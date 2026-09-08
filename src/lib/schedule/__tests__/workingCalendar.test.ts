import { describe, it, expect } from "vitest";
import {
  DEFAULT_CALENDAR,
  MON_SAT,
  ALL_DAYS,
  makeCalendar,
  isWorkingDay,
  snapToWorkingDay,
  addWorkingDays,
  workingDaysBetween,
  nonWorkingDaysBetween,
  isSevenDayCalendar,
} from "../workingCalendar";

/**
 * Cover for audit §2.1 / §7.4 — all Gantt and cascade math was calendar days,
 * so FS+1 off a Friday finish started the successor on Saturday. 32 tasks in
 * production start on a weekend.
 *
 * Anchors: 2026-03-02 is a Monday, so 03-06 is Friday, 03-07 Saturday,
 * 03-08 Sunday, 03-09 the following Monday. Fixed dates rather than relative
 * ones so a test failure names a real weekday.
 */

const MON = "2026-03-02";
const FRI = "2026-03-06";
const SAT = "2026-03-07";
const SUN = "2026-03-08";
const NEXT_MON = "2026-03-09";

describe("isWorkingDay", () => {
  it("Mon–Fri work, weekends do not", () => {
    expect(isWorkingDay(MON)).toBe(true);
    expect(isWorkingDay(FRI)).toBe(true);
    expect(isWorkingDay(SAT)).toBe(false);
    expect(isWorkingDay(SUN)).toBe(false);
  });

  it("a holiday is non-working even on a weekday", () => {
    const cal = makeCalendar({ holidays: [FRI] });
    expect(isWorkingDay(FRI, cal)).toBe(false);
    expect(isWorkingDay(MON, cal)).toBe(true);
  });

  it("a Saturday shop works Saturdays but not Sundays", () => {
    const cal = makeCalendar({ work_days: [...MON_SAT] });
    expect(isWorkingDay(SAT, cal)).toBe(true);
    expect(isWorkingDay(SUN, cal)).toBe(false);
  });

  it("is false, not throwing, on junk input", () => {
    expect(isWorkingDay(null)).toBe(false);
    expect(isWorkingDay("not-a-date")).toBe(false);
  });
});

describe("snapToWorkingDay", () => {
  it("moves a weekend date to Monday", () => {
    expect(snapToWorkingDay(SAT)).toBe(NEXT_MON);
    expect(snapToWorkingDay(SUN)).toBe(NEXT_MON);
  });

  it("leaves a working day alone, so it is safe to apply unconditionally", () => {
    expect(snapToWorkingDay(MON)).toBe(MON);
    expect(snapToWorkingDay(FRI)).toBe(FRI);
  });

  it("skips a holiday that lands on the snap target", () => {
    // Sat → Sun → Mon is a holiday → Tuesday.
    const cal = makeCalendar({ holidays: [NEXT_MON] });
    expect(snapToWorkingDay(SAT, cal)).toBe("2026-03-10");
  });
});

describe("addWorkingDays — the FS+1-off-a-Friday bug", () => {
  it("one working day after Friday is Monday, not Saturday", () => {
    // This is the defect, stated as an executable fact.
    expect(addWorkingDays(FRI, 1)).toBe(NEXT_MON);
  });

  it("n = 0 snaps a NON-working day forward without advancing", () => {
    // The contract of n = 0 is "snap, don't step". It is what lets the cascade
    // apply this unconditionally to an FS+0 link.
    expect(addWorkingDays(SAT, 0)).toBe(NEXT_MON);
    expect(addWorkingDays(SUN, 0)).toBe(NEXT_MON);
  });

  it("n = 0 leaves a working day exactly where it is", () => {
    // Not Monday: zero working days after Friday is Friday. Rounding this up
    // would push every FS+0 successor a weekend later than it should be.
    expect(addWorkingDays(FRI, 0)).toBe(FRI);
    expect(addWorkingDays(MON, 0)).toBe(MON);
  });

  it("five working days from Monday is the following Monday", () => {
    expect(addWorkingDays(MON, 5)).toBe(NEXT_MON);
  });

  it("steps over a holiday", () => {
    const cal = makeCalendar({ holidays: ["2026-03-04"] }); // the Wednesday
    // Mon +3 working days: Tue, Thu, Fri (Wed skipped).
    expect(addWorkingDays(MON, 3, cal)).toBe(FRI);
  });

  it("walks backwards for the backward pass", () => {
    expect(addWorkingDays(NEXT_MON, -1)).toBe(FRI);
    expect(addWorkingDays(NEXT_MON, -5)).toBe(MON);
  });

  it("counts from the RAW anchor, not a snapped one", () => {
    // The first working day strictly after Saturday is Monday, not Tuesday.
    // Snapping the anchor forward and THEN stepping counts the snap twice, and
    // pushed every successor of a weekend-dated predecessor a day late.
    expect(addWorkingDays(SAT, 1)).toBe(NEXT_MON);
    expect(addWorkingDays(SUN, 1)).toBe(NEXT_MON);
    // Symmetrically backwards: the first working day before Sunday is Friday.
    expect(addWorkingDays(SUN, -1)).toBe(FRI);
    expect(addWorkingDays(SAT, -1)).toBe(FRI);
  });

  it("returns null rather than guessing on bad input", () => {
    expect(addWorkingDays(null, 3)).toBeNull();
    expect(addWorkingDays(MON, Number.NaN)).toBeNull();
    expect(addWorkingDays("garbage", 1)).toBeNull();
  });
});

describe("workingDaysBetween — inclusive", () => {
  it("Monday to Friday is five working days", () => {
    expect(workingDaysBetween(MON, FRI)).toBe(5);
  });

  it("a same-day range is one", () => {
    expect(workingDaysBetween(MON, MON)).toBe(1);
  });

  it("a range spanning a weekend excludes it", () => {
    // Mon → next Mon is 8 calendar days but 6 working days.
    expect(workingDaysBetween(MON, NEXT_MON)).toBe(6);
  });

  it("a weekend-only range is zero working days", () => {
    expect(workingDaysBetween(SAT, SUN)).toBe(0);
  });

  it("returns null — not 0 — for an inverted or unparseable window", () => {
    expect(workingDaysBetween(FRI, MON)).toBeNull();
    expect(workingDaysBetween(null, FRI)).toBeNull();
  });
});

describe("nonWorkingDaysBetween", () => {
  it("counts the weekend inside a span", () => {
    expect(nonWorkingDaysBetween(MON, NEXT_MON)).toBe(2);
    expect(nonWorkingDaysBetween(MON, FRI)).toBe(0);
  });

  it("counts a holiday", () => {
    const cal = makeCalendar({ holidays: ["2026-03-04"] });
    expect(nonWorkingDaysBetween(MON, FRI, cal)).toBe(1);
  });
});

describe("makeCalendar — degrading safely", () => {
  it("falls back to Mon–Fri with no row, so every project benefits without setup", () => {
    expect(makeCalendar(null)).toBe(DEFAULT_CALENDAR);
    expect(makeCalendar(undefined)).toBe(DEFAULT_CALENDAR);
  });

  it("treats an EMPTY work_days as unconfigured, not as 'never works'", () => {
    // Otherwise every search below runs to its cap and returns null, and the
    // whole schedule silently loses its dates.
    const cal = makeCalendar({ work_days: [] });
    expect(isWorkingDay(MON, cal)).toBe(true);
    expect(addWorkingDays(FRI, 1, cal)).toBe(NEXT_MON);
  });

  it("discards out-of-range weekday numbers", () => {
    const cal = makeCalendar({ work_days: [1, 2, 9, -4] });
    expect(isWorkingDay(MON, cal)).toBe(true);        // Monday kept
    expect(isWorkingDay("2026-03-04", cal)).toBe(false); // Wednesday not listed
  });

  it("ignores unparseable holiday entries instead of throwing", () => {
    const cal = makeCalendar({ holidays: ["garbage", FRI, null as never] });
    expect(isWorkingDay(FRI, cal)).toBe(false);
    expect(isWorkingDay(MON, cal)).toBe(true);
  });
});

describe("a seven-day calendar collapses to plain calendar math", () => {
  const cal = makeCalendar({ work_days: [...ALL_DAYS] });

  it("every day works", () => {
    expect(isWorkingDay(SAT, cal)).toBe(true);
    expect(isWorkingDay(SUN, cal)).toBe(true);
    expect(isSevenDayCalendar(cal)).toBe(true);
    expect(isSevenDayCalendar(DEFAULT_CALENDAR)).toBe(false);
  });

  it("addWorkingDays behaves like raw day arithmetic", () => {
    expect(addWorkingDays(FRI, 1, cal)).toBe(SAT);
    expect(workingDaysBetween(MON, NEXT_MON, cal)).toBe(8);
  });
});
