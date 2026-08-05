/**
 * Pure token + chrome styles for PhoenixModal (shared form modals).
 */

export const MODAL_SURFACE = "var(--bg-surface-secondary)";
export const MODAL_PANEL = "var(--bg-surface-high)";
export const MODAL_PANEL_MUTED = "var(--bg-surface-low)";
export const MODAL_BORDER = "var(--border-default)";
export const MODAL_BORDER_MUTED = "var(--divider)";
export const MODAL_TEXT = "var(--text-primary)";
export const MODAL_TEXT_SECONDARY = "var(--text-secondary)";
export const MODAL_TEXT_MUTED = "var(--text-muted)";
export const MODAL_ACTION_TEXT = "var(--accent-text, var(--on-accent))";

export const btnPrimary: Record<string, string | number> = {
  background: "linear-gradient(135deg, rgba(86,176,255,0.98) 0%, rgba(35,134,230,0.98) 100%)",
  border: "1px solid rgba(86,176,255,0.4)",
  borderRadius: 8,
  padding: "8px 20px",
  color: MODAL_ACTION_TEXT,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: "0.02em",
  boxShadow: "0 10px 24px rgba(17,113,190,0.28)",
  transition: "box-shadow 0.15s",
};

export const btnSecondary: Record<string, string | number> = {
  background: MODAL_PANEL_MUTED,
  border: `1px solid ${MODAL_BORDER}`,
  borderRadius: 8,
  padding: "7px 18px",
  color: MODAL_TEXT_SECONDARY,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 0.15s",
};

export const btnDanger: Record<string, string | number> = {
  background: "rgba(239,68,68,0.13)",
  border: "1px solid rgba(239,68,68,0.35)",
  borderRadius: 8,
  padding: "7px 18px",
  color: "var(--status-error)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

export const inputStyle: Record<string, string | number> = {
  width: "100%",
  background: MODAL_PANEL,
  border: `1px solid ${MODAL_BORDER}`,
  borderRadius: 8,
  padding: "8px 12px",
  color: MODAL_TEXT,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  lineHeight: "18px",
  minHeight: 38,
  outline: "none",
  boxSizing: "border-box",
  boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
};

export const inputDisabledStyle: Record<string, string | number> = {
  ...inputStyle,
  background: MODAL_PANEL_MUTED,
  color: MODAL_TEXT_MUTED,
  cursor: "not-allowed",
};

export const labelStyle: Record<string, string | number> = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.12em",
  color: MODAL_TEXT_MUTED,
  marginBottom: 6,
  textTransform: "uppercase",
  fontWeight: 500,
};

export const PHOENIX_OVERLAY_STYLE: Record<string, string | number> = {
  position: "fixed",
  inset: 0,
  background: "rgba(1,4,10,0.76)",
  backdropFilter: "blur(8px)",
  zIndex: 1200,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

export function phoenixDialogStyle(maxWidth: number | string): Record<string, string | number> {
  return {
    background: MODAL_SURFACE,
    border: `1px solid ${MODAL_BORDER}`,
    borderRadius: 16,
    boxShadow: "0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",
    maxWidth,
    width: "90vw",
    maxHeight: "85vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    color: MODAL_TEXT,
  };
}

export const PHOENIX_HEADER_STYLE: Record<string, string | number> = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "20px 24px 16px",
  borderBottom: `1px solid ${MODAL_BORDER_MUTED}`,
  background: "var(--bg-surface-low)",
  flexShrink: 0,
};

export const PHOENIX_TITLE_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-display)",
  fontSize: 18,
  fontWeight: 700,
  color: MODAL_TEXT,
  letterSpacing: "0.04em",
};

export const PHOENIX_CLOSE_BTN_STYLE: Record<string, string | number> = {
  background: MODAL_PANEL_MUTED,
  border: `1px solid ${MODAL_BORDER_MUTED}`,
  color: MODAL_TEXT_MUTED,
  cursor: "pointer",
  padding: 4,
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
};

export const PHOENIX_BODY_STYLE: Record<string, string | number> = {
  padding: "20px 24px",
  flex: 1,
  overflowY: "auto",
  color: MODAL_TEXT,
};

export const PHOENIX_FOOTER_STYLE: Record<string, string | number> = {
  padding: "14px 24px",
  borderTop: `1px solid ${MODAL_BORDER_MUTED}`,
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  background: "var(--bg-surface-low)",
  flexShrink: 0,
};
