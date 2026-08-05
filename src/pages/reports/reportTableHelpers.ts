/**
 * Pure sort for ReportTable (generic report data tables).
 */

export type ReportSortDir = "asc" | "desc";

export type ReportColumnLike = {
  key: string;
  sortValue?: (row: any) => unknown;
};

/**
 * Sort rows by column key (or sortValue override). Null/empty sort last.
 * Returns a new array; original untouched.
 */
export function sortReportTableRows<T>(
  rows: T[] | null | undefined,
  columns: ReportColumnLike[] | null | undefined,
  sortKey: string | null | undefined,
  sortDir: ReportSortDir = "asc",
): T[] {
  const list = rows || [];
  if (!sortKey) return list;
  const col = (columns || []).find((c) => c.key === sortKey);
  const get = col?.sortValue || ((r: any) => r?.[sortKey]);
  const copy = [...list];
  copy.sort((a, b) => {
    let av = get(a);
    let bv = get(b);
    if (av === null || av === undefined || av === "") return 1;
    if (bv === null || bv === undefined || bv === "") return -1;
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  return copy;
}
