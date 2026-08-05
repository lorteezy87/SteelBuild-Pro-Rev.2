/**
 * Pure form chrome styles for ExpenseFormModal.
 */

export const iStyle: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "7px 11px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  boxSizing: "border-box",
  outline: "none",
  transition: "border-color 0.15s",
};

export const labelStyle: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  letterSpacing: "0.14em",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  marginBottom: 5,
  display: "block",
};

export const sectionLabel: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: "0.16em",
  color: "var(--accent)",
  textTransform: "uppercase",
  marginBottom: 12,
  paddingBottom: 6,
  borderBottom: "1px solid var(--divider)",
};

export const triggerStyle: Record<string, string | number> = {
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  color: "var(--text-primary)",
  height: 34,
};
