import { describe, expect, it } from "vitest";
import {
  buildPieceImpact,
  isGoverningDrawingReleaseReady,
} from "../drawingReleaseReady";
import type { ReadinessDrawing } from "../readiness";

const drawing: ReadinessDrawing = {
  id: "drawing-1",
  project_id: "project-1",
  drawing_set_id: "set-1",
  sheet_number: "S1.1",
  is_deleted: false,
  deleted_at: null,
  is_superseded: false,
};

describe("isGoverningDrawingReleaseReady", () => {
  it("is ready for IFC (Approved + GC) and Released for Fabrication", () => {
    expect(
      isGoverningDrawingReleaseReady(drawing, {
        submittals: [
          { id: "s1", status: "Approved", ball_in_court: "GC", drawing_set_ids: ["set-1"] },
        ],
      }).ready,
    ).toBe(true);

    expect(
      isGoverningDrawingReleaseReady(drawing, {
        submittals: [
          {
            id: "s1",
            status: "Released for Fabrication",
            ball_in_court: null,
            drawing_set_ids: ["set-1"],
          },
        ],
      }).ready,
    ).toBe(true);
  });

  it("blocks OFS (AAN + Detailer) and R&R", () => {
    expect(
      isGoverningDrawingReleaseReady(drawing, {
        submittals: [
          {
            id: "s1",
            status: "Approved as Noted",
            ball_in_court: "Detailer",
            drawing_set_ids: ["set-1"],
          },
        ],
      }),
    ).toMatchObject({ ready: false, stage: "OFS" });

    expect(
      isGoverningDrawingReleaseReady(drawing, {
        submittals: [
          {
            id: "s1",
            status: "Revise and Resubmit",
            ball_in_court: "Detailer",
            drawing_set_ids: ["set-1"],
          },
        ],
      }),
    ).toMatchObject({ ready: false, stage: "R&R" });
  });

  it("does not treat bare set_approval_status Approved as release-ready", () => {
    expect(
      isGoverningDrawingReleaseReady({
        ...drawing,
        set_approval_status: "approved",
      }).ready,
    ).toBe(false);
  });

  it("accepts fab signoff on the current revision", () => {
    expect(
      isGoverningDrawingReleaseReady(drawing, {
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
      }).ready,
    ).toBe(true);
  });

  it("accepts legacy drawings.stage IFC / Released", () => {
    expect(
      isGoverningDrawingReleaseReady({ ...drawing, stage: "IFC" }).ready,
    ).toBe(true);
    expect(
      isGoverningDrawingReleaseReady({ ...drawing, stage: "Released" }).ready,
    ).toBe(true);
  });
});

describe("buildPieceImpact", () => {
  it("flags R&R / unresolved comments / critical aging and blocks release", () => {
    const impact = buildPieceImpact({
      piece: {
        id: "p1",
        piece_mark: "B1",
        lifecycle_status: "not_started",
        on_hold: false,
      },
      linkedDrawingIds: ["drawing-1"],
      drawings: [drawing],
      evidence: {
        submittals: [
          {
            id: "s1",
            status: "Revise and Resubmit",
            ball_in_court: "Detailer",
            drawing_set_ids: ["set-1"],
            required_date: "2026-07-01",
          },
        ],
      },
      commentDispositions: [
        {
          id: "c1",
          status: "Unreviewed",
          is_required: true,
          comment_text: "Fix weld",
        },
      ],
      currentRevisionCode: "A",
    });

    expect(impact.releaseReady).toBe(false);
    expect(impact.workflowStage).toBe("R&R");
    expect(impact.flags.map((f) => f.key)).toEqual(
      expect.arrayContaining([
        "tied_to_rr",
        "unresolved_required_comment",
        "aging_critical",
      ]),
    );
  });

  it("is release-ready at IFC with no open comments", () => {
    const impact = buildPieceImpact({
      piece: {
        id: "p1",
        piece_mark: "B1",
        lifecycle_status: "released",
        on_hold: false,
      },
      linkedDrawingIds: ["drawing-1"],
      drawings: [drawing],
      evidence: {
        submittals: [
          {
            id: "s1",
            status: "Approved",
            ball_in_court: "GC",
            drawing_set_ids: ["set-1"],
          },
        ],
      },
      currentRevisionCode: "B",
    });
    expect(impact.releaseReady).toBe(true);
    expect(impact.workflowStage).toBe("IFC");
    expect(impact.flags).toEqual([]);
  });
});
