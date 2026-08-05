/** Pure style tokens for MfaSection. */

export const QR_CODE_BACKGROUND = "#fff";

export const MFA_LBL = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  color: "var(--text-muted)",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  display: "block" as const,
  marginBottom: 5,
};

export const MFA_INP = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box" as const,
};

export function mfaBtnPrimary(busy: boolean) {
  return {
    background: "var(--accent)",
    color: "var(--on-accent)",
    border: "none",
    borderRadius: 8,
    padding: "9px 18px",
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 700,
    cursor: busy ? ("not-allowed" as const) : ("pointer" as const),
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    opacity: busy ? 0.6 : 1,
  };
}

export const MFA_BTN_GHOST = {
  background: "var(--bg-surface-low)",
  color: "var(--text-secondary)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "8px 14px",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer" as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};
