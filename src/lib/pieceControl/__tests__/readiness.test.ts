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

describe("piece-control drawing approval rules (Slice 6 IFC/Released)", () => {
  it("accepts IFC (Approved + GC), Released for Fab, and fab signoff", () => {
    expect(
      isDrawingApproved(drawing, {
        submittals: [
          { id: "s1", status: "Approved", ball_in_court: "GC", drawing_set_ids: ["set-1"] },
        ],
      }),
    ).toBe(true);
    expect(
      isDrawingApproved(drawing, {
        submittals: [
          {
            id: "s1",
            status: "Released for Fabrication",
            ball_in_court: null,
            drawing_set_ids: ["set-1"],
          },
        ],
      }),
    ).toBe(true);
    expect(
      isDrawingApproved(drawing, {
        drawingRevisions: [
          { id: "rev-1", drawing_id: drawing.id, is_current: true, archived_at: null },
        ],
        drawingSignoffs: [
          {
            drawing_id: drawing.id,
            drawing_revision_id: "rev-1",
            stamp_type: "approved_for_fabrication",
            is_voided: false,
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects bare set_approval_status, sheet responses, and review-only evidence", () => {
    expect(isDrawingApproved({ ...drawing, set_approval_status: "approved" })).toBe(false);
    expect(isDrawingApproved({ ...drawing, set_approval_status: "approved_as_noted" })).toBe(false);
    expect(
      isDrawingApproved(drawing, {
        submittals: [
          { id: "s1", status: "Under Review", drawing_set_ids: ["set-1"], current_round_id: "round-2" },
        ],
        sheetResponses: [
          { drawing_id: drawing.id, submittal_round_id: "round-2", response_status: "No Exception" },
        ],
      }),
    ).toBe(false);
    expect(
      isDrawingApproved(drawing, {
        drawingRevisions: [{ id: "rev-2", drawing_id: drawing.id, is_current: true }],
        drawingReviews: [{ drawing_revision_id: "rev-2", decision: "approved" }],
      }),
    ).toBe(false);
  });

  it("rejects OFS (AAN + Detailer) and R&R", () => {
    expect(
      isDrawingApproved(drawing, {
        submittals: [
          {
            id: "s1",
            status: "Approved as Noted",
            ball_in_court: "Detailer",
            drawing_set_ids: ["set-1"],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isDrawingApproved(drawing, {
        submittals: [
          {
            id: "s1",
            status: "Revise and Resubmit",
            ball_in_court: "Detailer",
            drawing_set_ids: ["set-1"],
          },
        ],
      }),
    ).toBe(false);
  });

  it("accepts legacy drawings.stage IFC / Released", () => {
    expect(isDrawingApproved({ ...drawing, stage: "IFC" })).toBe(true);
    expect(isDrawingApproved({ ...drawing, stage: "Released" })).toBe(true);
    expect(isDrawingApproved({ ...drawing, stage: "OFS" })).toBe(false);
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
        {
          id: "piece-1",
          project_id: "project-1",
          work_package_id: "wp-1",
          parent_piece_id: null,
          piece_mark: "B1",
          lot_code: "ALL",
          on_hold: true,
        },
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

  it("counts unique linked and IFC/Released drawings without writing status", () => {
    const result = evaluateWorkPackageReadiness(
      [workPackages[0]],
      [
        {
          id: "piece-1",
          project_id: "project-1",
          work_package_id: "wp-1",
          parent_piece_id: null,
          piece_mark: "B1",
          lot_code: "ALL",
          on_hold: false,
        },
        {
          id: "piece-2",
          project_id: "project-1",
          work_package_id: "wp-1",
          parent_piece_id: null,
          piece_mark: "B2",
          lot_code: "ALL",
          on_hold: false,
        },
      ],
      [
        { project_id: "project-1", piece_id: "piece-1", drawing_id: "drawing-1" },
        { project_id: "project-1", piece_id: "piece-2", drawing_id: "drawing-1" },
      ],
      [drawing],
      {
        submittals: [
          {
            id: "s1",
            status: "Approved",
            ball_in_court: "GC",
            drawing_set_ids: ["set-1"],
          },
        ],
      },
    )[0];

    expect(result).toMatchObject({
      linkedDrawingCount: 1,
      approvedDrawingCount: 1,
      unapprovedDrawingCount: 0,
      blockers: [],
      isReady: true,
    });
  });

  it("blocks readiness when linked drawings are only OFS", () => {
    const result = evaluateWorkPackageReadiness(
      [workPackages[0]],
      [
        {
          id: "piece-1",
          project_id: "project-1",
          work_package_id: "wp-1",
          parent_piece_id: null,
          piece_mark: "B1",
          lot_code: "ALL",
          on_hold: false,
        },
      ],
      [{ project_id: "project-1", piece_id: "piece-1", drawing_id: "drawing-1" }],
      [drawing],
      {
        submittals: [
          {
            id: "s1",
            status: "Approved as Noted",
            ball_in_court: "Detailer",
            drawing_set_ids: ["set-1"],
          },
        ],
      },
    )[0];

    expect(result.isReady).toBe(false);
    expect(result.approvedDrawingCount).toBe(0);
    expect(result.blockers).toContain(
      "1 linked shop drawing is not IFC / Released for fabrication.",
    );
  });
});
