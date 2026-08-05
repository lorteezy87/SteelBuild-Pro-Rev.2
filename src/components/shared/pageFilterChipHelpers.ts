/**
 * Shared pure chrome for page-level filter toggle chips
 * (punchlist / photos / safety / QC and siblings).
 */

export function pageFilterChipStyle(
  active: boolean,
): Record<string, string | number> {
  return {
    background: active ? "var(--accent)" : "var(--bg-surface-low)",
    color: active ? "white" : "var(--text-secondary)",
    border: "none",
    borderRadius: "var(--radius-btn)",
    padding: "5px 12px",
    fontFamily: "var(--font-body)",
    fontSize: "8px",
    fontWeight: 700,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };
}
