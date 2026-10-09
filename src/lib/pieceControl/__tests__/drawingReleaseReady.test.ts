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
  it("rejects a newer Product Data approval and an unknown-type release as governing drawing approval", () => {
    expect(isGoverningDrawingReleaseReady(drawing, {
      submittals: [
        { id: "shop", submittal_type: "Shop Drawing", status: "Submitted", ball_in_court: "EOR", submitted_date: "2026-09-01", drawing_set_ids: ["set-1"] },
        { id: "product", submittal_type: "Product Data", status: "Approved", ball_in_court: "GC", submitted_date: "2026-09-02", drawing_set_ids: ["set-1"] },
        { id: "unknown", submittal_type: null, status: "Released for Fabrication", submitted_date: "2026-09-03", drawing_set_ids: ["set-1"] },
      ],
    })).toMatchObject({ ready: false, stage: "OFA", governingSubmittalId: "shop" });
  });

  it("rejects a drawing linked to a timestamp-deleted drawing set", () => {
    expect(isGoverningDrawingReleaseReady(drawing, {
      drawingSets: [{ id: "set-1", deleted_at: "2026-10-01T00:00:00Z" }],
      submittals: [{ id: "shop", submittal_type: "Shop Drawing", status: "Approved", ball_in_court: "GC", drawing_set_ids: ["set-1"] }],
    }).ready).toBe(false);
  });

  it("is ready for IFC (Approved + GC) and Released for Fabrication", () => {
    expect(
      isGoverningDrawingReleaseReady(drawing, {
        submittals: [
          { id: "s1", submittal_type: "Shop Drawing", status: "Approved", ball_in_court: "GC", drawing_set_ids: ["set-1"] },
        ],
      }).ready,
    ).toBe(true);

    expect(
      isGoverningDrawingReleaseReady(drawing, {
        submittals: [
          {
            id: "s1",
            submittal_type: "Shop Drawing",
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
            submittal_type: "Shop Drawing",
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
            submittal_type: "Shop Drawing",
            status: "Revise and Resubmit",
            ball_in_court: "Detailer",
            drawing_set_ids: ["set-1"],
          },
        ],
      }),
    ).toMatchObject({ ready: false, stage: "R&R" });
  });

  it("ignores a newer Void when choosing the governing approval for a sheet", () => {
    expect(isGoverningDrawingReleaseReady(drawing, {
      submittals: [
        { id: "void", status: "Void", submitted_date: "2026-09-02", drawing_set_ids: ["set-1"] },
        { id: "approved", submittal_type: "Shop Drawing", status: "Approved", ball_in_court: "GC", submitted_date: "2026-09-01", drawing_set_ids: ["set-1"] },
      ],
    })).toMatchObject({ ready: true, stage: "IFC", governingSubmittalId: "approved" });
  });

  it("ignores a newer timestamp-deleted submittal when choosing the governing approval", () => {
    expect(isGoverningDrawingReleaseReady(drawing, {
      submittals: [
        { id: "deleted", status: "Revise and Resubmit", submitted_date: "2026-09-02", deleted_at: "2026-09-03T00:00:00Z", drawing_set_ids: ["set-1"] },
        { id: "approved", submittal_type: "Shop Drawing", status: "Approved", ball_in_court: "GC", submitted_date: "2026-09-01", drawing_set_ids: ["set-1"] },
      ],
    })).toMatchObject({ ready: true, stage: "IFC", governingSubmittalId: "approved" });
  });

  it("does not treat bare set_approval_status Approved as release-ready", () => {
    expect(
      isGoverningDrawingReleaseReady({
        ...drawing,
        set_approval_status: "approved",
      }).ready,
    ).toBe(false);
  });

  it("does not treat a fab signoff as a substitute for a governing submittal", () => {
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
    ).toBe(false);
  });

  it("does not authorize fabrication from a legacy sheet stage or signoff without a governing submittal", () => {
    expect(isGoverningDrawingReleaseReady({ ...drawing, stage: "IFC" }))
      .toMatchObject({ ready: false, stage: "IFC", governingSubmittalId: null });
    expect(isGoverningDrawingReleaseReady(drawing, {
      drawingRevisions: [{ id: "rev-1", drawing_id: drawing.id, is_current: true }],
      drawingSignoffs: [{ drawing_id: drawing.id, drawing_revision_id: "rev-1", stamp_type: "approved_for_fabrication" }],
    }).ready).toBe(false);
  });

  it("does not let a revision signoff bypass an OFS governing submittal", () => {
    expect(isGoverningDrawingReleaseReady(drawing, {
      submittals: [{ id: "ofs", submittal_type: "Shop Drawing", status: "Approved as Noted", ball_in_court: "Detailer", drawing_set_ids: ["set-1"] }],
      drawingRevisions: [{ id: "rev-1", drawing_id: drawing.id, is_current: true }],
      drawingSignoffs: [{ drawing_id: drawing.id, drawing_revision_id: "rev-1", stamp_type: "approved_for_fabrication" }],
    })).toMatchObject({ ready: false, stage: "OFS", governingSubmittalId: "ofs" });
  });

  it("keeps legacy drawings.stage IFC / Released as display context only", () => {
    expect(
      isGoverningDrawingReleaseReady({ ...drawing, stage: "IFC" }),
    ).toMatchObject({ ready: false, stage: "IFC" });
    expect(
      isGoverningDrawingReleaseReady({ ...drawing, stage: "Released" }),
    ).toMatchObject({ ready: false, stage: "Released" });
  });
});

describe("buildPieceImpact", () => {
  it("labels a legacy IFC sheet as evidence only when no submittal governs it", () => {
    const impact = buildPieceImpact({
      piece: { id: "p1", piece_mark: "B1", lifecycle_status: "not_started", on_hold: false },
      linkedDrawingIds: ["drawing-1"],
      drawings: [{ ...drawing, stage: "IFC" }],
      evidence: {},
      currentRevisionCode: "A",
    });
    expect(impact.releaseReady).toBe(false);
    expect(impact.releaseBlockReason).toContain("No governing submittal");
    expect(impact.flags.map((flag) => flag.label)).toContain("No governing submittal — sheet stage is reference only");
  });

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
            submittal_type: "Shop Drawing",
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
            submittal_type: "Shop Drawing",
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
