/**
 * Client-side mirror of the `archive_piece_lots` guards that the loaded
 * register can see (supabase/migrations/20260720213000_archive_canonical_pieces.sql,
 * the split-lot and held/production-started checks). Blocked pieces are
 * skipped before the RPC, so one held piece no longer fails the whole
 * selection with P0001 (Sentry JAVASCRIPT-REACT-2D). Production history and
 * canonical release can only be checked on the server and stay there.
 */
import type { PieceRegisterRow } from "./repository";

export type ArchiveBlockReason = "held" | "production_started" | "split_lot";

export type ArchiveBlockedPiece = {
  id: string;
  pieceMark: string;
  lotCode: string;
  reason: ArchiveBlockReason;
};

export type ArchiveSelectionPartition = {
  archivableIds: string[];
  blocked: ArchiveBlockedPiece[];
};

export type ArchiveEligibilityRow = Pick<
  PieceRegisterRow,
  | "id"
  | "piece_mark"
  | "lot_code"
  | "parent_piece_id"
  | "lifecycle_status"
  | "current_station"
  | "on_hold"
  | "is_container"
  | "is_deleted"
  | "deleted_at"
>;

export const ARCHIVE_BLOCK_REASON_LABELS: Record<ArchiveBlockReason, string> = {
  held: "held",
  production_started: "production started",
  split_lot: "split lot",
};

function isActive(row: ArchiveEligibilityRow): boolean {
  return !row.is_deleted && !row.deleted_at;
}

/**
 * Why the server would refuse to archive this piece, or null when it passes
 * the client-visible guards. Checked in the same order as the SQL.
 */
export function archiveBlockReason(
  row: ArchiveEligibilityRow,
  hasActiveChild: boolean,
): ArchiveBlockReason | null {
  if (row.is_container === true || row.parent_piece_id != null || hasActiveChild) {
    return "split_lot";
  }
  if (row.on_hold === true) return "held";
  if (
    (row.lifecycle_status != null && row.lifecycle_status !== "not_started") ||
    row.current_station != null
  ) {
    return "production_started";
  }
  return null;
}

/**
 * Split the selection into pieces the archive RPC will accept and pieces it
 * would reject. Selected ids missing from the loaded rows are dropped.
 */
export function partitionArchiveSelection(
  rows: readonly ArchiveEligibilityRow[],
  selectedIds: ReadonlySet<string>,
): ArchiveSelectionPartition {
  const parentsWithActiveChild = new Set<string>();
  for (const row of rows) {
    if (row.parent_piece_id != null && isActive(row)) {
      parentsWithActiveChild.add(row.parent_piece_id);
    }
  }
  const archivableIds: string[] = [];
  const blocked: ArchiveBlockedPiece[] = [];
  for (const row of rows) {
    if (!selectedIds.has(row.id)) continue;
    const reason = archiveBlockReason(row, parentsWithActiveChild.has(row.id));
    if (reason) {
      blocked.push({ id: row.id, pieceMark: row.piece_mark, lotCode: row.lot_code, reason });
    } else {
      archivableIds.push(row.id);
    }
  }
  return { archivableIds, blocked };
}
