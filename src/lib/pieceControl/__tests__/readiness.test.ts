import { describe, expect, it } from "vitest";
import {
  evaluateWorkPackageReadiness,
  isDrawingApproved,
  type ReadinessDrawing,
} from "../readiness";

const drawing: ReadinessDrawing = {
  id: "drawing-1",
  project_id: "project-1",
  drawing_set_id: "set-1",
  sheet_number: "S1.1",
  is_deleted: false,
  deleted_at: null,
  is_superseded: false,
};

describe("piece-control drawing approval rules", () => {
  it("accepts only the application's approved equivalents", () => {
    expect(isDrawingApproved({ ...drawing, set_approval_status: "approved" })).toBe(true);
    expect(isDrawingApproved({ ...drawing, set_approval_status: "approved_as_noted" })).toBe(true);
    expect(isDrawingApproved({ ...drawing, set_approval_status: null }, {
      drawingSignoffs: [{ drawing_id: drawing.id, stamp_type: "approved_for_fabrication", is_voided: false }],
    })).toBe(true);
    expect(isDrawingApproved({ ...drawing, set_approval_status: null }, {
      submittals: [{ id: "s1", status: "Approved as Noted", drawing_set_ids: ["set-1"] }],
    })).toBe(true);
    expect(isDrawingApproved({ ...drawing, set_approval_status: "Released" })).toBe(false);
    expect(isDrawingApproved({ ...drawing, set_approval_status: null }, {
      submittals: [{ id: "s1", status: "Released for Fabrication", drawing_set_ids: ["set-1"] }],
    })).toBe(false);
  });

  it("uses current submittal responses and current-revision review evidence", () => {
    expect(isDrawingApproved({ ...drawing, set_approval_status: null }, {
      submittals: [{ id: "s1", status: "Under Review", drawing_set_ids: ["set-1"], current_round_id: "round-2" }],
      sheetResponses: [
        { drawing_id: drawing.id, submittal_round_id: "round-1", response_status: "Rejected" },
        { drawing_id: drawing.id, submittal_round_id: "round-2", response_status: "No Exception" },
      ],
    })).toBe(true);

    expect(isDrawingApproved({ ...drawing, set_approval_status: null }, {
      drawingRevisions: [{ id: "rev-2", drawing_id: drawing.id, is_current: true }],
      drawingReviews: [
        { drawing_revision_id: "rev-2", decision: "approved" },
        { drawing_revision_id: "rev-2", decision: "approved_with_notes" },
      ],
    })).toBe(true);
  });
});

describe("work-package readiness", () => {
  const workPackages = [
    { id: "wp-1", project_id: "project-1" },
    { id: "wp-2", project_id: "project-1" },
  ];

  it("surfaces no-drawing and held-piece blockers in plain language", () => {
    const result = evaluateWorkPackageReadiness(
      workPackages,
      [
        { id: "piece-1", project_id: "project-1", work_package_id: "wp-1", parent_piece_id: null, piece_mark: "B1", lot_code: "ALL", on_hold: true },
      ],
      [],
      [],
    );

    expect(result[0]).toMatchObject({
      hasCanonicalPieceScope: true,
      linkedDrawingCount: 0,
      heldPieceCount: 1,
      materialState: "not yet evaluated in this release.",
      isReady: false,
    });
    expect(result[0].blockers).toContain("No shop drawings linked.");
    expect(result[0].blockers).toContain("1 scoped piece is on hold.");
    expect(result[1].blockers).toContain("No canonical pieces assigned to this work package.");
  });

  it("counts unique linked and approved drawings without writing status", () => {
    const result = evaluateWorkPackageReadiness(
      [workPackages[0]],
      [
        { id: "piece-1", project_id: "project-1", work_package_id: "wp-1", parent_piece_id: null, piece_mark: "B1", lot_code: "ALL", on_hold: false },
        { id: "piece-2", project_id: "project-1", work_package_id: "wp-1", parent_piece_id: null, piece_mark: "B2", lot_code: "ALL", on_hold: false },
      ],
      [
        { project_id: "project-1", piece_id: "piece-1", drawing_id: "drawing-1" },
        { project_id: "project-1", piece_id: "piece-2", drawing_id: "drawing-1" },
      ],
      [{ ...drawing, set_approval_status: "approved" }],
    )[0];

    expect(result).toMatchObject({
      linkedDrawingCount: 1,
      approvedDrawingCount: 1,
      unapprovedDrawingCount: 0,
      blockers: [],
      isReady: true,
    });
  });
});
