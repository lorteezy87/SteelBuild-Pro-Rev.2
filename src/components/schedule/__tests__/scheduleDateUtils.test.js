import { describe, it, expect } from "vitest";
import {
  MIN_YEAR,
  MAX_YEAR,
  parseDateUTC,
  toDateOnly,
  fmtDate,
  calcDuration,
} from "../scheduleDateUtils";

describe("parseDateUTC", () => {
  it("returns null for falsy / blank input", () => {
    expect(parseDateUTC(null)).toBeNull();
    expect(parseDateUTC(undefined)).toBeNull();
    expect(parseDateUTC("")).toBeNull();
    expect(parseDateUTC("   ")).toBeNull();
  });

  it("parses YYYY-MM-DD as UTC midnight", () => {
    const d = parseDateUTC("2026-04-23");
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString()).toBe("2026-04-23T00:00:00.000Z");
  });

  it("parses ISO timestamp without crashing", () => {
    const d = parseDateUTC("2026-04-23T12:00:00Z");
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString()).toBe("2026-04-23T12:00:00.000Z");
  });

  it("rejects out-of-range years (year-clamp guard)", () => {
    expect(parseDateUTC("0026-06-15")).toBeNull();
    expect(parseDateUTC("2300-01-01")).toBeNull();
  });

  it("accepts a valid Date instance", () => {
    const orig = new Date("2026-04-23T00:00:00Z");
    expect(parseDateUTC(orig)).toBe(orig);
  });

  it("MIN_YEAR / MAX_YEAR are the documented bounds", () => {
    expect(MIN_YEAR).toBe(1900);
    expect(MAX_YEAR).toBe(2200);
  });
});

describe("toDateOnly", () => {
  it("returns YYYY-MM-DD for a valid input", () => {
    expect(toDateOnly("2026-04-23T15:30:00Z")).toBe("2026-04-23");
  });

  it("returns null for invalid input", () => {
    expect(toDateOnly("not-a-date")).toBeNull();
  });
});

describe("fmtDate", () => {
  it("formats a valid date as M/D/YY", () => {
    expect(fmtDate("2026-04-23")).toBe("4/23/26");
  });

  it("returns TBD for falsy / invalid input", () => {
    expect(fmtDate(null)).toBe("TBD");
    expect(fmtDate("garbage")).toBe("TBD");
  });
});

describe("calcDuration", () => {
  // INCLUSIVE days since §2.4 — see lib/schedule/duration.ts. These numbers
  // each went up by one when the convention changed: Apr 1 → Apr 8 is 8 days of
  // work, not 7, and a same-day task is 1 day, not 0. Exclusive counting is
  // what made the Gantt read "0d" on a row the drawer showed as 1.
  it("returns days as `Nd`, counting both endpoints", () => {
    expect(calcDuration("2026-04-01", "2026-04-08")).toBe("8d");
  });

  it("a same-day task is `1d`, not `0d`", () => {
    expect(calcDuration("2026-04-01", "2026-04-01")).toBe("1d");
  });

  it("returns TBD for invalid / negative ranges", () => {
    expect(calcDuration(null, "2026-04-01")).toBe("TBD");
    expect(calcDuration("2026-04-08", "2026-04-01")).toBe("TBD");
  });
});
