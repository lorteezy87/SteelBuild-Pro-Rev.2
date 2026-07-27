/**
 * Auto-assign pieces to work packages by sequence / erection area.
 *
 * Matching is fail-closed on ambiguity (same spirit as modelElementLink):
 * when more than one WP ties for best score, the piece is skipped.
 *
 * Apply path uses existing assign_pieces_to_work_package RPC — never writes
 * work_package_id during piece import apply (Slice 1 contract).
 */

export type AutoAssignPiece = {
  id: string;
  mark: string;
  work_package_id?: string | null;
  sequence_number?: string | null;
  erection_area?: string | null;
  is_deleted?: boolean | null;
};

export type AutoAssignWorkPackage = {
  id: string;
  wp_number?: string | null;
  name?: string | null;
  description?: string | null;
  sequence_number?: string | null;
  area?: string | null;
  is_deleted?: boolean | null;
};

export type AutoAssignMatchReason = "sequence" | "area" | "sequence_and_area";

export type AutoAssignSkipReason =
  | "already_assigned"
  | "no_match"
  | "ambiguous"
  | "inactive_piece"
  | "no_signals";

export type AutoAssignAssignment = {
  pieceId: string;
  mark: string;
  workPackageId: string;
  wpNumber: string | null;
  matchReason: AutoAssignMatchReason;
  fromWorkPackageId: string | null;
};

export type AutoAssignSkip = {
  pieceId: string;
  mark: string;
  reason: AutoAssignSkipReason;
  detail?: string;
};

export type AutoAssignPlan = {
  assignments: AutoAssignAssignment[];
  skipped: AutoAssignSkip[];
  byWorkPackage: Record<string, string[]>;
};

export type AutoAssignOptions = {
  /** When true, reassign pieces that already have a different work_package_id. */
  reassignExisting?: boolean;
};

function normalizeToken(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Normalize sequence / WP number tokens (WP-004, wp004, 004 → comparable). */
export function normalizeSequenceKey(value: string | null | undefined): string {
  const raw = normalizeToken(value);
  if (!raw) return "";
  return raw
    .replace(/^work[\s_-]*package[\s_-]*/i, "")
    .replace(/^wp[\s_-]*/i, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^0+(\d)/, "$1");
}

function sequenceKeysForWorkPackage(wp: AutoAssignWorkPackage): string[] {
  const keys = new Set<string>();
  for (const candidate of [wp.sequence_number, wp.wp_number]) {
    const key = normalizeSequenceKey(candidate);
    if (key) keys.add(key);
  }
  return [...keys];
}

type ScoredWp = {
  wp: AutoAssignWorkPackage;
  score: number;
  matchReason: AutoAssignMatchReason;
};

function scoreWorkPackage(
  piece: AutoAssignPiece,
  wp: AutoAssignWorkPackage,
): ScoredWp | null {
  const pieceSeq = normalizeSequenceKey(piece.sequence_number);
  const pieceArea = normalizeToken(piece.erection_area);
  if (!pieceSeq && !pieceArea) return null;

  const wpSeqKeys = sequenceKeysForWorkPackage(wp);
  const wpArea = normalizeToken(wp.area);

  const sequenceHit = Boolean(pieceSeq) && wpSeqKeys.includes(pieceSeq);
  const areaHit = Boolean(pieceArea) && Boolean(wpArea) && pieceArea === wpArea;

  if (!sequenceHit && !areaHit) return null;

  if (sequenceHit && areaHit) {
    return { wp, score: 3, matchReason: "sequence_and_area" };
  }
  if (sequenceHit) {
    return { wp, score: 2, matchReason: "sequence" };
  }
  return { wp, score: 1, matchReason: "area" };
}

/**
 * Build a dry-run assignment plan. Does not mutate data.
 */
export function planWorkPackageAutoAssign(
  pieces: AutoAssignPiece[],
  workPackages: AutoAssignWorkPackage[],
  options: AutoAssignOptions = {},
): AutoAssignPlan {
  const reassignExisting = options.reassignExisting === true;
  const activeWps = workPackages.filter((wp) => !wp.is_deleted && wp.id);
  const assignments: AutoAssignAssignment[] = [];
  const skipped: AutoAssignSkip[] = [];
  const byWorkPackage: Record<string, string[]> = {};

  for (const piece of pieces) {
    const mark = String(piece.mark ?? "").trim() || piece.id;
    if (piece.is_deleted) {
      skipped.push({ pieceId: piece.id, mark, reason: "inactive_piece" });
      continue;
    }

    const pieceSeq = normalizeSequenceKey(piece.sequence_number);
    const pieceArea = normalizeToken(piece.erection_area);
    if (!pieceSeq && !pieceArea) {
      skipped.push({ pieceId: piece.id, mark, reason: "no_signals" });
      continue;
    }

    const existingWpId = piece.work_package_id ? String(piece.work_package_id) : null;
    if (existingWpId && !reassignExisting) {
      skipped.push({
        pieceId: piece.id,
        mark,
        reason: "already_assigned",
        detail: existingWpId,
      });
      continue;
    }

    const scored = activeWps
      .map((wp) => scoreWorkPackage(piece, wp))
      .filter((row): row is ScoredWp => row != null)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      skipped.push({ pieceId: piece.id, mark, reason: "no_match" });
      continue;
    }

    const best = scored[0];
    const ties = scored.filter((row) => row.score === best.score);
    if (ties.length > 1) {
      skipped.push({
        pieceId: piece.id,
        mark,
        reason: "ambiguous",
        detail: ties.map((t) => t.wp.wp_number || t.wp.id).join(", "),
      });
      continue;
    }

    if (existingWpId && existingWpId === best.wp.id) {
      skipped.push({
        pieceId: piece.id,
        mark,
        reason: "already_assigned",
        detail: existingWpId,
      });
      continue;
    }

    assignments.push({
      pieceId: piece.id,
      mark,
      workPackageId: best.wp.id,
      wpNumber: best.wp.wp_number ?? null,
      matchReason: best.matchReason,
      fromWorkPackageId: existingWpId,
    });
    if (!byWorkPackage[best.wp.id]) byWorkPackage[best.wp.id] = [];
    byWorkPackage[best.wp.id].push(piece.id);
  }

  return { assignments, skipped, byWorkPackage };
}

export type AutoAssignApplyResult = {
  assignedCount: number;
  workPackageCount: number;
  errors: Array<{ workPackageId: string; message: string }>;
};

export type AssignPiecesFn = (
  workPackageId: string,
  pieceIds: string[],
) => Promise<unknown>;

/**
 * Apply a plan by calling assignPiecesToWorkPackage once per target WP.
 */
export async function applyWorkPackageAutoAssign(
  plan: AutoAssignPlan,
  assignPieces: AssignPiecesFn,
): Promise<AutoAssignApplyResult> {
  const errors: AutoAssignApplyResult["errors"] = [];
  let assignedCount = 0;
  const entries = Object.entries(plan.byWorkPackage);

  for (const [workPackageId, pieceIds] of entries) {
    if (pieceIds.length === 0) continue;
    try {
      await assignPieces(workPackageId, pieceIds);
      assignedCount += pieceIds.length;
    } catch (error) {
      errors.push({
        workPackageId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    assignedCount,
    workPackageCount: entries.filter(([, ids]) => ids.length > 0).length,
    errors,
  };
}
