import { describe, expect, it } from "vitest";
import { deriveRevisionExposure } from "../revisionExposure";
import type { PieceIntelligenceSnapshot } from "../pieceIntelligenceTypes";

function snapshot(
  patch: Partial<PieceIntelligenceSnapshot> = {},
): PieceIntelligenceSnapshot {
  return {
    pieces: [
      { id: "p1", project_id: "prj", piece_mark: "B1", normalized_piece_mark: "B1", lot_code: "A", parent_piece_id: null, quantity: 1, profile: "W12x26", material_grade: "A992", weight_each_lbs: 500, weight_total_lbs: 500, work_package_id: "wp1", lifecycle_status: "in_fabrication", current_station: "fit", on_hold: false, is_container: false, is_deleted: false, source_system: "csv", external_ref: null, metadata: null, updated_at: "2026-08-09T12:00:00Z", deleted_at: null },
    ],
    pieceDrawingSets: [{ project_id: "prj", piece_id: "p1", drawing_set_id: "set1" }],
    pieceDrawings: [],
    drawings: [{ id: "d1", project_id: "prj", drawing_set_id: "set1", sheet_number: "E502", title: "Framing", is_deleted: false, deleted_at: null, is_superseded: false }],
    drawingSets: [{ id: "set1", set_name: "Building 2", is_deleted: false, deleted_at: null }],
    drawingRevisions: [{ id: "r4", drawing_id: "d1", is_current: true, archived_at: null, revision_code: "4" }],
    workPackages: [{ id: "wp1", project_id: "prj", wp_number: "WP-004", sequence_number: "4", scheduled_start_date: "2026-08-16" }],
    submittals: [], sheetResponses: [], drawingReviews: [], drawingSignoffs: [], commentDispositions: [],
    drawingImpacts: [], rfis: [], pieceEvents: [],
    availability: { relationships: "available", approvals: "available", impacts: "available", rfis: "available", events: "available" },
    ...patch,
  };
}

describe("deriveRevisionExposure", () => {
  it("counts exact drawing-set links and groups the downstream lifecycle", () => {
    const [row] = deriveRevisionExposure(snapshot());
    expect(row.revisionId).toBe("r4");
    expect(row.verification).toBe("verified");
    expect(row.affectedPieceIds).toEqual(["p1"]);
    expect(row.exposure.in_fabrication).toBe(1);
  });

  it("does not count a sequence-only match", () => {
    const [row] = deriveRevisionExposure(snapshot({ pieceDrawingSets: [] }));
    expect(row.verification).toBe("link_required");
    expect(row.affectedPieceIds).toEqual([]);
  });

  it("removes containers and split parents through the actionable-leaf selector", () => {
    const source = snapshot();
    source.pieces = [
      { ...source.pieces[0], id: "root", lot_code: "ALL", is_container: true },
      { ...source.pieces[0], id: "lot-a", parent_piece_id: "root" },
    ];
    source.pieceDrawingSets = source.pieces.map((piece) => ({ project_id: "prj", piece_id: piece.id, drawing_set_id: "set1" }));
    const [row] = deriveRevisionExposure(source);
    expect(row.affectedPieceIds).toEqual(["lot-a"]);
  });

  it("unions and deduplicates exact drawing-set and legacy drawing links", () => {
    const source = snapshot();
    source.pieces.push({ ...source.pieces[0], id: "p2", piece_mark: "B2" });
    source.pieceDrawings = [
      { project_id: "prj", piece_id: "p1", drawing_id: "d1" },
      { project_id: "prj", piece_id: "p2", drawing_id: "d1" },
    ];

    const [row] = deriveRevisionExposure(source);

    expect(row.affectedPieceIds).toEqual(["p1", "p2"]);
  });

  it("reports partial verification when linked impact data is unavailable", () => {
    const [row] = deriveRevisionExposure(snapshot({
      availability: { relationships: "available", approvals: "available", impacts: "unavailable", rfis: "available", events: "available" },
    }));

    expect(row.verification).toBe("partial");
  });

  it("counts unresolved revision impacts and open RFIs in affected work packages", () => {
    const [row] = deriveRevisionExposure(snapshot({
      drawingImpacts: [
        { id: "impact-open", project_id: "prj", drawing_revision_id: "r4", impact_type: "fabrication", status: "open", priority: "high", title: "Check cope", notes: null, assigned_to: null, due_date: null, resolved_at: null, created_at: "2026-08-09T12:00:00Z", sheet_number: "E502", sheet_title: "Framing", revision_code: "4" },
        { id: "impact-resolved", project_id: "prj", drawing_revision_id: "r4", impact_type: "fabrication", status: "resolved", priority: "low", title: "Done", notes: null, assigned_to: null, due_date: null, resolved_at: "2026-08-09T12:00:00Z", created_at: "2026-08-09T12:00:00Z", sheet_number: "E502", sheet_title: "Framing", revision_code: "4" },
      ],
      rfis: [
        { id: "rfi-open", project_id: "prj", status: "Open", work_package_id: "wp1" },
        { id: "rfi-answered", project_id: "prj", status: "Answered", work_package_id: "wp1" },
        { id: "rfi-other", project_id: "prj", status: "Open", work_package_id: "wp2" },
      ],
    }));

    expect(row.openImpactCount).toBe(1);
    expect(row.openRfiCount).toBe(1);
  });
});
