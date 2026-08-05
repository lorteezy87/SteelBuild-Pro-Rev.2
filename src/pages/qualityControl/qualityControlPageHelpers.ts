/**
 * Pure helpers for QualityControl page shell.
 */
/** @deprecated Prefer `@/pages/shared/filterLiveRecords` — re-export kept for local imports. */
export { filterLiveRecords } from "@/pages/shared/filterLiveRecords";

export type QcRecordLike = {
  test_type?: string | null;
  result?: string | null;
  status?: string | null;
  material_or_component?: string | null;
  location?: string | null;
  test_lab_or_inspector?: string | null;
  specification?: string | null;
  notes?: string | null;
  [k: string]: unknown;
};

export function filterQcRecords(
  qcRecords: QcRecordLike[],
  opts: {
    filterType: string;
    filterResult: string;
    filterStatus: string | null;
    searchQuery: string;
  },
): QcRecordLike[] {
  const query = (opts.searchQuery || "").trim().toLowerCase();
  return (qcRecords || []).filter((record) => {
    const typeMatch = opts.filterType === "all" || record.test_type === opts.filterType;
    const resultMatch = opts.filterResult === "all" || record.result === opts.filterResult;
    const statusMatch = opts.filterStatus === null || record.status === opts.filterStatus;
    const searchMatch =
      !query ||
      [
        record.material_or_component,
        record.location,
        record.test_lab_or_inspector,
        record.specification,
        record.notes,
      ].some((field) => field && String(field).toLowerCase().includes(query));
    return typeMatch && resultMatch && statusMatch && searchMatch;
  });
}

export function computeQcStats(qcRecords: QcRecordLike[]) {
  const stats = {
    total: qcRecords.length,
    passed: qcRecords.filter((r) => r.result === "Pass").length,
    failed: qcRecords.filter((r) => r.result === "Fail").length,
    conditional: qcRecords.filter((r) => r.result === "Conditional Pass").length,
    pending: qcRecords.filter((r) => r.status === "Pending").length,
  };
  const conclusiveCount = qcRecords.filter((r) => r.result !== "Inconclusive").length;
  const passRate =
    conclusiveCount > 0
      ? Math.round(((stats.passed + stats.conditional) / conclusiveCount) * 100)
      : 0;
  return { ...stats, conclusiveCount, passRate };
}
