/**
 * Pure chart/card tokens for Executive View.
 */
import type { CSSProperties } from "react";

export const executiveTooltipStyle = {
  contentStyle: {
    background: "var(--bg-surface-high)",
    border: "none",
    borderRadius: 2,
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--text-primary)",
  } as CSSProperties,
  labelStyle: { color: "var(--text-muted)", fontSize: 9 } as CSSProperties,
};

export const executiveAxisProps = {
  tick: { fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)" },
  axisLine: false as const,
  tickLine: false as const,
};

export const executiveCardStyle: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  padding: "18px 20px",
};

export const executiveCardTitle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-primary)",
  marginBottom: 16,
};
