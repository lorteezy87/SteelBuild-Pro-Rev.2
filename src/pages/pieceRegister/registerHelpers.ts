import type { PillTone } from "@/components/command";
/**
 * Pure helpers extracted from PieceRegister.tsx.
 * Keep page-level useMemo wrappers; only move pure bodies here.
 */
import type { PieceAttentionItem } from "@/lib/pieceControl/presentation";
import { pieceTons } from "@/lib/pieceControl/tonnage";
import { formatWorkPackageTitle } from "@/lib/workPackages/formatWorkPackageTitle";
import {
  buildPieceImpact,
  currentRevisionCodeForDrawing,
} from "@/lib/pieceControl/drawingReleaseReady";
import {
  sortPieceRegisterRows,
  type PieceRegisterSort,
} from "@/lib/pieceControl/pieceRegisterSort";
import type { PieceRegisterRow } from "@/lib/pieceControl/repository";
import {
  filterPieceRegisterRows,
  type PieceRegisterDisplayRow,
  type PieceRegisterFilters,
} from "./filter";

const naturalSortCollator = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

export function uniqueValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort(naturalSortCollator.compare);
}

export function presentImportReconciliationText(value: string): string {
  return value === "mark has split lots but no active ALL root"
    ? "This piece mark has split lots but no active parent record."
    : value;
}

/**
 * Apply attention-focus secondary filter on top of the primary filter bar.
 * Returns a new array; does not mutate `rows`.
 */
export function applyAttentionFocus<
  T extends { work_package_id?: string | null; on_hold?: boolean | null },
>(
  rows: T[],
  attentionFocus: PieceAttentionItem["key"] | null,
): T[] {
  if (attentionFocus === "unassigned") {
    return rows.filter((piece) => !piece.work_package_id);
  }
  if (attentionFocus === "missing-weight") {
    return rows.filter((piece) => pieceTons(piece as never) == null);
  }
  if (attentionFocus === "held") {
    return rows.filter((piece) => Boolean(piece.on_hold));
  }
  return rows;
}

export function buildWorkPackageLabelMap(
  workPackages: Array<{ id?: string; [k: string]: unknown }>,
): Map<string, string> {
  return new Map(
    (workPackages || [])
      .filter((wp): wp is { id: string; [k: string]: unknown } => Boolean(wp?.id))
      .map((wp) => [wp.id, formatWorkPackageTitle(wp as never)]),
  );
}

export function buildPieceDisplayRows(
  pieces: PieceRegisterRow[] | null | undefined,
  workPackageMap: Map<string, string>,
): PieceRegisterDisplayRow[] {
  return (pieces ?? []).map((piece) => ({
    ...piece,
    workPackageLabel:
      piece.work_package_id && workPackageMap.has(piece.work_package_id)
        ? workPackageMap.get(piece.work_package_id)!
        : "Unassigned",
  }));
}

export function buildFilteredRegisterRows(
  displayRows: PieceRegisterDisplayRow[],
  filters: PieceRegisterFilters,
  attentionFocus: PieceAttentionItem["key"] | null,
  registerSort: PieceRegisterSort,
): PieceRegisterDisplayRow[] {
  const rows = applyAttentionFocus(
    filterPieceRegisterRows(displayRows, filters),
    attentionFocus,
  );
  return sortPieceRegisterRows(rows, registerSort);
}

export function archiveConfirmationText(selectedCount: number): string {
  return selectedCount === 1
    ? "ARCHIVE 1 PIECE"
    : `ARCHIVE ${selectedCount} PIECES`;
}

export function allRowsSelected(
  filteredRows: Array<{ id: string }>,
  selectedPieceIds: Set<string>,
): boolean {
  return (
    filteredRows.length > 0 &&
    filteredRows.every((piece) => selectedPieceIds.has(piece.id))
  );
}

export type PieceImpactSnapshotLike = {
  pieces: Array<{
    id: string;
    piece_mark?: string | null;
    lifecycle_status?: string | null;
    on_hold?: boolean | null;
  }>;
  pieceDrawings: Array<{ piece_id: string; drawing_id: string }>;
  commentDispositions: Array<{ related_piece_ids?: string[] | null }>;
  drawings: unknown[];
  drawingSets: unknown[];
  submittals: unknown[];
  sheetResponses: unknown[];
  drawingRevisions: unknown[];
  drawingReviews: unknown[];
  drawingSignoffs: unknown[];
};

/** Selected-piece impact panel model; null when no selection or piece missing. */
export function buildSelectedPieceImpact(
  selectedPieceId: string | null | undefined,
  snapshot: PieceImpactSnapshotLike | null | undefined,
) {
  if (!selectedPieceId || !snapshot) return null;
  const piece = snapshot.pieces.find((row) => row.id === selectedPieceId);
  if (!piece) return null;
  const linkedDrawingIds = snapshot.pieceDrawings
    .filter((link) => link.piece_id === selectedPieceId)
    .map((link) => link.drawing_id);
  const governingId = linkedDrawingIds[0] ?? null;
  const commentDispositions = snapshot.commentDispositions.filter((row) =>
    (row.related_piece_ids ?? []).includes(selectedPieceId),
  );
  return buildPieceImpact({
    piece: {
      id: piece.id,
      piece_mark: piece.piece_mark,
      lifecycle_status: piece.lifecycle_status,
      on_hold: piece.on_hold,
    },
    linkedDrawingIds,
    drawings: snapshot.drawings as never,
    evidence: {
      drawingSets: snapshot.drawingSets as never,
      submittals: snapshot.submittals as never,
      sheetResponses: snapshot.sheetResponses as never,
      drawingRevisions: snapshot.drawingRevisions as never,
      drawingReviews: snapshot.drawingReviews as never,
      drawingSignoffs: snapshot.drawingSignoffs as never,
    },
    commentDispositions: commentDispositions as never,
    currentRevisionCode: governingId
      ? currentRevisionCodeForDrawing(governingId, snapshot.drawingRevisions as never)
      : null,
  });
}

/** Import-row decision → command-kit Pill tone. */
export const IMPORT_DECISION_TONE: Record<string, PillTone> = {
  new: "good",
  unchanged: "neutral",
  update_candidate: "warn",
  conflict: "danger",
  invalid: "danger",
};

export const EMPTY_PIECE_REGISTER_FILTERS: PieceRegisterFilters = {
  search: "",
  workPackageId: "",
  profile: "",
  grade: "",
  lifecycle: "",
  source: "",
  hold: "all",
};

export const PIECE_REGISTER_VIEW_IDS = [
  "overview",
  "register",
  "board",
  "import",
  "relationships",
  "production",
  "logistics",
  "settings",
] as const;

export type PieceRegisterViewId = (typeof PIECE_REGISTER_VIEW_IDS)[number];

export function resolvePieceRegisterView(
  id: string | null | undefined,
  fallback: PieceRegisterViewId = "overview",
): PieceRegisterViewId {
  return (PIECE_REGISTER_VIEW_IDS as readonly string[]).includes(id || "")
    ? (id as PieceRegisterViewId)
    : fallback;
}
