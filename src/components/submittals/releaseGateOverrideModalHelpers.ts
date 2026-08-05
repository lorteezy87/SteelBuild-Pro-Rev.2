/**
 * Pure chrome styles for ReleaseGateOverrideModal.
 */

export const RELEASE_GATE_MONO: Record<string, string> = {
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
};

export const RELEASE_GATE_BTN_BASE: Record<string, string | number> = {
  ...RELEASE_GATE_MONO,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  padding: "8px 16px",
  borderRadius: 2,
  border: "1px solid var(--border-default)",
  cursor: "pointer",
  textTransform: "uppercase",
};
