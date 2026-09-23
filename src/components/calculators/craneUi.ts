/**
 * craneUi.ts — style tokens shared by the crane-planning components.
 *
 * Mirrors the tokens CranePickCalculator.jsx defines inline, so the fleet
 * manager, chart source picker and ground-bearing panel read as part of the
 * same tool. CSS variables only (CLAUDE.md design system).
 */
import type { CSSProperties } from "react";

export const mono: CSSProperties = { fontFamily: "var(--font-mono)" };

export const cardStyle: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  overflow: "hidden",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "10px 12px",
  color: "var(--text-primary)",
  fontSize: 14,
  ...mono,
  outline: "none",
  boxSizing: "border-box",
};

export const selectStyle: CSSProperties = { ...inputStyle, padding: "9px 12px", cursor: "pointer" };

export const labelStyle: CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  marginBottom: 6,
  display: "block",
};

export const hintStyle: CSSProperties = { ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.45 };

export const STATUS_COLOR: Record<"green" | "yellow" | "red", string> = {
  green: "var(--status-success-bright)",
  yellow: "var(--status-warning-bright)",
  red: "var(--status-error-bright)",
};

export function buttonStyle(variant: "accent" | "fn" | "danger" = "fn", disabled = false): CSSProperties {
  const base: CSSProperties = {
    ...mono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: "8px 14px",
    minHeight: 36,
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    boxShadow: "0 1px 0 var(--border-strong)",
  };
  if (variant === "accent") return { ...base, background: "var(--accent)", color: "var(--bg-base)", border: "1px solid var(--accent)" };
  if (variant === "danger") return { ...base, background: "var(--bg-surface)", color: "var(--status-error)", border: "1px solid var(--status-error)" };
  return { ...base, background: "var(--bg-surface-2, var(--bg-surface))", color: "var(--text-primary)", border: "1px solid var(--border-default)" };
}

/** Coloured notice box. `tone` picks the status colour; text stays readable. */
export function noticeStyle(tone: "red" | "yellow" | "info"): CSSProperties {
  const c = tone === "red" ? "var(--status-error)" : tone === "yellow" ? "var(--status-warning)" : "var(--text-secondary)";
  return {
    ...mono,
    fontSize: 11,
    lineHeight: 1.5,
    color: c,
    border: `1px solid ${c}`,
    background: `color-mix(in srgb, ${c} 10%, transparent)`,
    borderRadius: 6,
    padding: "8px 10px",
  };
}
