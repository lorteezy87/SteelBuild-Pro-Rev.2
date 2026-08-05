/**
 * Pure chrome styles for RegisterFetchStates panels.
 */

export const REGISTER_FETCH_PANEL_STYLE: Record<string, string | number> = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "48px 24px",
  background: "var(--bg-surface)",
  borderRadius: "var(--radius-card)",
  gap: 16,
};

export const REGISTER_FETCH_TITLE_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-body)",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-secondary)",
  margin: 0,
  textAlign: "center",
};

export const REGISTER_FETCH_BODY_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-body)",
  fontSize: 11,
  color: "var(--text-muted)",
  margin: 0,
  textAlign: "center",
  maxWidth: 320,
};
