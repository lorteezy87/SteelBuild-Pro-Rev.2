/**
 * Pure style objects for TitleblockMarkerModal chrome.
 */

export const overlayStyle: Record<string, string | number> = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const dialogStyle: Record<string, string | number> = {
  background: "var(--bg-surface-secondary)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  width: "min(1100px, 95vw)",
  height: "min(800px, 92vh)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

export const headerStyle: Record<string, string | number> = {
  padding: "14px 18px",
  borderBottom: "1px solid var(--border-default)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexShrink: 0,
};

export const toolbarStyle: Record<string, string | number> = {
  padding: "10px 18px",
  borderBottom: "1px solid var(--border-default)",
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  flexShrink: 0,
  background: "var(--bg-surface-low)",
};

export const canvasWrapStyle: Record<string, string | number> = {
  flex: 1,
  // A flex child needs min-height/width:0 to actually shrink to the available
  // space (instead of growing to its content) — without it the page can't be
  // measured or scrolled correctly.
  minHeight: 0,
  minWidth: 0,
  overflow: "auto",
  background: "rgba(0,0,0,0.4)",
  position: "relative",
  display: "flex",
  // `safe` alignment: center the sheet when it fits, but fall back to
  // start-alignment when it's larger than the viewport. Plain `center` makes
  // the leading (left/top) overflow unreachable by scrolling, which clips the
  // sheet edges — exactly where titleblocks live — so the corners can't be
  // marked. `safe` keeps every edge scroll-reachable (and degrades to a
  // reachable flex-start on browsers that don't support the keyword).
  alignItems: "safe center",
  justifyContent: "safe center",
  padding: 16,
};

export const footerStyle: Record<string, string | number> = {
  padding: "12px 18px",
  borderTop: "1px solid var(--border-default)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexShrink: 0,
};

export function btn(
  variant: "primary" | "secondary" = "secondary",
): Record<string, string | number> {
  return {
    padding: "8px 14px",
    borderRadius: 6,
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
    border:
      variant === "primary"
        ? "1px solid var(--accent)"
        : "1px solid var(--border-default)",
    background: variant === "primary" ? "var(--accent)" : "transparent",
    color: variant === "primary" ? "var(--bg-base)" : "var(--text-primary)",
    transition: "background 0.12s, opacity 0.12s",
  };
}
