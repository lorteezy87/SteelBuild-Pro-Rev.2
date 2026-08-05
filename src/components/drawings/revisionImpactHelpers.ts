/** Pure filters for RevisionImpactReportModal. */

export function filterRevisionsForSheets<
  T extends { drawing_id?: string | null },
  S extends { id?: string | null },
>(
  allRevisions: T[] | null | undefined,
  setSheets: S[] | null | undefined,
): T[] {
  const ids = new Set((setSheets || []).map((s) => String(s.id)));
  return (allRevisions || []).filter((r) => ids.has(String(r.drawing_id)));
}

export const SEV_ORDER = ["critical", "high", "medium", "low", "info"] as const;
export const IMPACT_MONO = "var(--font-mono)";
