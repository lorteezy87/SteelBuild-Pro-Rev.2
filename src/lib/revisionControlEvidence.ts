export type RevisionControlStatus = "clear" | "review_required" | "blocked";

export type ModelScopeState =
  | "exact"
  | "sequence_estimate"
  | "not_loaded"
  | "absent"
  | "unresolved";

export interface ModelScopeEvidence {
  state: ModelScopeState;
  affectedPieces: number | null;
  reasonCode:
    | "MODEL_SCOPE_EXACT"
    | "MODEL_SCOPE_SEQUENCE_ESTIMATE"
    | "MODEL_ROSTER_NOT_LOADED"
    | "MODEL_ROSTER_ABSENT"
    | "MODEL_SCOPE_UNRESOLVED";
}

export interface RevisionControlReason {
  code: string;
  message: string;
  severity: Exclude<RevisionControlStatus, "clear">;
}

export interface RevisionControlEvidence {
  status: RevisionControlStatus;
  reasons: RevisionControlReason[];
  model: ModelScopeEvidence;
}

interface ModelScopeInput {
  rosterCount?: number | null;
  rosterLoaded?: boolean;
  drawingSetId?: string | null;
  workPackageSequences?: Array<string | number | null | undefined>;
  elements?: any[];
}

interface RevisionControlInput {
  isChanged?: boolean;
  comparison?: { status?: string | null } | null;
  downstreamSeverity?: string | null;
  model: ModelScopeEvidence;
  hardBlockers?: Array<{ code?: string; message?: string }>;
}

function activeElements(elements: any[]): any[] {
  return elements.filter((element) => element && !element.is_deleted);
}

function normalizedSequences(
  sequences: Array<string | number | null | undefined> = [],
): Set<string> {
  return new Set(
    sequences
      .filter((sequence) => sequence !== null && sequence !== undefined && sequence !== "")
      .map((sequence) => String(sequence)),
  );
}

/**
 * Calculates model linkage evidence without treating an unloaded roster as an
 * empty one. A drawing-set link is authoritative; linked work-package
 * sequences are a clearly-labelled fallback only.
 */
export function modelScopeEvidence({
  rosterCount,
  rosterLoaded = false,
  drawingSetId,
  workPackageSequences = [],
  elements = [],
}: ModelScopeInput): ModelScopeEvidence {
  if (rosterCount == null || rosterCount <= 0) {
    return {
      state: "absent",
      affectedPieces: null,
      reasonCode: "MODEL_ROSTER_ABSENT",
    };
  }

  if (!rosterLoaded) {
    return {
      state: "not_loaded",
      affectedPieces: null,
      reasonCode: "MODEL_ROSTER_NOT_LOADED",
    };
  }

  if (!drawingSetId) {
    return {
      state: "unresolved",
      affectedPieces: null,
      reasonCode: "MODEL_SCOPE_UNRESOLVED",
    };
  }

  const active = activeElements(elements);
  const exact = active.filter(
    (element) => element.drawing_set_id && String(element.drawing_set_id) === String(drawingSetId),
  );
  if (exact.length > 0) {
    return {
      state: "exact",
      affectedPieces: exact.length,
      reasonCode: "MODEL_SCOPE_EXACT",
    };
  }

  const sequences = normalizedSequences(workPackageSequences);
  const estimated = active.filter(
    (element) => element.sequence_number != null
      && element.sequence_number !== ""
      && sequences.has(String(element.sequence_number)),
  );
  if (estimated.length > 0) {
    return {
      state: "sequence_estimate",
      affectedPieces: estimated.length,
      reasonCode: "MODEL_SCOPE_SEQUENCE_ESTIMATE",
    };
  }

  return {
    state: "unresolved",
    affectedPieces: null,
    reasonCode: "MODEL_SCOPE_UNRESOLVED",
  };
}

/**
 * Derives client-side revision-control evidence. It intentionally does not
 * authorize release: server-side release gates remain the source of authority.
 */
export function deriveRevisionControlEvidence({
  isChanged = false,
  comparison,
  downstreamSeverity,
  model,
  hardBlockers = [],
}: RevisionControlInput): RevisionControlEvidence {
  const reasons: RevisionControlReason[] = hardBlockers.map((blocker) => ({
    code: blocker.code || "HARD_BLOCKER",
    message: blocker.message || "An existing release blocker is open.",
    severity: "blocked",
  }));

  if (!isChanged) return { status: reasons.length ? "blocked" : "clear", reasons, model };

  if (comparison?.status !== "complete") {
    reasons.push({
      code: "COMPARISON_INCOMPLETE",
      message: "A completed revision comparison is required.",
      severity: "review_required",
    });
  }

  if (downstreamSeverity === "unknown" || !downstreamSeverity) {
    reasons.push({
      code: "DOWNSTREAM_UNKNOWN",
      message: "Downstream release or fabrication exposure is unknown.",
      severity: "review_required",
    });
  } else if (downstreamSeverity !== "low") {
    reasons.push({
      code: "DOWNSTREAM_EXPOSED",
      message: "Downstream release or fabrication exposure requires review.",
      severity: "review_required",
    });
  }

  if (!["exact", "sequence_estimate"].includes(model.state)) {
    reasons.push({
      code: model.reasonCode,
      message: "Model scope is not resolved from a loaded roster.",
      severity: "review_required",
    });
  }

  const status = reasons.some((reason) => reason.severity === "blocked")
    ? "blocked"
    : reasons.length > 0
      ? "review_required"
      : "clear";

  return { status, reasons, model };
}
