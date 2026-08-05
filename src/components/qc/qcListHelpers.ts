/** Pure result/status tones for QCList. */

export const RESULT_COLORS: Record<string, string> = {
  Pass: "var(--status-success)",
  Fail: "var(--status-error)",
  "Conditional Pass": "var(--status-warning)",
  Inconclusive: "var(--text-muted)",
};

export const QC_STATUS_COLORS: Record<string, string> = {
  Pending: "var(--status-warning)",
  Reviewed: "var(--status-info)",
  Approved: "var(--status-success)",
  Rejected: "var(--status-error)",
};
