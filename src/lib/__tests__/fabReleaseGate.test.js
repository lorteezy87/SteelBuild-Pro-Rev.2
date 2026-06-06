import { describe, expect, it } from "vitest";
import { findBlockingRfis, computeFabReleaseGate, linkedRfiNumbers } from "../fabReleaseGate";

// drawings.linked_rfi_ids is a COMMA-SEPARATED STRING of RFI numbers.
const sheet = (id, linkedCsv) => ({ id, sheet_number: id, linked_rfi_ids: linkedCsv });
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
