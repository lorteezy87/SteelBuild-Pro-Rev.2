import type { PieceRegisterRow } from "@/lib/pieceControl/repository";

const NATURAL_COMPARE_OPTIONS = { numeric: true, sensitivity: "base" as const };

function compareAlphanumeric(a: string, b: string): number {
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, NATURAL_COMPARE_OPTIONS);
}

function compareLotCode(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "ALL") return -1;
  if (b === "ALL") return 1;
  return compareAlphanumeric(a, b);
}

export interface PieceRegisterFilters {
  search: string;
  workPackageId: string;
  profile: string;
  grade: string;
  lifecycle: string;
  source: string;
  hold: "all" | "held" | "clear";
}

export interface PieceRegisterDisplayRow extends PieceRegisterRow {
  workPackageLabel: string;
}

export function filterPieceRegisterRows(
  rows: PieceRegisterDisplayRow[],
  filters: PieceRegisterFilters,
): PieceRegisterDisplayRow[] {
  const search = filters.search.trim().toUpperCase();
  const normalizedRows = rows.filter((row) => {
    if (
      search &&
      ![
        row.piece_mark,
        row.normalized_piece_mark,
        row.workPackageLabel,
        row.profile,
        row.material_grade,
        row.source_system,
      ].some((value) => String(value ?? "").toUpperCase().includes(search))
    ) return false;
    if (filters.workPackageId && row.work_package_id !== filters.workPackageId) return false;
    if (filters.profile && row.profile !== filters.profile) return false;
    if (filters.grade && row.material_grade !== filters.grade) return false;
    if (filters.lifecycle && row.lifecycle_status !== filters.lifecycle) return false;
    if (filters.source && row.source_system !== filters.source) return false;
    if (filters.hold === "held" && !row.on_hold) return false;
    if (filters.hold === "clear" && row.on_hold) return false;
    return true;
  });

  return [...normalizedRows].sort((a, b) => {
    const pieceCompare = compareAlphanumeric(
      a.normalized_piece_mark || a.piece_mark,
      b.normalized_piece_mark || b.piece_mark,
    );
    if (pieceCompare !== 0) return pieceCompare;
    const lotCompare = compareLotCode(a.lot_code, b.lot_code);
    if (lotCompare !== 0) return lotCompare;
    return String(a.piece_mark ?? "").localeCompare(
      String(b.piece_mark ?? ""),
      undefined,
      NATURAL_COMPARE_OPTIONS,
    );
  });
}
