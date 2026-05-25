import type { CSSProperties } from "react";
import { phaseColor, STATUS_TONE } from "./format";

export const mono: CSSProperties = { fontFamily: "var(--font-mono)" };
export const display: CSSProperties = { fontFamily: "'Space Grotesk', var(--font-display)" };

export const pageStyle: CSSProperties = {
  padding: 18,
  display: "flex",
  flexDirection: "column",
  gap: 14,
  minWidth: 0,
};

export const heroStyle: CSSProperties = {
  border: "1px solid color-mix(in srgb, var(--border-default) 84%, white 16%)",
  borderRadius: 18,
  background: "linear-gradient(135deg, color-mix(in srgb, var(--bg-surface-high) 94%, #000 6%), color-mix(in srgb, var(--bg-surface) 86%, #000 14%))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 42px rgba(0,0,0,0.30)",
  padding: 18,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 18,
  alignItems: "end",
};

export const eyebrowStyle: CSSProperties = {
  ...mono,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--accent)",
};

export const heroTitleStyle: CSSProperties = {
  ...display,
  fontSize: 34,
  lineHeight: 1,
  fontWeight: 900,
  color: "var(--text-primary)",
  marginTop: 6,
};

export const heroMetaStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 12,
  ...mono,
  fontSize: 9,
  fontWeight: 800,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
};

export const heroActionStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  justifyItems: "end",
};

export const viewToggleStyle: CSSProperties = {
  display: "inline-flex",
  gap: 5,
  padding: 5,
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "var(--bg-surface-low)",
};

export const viewButtonStyle = (active): CSSProperties => ({
  height: 30,
  padding: "0 10px",
  border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
  borderRadius: 10,
  background: active ? "var(--accent-muted)" : "transparent",
  color: active ? "var(--accent)" : "var(--text-secondary)",
  ...mono,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  cursor: "pointer",
});

export const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

export const metricCardStyle = (tone): CSSProperties => ({
  minHeight: 114,
  border: `1px solid color-mix(in srgb, ${tone} 28%, var(--border-default))`,
  borderRadius: 14,
  padding: 13,
  background: `linear-gradient(145deg, color-mix(in srgb, ${tone} 8%, var(--bg-surface-high)), var(--bg-surface-low))`,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 24px rgba(0,0,0,0.24)",
});

export const metricLabelStyle: CSSProperties = {
  ...mono,
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.13em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

export const phaseMetricStyle = (phase, active): CSSProperties => ({
  textAlign: "left",
  minHeight: 114,
  border: `1px solid ${active ? phaseColor(phase) : "var(--border-default)"}`,
  borderRadius: 14,
  padding: 13,
  background: active
    ? `linear-gradient(145deg, color-mix(in srgb, ${phaseColor(phase)} 14%, var(--bg-surface-high)), var(--bg-surface-low))`
    : "var(--bg-surface)",
  cursor: "pointer",
});

export const controlPanelStyle: CSSProperties = {
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  padding: 10,
  background: "var(--bg-surface)",
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

export const searchBoxStyle: CSSProperties = {
  minWidth: 240,
  flex: "1 1 300px",
  height: 34,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 10px",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  background: "var(--bg-input)",
};

export const searchInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--text-primary)",
  fontSize: 12,
  fontFamily: "var(--font-body)",
};

export const filterGroupStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  flexWrap: "wrap",
};

export const filterLabelStyle: CSSProperties = {
  ...mono,
  fontSize: 8,
  fontWeight: 900,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  marginRight: 2,
};

export const filterButtonStyle = (active, tone): CSSProperties => ({
  minHeight: 26,
  padding: "0 8px",
  borderRadius: 8,
  border: `1px solid ${active ? tone : "var(--border-default)"}`,
  background: active ? `color-mix(in srgb, ${tone} 14%, transparent)` : "var(--bg-surface-low)",
  color: active ? tone : "var(--text-secondary)",
  ...mono,
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
  whiteSpace: "nowrap",
});

export const countLabelStyle: CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
};

export const clearButtonStyle: CSSProperties = {
  border: "1px solid var(--accent-border)",
  borderRadius: 8,
  background: "var(--accent-muted)",
  color: "var(--accent)",
  ...mono,
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  padding: "6px 9px",
  cursor: "pointer",
};

export const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "300px minmax(0, 1fr)",
  gap: 14,
  alignItems: "start",
};

export const sideRailStyle: CSSProperties = {
  position: "sticky",
  top: 12,
  border: "1px solid var(--border-default)",
  borderRadius: 16,
  background: "linear-gradient(180deg, var(--bg-surface-high), var(--bg-surface))",
  padding: 14,
  display: "grid",
  gap: 10,
  boxShadow: "0 14px 34px rgba(0,0,0,0.24)",
};

