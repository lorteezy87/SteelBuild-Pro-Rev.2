import { describe, expect, it } from "vitest";
import {
  CLOSED_SUBMITTAL_STATUSES,
  buildSetPackages,
  dueInfo,
  fmtDate,
  getOperationalStateColor,
  getStatusColor,
  isClosedPackage,
  isClosedSubmittal,
  itemUrgency,
  rollupDrawingStage,
  textMuted,
  toDateInputValue,
  toLocalDay,
  buildApprovalMatrixRows,
  summarizeApprovalMatrix,
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

  it("does NOT let a Void submittal with a higher round_number mask an active governing round", () => {
    // The governing submittal (Approved → OFS) is at a LOWER round_number than a
    // Void one. Closure must follow the governing submittal (still active), not
    // the highest-round Void — otherwise the package vanishes from the hit list
    // while its stage chip shows OFS.
    expect(
      isClosedPackage(
        pkg({
          submittals: [
            { status: "Approved", ball_in_court: "Detailer", round_number: 1, submitted_date: "2026-05-01" },
            { status: "Void", round_number: 2 },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("does NOT close a partially-released legacy package on a sheet-stage MAJORITY", () => {
    // No governing submittal; a plurality of legacy stage='Released' sheets must
    // NOT close a package that still has an open (IFA) sheet — the all-sheets
    // gate, not dominantStage, decides legacy closure.
    expect(isClosedPackage(pkg({ sheets: [{ stage: "Released" }, { stage: "Released" }, { stage: "IFA" }] }))).toBe(false);
  });

  it("closes a legacy package when EVERY sheet is released via set_approval_status", () => {
    // Pins the gated all-sheets branch via the column dominantStage ignores
    // (set_approval_status, no stage) — so deleting that branch fails a test.
    expect(isClosedPackage(pkg({ sheets: [{ set_approval_status: "approved" }, { set_approval_status: "approved" }] }))).toBe(true);
  });

  it("is open for an empty package, and false for null/undefined", () => {
    expect(isClosedPackage(pkg())).toBe(false);
    expect(isClosedPackage(null)).toBe(false);
    expect(isClosedPackage(undefined)).toBe(false);
  });
});

// A date-only string for today + offset days, written as the LOCAL calendar day
// so it round-trips through toLocalDay/daysUntil without the Arizona UTC shift.
// dueInfo reads `new Date()` internally, so expected values are derived the same
// way (relative to "now") rather than hard-coded — see the engine test-pattern note.
function isoDay(offset: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("dueInfo (the Due-Status chip the matrix renders)", () => {
  it("flags a past date as overdue with a 'Nd late' label", () => {
    const info = dueInfo(isoDay(-3));
    expect(info.overdue).toBe(true);
    expect(info.dueSoon).toBe(false);
    expect(info.days).toBe(-3);
    expect(info.label).toBe("3d late");
  });

  it("labels the current day 'Due today' (due soon, not overdue)", () => {
    const info = dueInfo(isoDay(0));
    expect(info.days).toBe(0);
    expect(info.overdue).toBe(false);
    expect(info.dueSoon).toBe(true);
    expect(info.label).toBe("Due today");
  });

  it("treats a date within 7 days as due soon ('Nd left')", () => {
    const info = dueInfo(isoDay(5));
    expect(info.dueSoon).toBe(true);
    expect(info.overdue).toBe(false);
    expect(info.label).toBe("5d left");
  });

  it("a date more than 7 days out is neither overdue nor due soon", () => {
    const info = dueInfo(isoDay(20));
    expect(info.overdue).toBe(false);
    expect(info.dueSoon).toBe(false);
    expect(info.days).toBe(20);
  });

  it("returns 'No date' when there is no due date", () => {
    const info = dueInfo(null);
    expect(info.label).toBe("No date");
    expect(info.days).toBe(null);
    expect(info.overdue).toBe(false);
  });

  it("returns 'Closed' when the closed flag is set, ignoring an overdue date", () => {
    const info = dueInfo(isoDay(-99), true);
    expect(info.label).toBe("Closed");
    expect(info.overdue).toBe(false);
    expect(info.dueSoon).toBe(false);
  });
});

describe("rollupDrawingStage", () => {
  it("returns 'No sheets' for an empty set", () => {
    expect(rollupDrawingStage([])).toBe("No sheets");
  });

  it("rolls up to 'Released' only when EVERY sheet is released", () => {
    expect(rollupDrawingStage([{ stage: "Released" }, { stage: "Released" }] as any)).toBe("Released");
  });

  it("surfaces 'Needs Action' when any sheet is rejected / R&R / returned", () => {
    expect(rollupDrawingStage([{ stage: "IFA" }, { stage: "Rejected" }] as any)).toBe("Needs Action");
  });

  it("rolls up to 'In Review' when a sheet is mid-approval (IFA…IFC)", () => {
    expect(rollupDrawingStage([{ stage: "IFA" }, { stage: "OFA" }] as any)).toBe("In Review");
  });
});

describe("status + operational-state color resolvers", () => {
  it("getStatusColor maps a known status and falls back to muted", () => {
    expect(getStatusColor("Approved")).toBe("#10b981");
    expect(getStatusColor("Released for Fabrication")).toBe("#0ea5e9");
    expect(getStatusColor("totally-unknown-status")).toBe(textMuted);
  });

  it("getOperationalStateColor maps a drafting/release state and falls back to muted", () => {
    expect(getOperationalStateColor("Not Started")).toBe("#64748b");
    expect(getOperationalStateColor("Partially Released")).toBe("#10b981");
    expect(getOperationalStateColor("totally-unknown-state")).toBe(textMuted);
  });
});

describe("buildSetPackages (the set↔submittal join behind every matrix row)", () => {
  const sets = [
    { id: "s1", set_name: "Main Steel" },
    { id: "s2", set_name: "Anchor Bolts" },
  ];
  const drawings = [
    { id: "d1", drawing_set_id: "s1" },
    { id: "d2", drawing_set_id: "s1" },
    { id: "d3", drawing_set_id: "s2" },
    { id: "d4", drawing_set_id: "s1", is_superseded: true }, // skipped
    { id: "d5", drawing_set_id: "s2", is_deleted: true },    // skipped
  ];
  const submittals = [
    { id: "sub1", drawing_set_ids: ["s1"] },           // linked by id
    { id: "sub2", drawing_set_name: "Anchor Bolts" },  // linked by name fallback
    { id: "sub3", drawing_set_ids: ["s1"], is_deleted: true }, // excluded
  ];

  it("groups live sheets under their parent set, skipping deleted + superseded", () => {
    const pkgs = buildSetPackages(drawings as any, sets as any, submittals as any);
    const s1 = pkgs.find((p) => p.setId === "s1")!;
    const s2 = pkgs.find((p) => p.setId === "s2")!;
    expect(s1.sheets.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(s2.sheets.map((d) => d.id)).toEqual(["d3"]);
  });

  it("links a submittal by drawing_set_ids and by drawing_set_name fallback", () => {
    const pkgs = buildSetPackages(drawings as any, sets as any, submittals as any);
    expect(pkgs.find((p) => p.setId === "s1")!.submittals.map((s) => s.id)).toEqual(["sub1"]);
    expect(pkgs.find((p) => p.setId === "s2")!.submittals.map((s) => s.id)).toEqual(["sub2"]);
  });

  it("excludes a soft-deleted submittal from every package", () => {
    const pkgs = buildSetPackages(drawings as any, sets as any, submittals as any);
    expect(pkgs.flatMap((p) => p.submittals.map((s) => s.id))).not.toContain("sub3");
  });

  it("yields a package for every named set (even empty), and nothing for empty input", () => {
    expect(buildSetPackages([], sets as any, [])).toHaveLength(2);
    expect(buildSetPackages([], [], [])).toHaveLength(0);
  });
});

describe("itemUrgency (triage ordering)", () => {
  const item = (over: any): any => ({
    due: { overdue: false, dueSoon: false, sort: 0 },
    needsAction: false,
    dueDate: "2026-01-01",
    title: "x",
    ...over,
  });

  it("orders overdue → due-soon → needs-action → undated → normal", () => {
    const overdue = item({ due: { overdue: true, dueSoon: false, sort: -2 } });
    const soon = item({ due: { overdue: false, dueSoon: true, sort: 1 } });
    const action = item({ needsAction: true });
    const undated = item({ dueDate: null });
    const normal = item({});
    const sorted = [normal, undated, action, soon, overdue].sort(itemUrgency);
    const bucket = (i: any) =>
      i.due.overdue ? "overdue" : i.due.dueSoon ? "soon" : i.needsAction ? "action" : !i.dueDate ? "undated" : "normal";
    expect(sorted.map(bucket)).toEqual(["overdue", "soon", "action", "undated", "normal"]);
  });

  it("breaks ties on the same rank by due.sort (earlier first)", () => {
    const earlier = item({ due: { overdue: true, dueSoon: false, sort: -5 }, title: "B" });
    const later = item({ due: { overdue: true, dueSoon: false, sort: -1 }, title: "A" });
    expect([later, earlier].sort(itemUrgency).map((i) => i.title)).toEqual(["B", "A"]);
  });
});

describe("buildApprovalMatrixRows", () => {
  const sets = [
    { id: "s1", set_name: "Main Steel", discipline: "Structural", is_deleted: false },
    { id: "s2", set_name: "Anchor Bolts", discipline: "Structural", is_deleted: false },
    { id: "s3", set_name: "Old", is_deleted: true }, // deleted → excluded
  ];
  const subs = [
    { id: "a", drawing_set_ids: ["s1"], round_number: 1, status: "Submitted", submittal_number: "001" },
    { id: "b", drawing_set_ids: ["s1"], round_number: 2, status: "Approved", submittal_number: "002" },
    { id: "c", drawing_set_ids: ["s2"], is_deleted: true, round_number: 1, status: "Approved" }, // deleted sub
  ];

  it("joins active sets to their active submittals and picks the latest round", () => {
    const rows = buildApprovalMatrixRows(sets, subs);
    expect(rows).toHaveLength(2); // s3 deleted → excluded
    const s1 = rows.find((r) => r.id === "s1");
    expect(s1.submittals).toHaveLength(2);
    expect(s1.latestSubmittal.id).toBe("b"); // round 2 wins
    const s2 = rows.find((r) => r.id === "s2");
    expect(s2.submittals).toHaveLength(0); // its only submittal is deleted
    expect(s2.latestSubmittal).toBeNull();
  });

  it("filters by search across set name, discipline, and submittal number", () => {
    expect(buildApprovalMatrixRows(sets, subs, "anchor").map((r) => r.id)).toEqual(["s2"]);
    expect(buildApprovalMatrixRows(sets, subs, "002").map((r) => r.id)).toEqual(["s1"]); // by submittal #
    expect(buildApprovalMatrixRows(sets, subs, "zzz")).toEqual([]);
  });

  it("handles empty input", () => {
    expect(buildApprovalMatrixRows([], [])).toEqual([]);
  });
});

describe("summarizeApprovalMatrix", () => {
  const row = (status: string | null, over = false, soon = false) => ({
    latestSubmittal: status ? { status } : null,
    due: { overdue: over, dueSoon: soon },
  });
  it("buckets approved / rejected / pending / no-submittal and tallies due flags", () => {
    const s = summarizeApprovalMatrix([
      row("Approved"),
      row("Released for Fabrication"),
      row("Revise and Resubmit", true), // rejected + overdue
      row("Submitted", false, true), // pending + dueSoon
      row(null), // no submittal
    ]);
    expect(s.approved).toBe(2);
    expect(s.rejected).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.noSubmittal).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.dueSoon).toBe(1);
    expect(s.total).toBe(5);
  });
  it("handles empty input", () => {
    expect(summarizeApprovalMatrix([])).toMatchObject({ total: 0, approved: 0 });
  });
});
