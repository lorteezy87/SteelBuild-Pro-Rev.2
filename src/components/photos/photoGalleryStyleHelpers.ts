/**
 * Pure style object builders for PhotoGallery chrome.
 */
export function navButtonStyle(side: "left" | "right"): Record<string, string | number> {
  return {
    position: "absolute",
    top: "50%",
    [side]: 16,
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: 22,
    background: "rgba(15,23,42,0.78)",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "rgba(255,255,255,0.85)",
    cursor: "pointer",
    backdropFilter: "blur(6px)",
    zIndex: 4,
  };
}

export const editInputStyle: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "7px 10px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

export function panelButtonStyle({
  primary,
  destructive,
  disabled,
}: { primary?: boolean; destructive?: boolean; disabled?: boolean } = {}): Record<
  string,
  string | number
> {
  return {
    flex: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "8px 10px",
    borderRadius: 6,
    border: destructive
      ? "1px solid var(--status-error)"
      : primary
        ? "1px solid var(--accent)"
        : "1px solid var(--border-default)",
    background: destructive
      ? "rgba(239,68,68,0.12)"
      : primary
        ? "var(--accent)"
        : "var(--bg-surface)",
    color: destructive
      ? "var(--status-error)"
      : primary
        ? "var(--bg-base)"
        : "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: disabled ? 0.5 : 1,
  };
}
