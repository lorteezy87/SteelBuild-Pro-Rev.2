/** Pure priority chip catalog for ActionItemFormModal. */

export const PRIORITY_OPTIONS = [
  {
    value: "Low",
    label: "Low",
    color: "var(--text-muted)",
    bg: "rgba(100,116,139,0.12)",
    border: "rgba(100,116,139,0.3)",
  },
  {
    value: "Medium",
    label: "Med",
    color: "var(--status-info)",
    bg: "rgba(37,99,235,0.12)",
    border: "rgba(37,99,235,0.3)",
  },
  {
    value: "High",
    label: "High",
    color: "var(--status-warning)",
    bg: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.3)",
  },
  {
    value: "Critical",
    label: "🔥 Crit",
    color: "var(--status-error)",
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.3)",
  },
] as const;
