/** Pure status/priority tones for ChangeRequestList. */

export const CR_STATUS_COLORS: Record<string, string> = {
  Submitted: "var(--status-warning)",
  "Under Review": "var(--status-info)",
  "Awaiting Approval": "var(--status-warning)",
  Approved: "var(--status-success)",
  Rejected: "var(--status-error)",
  "Approved with Conditions": "var(--accent)",
  "On Hold": "var(--text-muted)",
};

export const CR_PRIORITY_COLORS: Record<string, string> = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Medium: "var(--status-info)",
  Low: "var(--accent)",
};
