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
  it("returns days as `Nd`", () => {
    expect(calcDuration("2026-04-01", "2026-04-08")).toBe("7d");
  });

  it("zero duration is `0d`", () => {
    expect(calcDuration("2026-04-01", "2026-04-01")).toBe("0d");
  });

  it("returns TBD for invalid / negative ranges", () => {
    expect(calcDuration(null, "2026-04-01")).toBe("TBD");
    expect(calcDuration("2026-04-08", "2026-04-01")).toBe("TBD");
  });
});
