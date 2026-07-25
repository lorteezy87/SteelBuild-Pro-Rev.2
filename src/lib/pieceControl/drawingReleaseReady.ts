/**
 * drawingReleaseReady.ts — governing-drawing release readiness (Slice 6).
 *
 * Fabrication release is allowed when the governing drawing's workflow is
 * IFC or Released — not bare Approved/AAN (those can still be OFS/BFA) and
 * never R&R. Pure helpers shared by piece readiness + Piece Impact.
 */
import {
  pickMostRecentSubmittal,
  submittalStatusToStage,
} from "@/lib/submittalStageMapping";
import {
  collectUnresolvedRequiredComments,
  type CommentDispositionLike,
} from "@/lib/commentDispositionGate";
import type {
  DrawingRevisionEvidence,
  DrawingSignoffEvidence,
  ReadinessDrawing,
  ReadinessEvidence,
  SubmittalEvidence,
} from "./readiness";

export const RELEASE_READY_STAGES: ReadonlySet<string> = new Set(["IFC", "Released"]);

export const RELEASE_BLOCKING_STAGES: ReadonlySet<string> = new Set([
  "R&R",
  "OFS",
  "BFA",
  "OFA",
  "IFA",
  "Not Started",
]);

export type PieceExposureFlagKey =
  | "missing_governing_drawing"
  | "missing_governing_rev"
  | "non_ifc_governing"
  | "tied_to_rr"
  | "tied_to_ofs"
  | "unresolved_required_comment"
  | "fabricated_from_superseded"
  | "shipped_on_new_rev";

export interface PieceExposureFlag {
  key: PieceExposureFlagKey;
  label: string;
  tone: "danger" | "warn" | "info";
}

export interface GoverningDrawingReadyResult {
  ready: boolean;
  stage: string | null;
  reason: string | null;
  governingSubmittalId: string | null;
}

export interface PieceImpactModel {
  pieceId: string;
  pieceMark: string;
  lifecycleStatus: string;
  onHold: boolean;
  governingDrawing: ReadinessDrawing | null;
  governingRevisionCode: string | null;
  workflowStage: string | null;
  releaseReady: boolean;
  releaseBlockReason: string | null;
  unresolvedRequiredComments: number;
  flags: PieceExposureFlag[];
}

function linkedSubmittals(
  drawing: ReadinessDrawing,
  evidence: ReadinessEvidence,
): SubmittalEvidence[] {
  if (!drawing.drawing_set_id) return [];
  return (evidence.submittals ?? []).filter(
    (submittal) =>
      !submittal.is_deleted &&
      !submittal.deleted_at &&
      (submittal.drawing_set_ids ?? []).includes(drawing.drawing_set_id!),
  );
}

