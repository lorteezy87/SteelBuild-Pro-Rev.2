import { describe, expect, it } from "vitest";
import { findBlockingRfis, computeFabReleaseGate, linkedRfiNumbers, isUnresolvedCurrentRevision } from "../fabReleaseGate";

// drawings.linked_rfi_ids is a COMMA-SEPARATED STRING of RFI numbers.
// Slice 8: default stage Released so RFI-only cases aren't also not_ifc_ready.
const sheet = (id, linkedCsv, extra = {}) => ({
  id,
  sheet_number: id,
  linked_rfi_ids: linkedCsv,
  stage: "Released",
  ...extra,
});
const rfi = (number, status, extra = {}) => ({ id: `id-${number}`, rfi_number: number, status, ...extra });

describe("linkedRfiNumbers", () => {
  it("parses a CSV string and tolerates an array / empty", () => {
    expect(linkedRfiNumbers({ linked_rfi_ids: "RFI-001, RFI-002 ,RFI-003" })).toEqual(["RFI-001", "RFI-002", "RFI-003"]);
    expect(linkedRfiNumbers({ linked_rfi_ids: ["RFI-001", "RFI-002"] })).toEqual(["RFI-001", "RFI-002"]);
    expect(linkedRfiNumbers({ linked_rfi_ids: "" })).toEqual([]);
    expect(linkedRfiNumbers({})).toEqual([]);
  });
});

describe("computeFabReleaseGate", () => {
  it("is not blocked when no sheet links any RFI", () => {
    const g = computeFabReleaseGate({ drawings: [sheet("S1", ""), sheet("S2", null)], rfis: [rfi("RFI-001", "Open")] });
    expect(g.blocked).toBe(false);
    expect(g.affectedSheets).toEqual([]);
  });

  it("blocks when a linked RFI is open, reporting the RFI + affected sheet", () => {
    const g = computeFabReleaseGate({
      drawings: [sheet("S1", "RFI-001"), sheet("S2", "RFI-002")],
      rfis: [rfi("RFI-001", "Open"), rfi("RFI-002", "Closed")],
    });
    expect(g.blocked).toBe(true);
    expect(g.blockingCount).toBe(1);
    expect(g.blockingRfis.map((r) => r.rfi_number)).toEqual(["RFI-001"]);
    expect(g.affectedSheets.map((s) => s.id)).toEqual(["S1"]);
  });

  it("normalizes numbers — 'RFI #001' on a sheet matches 'RFI-001' RFI", () => {
    const g = computeFabReleaseGate({ drawings: [sheet("S1", "RFI #001")], rfis: [rfi("RFI-001", "Open")] });
    expect(g.blocked).toBe(true);
  });

  it("does NOT block when the only linked RFIs are closed (Answered/Closed/Void)", () => {
    const g = computeFabReleaseGate({
      drawings: [sheet("S1", "RFI-001, RFI-002, RFI-003")],
      rfis: [rfi("RFI-001", "Answered"), rfi("RFI-002", "Closed"), rfi("RFI-003", "Void")],
    });
    expect(g.blocked).toBe(false);
  });

  it("treats 'Under Review' / unknown statuses as open (fails safe)", () => {
    const g = computeFabReleaseGate({
      drawings: [sheet("S1", "RFI-001, RFI-002")],
      rfis: [rfi("RFI-001", "Under Review"), rfi("RFI-002", "Something New")],
    });
    expect(g.blocked).toBe(true);
    expect(g.blockingCount).toBe(2);
  });

  it("ignores soft-deleted RFIs", () => {
    const g = computeFabReleaseGate({ drawings: [sheet("S1", "RFI-001")], rfis: [rfi("RFI-001", "Open", { is_deleted: true })] });
    expect(g.blocked).toBe(false);
  });

  it("dedupes an RFI linked from multiple sheets, but lists all affected sheets", () => {
    const g = computeFabReleaseGate({
      drawings: [sheet("S1", "RFI-001"), sheet("S2", "RFI-001")],
      rfis: [rfi("RFI-001", "Open")],
    });
    expect(g.blockingCount).toBe(1);
    expect(g.affectedSheets.map((s) => s.id).sort()).toEqual(["S1", "S2"]);
    expect(findBlockingRfis({ drawings: [sheet("S1", "RFI-001"), sheet("S2", "RFI-001")], rfis: [rfi("RFI-001", "Open")] })).toHaveLength(1);
  });
});

