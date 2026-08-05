/**
 * Pure chrome styles for PhoenixPanel table cells / rows.
 */

export const phoenixTH: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  fontWeight: 700,
  padding: "10px 12px",
  background: "color-mix(in srgb, var(--bg-surface-low) 90%, #000 10%)",
  borderBottom: "1px solid var(--divider)",
};

export function phoenixTR(
  overdue = false,
  over = false,
): Record<string, string | number> {
  return {
    borderBottom: "1px solid var(--divider)",
    background: overdue
      ? "var(--danger-muted)"
      : over
        ? "var(--warning-muted)"
        : "transparent",
    cursor: "pointer",
    borderLeft: overdue
      ? "3px solid var(--status-error)"
      : "3px solid transparent",
  };
}

export const phoenixTD: Record<string, string | number> = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-secondary)",
  padding: "8px 12px",
  verticalAlign: "middle",
};

export const phoenixTDMono: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--text-secondary)",
  padding: "8px 12px",
  verticalAlign: "middle",
};

export const PHOENIX_PANEL_SURFACE_STYLE: Record<string, string | number> = {
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 90%, #000 10%) 0%, color-mix(in srgb, var(--bg-surface-low) 86%, #000 14%) 100%)",
  border: "1px solid color-mix(in srgb, var(--border-default) 88%, white 12%)",
  borderRadius: "16px",
  overflow: "hidden",
  padding: 0,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 28px rgba(0,0,0,0.28)",
};

export const PHOENIX_PANEL_HEADER_STYLE: Record<string, string | number> = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 18px",
  borderBottom: "1px solid var(--divider)",
  background: "color-mix(in srgb, var(--bg-surface-low) 88%, #000 12%)",
};

export const PHOENIX_PANEL_TITLE_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  color: "var(--text-primary)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

export const PHOENIX_PANEL_COUNT_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  background: "var(--accent-muted)",
  border: "1px solid var(--accent-border)",
  color: "var(--accent)",
  borderRadius: 999,
  padding: "2px 7px",
  letterSpacing: "0.08em",
};