function hasFabSignoff(
  drawing: ReadinessDrawing,
  evidence: ReadinessEvidence,
): boolean {
  const currentRevisionIds = new Set(
    (evidence.drawingRevisions ?? [])
      .filter(
        (revision) =>
          revision.drawing_id === drawing.id &&
          revision.is_current &&
          !revision.archived_at,
      )
      .map((revision) => revision.id),
  );
  return (evidence.drawingSignoffs ?? []).some((signoff: DrawingSignoffEvidence) => {
    if (signoff.drawing_id !== drawing.id || signoff.is_voided) return false;
    const stamp = String(signoff.stamp_type ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (stamp !== "approved_for_fabrication") return false;
    if (currentRevisionIds.size === 0) return true;
    return (
      !signoff.drawing_revision_id ||
      currentRevisionIds.has(signoff.drawing_revision_id)
    );
  });
}

/**
 * Derive the governing workflow stage for a drawing from its most-recent
 * linked submittal (status + BIC). Falls back to drawings.stage when no
 * submittal signal exists.
 */
export function deriveGoverningWorkflowStage(
  drawing: ReadinessDrawing,
  evidence: ReadinessEvidence = {},
): { stage: string | null; submittal: SubmittalEvidence | null } {
  const subs = linkedSubmittals(drawing, evidence);
  const recent = pickMostRecentSubmittal(subs);
  if (recent) {
    const stage = submittalStatusToStage(
      recent.status,
      recent.ball_in_court ?? null,
      null,
    );
    return { stage, submittal: recent };
  }
  const sheetStage = String(drawing.stage ?? "").trim() || null;
  return { stage: sheetStage, submittal: null };
}

/**
 * True when a governing drawing is release-ready for piece/WP fabrication.
 * Ready sources (any one):
 *   - most-recent linked submittal derives to IFC or Released
 *   - drawings.stage is IFC or Released (legacy sheet enum)
 *   - current-revision fab signoff (`approved_for_fabrication`)
 */
export function isGoverningDrawingReleaseReady(
  drawing: ReadinessDrawing,
  evidence: ReadinessEvidence = {},
): GoverningDrawingReadyResult {
  if (drawing.is_deleted || drawing.deleted_at || drawing.is_superseded) {
    return {
      ready: false,
      stage: null,
      reason: "Governing drawing is missing, deleted, or superseded.",
      governingSubmittalId: null,
    };
  }

  const { stage, submittal } = deriveGoverningWorkflowStage(drawing, evidence);
  if (stage && RELEASE_READY_STAGES.has(stage)) {
    return {
      ready: true,
      stage,
      reason: null,
      governingSubmittalId: submittal?.id ?? null,
    };
  }

  if (hasFabSignoff(drawing, evidence)) {
    return {
      ready: true,
      stage: stage ?? "IFC",
      reason: null,
      governingSubmittalId: submittal?.id ?? null,
    };
  }

  if (stage && RELEASE_BLOCKING_STAGES.has(stage)) {
    return {
      ready: false,
      stage,
      reason: `Governing drawing is at ${stage} — release requires IFC or Released.`,
      governingSubmittalId: submittal?.id ?? null,
    };
  }

  return {
    ready: false,
    stage,
    reason: "Governing drawing is not IFC / Released for fabrication.",
    governingSubmittalId: submittal?.id ?? null,
  };
}

export interface BuildPieceImpactInput {
  piece: {
    id: string;
    piece_mark: string;
    lifecycle_status: string;
    on_hold: boolean;
  };
  linkedDrawingIds: string[];
  drawings: ReadinessDrawing[];
  evidence: ReadinessEvidence;
  /** Comment dispositions that reference this piece (related_piece_ids). */
  commentDispositions?: CommentDispositionLike[] | null;
  /** Current revision code when known. */
  currentRevisionCode?: string | null;
  /** True when the piece was fabricated against a now-superseded revision. */
  fabricatedFromSuperseded?: boolean;
  /** True when fabricated/shipped and a newer current revision arrived. */
  shippedOnNewRevision?: boolean;
}

export function buildPieceImpact(input: BuildPieceImpactInput): PieceImpactModel {
  const drawingsById = new Map(input.drawings.map((d) => [d.id, d]));
  const governing =
    input.linkedDrawingIds
      .map((id) => drawingsById.get(id))
      .find((d) => d && !d.is_deleted && !d.deleted_at) ?? null;

  const flags: PieceExposureFlag[] = [];
  if (!governing) {
    flags.push({
      key: "missing_governing_drawing",
      label: "No governing shop drawing linked",
      tone: "danger",
    });
    return {
      pieceId: input.piece.id,
      pieceMark: input.piece.piece_mark,
      lifecycleStatus: input.piece.lifecycle_status,
      onHold: input.piece.on_hold,
      governingDrawing: null,
      governingRevisionCode: null,
      workflowStage: null,
      releaseReady: false,
      releaseBlockReason: "No governing shop drawing linked.",
      unresolvedRequiredComments: 0,
      flags,
    };
  }

  const ready = isGoverningDrawingReleaseReady(governing, input.evidence);
  const unresolved = collectUnresolvedRequiredComments(input.commentDispositions);
  const revCode = input.currentRevisionCode ?? null;

  if (!revCode) {
    flags.push({
      key: "missing_governing_rev",
      label: "Missing governing revision",
      tone: "warn",
    });
  }
  if (ready.stage === "R&R") {
    flags.push({
      key: "tied_to_rr",
      label: "Tied to R&R package",
      tone: "danger",
    });
  }
  if (ready.stage === "OFS") {
    flags.push({
      key: "tied_to_ofs",
      label: "Tied to OFS (Out for Scrub)",
      tone: "warn",
    });
  }
  if (!ready.ready && ready.stage !== "R&R" && ready.stage !== "OFS") {
    flags.push({
      key: "non_ifc_governing",
      label: `Governing stage ${ready.stage || "unknown"} — not IFC`,
      tone: "warn",
    });
  }
  if (unresolved.length > 0) {
    flags.push({
      key: "unresolved_required_comment",
      label: `${unresolved.length} unresolved required comment(s)`,
      tone: "danger",
    });
  }
  if (input.fabricatedFromSuperseded) {
    flags.push({
      key: "fabricated_from_superseded",
      label: "Fabricated from a superseded revision",
      tone: "danger",
    });
  }
  if (input.shippedOnNewRevision) {
    flags.push({
      key: "shipped_on_new_rev",
      label: "Fabricated/shipped — newer revision arrived",
      tone: "warn",
    });
  }

  return {
    pieceId: input.piece.id,
    pieceMark: input.piece.piece_mark,
    lifecycleStatus: input.piece.lifecycle_status,
    onHold: input.piece.on_hold,
    governingDrawing: governing,
    governingRevisionCode: revCode,
    workflowStage: ready.stage,
    releaseReady: ready.ready && unresolved.length === 0 && !input.piece.on_hold,
    releaseBlockReason: input.piece.on_hold
      ? "Piece is on hold."
      : unresolved.length > 0
        ? `${unresolved.length} unresolved required comment(s) on this piece.`
        : ready.reason,
    unresolvedRequiredComments: unresolved.length,
    flags,
  };
}

/** Current revision code helper for impact panels. */
export function currentRevisionCodeForDrawing(
  drawingId: string,
  revisions: Array<DrawingRevisionEvidence & { revision_code?: string | null }>,
): string | null {
  const current = revisions.find(
    (r) => r.drawing_id === drawingId && r.is_current && !r.archived_at,
  );
  return current?.revision_code ? String(current.revision_code) : null;
}
