import { describe, expect, it } from "vitest";
import { findBlockingRfis, computeFabReleaseGate } from "../fabReleaseGate";

const sheet = (id, rfiIds) => ({ id, sheet_number: id, linked_rfi_ids: rfiIds });
const rfi = (id, status, extra = {}) => ({ id, rfi_number: `RFI-${id}`, status, ...extra });

describe("computeFabReleaseGate", () => {
  it("is not blocked when no sheet links any RFI", () => {
    const g = computeFabReleaseGate({
      drawings: [sheet("S1", []), sheet("S2", null)],
      rfis: [rfi("a", "Open")],
    });
    expect(g.blocked).toBe(false);
    expect(g.blockingRfis).toEqual([]);
    expect(g.affectedSheets).toEqual([]);
  });

  it("blocks when a linked RFI is open, and reports the RFI + affected sheet", () => {
    const g = computeFabReleaseGate({
      drawings: [sheet("S1", ["a"]), sheet("S2", ["b"])],
      rfis: [rfi("a", "Open"), rfi("b", "Closed")],
    });
    expect(g.blocked).toBe(true);
    expect(g.blockingCount).toBe(1);
    expect(g.blockingRfis.map((r) => r.id)).toEqual(["a"]);
    expect(g.affectedSheets.map((s) => s.id)).toEqual(["S1"]);
  });

  it("does NOT block when the only linked RFIs are closed (Answered/Closed/Void)", () => {
    const g = computeFabReleaseGate({
      drawings: [sheet("S1", ["a", "b", "c"])],
      rfis: [rfi("a", "Answered"), rfi("b", "Closed"), rfi("c", "Void")],
    });
    expect(g.blocked).toBe(false);
  });

  it("treats 'Under Review' / unknown statuses as open (gate fails safe)", () => {
    const g = computeFabReleaseGate({
      drawings: [sheet("S1", ["a", "b"])],
      rfis: [rfi("a", "Under Review"), rfi("b", "Something New")],
    });
    expect(g.blocked).toBe(true);
    expect(g.blockingCount).toBe(2);
  });

  it("ignores soft-deleted RFIs", () => {
    const g = computeFabReleaseGate({
      drawings: [sheet("S1", ["a"])],
      rfis: [rfi("a", "Open", { is_deleted: true })],
    });
    expect(g.blocked).toBe(false);
  });

  it("dedupes an RFI linked from multiple sheets, but lists all affected sheets", () => {
    const g = computeFabReleaseGate({
      drawings: [sheet("S1", ["a"]), sheet("S2", ["a"])],
      rfis: [rfi("a", "Open")],
    });
    expect(g.blockingCount).toBe(1);
    expect(g.affectedSheets.map((s) => s.id).sort()).toEqual(["S1", "S2"]);
  });

  it("coerces id types when matching (numeric link vs string id)", () => {
    expect(findBlockingRfis({ drawings: [sheet("S1", [42])], rfis: [rfi("42", "Open")] })).toHaveLength(1);
  });
});
