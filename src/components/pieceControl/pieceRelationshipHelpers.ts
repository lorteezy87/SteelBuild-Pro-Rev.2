/**
 * Pure selection / tonnage / drawing-set filters for PieceRelationshipManager.
 */
import { sortPieceRegisterRows } from "@/lib/pieceControl/pieceRegisterSort";
import { formatWorkPackageTitle } from "@/lib/workPackages/formatWorkPackageTitle";

export type RelPiece = {
  id: string;
  parent_piece_id?: string | null;
  is_container?: boolean | null;
  work_package_id?: string | null;
  piece_mark?: string | null;
  weight_each_lbs?: number | string | null;
  quantity?: number | string | null;
  weight_total_lbs?: number | string | null;
  [key: string]: unknown;
};

export type RelWorkPackage = {
  id: string;
  [key: string]: unknown;
};

export type PieceDrawingSetLink = {
  piece_id: string;
  drawing_set_id?: string;
  [key: string]: unknown;
};

export type DrawingSetLike = {
  id: string;
  set_name?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
  [key: string]: unknown;
};

export function buildContainerIds(
  pieces: RelPiece[] | null | undefined,
): Set<string> {
  return new Set(
    (pieces ?? [])
      .map((piece) => piece.parent_piece_id)
      .filter((id): id is string => Boolean(id)),
  );
}

export function selectLeafPieces(
  pieces: RelPiece[] | null | undefined,
  containerIds: Set<string>,
): RelPiece[] {
  return (pieces ?? []).filter(
    (piece) => !piece.is_container && !containerIds.has(piece.id),
  );
}

export function buildWorkPackageTitleMap(
  workPackages: RelWorkPackage[] | null | undefined,
): Map<string, string> {
  return new Map(
    (workPackages ?? []).map((wp) => [wp.id, formatWorkPackageTitle(wp as any)]),
  );
}

export function buildDrawingLinkCountByPiece(
  pieceDrawingSets: PieceDrawingSetLink[] | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const link of pieceDrawingSets ?? []) {
    map.set(link.piece_id, (map.get(link.piece_id) ?? 0) + 1);
  }
  return map;
}

export function resolveLiveWorkPackageId(
  piece: { work_package_id?: string | null },
  workPackageMap: Map<string, string>,
): string | null {
  return piece.work_package_id && workPackageMap.has(piece.work_package_id)
    ? piece.work_package_id
    : null;
}

export function filterPackageScopedLeaves(
  leafPieces: RelPiece[],
  focusedWorkPackageId: string | undefined,
  workPackageMap: Map<string, string>,
): RelPiece[] {
  if (!focusedWorkPackageId) return leafPieces;
  return leafPieces.filter((piece) => {
    const liveId = resolveLiveWorkPackageId(piece, workPackageMap);
    return !liveId || liveId === focusedWorkPackageId;
  });
}

export function filterSelectablePieces(args: {
  packageScopedLeaves: RelPiece[];
  workPackageMap: Map<string, string>;
  drawingLinkCountByPiece: Map<string, number>;
  markFilter: string;
  needsDrawingOnly: boolean;
  scopeFilter: "unassigned" | "package" | "all";
  focusedWorkPackageId?: string;
}): Array<RelPiece & { workPackageLabel: string }> {
  const {
    packageScopedLeaves,
    workPackageMap,
    drawingLinkCountByPiece,
    markFilter,
    needsDrawingOnly,
    scopeFilter,
    focusedWorkPackageId,
  } = args;
  const mark = markFilter.trim().toLowerCase();
  const filtered = packageScopedLeaves.filter((piece) => {
    const liveId = resolveLiveWorkPackageId(piece, workPackageMap);
    if (scopeFilter === "unassigned" && liveId) return false;
    if (
      scopeFilter === "package" &&
      focusedWorkPackageId &&
      liveId !== focusedWorkPackageId
    ) {
      return false;
    }
    if (mark && !String(piece.piece_mark || "").toLowerCase().includes(mark)) {
      return false;
    }
    if (needsDrawingOnly && (drawingLinkCountByPiece.get(piece.id) ?? 0) > 0) {
      return false;
    }
    return true;
  });
  return sortPieceRegisterRows(
    filtered.map((piece) => ({
      ...piece,
      workPackageLabel: resolveLiveWorkPackageId(piece, workPackageMap)
        ? workPackageMap.get(resolveLiveWorkPackageId(piece, workPackageMap)!) ??
          "Unassigned"
        : "Unassigned",
    })),
    { key: "work_package", direction: "asc" },
  ) as Array<RelPiece & { workPackageLabel: string }>;
}

export function sumSelectedPieceTons(
  selectablePieces: Array<{
    id: string;
    weight_each_lbs?: number | string | null;
    quantity?: number | string | null;
    weight_total_lbs?: number | string | null;
  }>,
  selectedPieceIds: Set<string>,
): { tons: number; known: number; selected: number } {
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

export function filterActiveDrawingSets(
  drawingSets: DrawingSetLike[] | null | undefined,
): DrawingSetLike[] {
  return (drawingSets ?? []).filter((set) => !set.is_deleted && !set.deleted_at);
}

export function filterDrawingSetsByNeedle(
  activeDrawingSets: DrawingSetLike[],
  drawingFilter: string,
): DrawingSetLike[] {
  const needle = drawingFilter.trim().toLowerCase();
  if (!needle) return activeDrawingSets;
  return activeDrawingSets.filter((set) => {
    const name = String(set.set_name ?? "").toLowerCase();
    return name.includes(needle) || set.id.toLowerCase().includes(needle);
  });
}

export function summarizeAutoAssignSkips(
  skipped: Array<{ reason: string }> | null | undefined,
): Record<string, number> | null {
  if (!skipped) return null;
  const counts: Record<string, number> = {};
  for (const row of skipped) {
    counts[row.reason] = (counts[row.reason] ?? 0) + 1;
  }
  return counts;
}

/** UI copy overrides for readiness blocker strings from the pilot. */
export const READINESS_BLOCKER_COPY: Record<string, string> = {
  "No canonical pieces assigned to this work package.":
    "No active pieces assigned to this work package.",
};

/** UI copy overrides for material-state strings. */
export const READINESS_MATERIAL_COPY: Record<string, string> = {
  "not yet evaluated in this release.": "Material status is not available.",
};
