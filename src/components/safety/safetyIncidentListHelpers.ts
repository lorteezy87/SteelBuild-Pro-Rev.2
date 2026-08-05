/** Pure tones/status catalog for SafetyIncidentList (icons stay local). */

export const SEVERITY_COLORS: Record<string, string> = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Medium: "var(--status-info)",
  Low: "var(--accent)",
};

export const SAFETY_STATUS_COLORS: Record<string, string> = {
  Open: "var(--status-error)",
  "Under Investigation": "var(--status-warning)",
  "Action Plan": "var(--status-info)",
  "In Progress": "var(--status-warning)",
  Completed: "var(--status-success)",
  Closed: "var(--accent)",
};

export const SAFETY_STATUS_OPTIONS = [
  "Open",
  "In Progress",
  "Completed",
  "Closed",
] as const;
