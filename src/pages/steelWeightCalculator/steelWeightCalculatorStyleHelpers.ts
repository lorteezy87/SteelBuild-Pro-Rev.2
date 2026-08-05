/**
 * Pure style tokens for Steel Weight Calculator.
 */

export const mono: Record<string, string | number> = { fontFamily: "var(--font-mono)" };
export const body: Record<string, string | number> = { fontFamily: "var(--font-body)" };

export const cardStyle: Record<string, string | number> = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  overflow: "hidden",
};

export const inputStyle: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "10px 12px",
  color: "var(--text-primary)",
  fontSize: 14,
  ...mono,
  outline: "none",
  boxSizing: "border-box",
};

export const selectStyle: Record<string, string | number> = {
  ...inputStyle,
  padding: "9px 12px",
  cursor: "pointer",
};

export const labelStyle: Record<string, string | number> = {
  ...mono,
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  marginBottom: 6,
  display: "block",
};

export const tdBase: Record<string, string | number> = {
  ...mono,
  fontSize: 11,
  color: "var(--text-primary)",
  padding: "8px 12px",
  borderBottom: "1px solid var(--divider)",
  fontVariantNumeric: "tabular-nums",
};

export const tdLeft: Record<string, string | number> = { ...tdBase, textAlign: "left" };
export const tdRight: Record<string, string | number> = { ...tdBase, textAlign: "right" };
