/**
 * Pure style builders for PhotoUploadModal actions.
 */
export function cancelButtonStyle(disabled?: boolean): Record<string, string | number> {
  return {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: 6,
    padding: "8px 14px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: disabled ? 0.5 : 1,
  };
}

export function uploadButtonStyle(disabled?: boolean): Record<string, string | number> {
  return {
    background: "var(--accent)",
    color: "var(--bg-base)",
    border: "none",
    borderRadius: 6,
    padding: "8px 14px",
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: disabled ? 0.5 : 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

export const inputStyle: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "6px 9px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 11,
  outline: "none",
  boxSizing: "border-box",
};

export const compactInputStyle: Record<string, string | number> = {
  ...inputStyle,
  fontSize: 10,
  padding: "5px 7px",
};
