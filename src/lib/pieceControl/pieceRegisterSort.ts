/**
 * Sort helpers for the Piece Register table and Lots & links list.
 */

export type PieceRegisterSortKey =
  | "work_package"
  | "mark"
  | "updated_at";

export type PieceRegisterSortDirection = "asc" | "desc";

export type PieceRegisterSort = {
  key: PieceRegisterSortKey;
  direction: PieceRegisterSortDirection;
};

const collator = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

export type SortablePieceRow = {
  piece_mark?: string | null;
  lot_code?: string | null;
  work_package_id?: string | null;
  workPackageLabel?: string | null;
  updated_at?: string | null;
};

function workPackageSortValue(row: SortablePieceRow): string {
  if (!row.work_package_id) return "\uFFFF"; // unassigned last when ascending
  return String(row.workPackageLabel ?? row.work_package_id);
}

function markSortValue(row: SortablePieceRow): string {
  return `${String(row.piece_mark ?? "")}\u0000${String(row.lot_code ?? "")}`;
}

function compareRows(
  left: SortablePieceRow,
  right: SortablePieceRow,
  sort: PieceRegisterSort,
): number {
  let primary = 0;
  if (sort.key === "work_package") {
    primary = collator.compare(
      workPackageSortValue(left),
      workPackageSortValue(right),
    );
  } else if (sort.key === "updated_at") {
    const leftTs = Date.parse(String(left.updated_at ?? "")) || 0;
    const rightTs = Date.parse(String(right.updated_at ?? "")) || 0;
    primary = leftTs - rightTs;
  } else {
    primary = collator.compare(markSortValue(left), markSortValue(right));
  }
  if (primary === 0 && sort.key !== "mark") {
    primary = collator.compare(markSortValue(left), markSortValue(right));
  }
  return sort.direction === "desc" ? -primary : primary;
}

export function sortPieceRegisterRows<T extends SortablePieceRow>(
  rows: T[],
  sort: PieceRegisterSort,
): T[] {
  return [...rows].sort((left, right) => compareRows(left, right, sort));
}

export function nextPieceRegisterSort(
  current: PieceRegisterSort,
  key: PieceRegisterSortKey,
): PieceRegisterSort {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }
  return { key, direction: "asc" };
}