export const panelHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  paddingBottom: 4,
};

export const panelTitleStyle: CSSProperties = {
  ...display,
  fontSize: 18,
  fontWeight: 900,
  color: "var(--text-primary)",
};

export const railStatStyle = (tone): CSSProperties => ({
  width: "100%",
  border: `1px solid color-mix(in srgb, ${tone} 28%, var(--border-default))`,
  borderRadius: 12,
  background: `linear-gradient(90deg, color-mix(in srgb, ${tone} 9%, transparent), transparent)`,
  padding: "9px 10px",
  color: "var(--text-secondary)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  cursor: "pointer",
  ...mono,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
});

export const miniLabelStyle: CSSProperties = {
  ...mono,
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

export const watchItemStyle = (risk): CSSProperties => {
  const tone = risk === "high" ? "var(--status-error)" : risk === "medium" ? "var(--status-warning)" : "var(--status-success)";
  return {
    border: `1px solid color-mix(in srgb, ${tone} 26%, var(--border-default))`,
    borderRadius: 11,
    background: "var(--bg-surface-low)",
    padding: "8px 9px",
    color: "inherit",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 8px",
    gap: 8,
    alignItems: "center",
    textAlign: "left",
    cursor: "pointer",
  };
};

export const watchTitleStyle: CSSProperties = {
  display: "block",
  color: "var(--text-primary)",
  fontSize: 12,
  fontWeight: 850,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const watchMetaStyle: CSSProperties = {
  display: "block",
  ...mono,
  fontSize: 8,
  color: "var(--text-muted)",
  marginTop: 3,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

export const riskDotStyle = (risk): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: 8,
  background: risk === "high" ? "var(--status-error)" : risk === "medium" ? "var(--status-warning)" : "var(--status-success)",
});

export const emptyRailStyle: CSSProperties = {
  border: "1px dashed var(--border-default)",
  borderRadius: 10,
  padding: 12,
  color: "var(--text-muted)",
  fontSize: 12,
  textAlign: "center",
};

export const phaseFlowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 12,
  alignItems: "start",
  overflowX: "visible",
  paddingBottom: 4,
};

export const laneStyle = (phase): CSSProperties => ({
  minWidth: 0,
  border: `1px solid color-mix(in srgb, ${phaseColor(phase)} 30%, var(--border-default))`,
  borderRadius: 16,
  background: "linear-gradient(180deg, var(--bg-surface), var(--bg-surface-low))",
  padding: 12,
});

export const laneHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
};

export const laneIconStyle = (phase): CSSProperties => ({
  width: 30,
  height: 30,
  borderRadius: 10,
  display: "grid",
  placeItems: "center",
  color: phaseColor(phase),
  background: `color-mix(in srgb, ${phaseColor(phase)} 12%, transparent)`,
  border: `1px solid color-mix(in srgb, ${phaseColor(phase)} 32%, transparent)`,
  flexShrink: 0,
});

export const laneDescriptionStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: 11,
  lineHeight: 1.35,
  marginTop: 2,
};

export const laneCountStyle = (phase): CSSProperties => ({
  ...mono,
  fontSize: 13,
  fontWeight: 900,
  color: phaseColor(phase),
});

export const laneEmptyStyle: CSSProperties = {
  border: "1px dashed var(--border-default)",
  borderRadius: 12,
  padding: 16,
  color: "var(--text-muted)",
  textAlign: "center",
  ...mono,
  fontSize: 9,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
};

export const statusBoardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 12,
};

export const statusColumnStyle = (status): CSSProperties => ({
  border: `1px solid color-mix(in srgb, ${STATUS_TONE[status]} 28%, var(--border-default))`,
  borderTop: `3px solid ${STATUS_TONE[status]}`,
  borderRadius: 16,
  background: "var(--bg-surface)",
  padding: 12,
});

export const statusColumnHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 10,
  ...mono,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

export const packageCardStyle = (risk, selected): CSSProperties => {
  const tone = risk === "high" ? "var(--status-error)" : risk === "medium" ? "var(--status-warning)" : "var(--border-default)";
  return {
    border: `1px solid ${selected ? "var(--accent)" : tone}`,
    borderRadius: 13,
    padding: 10,
    background: selected ? "var(--accent-muted)" : "var(--bg-surface-high)",
    display: "grid",
    gap: 9,
    cursor: "pointer",
    boxShadow: selected ? "0 0 0 1px var(--accent-border)" : "inset 0 1px 0 rgba(255,255,255,0.04)",
  };
};

export const compactCardStyle = (risk): CSSProperties => {
  const tone = risk === "high" ? "var(--status-error)" : risk === "medium" ? "var(--status-warning)" : "var(--border-default)";
  return {
    border: `1px solid ${tone}`,
    borderRadius: 13,
    padding: 10,
    background: "var(--bg-surface-high)",
    display: "grid",
    gap: 8,
    cursor: "pointer",
  };
};

