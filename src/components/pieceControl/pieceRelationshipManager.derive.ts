import { evaluateWorkPackageReadiness } from "@/lib/pieceControl/readiness";
import type { PieceRegisterRow } from "@/lib/pieceControl/repository";
import type { PieceRelationshipSnapshot } from "@/lib/pieceControl/relationshipsRepository";
import { sortPieceRegisterRows } from "@/lib/pieceControl/pieceRegisterSort";
import { formatWorkPackageTitle } from "@/lib/workPackages/formatWorkPackageTitle";

export type RelationshipScopeFilter = "unassigned" | "package" | "all";

export interface RelationshipFilters {
  focusedWorkPackageId?: string;
  scopeFilter: RelationshipScopeFilter;
  markFilter: string;
  needsDrawingOnly: boolean;
}

export function liveWorkPackageId(
  piece: Pick<PieceRegisterRow, "work_package_id">,
  workPackageMap: Map<string, string>,
): string | null {
  return piece.work_package_id && workPackageMap.has(piece.work_package_id)
    ? piece.work_package_id
    : null;
}

export function derivePieceRelationshipView(
  snapshot: PieceRelationshipSnapshot,
  filters: RelationshipFilters,
) {
  const pieces = snapshot.pieces ?? [];
  const workPackages = snapshot.workPackages ?? [];
  const pieceDrawingSets = snapshot.pieceDrawingSets ?? [];
  const pieceDrawings = snapshot.pieceDrawings ?? [];
  const drawings = snapshot.drawings ?? [];
  const drawingSets = snapshot.drawingSets ?? [];
  const submittals = snapshot.submittals ?? [];
  const sheetResponses = snapshot.sheetResponses ?? [];
  const drawingRevisions = snapshot.drawingRevisions ?? [];
  const drawingReviews = snapshot.drawingReviews ?? [];
  const drawingSignoffs = snapshot.drawingSignoffs ?? [];
  const containerIds = new Set(
    pieces
      .map((piece) => piece.parent_piece_id)
      .filter((id): id is string => Boolean(id)),
  );
  const leafPieces = pieces.filter(
    (piece) => !piece.is_container && !containerIds.has(piece.id),
  );
  const workPackageMap = new Map(
    workPackages.map((wp) => [wp.id, formatWorkPackageTitle(wp)]),
  );
  const drawingLinkCountByPiece = new Map<string, number>();
  for (const link of pieceDrawingSets) {
    drawingLinkCountByPiece.set(
      link.piece_id,
      (drawingLinkCountByPiece.get(link.piece_id) ?? 0) + 1,
    );
  }
  const packageScopedLeaves = filters.focusedWorkPackageId
    ? leafPieces.filter((piece) => {
        const liveId = liveWorkPackageId(piece, workPackageMap);
        return !liveId || liveId === filters.focusedWorkPackageId;
      })
    : leafPieces;
  const mark = filters.markFilter.trim().toLowerCase();
  const selectablePieces = sortPieceRegisterRows(
    packageScopedLeaves
      .filter((piece) => {
        const liveId = liveWorkPackageId(piece, workPackageMap);
        if (filters.scopeFilter === "unassigned" && liveId) return false;
        if (
          filters.scopeFilter === "package" &&
          filters.focusedWorkPackageId &&
          liveId !== filters.focusedWorkPackageId
        ) {
          return false;
        }
        if (
          mark &&
          !String(piece.piece_mark || "").toLowerCase().includes(mark)
        ) {
          return false;
        }
        if (
          filters.needsDrawingOnly &&
          (drawingLinkCountByPiece.get(piece.id) ?? 0) > 0
        ) {
          return false;
        }
        return true;
      })
      .map((piece) => ({
        ...piece,
        workPackageLabel: liveWorkPackageId(piece, workPackageMap)
          ? workPackageMap.get(liveWorkPackageId(piece, workPackageMap)!) ??
            "Unassigned"
          : "Unassigned",
      })),
    { key: "work_package", direction: "asc" },
  );
  const drawingPieces = filters.focusedWorkPackageId
    ? leafPieces.filter(
        (piece) =>
          liveWorkPackageId(piece, workPackageMap) ===
          filters.focusedWorkPackageId,
      )
    : leafPieces;
  const readiness = evaluateWorkPackageReadiness(
    workPackages,
    pieces,
    pieceDrawings,
    drawings,
    {
      drawingSets,
      submittals,
      sheetResponses,
      drawingRevisions,
      drawingReviews,
      drawingSignoffs,
    },
    pieceDrawingSets,
  );
  const activeDrawingSets = drawingSets.filter(
    (set) => !set.is_deleted && !set.deleted_at,
  );

  return {
    leafPieces,
    workPackageMap,
    drawingLinkCountByPiece,
    packageScopedLeaves,
    selectablePieces,
    drawingPieces,
    readiness,
    visibleReadiness: filters.focusedWorkPackageId
      ? readiness.filter(
          (row) => row.workPackageId === filters.focusedWorkPackageId,
        )
      : readiness,
    drawingSetMap: new Map(drawingSets.map((set) => [set.id, set])),
    activeDrawingSets,
  };
}

export function calculateSelectedTons(
  selectablePieces: PieceRegisterRow[],
  selectedPieceIds: Set<string>,
) {
  let lbs = 0;
  let known = 0;
  for (const piece of selectablePieces) {
    if (!selectedPieceIds.has(piece.id)) continue;
    const each = Number(piece.weight_each_lbs);
    const qty = Number(piece.quantity) || 0;
    const total = Number(piece.weight_total_lbs);
    const weight =
      Number.isFinite(each) && each >= 0 && qty > 0
        ? each * qty
        : Number.isFinite(total) && total >= 0
          ? total
          : null;
    if (weight !== null) {
      lbs += weight;
      known += 1;
    }
  }
  return { tons: lbs / 2000, known, selected: selectedPieceIds.size };
}

export function countAutoAssignSkips(
  skipped: Array<{ reason: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of skipped) {
    counts[row.reason] = (counts[row.reason] ?? 0) + 1;
  }
  return counts;
}
