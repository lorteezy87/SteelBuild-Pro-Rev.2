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

export const ACTION_ITEM_INPUT_STYLE: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-surface-high)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
};

export const ACTION_ITEM_LABEL_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 4,
};
