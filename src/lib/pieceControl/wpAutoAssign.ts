/**
 * Auto-assign pieces to work packages.
 *
 * Match priority (fail-closed on ties):
 * 1. Import source / filename ↔ work package name (real Tekla/EPM imports)
 * 2. Sequence number ↔ WP sequence / wp_number
 * 3. Erection area ↔ WP area
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
  /** Piece register metadata (import_source_name, last_import_source_name, …). */
  metadata?: Record<string, unknown> | null;
};

export type AutoAssignWorkPackage = {
  id: string;
  wp_number?: string | null;
  name?: string | null;
  description?: string | null;
  sequence_number?: string | null;
  area?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
};

export type AutoAssignMatchReason =
  | "import_name"
  | "sequence"
  | "area"
  | "sequence_and_area";

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

export const NOISE_TOKENS = new Set([
  "ifc",
  "ifa",
  "epm",
  "xml",
  "csv",
  "shop",
  "part",
  "parts",
  "all",
  "the",
  "and",
  "production",
  "status",
  "roster",
  "steelbuild",
  "pro",
  "partial",
]);

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

/** Lowercase alnum phrase for substring / token matching. */
export function normalizeMatchPhrase(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\.(xml|csv|xlsx|xls|json)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(phrase: string): string[] {
  return phrase
    .split(" ")
    .map((token) => token.replace(/s$/, ""))
    .filter((token) => token.length >= 3 && !NOISE_TOKENS.has(token));
}

function metadataText(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata || typeof metadata !== "object") return "";
  const parts: string[] = [];
  for (const key of [
    "import_source_name",
    "last_import_source_name",
    "source_name",
    "file_name",
    "filename",
  ]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) parts.push(value);
  }
  return parts.join(" ");
}

export function pieceImportSourceBlob(piece: AutoAssignPiece): string {
  return normalizeMatchPhrase(metadataText(piece.metadata));
}

function sequenceKeysForWorkPackage(wp: AutoAssignWorkPackage): string[] {
  const keys = new Set<string>();
  for (const candidate of [wp.sequence_number, wp.wp_number]) {
    const key = normalizeSequenceKey(candidate);
    if (key) keys.add(key);
  }
  return [...keys];
}

function workPackageNamePhrase(wp: AutoAssignWorkPackage): string {
  return normalizeMatchPhrase(wp.name || wp.description || "");
}

/**
 * Score how well a WP name fits an import-source haystack.
 * Higher is better; 0 = no match.
 */
export function scoreImportNameMatch(
  sourceBlob: string,
  wp: AutoAssignWorkPackage,
): number {
  if (!sourceBlob) return 0;
  const namePhrase = workPackageNamePhrase(wp);
  if (!namePhrase || namePhrase.length < 3) return 0;

  // Prefer full-phrase containment (order-preserving after normalize).
  if (sourceBlob.includes(namePhrase)) {
    return 100 + namePhrase.length;
  }

  // Token set: prefer all significant WP tokens; allow strong partials for
  // longer names (e.g. "Partial Main Steel" → "Main & Misc. Steel").
  const wpTokens = significantTokens(namePhrase);
  if (wpTokens.length === 0) return 0;
  const sourceTokens = new Set(significantTokens(sourceBlob));
  const hits = wpTokens.filter((token) => sourceTokens.has(token));
  const coverage = hits.length / wpTokens.length;
  const fullHit = hits.length === wpTokens.length;
  const strongPartial =
    wpTokens.length >= 3 && hits.length >= 2 && coverage >= 2 / 3;
  if (!fullHit && !strongPartial) return 0;

  // Single short label (e.g. "ladder") must appear as its own token.
  if (wpTokens.length === 1 && wpTokens[0].length < 5) {
    return 40 + wpTokens[0].length;
  }
  return 50 + hits.length * 10 + Math.round(coverage * 20) + namePhrase.length;
}

type ScoredWp = {
  wp: AutoAssignWorkPackage;
  score: number;
  matchReason: AutoAssignMatchReason;
};

function scoreWorkPackage(
  piece: AutoAssignPiece,
  wp: AutoAssignWorkPackage,
  sourceBlob: string,
): ScoredWp | null {
  const nameScore = scoreImportNameMatch(sourceBlob, wp);
  if (nameScore > 0) {
    return { wp, score: 400 + nameScore, matchReason: "import_name" };
  }

  const pieceSeq = normalizeSequenceKey(piece.sequence_number);
  const pieceArea = normalizeToken(piece.erection_area);
  if (!pieceSeq && !pieceArea) return null;

  const wpSeqKeys = sequenceKeysForWorkPackage(wp);
  const wpArea = normalizeToken(wp.area);

  const sequenceHit = Boolean(pieceSeq) && wpSeqKeys.includes(pieceSeq);
  const areaHit = Boolean(pieceArea) && Boolean(wpArea) && pieceArea === wpArea;

  if (!sequenceHit && !areaHit) return null;

  if (sequenceHit && areaHit) {
    return { wp, score: 300, matchReason: "sequence_and_area" };
  }
  if (sequenceHit) {
    return { wp, score: 200, matchReason: "sequence" };
  }
  return { wp, score: 100, matchReason: "area" };
}

function pieceHasSignals(piece: AutoAssignPiece, sourceBlob: string): boolean {
  return Boolean(
    sourceBlob ||
      normalizeSequenceKey(piece.sequence_number) ||
      normalizeToken(piece.erection_area),
  );
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
  const activeWps = workPackages.filter(
    (wp) => !wp.is_deleted && !wp.deleted_at && wp.id,
  );
  const activeWpIds = new Set(activeWps.map((wp) => wp.id));
  const assignments: AutoAssignAssignment[] = [];
  const skipped: AutoAssignSkip[] = [];
  const byWorkPackage: Record<string, string[]> = {};

  for (const piece of pieces) {
    const mark = String(piece.mark ?? "").trim() || piece.id;
    if (piece.is_deleted) {
      skipped.push({ pieceId: piece.id, mark, reason: "inactive_piece" });
      continue;
    }

    const sourceBlob = pieceImportSourceBlob(piece);
    if (!pieceHasSignals(piece, sourceBlob)) {
      skipped.push({ pieceId: piece.id, mark, reason: "no_signals" });
      continue;
    }

    // Treat assignments to soft-deleted / unknown WPs as unassigned so
    // auto-assign can reclaim them (dropdowns no longer list those WPs).
    const rawWpId = piece.work_package_id ? String(piece.work_package_id) : null;
    const existingWpId =
      rawWpId && activeWpIds.has(rawWpId) ? rawWpId : null;
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
      .map((wp) => scoreWorkPackage(piece, wp, sourceBlob))
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
 * Chunks large piece arrays to keep RPC payloads bounded.
 */
export async function applyWorkPackageAutoAssign(
  plan: AutoAssignPlan,
  assignPieces: AssignPiecesFn,
  options: { chunkSize?: number } = {},
): Promise<AutoAssignApplyResult> {
  const chunkSize = Math.max(1, options.chunkSize ?? 200);
  const errors: AutoAssignApplyResult["errors"] = [];
  let assignedCount = 0;
  const entries = Object.entries(plan.byWorkPackage);

  for (const [workPackageId, pieceIds] of entries) {
    if (pieceIds.length === 0) continue;
    try {
      for (let i = 0; i < pieceIds.length; i += chunkSize) {
        const chunk = pieceIds.slice(i, i + chunkSize);
        await assignPieces(workPackageId, chunk);
        assignedCount += chunk.length;
      }
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
