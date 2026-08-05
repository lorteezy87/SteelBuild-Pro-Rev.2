/**
 * Pure sort for AgingReportTable.
 */
export type AgingSortDir = "asc" | "desc";

export function sortAgingReportRows<T extends Record<string, unknown>>(
  rows: T[] | null | undefined,
  sortKey: string,
  sortDir: AgingSortDir = "asc",
): T[] {
  const arr = (rows || []).slice();
  arr.sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    const cmp = String(av || "").localeCompare(String(bv || ""));
    return sortDir === "asc" ? cmp : -cmp;
  });
  return arr;
}
