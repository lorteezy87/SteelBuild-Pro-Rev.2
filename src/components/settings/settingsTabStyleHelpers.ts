/** Shared pure style tokens for settings sub-tabs. */

export const SETTINGS_LABEL_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  color: "var(--text-muted)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: 12,
  display: "block",
};

export const SETTINGS_SECTION_STYLE: Record<string, string | number> = {
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "18px 16px",
  marginBottom: 20,
};
