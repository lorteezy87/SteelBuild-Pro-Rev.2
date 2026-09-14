import { describe, it, expect } from "vitest";
import { buildRevisionImpactRows } from "../revisionImpactBoard";

describe("buildRevisionImpactRows", () => {
  it("joins set, work package, RFIs (open/all), and fab-blocked", () => {
    const sources = {
      drawings: [{ id: "d1", drawing_set_id: "set1", linked_rfi_ids: "RFI-001, RFI-002" }],
      drawingSets: [{ id: "set1", set_name: "Main Steel", linked_work_package_ids: ["wp1"] }],
      workPackages: [{ id: "wp1", wp_number: "WP-104", sequence_number: "2" }],
      rfis: [
        { rfi_number: "RFI-001", status: "Open", fab_hold: true },
        { rfi_number: "RFI-002", status: "Closed", fab_hold: false },
      ],
      modelElements: [
        { drawing_set_id: "set1", sequence_number: "2" },
        { drawing_set_id: "set1", sequence_number: "2" },
        { drawing_set_id: "set1", sequence_number: "3" },
      ],
    };
    const [row] = buildRevisionImpactRows(
      [{ drawingId: "d1", sheetNumber: "S2.1", severity: "high", drawingSetName: "Main Steel" }],
      sources,
    );
    expect(row.setName).toBe("Main Steel");
    expect(row.wpNames).toEqual(["WP-104"]);
    expect(row.rfiCount).toBe(2);
    expect(row.openRfiCount).toBe(1); // RFI-002 is closed
    expect(row.fabBlocked).toBe(true); // RFI-001 is open + fab_hold
    expect(row.affectedPieces).toBe(3); // exact via drawing_set_id = set1
  });

  it("falls back to the WP-sequence heuristic when elements lack a set FK", () => {
    const [row] = buildRevisionImpactRows([{ drawingId: "d1" }], {
      drawings: [{ id: "d1", drawing_set_id: "set1", linked_rfi_ids: null }],
      drawingSets: [{ id: "set1", set_name: "S", linked_work_package_ids: ["wp1"] }],
      workPackages: [{ id: "wp1", wp_number: "WP-1", sequence_number: "5" }],
      modelElements: [{ sequence_number: "5" }, { sequence_number: "5" }, { sequence_number: "9" }],
    });
    expect(row.affectedPieces).toBe(2); // two elements in sequence "5" (WP-1's sequence)
  });

  it("prefers the exact set-FK count over the sequence heuristic", () => {
    const [row] = buildRevisionImpactRows([{ drawingId: "d1" }], {
      drawings: [{ id: "d1", drawing_set_id: "set1" }],
      drawingSets: [{ id: "set1", linked_work_package_ids: ["wp1"] }],
      workPackages: [{ id: "wp1", sequence_number: "2" }],
      modelElements: [
        { drawing_set_id: "set1", sequence_number: "2" }, // counted by set (1)
        { sequence_number: "2" }, { sequence_number: "2" }, // would be 3 by sequence
      ],
    });
    expect(row.affectedPieces).toBe(1); // exact wins
  });

  it("returns null affectedPieces when there is no usable linkage", () => {
    const [row] = buildRevisionImpactRows([{ drawingId: "d1" }], {
      drawings: [{ id: "d1", drawing_set_id: "set1" }],
      drawingSets: [{ id: "set1", linked_work_package_ids: [] }], // no WP
      modelElements: [{ sequence_number: "5" }], // no set FK, no WP sequence to match
    });
    expect(row.affectedPieces).toBeNull();
  });

  it("is not fab-blocked when the fab_hold RFI is already closed", () => {
    const [row] = buildRevisionImpactRows([{ drawingId: "d1" }], {
      drawings: [{ id: "d1", drawing_set_id: "set1", linked_rfi_ids: "R1" }],
      drawingSets: [{ id: "set1", linked_work_package_ids: [] }],
      rfis: [{ rfi_number: "R1", status: "Closed", fab_hold: true }],
    });
    expect(row.openRfiCount).toBe(0);
    expect(row.fabBlocked).toBe(false);
  });

  it("counts an Answered RFI as CLOSED (canonical predicate)", () => {
    const [row] = buildRevisionImpactRows(
      [{ drawingId: "d1", sheetNumber: "S2.1", severity: "high", drawingSetName: "Set 1" }],
      {
        drawings: [{ id: "d1", drawing_set_id: "set-1", linked_rfi_ids: "100" }],
        drawingSets: [{ id: "set-1", set_name: "Set 1" }],
        workPackages: [],
        rfis: [{ id: "r1", rfi_number: "100", status: "Answered", fab_hold: true }],
        modelElements: [],
      },
    );
    expect(row.openRfiCount).toBe(0);
    expect(row.fabBlocked).toBe(false);
  });

  it("degrades gracefully for an orphan revision (no matching drawing)", () => {
    const [row] = buildRevisionImpactRows([{ drawingId: "missing", drawingSetName: "Orphan" }], { drawings: [] });
    expect(row.setName).toBe("Orphan");
    expect(row.wpNames).toEqual([]);
    expect(row.rfiCount).toBe(0);
    expect(row.affectedPieces).toBeNull();
  });
});

