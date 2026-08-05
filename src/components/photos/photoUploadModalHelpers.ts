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
