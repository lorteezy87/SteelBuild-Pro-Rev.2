/**
 * Pure chrome styles for RenameSetModal.
 */

export const RENAME_SET_BTN_PRIMARY: Record<string, string | number> = {
  padding: "7px 18px",
  background: "var(--accent)",
  color: "var(--on-accent)",
  border: "none",
  borderRadius: 2,
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};

export const RENAME_SET_BTN_GHOST: Record<string, string | number> = {
  padding: "7px 16px",
  background: "transparent",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};

export const RENAME_SET_BTN_ICON: Record<string, string | number> = {
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: 4,
  display: "flex",
  alignItems: "center",
};
