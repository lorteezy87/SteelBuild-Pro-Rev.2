/** Pure tone maps for PunchlistList. */

export const STATUS_COLORS: Record<string, string> = {
  Open: "var(--status-error)",
  "In Progress": "var(--status-warning)",
  Completed: "var(--status-success)",
  "On Hold": "var(--text-muted)",
  Deferred: "var(--accent)",
};

export const PRIORITY_COLORS: Record<string, string> = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Medium: "var(--status-info)",
  Low: "var(--accent)",
};
