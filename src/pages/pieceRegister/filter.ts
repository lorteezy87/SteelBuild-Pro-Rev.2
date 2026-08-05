import type { PieceRegisterRow } from "@/lib/pieceControl/repository";

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
  return rows.filter((row) => {
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
}
