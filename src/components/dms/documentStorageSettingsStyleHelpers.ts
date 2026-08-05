/**
 * Pure form chrome styles for DocumentStorageSettings.
 */

export const labelStyle: Record<string, string | number> = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 5,
};

export const inputStyle: Record<string, string | number> = {
  width: "100%",
  padding: "8px 12px",
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

export const primaryBtnStyle: Record<string, string | number> = {
  padding: "7px 14px",
  background: "var(--accent)",
  border: "1px solid var(--accent-border)",
  borderRadius: 6,
  fontFamily: "var(--font-body)",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--on-accent)",
  cursor: "pointer",
};

export const secondaryBtnStyle: Record<string, string | number> = {
  padding: "7px 14px",
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  fontFamily: "var(--font-body)",
  fontSize: 11,
  fontWeight: 500,
  color: "var(--text-secondary)",
  cursor: "pointer",
};

export const iconBtnStyle: Record<string, string | number> = {
  width: 30,
  height: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "none",
  border: "1px solid transparent",
  borderRadius: 6,
  cursor: "pointer",
  transition: "all 120ms",
};
