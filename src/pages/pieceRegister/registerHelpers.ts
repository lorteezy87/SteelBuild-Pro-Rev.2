/**
 * Pure helpers extracted from PieceRegister.tsx.
 * Keep page-level useMemo wrappers; only move pure bodies here.
 */
import type { PieceAttentionItem } from "@/lib/pieceControl/presentation";
import { pieceTons } from "@/lib/pieceControl/tonnage";

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
