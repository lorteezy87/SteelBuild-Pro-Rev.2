/**
 * Pure risk tone + chrome styles for ScheduleAiRiskCard.
 */

export function riskTone(level: string | null | undefined): string {
  if (level === "HIGH") return "var(--status-error)";
  if (level === "MEDIUM") return "var(--status-warning)";
  return "var(--status-success)";
}

export function aiRiskPanelStyle(tone: string): Record<string, string | number> {
  return {
    gridColumn: "span 6",
    border: `1px solid color-mix(in srgb, ${tone} 34%, var(--border-default))`,
    borderRadius: 16,
    background: `linear-gradient(135deg, color-mix(in srgb, ${tone} 10%, var(--bg-surface-high)), var(--bg-surface-low))`,
    boxShadow: `inset 3px 0 0 ${tone}, var(--shadow-lg)`,
    padding: 14,
  };
}

export const AI_RISK_HEADER_STYLE: Record<string, string | number> = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 14,
  marginBottom: 10,
};

export const AI_RISK_EYEBROW_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--status-info)",
};

export const AI_RISK_TITLE_STYLE: Record<string, string | number> = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 4,
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-primary)",
};

export function aiRiskDelayStyle(tone: string): Record<string, string | number> {
  return {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 22,
    padding: "0 8px",
    borderRadius: 999,
    border: `1px solid color-mix(in srgb, ${tone} 42%, transparent)`,
    background: `color-mix(in srgb, ${tone} 12%, transparent)`,
    color: tone,
    whiteSpace: "nowrap",
  };
}

export function aiRiskScoreStyle(tone: string): Record<string, string | number> {
  return {
    width: 48,
    height: 48,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)`,
    background: `color-mix(in srgb, ${tone} 12%, var(--bg-surface-high))`,
    color: tone,
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    fontWeight: 900,
    flexShrink: 0,
  };
}

export const AI_RISK_SUMMARY_STYLE: Record<string, string | number> = {
  margin: "0 0 12px",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  lineHeight: 1.48,
};

export const AI_RISK_COLUMNS_STYLE: Record<string, string | number> = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 1fr)",
  gap: 10,
  alignItems: "stretch",
};

export const AI_RISK_SECTION_STYLE: Record<string, string | number> = {
  border: "1px solid var(--border-default)",
  borderRadius: 12,
  background: "var(--bg-surface-low)",
  padding: 11,
  minWidth: 0,
};

export const AI_RISK_SECTION_TITLE_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 8,
};

export const AI_RISK_TASK_STYLE: Record<string, string | number> = {
  borderTop: "1px solid var(--border-default)",
  paddingTop: 8,
};

export const AI_RISK_TEXT_STYLE: Record<string, string | number> = {
  marginTop: 5,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  lineHeight: 1.38,
  color: "var(--text-secondary)",
};

export const AI_RISK_LIST_STYLE: Record<string, string | number> = {
  margin: 0,
  paddingLeft: 17,
  display: "grid",
  gap: 7,
};

export const AI_RISK_LIST_ITEM_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  lineHeight: 1.38,
  color: "var(--text-secondary)",
};

export const AI_RISK_FOOTER_STYLE: Record<string, string | number> = {
  marginTop: 10,
  paddingTop: 9,
  borderTop: "1px solid var(--border-default)",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 800,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};
