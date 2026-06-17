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

  it("degrades gracefully for an orphan revision (no matching drawing)", () => {
    const [row] = buildRevisionImpactRows([{ drawingId: "missing", drawingSetName: "Orphan" }], { drawings: [] });
    expect(row.setName).toBe("Orphan");
    expect(row.wpNames).toEqual([]);
    expect(row.rfiCount).toBe(0);
    expect(row.affectedPieces).toBeNull();
  });
});
