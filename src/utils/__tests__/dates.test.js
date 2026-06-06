import { describe, expect, it } from "vitest";
import { formatShortDate, localToday, toLocalDay } from "../dates";

// Arizona is MST (UTC-7, no DST). A date-only string parsed with `new Date(...)`
// lands at UTC midnight = 17:00 the previous local day, so any local-clock
// render shows it one day early. toLocalDay / formatShortDate must read the
// calendar day as written.

describe("toLocalDay", () => {
  it("reads a date-only string as the LOCAL calendar day, not UTC midnight", () => {
    const d = toLocalDay("2026-06-10");
    expect(d).not.toBeNull();
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June (0-indexed)
    expect(d.getDate()).toBe(10);
    expect(d.getHours()).toBe(0); // local midnight
  });

  it("normalizes a Date instance to local midnight", () => {
    const d = toLocalDay(new Date(2026, 0, 5, 23, 30));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(0);
  });

  it("returns null for empty / invalid input", () => {
    expect(toLocalDay(null)).toBeNull();
    expect(toLocalDay(undefined)).toBeNull();
    expect(toLocalDay("")).toBeNull();
    expect(toLocalDay("not-a-date")).toBeNull();
  });
});

describe("formatShortDate", () => {
  it("formats a date-only string without rolling back a day", () => {
    expect(formatShortDate("2026-06-10")).toBe("Jun 10, 26");
  });

  it("does not roll a first-of-month date into the prior month", () => {
    expect(formatShortDate("2026-03-01")).toBe("Mar 1, 26");
  });

  it("omits the year when withYear is false", () => {
    expect(formatShortDate("2026-06-10", { withYear: false })).toBe("Jun 10");
  });

  it("returns the em dash for empty / invalid input", () => {
    expect(formatShortDate(null)).toBe("—");
    expect(formatShortDate("nope")).toBe("—");
  });
});

describe("localToday", () => {
  it("returns a YYYY-MM-DD string matching the local clock", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(localToday()).toBe(expected);
  });
});
