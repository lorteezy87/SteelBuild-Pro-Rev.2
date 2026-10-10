/**
 * drawingReleaseReady.ts — governing-drawing release readiness (Slice 6).
 *
 * IFC or Released is necessary for the drawing-stage check, but insufficient
 * for fabrication release: the server gate also evaluates holds, RFIs, PDFs,
 * material and the full work-package scope. Pure helpers shared by piece
 * readiness and Piece Impact.
 */
import {
  isUsableShopDrawingSubmittal,
  pickMostRecentSubmittal,
  submittalStatusToStage,
} from "@/lib/submittalStageMapping";
import {
  collectUnresolvedRequiredComments,
  type CommentDispositionLike,
} from "@/lib/commentDispositionGate";
import { computeSubmittalRiskAging } from "@/lib/submittalRiskAging";
import { submittalRevisionEvidenceBlockReason } from '@/lib/submittalRevisionEvidence';
import type {
  DrawingRevisionEvidence,
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
  | "aging_urgent"
  | "aging_critical"
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
      isUsableShopDrawingSubmittal(submittal) &&
      (submittal.drawing_set_ids ?? []).includes(drawing.drawing_set_id!),
  );
}

/**
 * Derive the governing workflow stage for a drawing from its most-recent
 * linked submittal (status + BIC). Falls back to drawings.stage for display
 * context only; a legacy sheet stage cannot authorize fabrication release.
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
 * Client-side readiness signal for piece/WP context. Only a governing
 * submittal at IFC or Released can be ready. The server fab-release gate
 * remains the authority for holds, RFIs, missing files and package release.
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
  if (drawing.drawing_set_id && evidence.drawingSets) {
    const set = evidence.drawingSets.find((candidate) => candidate.id === drawing.drawing_set_id);
    if (!set || set.is_deleted || set.deleted_at) {
      return {
        ready: false,
        stage: null,
        reason: "Governing drawing set is missing or deleted.",
        governingSubmittalId: null,
      };
    }
  }

  const { stage, submittal } = deriveGoverningWorkflowStage(drawing, evidence);
  if (!submittal) {
    return {
      ready: false,
      stage,
      reason: "No governing submittal for this drawing set. Sheet stage and revision signoffs are reference only.",
      governingSubmittalId: null,
    };
  }
  if (stage && RELEASE_READY_STAGES.has(stage)) {
    const evidenceBlock = submittalRevisionEvidenceBlockReason(submittal);
    if (evidenceBlock) return { ready: false, stage, reason: evidenceBlock, governingSubmittalId: submittal.id };
    return {
      ready: true,
      stage,
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
  const governingSub = (input.evidence.submittals ?? []).find(
    (s) => s.id === ready.governingSubmittalId,
  ) as (SubmittalEvidence & { required_date?: string | null; returned_date?: string | null }) | undefined;
  const agingScored = computeSubmittalRiskAging({
    stage: ready.stage,
    dueDate: governingSub?.required_date ?? null,
    statusChangedAt:
      governingSub?.returned_date ||
      governingSub?.updated_at ||
      governingSub?.submitted_date ||
      null,
    useWorkdays: true,
  });
  if (agingScored?.tier === "critical") {
    flags.push({
      key: "aging_critical",
      label: `Critical aging — ${agingScored.reason}`,
      tone: "danger",
    });
  } else if (agingScored?.tier === "urgent") {
    flags.push({
      key: "aging_urgent",
      label: `Urgent aging — ${agingScored.reason}`,
      tone: "warn",
    });
  }
  if (!ready.ready && !ready.governingSubmittalId) {
    flags.push({
      key: "non_ifc_governing",
      label: "No governing submittal — sheet stage is reference only",
      tone: "warn",
    });
  } else if (!ready.ready && ready.stage !== "R&R" && ready.stage !== "OFS") {
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