// ── Linked-RFI join + fab hold (§4/§5) ───────────────────────────────────────
// Two independent defects that both rendered a confident, wrong answer:
// the normalizer split on whitespace and kept "#", so the canonical "RFI #001"
// never matched; and "Fab Blocked?" read a top-level fab_hold column that does
// not exist on `rfis` (the flag lives in metadata).
describe("buildRevisionImpactRows — RFI join and fab hold", () => {
  const impact = [{ revisionId: "r1", drawingId: "d1", severity: "medium" }];
  const drawings = [{ id: "d1", sheet_number: "S1", drawing_set_id: "set1", linked_rfi_ids: "RFI #001" }];
  const drawingSets = [{ id: "set1", set_name: "Main" }];

  it("matches the canonical 'RFI #001' format the sheet editor asks for", () => {
    const rows = buildRevisionImpactRows(impact, {
      drawings, drawingSets,
      rfis: [{ id: "x", rfi_number: "RFI #001", status: "Open" }],
    });
    expect(rows[0].rfiCount).toBe(1);
    expect(rows[0].openRfiCount).toBe(1);
  });

  it("matches across punctuation variants on both sides of the join", () => {
    for (const [sheetRef, rfiNum] of [
      ["RFI #001", "RFI-001"],
      ["rfi-001", "RFI #001"],
      ["RFI001", "RFI #001"],
    ]) {
      const rows = buildRevisionImpactRows(impact, {
        drawings: [{ ...drawings[0], linked_rfi_ids: sheetRef }],
        drawingSets,
        rfis: [{ id: "x", rfi_number: rfiNum, status: "Open" }],
      });
      expect(rows[0].rfiCount, `${sheetRef} vs ${rfiNum}`).toBe(1);
    }
  });

  it("splits a multi-RFI CSV on commas only", () => {
    const rows = buildRevisionImpactRows(impact, {
      drawings: [{ ...drawings[0], linked_rfi_ids: "RFI #001, RFI #002" }],
      drawingSets,
      rfis: [
        { id: "x", rfi_number: "RFI #001", status: "Open" },
        { id: "y", rfi_number: "RFI #002", status: "Closed" },
      ],
    });
    expect(rows[0].rfiCount).toBe(2);
    expect(rows[0].openRfiCount).toBe(1);
  });

  it("reads the fab-hold flag from metadata, where RFIFormModal writes it", () => {
    const rows = buildRevisionImpactRows(impact, {
      drawings, drawingSets,
      rfis: [{ id: "x", rfi_number: "RFI #001", status: "Open", metadata: { fab_hold: true } }],
    });
    expect(rows[0].fabBlocked).toBe(true);
  });

  it("does not report fab-blocked when the hold flag is absent", () => {
    const rows = buildRevisionImpactRows(impact, {
      drawings, drawingSets,
      rfis: [{ id: "x", rfi_number: "RFI #001", status: "Open", metadata: {} }],
    });
    expect(rows[0].fabBlocked).toBe(false);
  });

  it("only counts a hold from an OPEN rfi", () => {
    const rows = buildRevisionImpactRows(impact, {
      drawings, drawingSets,
      rfis: [{ id: "x", rfi_number: "RFI #001", status: "Closed", metadata: { fab_hold: true } }],
    });
    expect(rows[0].fabBlocked).toBe(false);
  });
});
