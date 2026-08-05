/**
 * Pure chrome styles for FolderBar.
 */

export const PILL_BTN: Record<string, string | number> = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
  color: "var(--text-secondary)",
  transition: "all 0.12s",
};

export const PRIMARY_BTN: Record<string, string | number> = {
  ...PILL_BTN,
  background: "var(--accent)",
  color: "var(--bg-base)",
  borderColor: "var(--accent)",
};

export const CRUMB_LINK: Record<string, string | number> = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

export const CRUMB_CURRENT: Record<string, string | number> = {
  ...CRUMB_LINK,
  color: "var(--text-primary)",
  cursor: "default",
};

export const CARD_STYLE: Record<string, string | number> = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  cursor: "pointer",
  transition: "all 0.12s",
  position: "relative",
};
