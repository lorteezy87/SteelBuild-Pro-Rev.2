/**
 * Pure status chrome maps for ProjectHandoffChecklist.
 */

export const STATUS_ORDER = [
  "Not Completed",
  "In Progress",
  "Completed",
  "Not Applicable",
] as const;

export const STATUS_STYLE: Record<
  string,
  { color: string; bg: string; border: string }
> = {
  "Not Completed": {
    color: "var(--text-muted)",
    bg: "var(--bg-surface-low)",
    border: "var(--border-default)",
  },
  "In Progress": {
    color: "var(--status-warning)",
    bg: "var(--warning-muted)",
    border: "var(--warning-border)",
  },
  Completed: {
    color: "var(--status-success)",
    bg: "var(--success-muted)",
    border: "var(--success-border)",
  },
  "Not Applicable": {
    color: "var(--text-muted)",
    bg: "var(--hover-bg)",
    border: "var(--border-default)",
  },
};

export const mono: Record<string, string> = { fontFamily: "var(--font-mono)" };

export const inputStyle: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 4,
  padding: "5px 7px",
  fontSize: 11,
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  boxSizing: "border-box",
  minHeight: 26,
};