export const cardTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

export const wpNumberStyle: CSSProperties = {
  ...mono,
  color: "var(--accent)",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.08em",
  whiteSpace: "nowrap",
};

export const packageNameStyle: CSSProperties = {
  display: "block",
  color: "var(--text-primary)",
  fontSize: 13,
  lineHeight: 1.3,
  fontWeight: 850,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const subLineStyle: CSSProperties = {
  display: "block",
  color: "var(--text-muted)",
  fontSize: 10,
  lineHeight: 1.35,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const cardMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 6,
};

export const factStyle: CSSProperties = {
  minWidth: 0,
  border: "1px solid var(--border-default)",
  borderRadius: 9,
  padding: "6px 7px",
  display: "flex",
  gap: 6,
  alignItems: "center",
  background: "var(--bg-surface)",
};

export const factLabelStyle: CSSProperties = {
  display: "block",
  ...mono,
  fontSize: 7,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
};

export const factValueStyle: CSSProperties = {
  display: "block",
  ...mono,
  fontSize: 9,
  color: "var(--text-primary)",
  fontWeight: 900,
  marginTop: 1,
};

export const flagWrapStyle: CSSProperties = {
  display: "flex",
  gap: 5,
  alignItems: "center",
  flexWrap: "wrap",
};

export const flagStyle = (tone): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  minHeight: 20,
  padding: "0 7px",
  borderRadius: 7,
  border: `1px solid color-mix(in srgb, ${tone} 32%, transparent)`,
  background: `color-mix(in srgb, ${tone} 10%, transparent)`,
  color: tone,
  ...mono,
  fontSize: 7,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
});

export const readinessStyle = (tone): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  minHeight: 20,
  padding: "0 7px",
  borderRadius: 7,
  border: `1px solid color-mix(in srgb, ${tone} 35%, transparent)`,
  background: `color-mix(in srgb, ${tone} 10%, transparent)`,
  color: tone,
  ...mono,
  fontSize: 7,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
});

export const cardFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
};

export const iconButtonStyle: CSSProperties = {
  width: 24,
  height: 24,
  border: "1px solid var(--border-default)",
  borderRadius: 7,
  background: "var(--bg-surface)",
  color: "var(--text-muted)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  cursor: "pointer",
};

export const phaseBadgeStyle = (phase): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  width: "fit-content",
  minHeight: 22,
  padding: "0 7px",
  borderRadius: 8,
  border: `1px solid color-mix(in srgb, ${phaseColor(phase)} 36%, transparent)`,
  background: `color-mix(in srgb, ${phaseColor(phase)} 12%, transparent)`,
  color: phaseColor(phase),
  ...mono,
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
});

export const registerShellStyle: CSSProperties = {
  border: "1px solid var(--border-default)",
  borderRadius: 16,
  background: "var(--bg-surface)",
  overflowX: "auto",
  overflowY: "hidden",
};

export const registerHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "26px 86px minmax(220px, 1.4fr) 110px 116px 132px 92px 70px 58px",
  gap: 10,
  alignItems: "center",
  minWidth: 900,
  padding: "9px 12px",
  borderBottom: "1px solid var(--divider)",
  background: "var(--bg-surface-low)",
  ...mono,
  fontSize: 8,
  fontWeight: 900,
  color: "var(--text-muted)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

export const registerRowStyle = (risk): CSSProperties => {
  const tone = risk === "high" ? "var(--status-error)" : risk === "medium" ? "var(--status-warning)" : "var(--divider)";
  return {
    display: "grid",
    gridTemplateColumns: "26px 86px minmax(220px, 1.4fr) 110px 116px 132px 92px 70px 58px",
    gap: 10,
    alignItems: "center",
    minWidth: 900,
    padding: "10px 12px",
    borderBottom: "1px solid var(--divider)",
    borderLeft: `3px solid ${tone}`,
    cursor: "pointer",
  };
};

export const laborLabelStyle = (burn): CSSProperties => ({
  ...mono,
  fontSize: 10,
  fontWeight: 900,
  color: burn > 100 ? "var(--status-error)" : burn >= 85 ? "var(--status-warning)" : "var(--text-secondary)",
});

export const RESPONSIVE_CSS = `
@media (max-width: 1180px) {
  .wp-content-grid {
    grid-template-columns: 1fr !important;
  }
  .wp-phase-flow {
    grid-template-columns: repeat(2, minmax(260px, 1fr)) !important;
  }
}

@media (max-width: 760px) {
  .wp-hero {
    grid-template-columns: 1fr !important;
  }
  .wp-phase-flow {
    grid-template-columns: 1fr !important;
    overflow-x: visible !important;
  }
}
`;
