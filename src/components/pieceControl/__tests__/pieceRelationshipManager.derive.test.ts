import { describe, expect, it } from "vitest";
import type { PieceRelationshipSnapshot } from "@/lib/pieceControl/relationshipsRepository";
import type { PieceRegisterRow } from "@/lib/pieceControl/repository";
import {
  calculateSelectedTons,
  countAutoAssignSkips,
  derivePieceRelationshipReadiness,
  derivePieceRelationshipView,
} from "../pieceRelationshipManager.derive";

function piece(
  overrides: Partial<PieceRegisterRow> & Pick<PieceRegisterRow, "id" | "piece_mark">,
): PieceRegisterRow {
  return {
    project_id: "project-1",
    normalized_piece_mark: overrides.piece_mark.toLowerCase(),
    lot_code: "ALL",
    parent_piece_id: null,
    quantity: 1,
    profile: null,
    material_grade: null,
    weight_each_lbs: null,
    weight_total_lbs: null,
    work_package_id: null,
    lifecycle_status: "not_started",
    on_hold: false,
    is_container: false,
    is_deleted: false,
    source_system: null,
    external_ref: null,
    metadata: null,
    updated_at: "2026-09-12T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

const snapshot: PieceRelationshipSnapshot = {
  pieces: [
    piece({
      id: "parent",
      piece_mark: "B1",
      work_package_id: "wp-1",
      quantity: 2,
      weight_each_lbs: 1000,
      weight_total_lbs: 2000,
    }),
    piece({
      id: "child",
      parent_piece_id: "parent",
      piece_mark: "B1",
      lot_code: "A",
      work_package_id: "wp-1",
      quantity: 2,
      weight_each_lbs: 1000,
      weight_total_lbs: 2000,
    }),
    piece({
      id: "unassigned",
      piece_mark: "C1",
    }),
  ],
  workPackages: [
    {
      id: "wp-1",
      project_id: "project-1",
      wp_number: "WP-001",
      name: "Steel",
    },
  ],
  pieceDrawingSets: [
    {
      piece_id: "child",
      drawing_set_id: "set-1",
      project_id: "project-1",
    },
  ],
  pieceDrawings: [],
  drawings: [],
  drawingSets: [{ id: "set-1", set_name: "Shop", is_deleted: false }],
  submittals: [],
  sheetResponses: [],
  drawingRevisions: [],
  drawingReviews: [],
  drawingSignoffs: [],
  commentDispositions: [],
  sourceAvailability: {
    pieceDrawings: "available",
    pieceDrawingSets: "available",
    drawings: "available",
    drawingSets: "available",
    revisions: "available",
    approvals: "available",
  },
};

describe("derivePieceRelationshipView", () => {
  it("excludes split parents and applies scope and drawing filters", () => {
    const view = derivePieceRelationshipView(snapshot, {
      focusedWorkPackageId: "wp-1",
      scopeFilter: "all",
      markFilter: "",
      needsDrawingOnly: true,
    });

    expect(view.leafPieces.map((piece) => piece.id)).toEqual([
      "child",
      "unassigned",
    ]);
    expect(view.selectablePieces.map((piece) => piece.id)).toEqual([
      "unassigned",
    ]);
    expect(view.drawingPieces.map((piece) => piece.id)).toEqual(["child"]);
  });

  it("preserves selected tonnage and auto-assign skip summaries", () => {
    const view = derivePieceRelationshipView(snapshot, {
      scopeFilter: "all",
      markFilter: "",
      needsDrawingOnly: false,
    });

    expect(calculateSelectedTons(view.selectablePieces, new Set(["child"]))).toEqual({
      tons: 1,
      known: 1,
      selected: 1,
    });
    expect(
      countAutoAssignSkips([
        { reason: "ambiguous" },
        { reason: "ambiguous" },
        { reason: "no_match" },
      ]),
    ).toEqual({ ambiguous: 2, no_match: 1 });
  });

  it("derives readiness independently from selectable-piece filters", () => {
    const view = derivePieceRelationshipReadiness(snapshot, "wp-1");

    expect(view.readiness).toHaveLength(1);
    expect(view.visibleReadiness.map((row) => row.workPackageId)).toEqual([
      "wp-1",
    ]);
  });
});
