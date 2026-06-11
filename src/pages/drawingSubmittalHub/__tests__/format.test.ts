import { describe, expect, it } from "vitest";
import {
  CLOSED_SUBMITTAL_STATUSES,
  fmtDate,
  isClosedSubmittal,
  toDateInputValue,
  toLocalDay,
} from "../format";

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

describe("isClosedSubmittal (due/triage 'closed' definition)", () => {
  it("treats ONLY Released for Fabrication and Void as closed", () => {
    expect(CLOSED_SUBMITTAL_STATUSES.has("Released for Fabrication")).toBe(true);
    expect(CLOSED_SUBMITTAL_STATUSES.has("Void")).toBe(true);
    // Narrow on purpose — must agree with SubmittalVisualBoard.jsx.
    expect(CLOSED_SUBMITTAL_STATUSES.size).toBe(2);
  });

  it("does NOT close on Approved / Approved as Noted (they map to BFA/OFS/IFC)", () => {
    // Linking an approved submittal to a drawing set must not flip its due
    // status to "Closed" — Out-For-Scrub → IFC → Release work is still ahead.
    expect(isClosedSubmittal({ status: "Approved" } as any)).toBe(false);
    expect(isClosedSubmittal({ status: "Approved as Noted" } as any)).toBe(false);
  });

  it("does not close in-flight statuses", () => {
    for (const status of ["Draft", "Submitted", "Under Review", "Revise and Resubmit", "Rejected"]) {
      expect(isClosedSubmittal({ status } as any)).toBe(false);
    }
  });

  it("closes a Released-for-Fabrication or Void submittal", () => {
    expect(isClosedSubmittal({ status: "Released for Fabrication" } as any)).toBe(true);
    expect(isClosedSubmittal({ status: "Void" } as any)).toBe(true);
  });

  it("returns false for null/undefined", () => {
    expect(isClosedSubmittal(null)).toBe(false);
    expect(isClosedSubmittal(undefined)).toBe(false);
  });
});
