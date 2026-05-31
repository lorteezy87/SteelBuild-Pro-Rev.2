import { describe, expect, it } from "vitest";
import { fmtDate, toDateInputValue, toLocalDay } from "../format";

// These guard the Arizona (MST, UTC-7, no DST) date-display bug: a date-only
// string parsed via `new Date(...)` lands at UTC midnight, which renders as the
// PREVIOUS local day. fmtDate / toDateInputValue must read the calendar day as
// written, in agreement with toLocalDay (which backs daysUntil/dueInfo).

describe("fmtDate", () => {
  it("renders a date-only string as the same calendar day (no UTC shift)", () => {
    expect(fmtDate("2026-06-10")).toBe("Jun 10, 26");
  });

  it("does not roll a first-of-month date back to the prior month", () => {
    expect(fmtDate("2026-03-01")).toBe("Mar 1, 26");
  });

  it("renders a Date instance by its local calendar day", () => {
    expect(fmtDate(new Date(2026, 5, 10))).toBe("Jun 10, 26");
  });

  it("returns the em dash for empty / invalid input", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("")).toBe("—");
    expect(fmtDate("not-a-date")).toBe("—");
  });
});

describe("toDateInputValue", () => {
  it("round-trips a date-only string for an <input type=date>", () => {
    expect(toDateInputValue("2026-06-10")).toBe("2026-06-10");
  });

  it("zero-pads month and day", () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("returns empty string for missing input", () => {
    expect(toDateInputValue(null)).toBe("");
  });
});

describe("toLocalDay (agreement check)", () => {
  it("fmtDate of a date-only string matches formatting its toLocalDay", () => {
    const raw = "2026-12-31";
    const local = toLocalDay(raw)!;
    expect(fmtDate(raw)).toBe(local.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }));
  });
});
