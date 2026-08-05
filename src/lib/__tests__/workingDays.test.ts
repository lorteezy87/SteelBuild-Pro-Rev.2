import { describe, it, expect } from "vitest";
import {
  parseLocalDate,
  formatISO,
  isWeekend,
  addWorkingDays,
  diffCalendarDays,
  workingDaysBetween,
} from "../workingDays";

// ── Ported verbatim from the SteelBuild Submittal Tracker
//    (src/lib/workingDays.test.ts) so both apps prove the same math. ──

describe("parseLocalDate", () => {
  it("parses a YYYY-MM-DD string as a local calendar day (no UTC shift)", () => {
    const d = parseLocalDate("2026-07-03")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // July = 6
    expect(d.getDate()).toBe(3);
  });

  it("returns null for empty or unparseable input", () => {
    expect(parseLocalDate(null)).toBeNull();
    expect(parseLocalDate(undefined)).toBeNull();
    expect(parseLocalDate("")).toBeNull();
    expect(parseLocalDate("not-a-date")).toBeNull();
  });
});

describe("formatISO", () => {
  it("formats a Date to YYYY-MM-DD using local fields", () => {
    expect(formatISO(new Date(2026, 6, 3, 12, 0, 0))).toBe("2026-07-03");
    expect(formatISO(new Date(2026, 0, 9, 12, 0, 0))).toBe("2026-01-09");
  });
});

describe("isWeekend", () => {
  it("is true for Saturday and Sunday", () => {
    expect(isWeekend(parseLocalDate("2026-07-04")!)).toBe(true); // Saturday
    expect(isWeekend(parseLocalDate("2026-07-05")!)).toBe(true); // Sunday
  });
  it("is false for weekdays", () => {
    expect(isWeekend(parseLocalDate("2026-07-03")!)).toBe(false); // Friday
    expect(isWeekend(parseLocalDate("2026-07-06")!)).toBe(false); // Monday
  });
});

describe("addWorkingDays", () => {
  it("rolls a Friday + 1 working day to Monday", () => {
    expect(addWorkingDays("2026-07-03", 1)).toBe("2026-07-06");
  });
  it("adds a full week of working days (Fri + 5 = next Fri)", () => {
    expect(addWorkingDays("2026-07-03", 5)).toBe("2026-07-10");
  });
  it("adds 10 working days skipping two weekends (Wed Jul 1 -> Wed Jul 15)", () => {
    expect(addWorkingDays("2026-07-01", 10)).toBe("2026-07-15");
  });
  it("returns the same date for n = 0", () => {
    expect(addWorkingDays("2026-07-03", 0)).toBe("2026-07-03");
  });
  it("treats a negative n as 0 (never runs the deadline backward)", () => {
    expect(addWorkingDays("2026-07-03", -5)).toBe("2026-07-03");
  });
  it("returns null for an unparseable start date", () => {
    expect(addWorkingDays(null, 10)).toBeNull();
  });
});

describe("diffCalendarDays", () => {
  it("counts whole calendar days from a to b", () => {
    expect(diffCalendarDays("2026-07-03", "2026-07-13")).toBe(10);
  });
  it("is negative when b is before a", () => {
    expect(diffCalendarDays("2026-07-13", "2026-07-03")).toBe(-10);
  });
  it("returns null when either date is unparseable", () => {
    expect(diffCalendarDays("2026-07-03", null)).toBeNull();
    expect(diffCalendarDays(null, "2026-07-03")).toBeNull();
  });
});

// ── New in SB Pro: signed working-day span for the "days remaining" display. ──

describe("workingDaysBetween", () => {
  it("is 0 for the same day", () => {
    expect(workingDaysBetween("2026-07-06", "2026-07-06")).toBe(0);
  });
  it("counts working days forward, excluding weekends (Fri -> next Fri = 5)", () => {
    expect(workingDaysBetween("2026-07-03", "2026-07-10")).toBe(5);
  });
  it("counts Friday -> Monday as 1 working day (weekend contributes nothing)", () => {
    expect(workingDaysBetween("2026-07-03", "2026-07-06")).toBe(1);
  });
  it("counts 10 working days over two weekends (Wed Jul 1 -> Wed Jul 15)", () => {
    expect(workingDaysBetween("2026-07-01", "2026-07-15")).toBe(10);
  });
  it("is negative (working days overdue) when b is in the past", () => {
    // today Mon Jul 6, due was Fri Jul 3 → 1 working day overdue.
    expect(workingDaysBetween("2026-07-06", "2026-07-03")).toBe(-1);
  });
  it("a due date landing on a weekend still counts the working days between", () => {
    // Fri Jul 3 -> Sat Jul 4: no working day is added crossing into the weekend.
    expect(workingDaysBetween("2026-07-03", "2026-07-04")).toBe(0);
    // Fri Jul 3 -> Sun Jul 5: still 0 working days.
    expect(workingDaysBetween("2026-07-03", "2026-07-05")).toBe(0);
  });
  it("returns null when either date is unparseable", () => {
    expect(workingDaysBetween("2026-07-03", null)).toBeNull();
    expect(workingDaysBetween(null, "2026-07-03")).toBeNull();
  });
});
