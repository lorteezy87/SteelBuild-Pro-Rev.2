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
