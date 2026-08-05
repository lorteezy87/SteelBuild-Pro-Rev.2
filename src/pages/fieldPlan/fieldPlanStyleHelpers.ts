/**
 * Pure style tokens for Field Plan board chrome.
 */

export const headerCellStyle: Record<string, string | number> = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--accent-border)",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-primary)",
  textAlign: "left",
};

export const crewCellStyle: Record<string, string | number> = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--divider)",
  borderRight: "1px solid var(--divider)",
  fontFamily: "var(--font-display)",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-primary)",
  verticalAlign: "top",
};

export const dayCellStyle: Record<string, string | number> = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--divider)",
  borderRight: "1px solid var(--divider)",
  verticalAlign: "top",
  minHeight: 80,
};

export const toolBtn: Record<string, string | number> = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--border-default)",
  background: "transparent",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  cursor: "pointer",
};

/** Severity tokens for Field Plan blocker chips. */
export function fieldPlanBlockerChipColors(severity: string | null | undefined): {
  color: string;
  bg: string;
} {
  if (severity === "danger") {
    return { color: "var(--status-error)", bg: "var(--danger-muted)" };
  }
  if (severity === "warn") {
    return { color: "var(--status-warning)", bg: "var(--warning-muted)" };
  }
  return { color: "var(--status-success)", bg: "var(--success-muted)" };
}
