/**
 * rivetBriefStyles - inline style objects + style-generating functions for
 * the Rivet schedule brief, extracted verbatim from ScheduleRivetBrief.jsx
 * (behavior-preserving). Pure CSS-in-JS (CSS-variable strings); no imports.
 */

export const shellStyle = {
  flexShrink: 0,
  margin: "0 24px 12px",
  border: "1px solid color-mix(in srgb, var(--border-default) 84%, white 16%)",
  borderRadius: 18,
  background: "var(--sched-band-bg)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.055), 0 18px 42px rgba(0,0,0,0.28)",
  padding: 14,
};

export const toggleButtonStyle = {
  display: "grid",
  placeItems: "center",
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid var(--border-default)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--text-muted)",
  cursor: "pointer",
  transition: "background 0.15s, border-color 0.15s, color 0.15s",
  flexShrink: 0,
};

export const collapsedMetricsStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 12,
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  marginBottom: 0,
};

export const titleWrapStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

export const avatarStyle = {
  width: 34,
  height: 34,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  color: "#04111d",
  background: "linear-gradient(135deg, var(--status-info), color-mix(in srgb, var(--status-info) 70%, white 30%))",
  boxShadow: "0 0 18px color-mix(in srgb, var(--status-info) 40%, transparent)",
  flexShrink: 0,
};

export const eyebrowStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--status-info)",
};

export const titleStyle = {
  fontFamily: "var(--font-display)",
  fontSize: 18,
  fontWeight: 900,
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export function riskPillStyle(tone) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    height: 30,
    padding: "0 11px",
    borderRadius: 999,
    border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)`,
    background: `color-mix(in srgb, ${tone} 12%, var(--bg-surface-high))`,
    color: tone,
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
}

export const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(104px, 1fr))",
  gap: 10,
  alignItems: "stretch",
};

export function metricStyle(tone) {
  return {
    minHeight: 104,
    border: `1px solid color-mix(in srgb, ${tone} 28%, var(--border-default))`,
    borderRadius: 14,
    background: `linear-gradient(145deg, color-mix(in srgb, ${tone} 10%, rgba(255,255,255,0.035)), rgba(255,255,255,0.025))`,
    padding: 12,
    display: "grid",
    alignContent: "space-between",
  };
}

export const recommendationStyle = {
  gridColumn: "span 3",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  padding: 12,
};

export const phasePanelStyle = {
  gridColumn: "span 3",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  padding: 12,
};

export const nearTermStyle = {
  gridColumn: "span 3",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.025)",
  padding: 12,
};

export const recoveryPanelStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--status-info) 24%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(34,211,238,0.055), rgba(255,255,255,0.025))",
  padding: 12,
};

export const morningPlanStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--accent) 24%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(86,176,255,0.06), rgba(255,255,255,0.025))",
  padding: 12,
};

export const handoffPanelStyle = {
  gridColumn: "span 6",
  border: "1px solid color-mix(in srgb, var(--status-info) 30%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(135deg, rgba(34,211,238,0.07), rgba(255,255,255,0.026))",
  padding: 12,
};

export const handoffGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  marginTop: 10,
};

export const handoffHeadingStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.11em",
  textTransform: "uppercase",
  color: "var(--status-info)",
};

export const linkButtonStyle = {
  border: "1px solid var(--accent-border)",
  borderRadius: 999,
  background: "var(--accent-muted)",
  color: "var(--accent)",
  padding: "5px 9px",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  cursor: "pointer",
};

export const criticalPanelStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--status-warning) 24%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(245,158,11,0.055), rgba(255,255,255,0.025))",
  padding: 12,
};

export const dependencyPanelStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--status-warning) 24%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(245,158,11,0.05), rgba(255,255,255,0.025))",
  padding: 12,
};

export const variancePanelStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--status-warning) 28%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(245,158,11,0.06), rgba(255,255,255,0.025))",
  padding: 12,
};

export const ownershipPanelStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--status-error) 26%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(239,68,68,0.052), rgba(255,255,255,0.025))",
  padding: 12,
};

export const miniLabelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

export const copyStyle = {
  margin: "7px 0 0",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  lineHeight: 1.45,
  color: "var(--text-secondary)",
};

export function phaseRowStyle(active) {
  return {
    width: "100%",
    border: `1px solid ${active ? "var(--accent-border)" : "var(--border-default)"}`,
    borderRadius: 10,
    background: active ? "var(--accent-muted)" : "rgba(255,255,255,0.025)",
    color: "var(--text-muted)",
    padding: "8px 9px",
    display: "grid",
    gridTemplateColumns: "minmax(90px, 1fr) auto auto auto auto",
    gap: 8,
    alignItems: "center",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };
}

export function recoveryRowStyle(tone) {
  return {
    width: "100%",
    border: `1px solid color-mix(in srgb, ${tone} 26%, var(--border-default))`,
    borderRadius: 12,
    background: `linear-gradient(135deg, color-mix(in srgb, ${tone} 8%, transparent), rgba(255,255,255,0.025))`,
    color: "var(--text-muted)",
    padding: "9px 10px",
    display: "grid",
    gridTemplateColumns: "24px minmax(0, 1fr) auto",
    gap: 9,
    alignItems: "start",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };
}

export const morningPlanRowStyle = {
  display: "grid",
  gridTemplateColumns: "24px minmax(0, 1fr)",
  gap: 9,
  alignItems: "start",
  border: "1px solid var(--border-default)",
  borderRadius: 11,
  background: "rgba(255,255,255,0.025)",
  color: "var(--text-secondary)",
  padding: "8px 10px",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  lineHeight: 1.35,
};

export const criticalTaskStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.025)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
};

export const logicTaskStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  border: "1px solid color-mix(in srgb, var(--status-warning) 24%, var(--border-default))",
  borderRadius: 10,
  background: "rgba(245,158,11,0.045)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
};

export const varianceTaskStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "42px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  border: "1px solid color-mix(in srgb, var(--status-warning) 24%, var(--border-default))",
  borderRadius: 10,
  background: "rgba(245,158,11,0.045)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
};

export const ownershipTaskStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  border: "1px solid color-mix(in srgb, var(--status-error) 24%, var(--border-default))",
  borderRadius: 10,
  background: "rgba(239,68,68,0.045)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
};

export const varianceDaysStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 22,
  borderRadius: 8,
  border: "1px solid color-mix(in srgb, var(--status-warning) 38%, var(--border-default))",
  background: "rgba(245,158,11,0.10)",
  color: "var(--status-warning)",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

export const handoffTaskStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "58px minmax(0, 1fr)",
  gap: 9,
  alignItems: "start",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.026)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
};

export const dateChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 22,
  borderRadius: 8,
  border: "1px solid color-mix(in srgb, var(--status-info) 32%, var(--border-default))",
  background: "rgba(34,211,238,0.08)",
  color: "var(--status-info)",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

export const taskRowStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  background: "transparent",
  color: "inherit",
  textAlign: "left",
  borderTop: "1px solid var(--border-default)",
  borderRight: "none",
  borderBottom: "none",
  borderLeft: "none",
  paddingTop: 7,
  cursor: "pointer",
};

export const taskNameStyle = {
  display: "block",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 900,
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const taskMetaStyle = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  color: "var(--text-muted)",
  marginTop: 2,
};

export const emptyStyle = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-muted)",
};
