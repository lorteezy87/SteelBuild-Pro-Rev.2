import { selectActionableLeafPieces } from "@/lib/pieceControl/canonicalRollups";
import { pieceTons } from "@/lib/pieceControl/tonnage";

export const UNASSIGNED_COLUMN_ID = "unassigned";

export type BoardColumnId = typeof UNASSIGNED_COLUMN_ID | string;

export interface BoardPiece {
  id: string;
  piece_mark: string;
  lot_code: string;
  lifecycle_status: string;
  work_package_id: string | null;
  quantity?: number | null;
  weight_each_lbs?: number | null;
  weight_total_lbs?: number | null;
  parent_piece_id?: string | null;
  is_container?: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
}

export interface BoardWorkPackage {
  id: string;
  wp_number?: string | null;
  name?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
}

export interface BoardColumn {
  id: BoardColumnId;
  title: string;
  pieces: BoardPiece[];
  leafCount: number;
  knownTons: number;
}

export interface BuildPackageBoardInput {
  pieces: BoardPiece[];
  workPackages: BoardWorkPackage[];
  markFilter?: string;
  lifecycleFilter?: string;
  /** Optional pieceId → work_package_id overrides for optimistic UI */
  assignmentOverrides?: Record<string, string | null>;
}

const markCollator = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

function workPackageTitle(wp: BoardWorkPackage): string {
  const number = String(wp.wp_number || "").trim();
  const name = String(wp.name || "").trim();
  if (number && name && number !== name) return `${number} · ${name}`;
  return number || name || "Unnamed package";
}

function activeWorkPackages(workPackages: BoardWorkPackage[]): BoardWorkPackage[] {
  return workPackages
    .filter((wp) => !wp.is_deleted && !wp.deleted_at)
    .slice()
    .sort((a, b) => {
      const aKey = String(a.wp_number || a.name || a.id);
      const bKey = String(b.wp_number || b.name || b.id);
      return markCollator.compare(aKey, bKey);
    });
}

function matchesFilters(
  piece: BoardPiece,
  markFilter: string,
  lifecycleFilter: string,
): boolean {
  if (lifecycleFilter && piece.lifecycle_status !== lifecycleFilter) return false;
  if (!markFilter) return true;
  const mark = String(piece.piece_mark || "").toLowerCase();
  const lot = String(piece.lot_code || "").toLowerCase();
  return mark.includes(markFilter) || lot.includes(markFilter);
}

function sortPieces(pieces: BoardPiece[]): BoardPiece[] {
  return pieces.slice().sort((a, b) => {
    const byMark = markCollator.compare(a.piece_mark || "", b.piece_mark || "");
    if (byMark !== 0) return byMark;
    return markCollator.compare(a.lot_code || "", b.lot_code || "");
  });
}

function knownTonsFor(pieces: BoardPiece[]): number {
  let tons = 0;
  for (const piece of pieces) {
    const value = pieceTons(piece);
    if (value !== null) tons += value;
  }
  return tons;
}

function resolveAssignment(
  piece: BoardPiece,
  overrides?: Record<string, string | null>,
): string | null {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, piece.id)) {
    return overrides[piece.id] ?? null;
  }
  return piece.work_package_id ?? null;
}

export function buildPackageBoardColumns(input: BuildPackageBoardInput): BoardColumn[] {
  const markFilter = String(input.markFilter || "").trim().toLowerCase();
  const lifecycleFilter = String(input.lifecycleFilter || "").trim();
  const packages = activeWorkPackages(input.workPackages);
  const packageIds = new Set(packages.map((wp) => wp.id));

  const leaves = selectActionableLeafPieces(input.pieces)
    .map((piece) => ({
      ...piece,
      work_package_id: resolveAssignment(piece, input.assignmentOverrides),
    }))
    .filter((piece) => matchesFilters(piece, markFilter, lifecycleFilter));

  const byPackage = new Map<string, BoardPiece[]>();
  const unassigned: BoardPiece[] = [];

  for (const piece of leaves) {
    const wpId = piece.work_package_id;
    if (!wpId || !packageIds.has(wpId)) {
      unassigned.push(piece);
      continue;
    }
    const bucket = byPackage.get(wpId) ?? [];
    bucket.push(piece);
    byPackage.set(wpId, bucket);
  }

  const columns: BoardColumn[] = [
    {
      id: UNASSIGNED_COLUMN_ID,
      title: "Unassigned",
      pieces: sortPieces(unassigned),
      leafCount: unassigned.length,
      knownTons: knownTonsFor(unassigned),
    },
  ];

  for (const wp of packages) {
    const pieces = sortPieces(byPackage.get(wp.id) ?? []);
    columns.push({
      id: wp.id,
      title: workPackageTitle(wp),
      pieces,
      leafCount: pieces.length,
      knownTons: knownTonsFor(pieces),
    });
  }

  return columns;
}
