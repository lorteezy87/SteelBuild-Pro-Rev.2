import { describe, expect, it } from "vitest";
import {
  deriveRevisionControlEvidence,
  modelScopeEvidence,
  comparisonEvidenceByRevision,
} from "@/lib/revisionControlEvidence";

describe("revisionControlEvidence", () => {
  it("accepts only the immediate predecessor pair, even when an older pair is complete", () => {
    const revisions = [{ id: "r3", supersedes_revision_id: "r2" }];
    const olderPair = { id: "c1", from_revision_id: "r1", to_revision_id: "r3", compare_status: "complete", is_deleted: false };
    expect(comparisonEvidenceByRevision(revisions, [olderPair])).toEqual({});
    expect(comparisonEvidenceByRevision(revisions, [
      olderPair,
      { ...olderPair, id: "c2", from_revision_id: "r2", compare_status: "processing" },
    ])).toEqual({ r3: { status: "processing" } });
    expect(comparisonEvidenceByRevision(revisions, [
      { ...olderPair, from_revision_id: "r2" },
    ])).toEqual({ r3: { status: "complete" } });
  });

  it("excludes archived evidence and revisions without a known predecessor", () => {
    const comparison = { id: "c1", from_revision_id: "r1", to_revision_id: "r2", compare_status: "complete", is_deleted: false };
    expect(comparisonEvidenceByRevision([{ id: "r2" }], [comparison])).toEqual({});
    expect(comparisonEvidenceByRevision([{ id: "r2", supersedes_revision_id: "r1" }], [
      { ...comparison, is_deleted: true },
    ])).toEqual({});
  });
  it("keeps missing downstream dates review-required", () => {
    expect(deriveRevisionControlEvidence({
      isChanged: true,
      comparison: { status: "complete" },
      downstreamSeverity: "unknown",
      model: { state: "exact", affectedPieces: 2, reasonCode: "MODEL_SCOPE_EXACT" },
    })).toMatchObject({
      status: "review_required",
      reasons: [{ code: "DOWNSTREAM_UNKNOWN" }],
    });
  });

  it("does not turn an unloaded model roster into zero affected pieces", () => {
    expect(modelScopeEvidence({
      rosterCount: 664,
      rosterLoaded: false,
      drawingSetId: "set-1",
      elements: [],
    })).toEqual({
      state: "not_loaded",
      affectedPieces: null,
      reasonCode: "MODEL_ROSTER_NOT_LOADED",
    });
  });

  it("uses exact drawing-set links before a sequence estimate", () => {
    expect(modelScopeEvidence({
      rosterCount: 3,
      rosterLoaded: true,
      drawingSetId: "set-1",
      workPackageSequences: ["A"],
      elements: [
        { drawing_set_id: "set-1", sequence_number: "B" },
        { drawing_set_id: "set-1", sequence_number: "A" },
        { drawing_set_id: "set-2", sequence_number: "A" },
      ],
    })).toEqual({
      state: "exact",
      affectedPieces: 2,
      reasonCode: "MODEL_SCOPE_EXACT",
    });
  });

  it("marks a missing completed comparison as review-required", () => {
    expect(deriveRevisionControlEvidence({
      isChanged: true,
      comparison: null,
      downstreamSeverity: "low",
      model: { state: "exact", affectedPieces: 0, reasonCode: "MODEL_SCOPE_EXACT" },
    })).toMatchObject({
      status: "review_required",
      reasons: [{ code: "COMPARISON_INCOMPLETE" }],
    });
  });

  it("preserves an existing hard blocker as blocked", () => {
    expect(deriveRevisionControlEvidence({
      isChanged: true,
      comparison: { status: "complete" },
      downstreamSeverity: "low",
      model: { state: "exact", affectedPieces: 1, reasonCode: "MODEL_SCOPE_EXACT" },
      hardBlockers: [{ code: "OPEN_FAB_HOLD", message: "Open fabrication hold" }],
    })).toMatchObject({
      status: "blocked",
      reasons: [{ code: "OPEN_FAB_HOLD", severity: "blocked" }],
    });
  });
});
