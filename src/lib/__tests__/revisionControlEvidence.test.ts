import { describe, expect, it } from "vitest";
import {
  deriveRevisionControlEvidence,
  modelScopeEvidence,
} from "@/lib/revisionControlEvidence";

describe("revisionControlEvidence", () => {
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
