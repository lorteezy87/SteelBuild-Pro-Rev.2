/**
 * Pure status color maps for InspectionList.
 */

export const STATUS_COLORS: Record<string, string> = {
  Scheduled: "var(--status-info)",
  "In Progress": "var(--status-warning)",
  Completed: "var(--status-success)",
  "On Hold": "var(--text-muted)",
  Cancelled: "var(--status-error)",
};

export const SIGNOFF_COLORS: Record<string, string> = {
  Pending: "var(--status-warning)",
  Approved: "var(--status-success)",
  "Conditional Approval": "var(--status-info)",
  Rejected: "var(--status-error)",
};
