import { describe, expect, it } from "vitest";
import {
  CLOSED_SUBMITTAL_STATUSES,
  fmtDate,
  isClosedPackage,
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

describe("isClosedPackage (the layer the reported bug lives in)", () => {
  // Minimal SetPackage factory — isClosedPackage only reads submittals/parent/sheets.
  const pkg = (over: any = {}) =>
    ({ key: "k", setId: null, name: "Set", parent: null, sheets: [], submittals: [], ...over } as any);

  it("does NOT close a package whose linked submittal is Approved / Approved as Noted", () => {
    // The exact path the user hits: linking an approved submittal to a drawing
    // set must keep the set OPEN at its real stage (BFA/OFS/IFC), not "Closed".
    expect(isClosedPackage(pkg({ submittals: [{ status: "Approved", round_number: 1 }] }))).toBe(false);
    expect(isClosedPackage(pkg({ submittals: [{ status: "Approved as Noted", round_number: 1 }] }))).toBe(false);
  });

  it("closes a package whose latest submittal is Released for Fabrication or Void", () => {
    expect(isClosedPackage(pkg({ submittals: [{ status: "Released for Fabrication", round_number: 1 }] }))).toBe(true);
    expect(isClosedPackage(pkg({ submittals: [{ status: "Void", round_number: 1 }] }))).toBe(true);
  });

  it("does not close an in-flight (Submitted) submittal package", () => {
    expect(isClosedPackage(pkg({ submittals: [{ status: "Submitted", round_number: 1 }] }))).toBe(false);
  });

  it("uses the latest round — a resubmittal after a prior approval stays open", () => {
    expect(
      isClosedPackage(
        pkg({
          submittals: [
            { status: "Approved", round_number: 1 },
            { status: "Submitted", round_number: 2 },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("closes on the legacy set_approval_status flag ONLY when no submittal governs", () => {
    // No governing submittal → the deprecated column is the last-resort signal.
    expect(isClosedPackage(pkg({ parent: { set_approval_status: "approved" } }))).toBe(true);
  });

  it("does NOT let a stale set_approval_status='approved' mask a mid-flow submittal", () => {
    // The deprecated-column residual: a legacy-approved set whose linked submittal
    // is only Approved (→ BFA) must show ACTIVE, not "Closed".
    expect(
      isClosedPackage(
        pkg({
          parent: { set_approval_status: "approved" },
          submittals: [{ status: "Approved", round_number: 1, ball_in_court: "EOR" }],
        }),
      ),
    ).toBe(false);
  });

  it("does NOT let legacy sheet stages mask a mid-flow submittal", () => {
    expect(
      isClosedPackage(
        pkg({
          sheets: [{ stage: "Released" }],
          submittals: [{ status: "Approved", round_number: 1, ball_in_court: "EOR" }],
        }),
      ),
    ).toBe(false);
  });

  it("keeps a MANUALLY-released package (detailing_state) closed even with a mid-flow submittal", () => {
    // Manual release stays authoritative via the detailing_state signal — must
    // not regress when the deprecated columns are gated.
    expect(
      isClosedPackage(
        pkg({
          parent: { detailing_state: "Released for Erection" },
          submittals: [{ status: "Approved", round_number: 1, ball_in_court: "EOR" }],
        }),
      ),
    ).toBe(true);
  });

  it("closes when every sheet is individually released", () => {
    expect(isClosedPackage(pkg({ sheets: [{ stage: "Released" }, { stage: "Released" }] }))).toBe(true);
  });

  it("is open for an empty package, and false for null/undefined", () => {
    expect(isClosedPackage(pkg())).toBe(false);
    expect(isClosedPackage(null)).toBe(false);
    expect(isClosedPackage(undefined)).toBe(false);
  });
});