describe("computeFabReleaseGate — readiness checks beyond RFIs", () => {
  it("blocks on a rejected / revise-and-resubmit sheet (no RFIs involved)", () => {
    const g = computeFabReleaseGate({ drawings: [{ id: "S1", stage: "Revise and Resubmit" }] });
    expect(g.blocked).toBe(true);
    expect(g.reasons.map((r) => r.kind)).toContain("rejected_sheets");
    expect(g.reasons.find((r) => r.kind === "rejected_sheets").sheets.map((s) => s.id)).toEqual(["S1"]);
    expect(g.blockingCount).toBe(0); // legacy RFI fields stay clean
  });

  it("blocks on a superseded sheet (revision conflict)", () => {
    const g = computeFabReleaseGate({ drawings: [{ id: "S1", stage: "Released", is_superseded: true }] });
    expect(g.reasons.map((r) => r.kind)).toContain("revision_conflict");
  });

  it("reports a sheet that is both rejected AND superseded once (under rejected)", () => {
    const g = computeFabReleaseGate({ drawings: [{ id: "S1", stage: "Rejected", is_superseded: true }] });
    const kinds = g.reasons.map((r) => r.kind);
    expect(kinds).toContain("rejected_sheets");
    expect(kinds).not.toContain("revision_conflict");
  });

  it("does NOT block an IFC/Released, non-superseded, RFI-free package", () => {
    const g = computeFabReleaseGate({
      drawings: [{ id: "S1", stage: "Released" }, { id: "S2", stage: "IFC" }],
    });
    expect(g.blocked).toBe(false);
    expect(g.reasons).toEqual([]);
  });

  it("blocks bare Approved / OFS sheets as not IFC ready (Slice 8)", () => {
    const g = computeFabReleaseGate({
      drawings: [
        { id: "S1", stage: "Released" },
        { id: "S2", stage: "OFS", set_approval_status: "approved" },
      ],
    });
    expect(g.blocked).toBe(true);
    expect(g.reasons.map((r) => r.kind)).toContain("not_ifc_ready");
    expect(g.reasons.find((r) => r.kind === "not_ifc_ready").sheets.map((s) => s.id)).toEqual(["S2"]);
  });

  it("requireSignoffs blocks IFC/Released sheets without a fab sign-off", () => {
    const drawings = [
      { id: "A", stage: "Released" }, // approved, no sign-off → blocks
      { id: "B", stage: "Released" }, // approved, has sign-off → ok
    ];
    const signoffs = [{ drawing_id: "B", stamp_type: "approved_for_fabrication" }];
    const g = computeFabReleaseGate({ drawings, signoffs, requireSignoffs: true });
    const missing = g.reasons.find((r) => r.kind === "missing_signoffs");
    expect(missing).toBeTruthy();
    expect(missing.sheets.map((s) => s.id)).toEqual(["A"]);
  });

  it("requireSignoffs=false never adds a sign-off reason", () => {
    const g = computeFabReleaseGate({ drawings: [{ id: "A", stage: "Released" }], requireSignoffs: false });
    expect(g.reasons.map((r) => r.kind)).not.toContain("missing_signoffs");
  });

  it("surfaces multiple blocking reasons together", () => {
    const g = computeFabReleaseGate({
      drawings: [
        { id: "S1", stage: "Released", linked_rfi_ids: "RFI-001" },
        { id: "S2", stage: "Rejected" },
        { id: "S3", stage: "Released", is_superseded: true },
      ],
      rfis: [{ id: "r1", rfi_number: "RFI-001", status: "Open" }],
    });
    expect(g.blocked).toBe(true);
    expect(g.reasons.map((r) => r.kind).sort()).toEqual(["open_rfis", "rejected_sheets", "revision_conflict"]);
  });

  it("blocks sheets with an unresolved current revision and explains the action", () => {
    expect(isUnresolvedCurrentRevision({ id: "A", current_release_status: "on_hold" })).toBe(true);
    const g = computeFabReleaseGate({
      drawings: [{ id: "A", stage: "Released", current_release_status: "pending_review" }],
    });
    expect(g.blocked).toBe(true);
    const reason = g.reasons.find((r) => r.kind === "unresolved_revision");
    expect(reason?.action).toMatch(/Publish or clear the current revision/i);
  });
});
