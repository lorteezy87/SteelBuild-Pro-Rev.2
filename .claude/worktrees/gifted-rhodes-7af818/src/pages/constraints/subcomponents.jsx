/**
 * Presentational atoms for the Constraint Log: `Meta` (label + value
 * pair used in the expanded row), `ActionBtn` (large full-width button
 * in ExpandedRow), and `MiniBtn` (compact board-card action button).
 * Pure display — no state.
 */

import React from "react";

export function Meta({ label, value }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--text-muted)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-primary)",
          fontWeight: 600,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const ACTION_TONES = {
  accent:  { background: "var(--accent-muted)",   border: "1px solid var(--accent-border)",   color: "var(--accent)" },
  success: { background: "var(--success-muted)",  border: "1px solid var(--success-border)",  color: "var(--status-success)" },
  warning: { background: "var(--warning-muted)",  border: "1px solid var(--warning-border)",  color: "var(--status-warning)" },
  muted:   { background: "transparent",           border: "1px solid var(--border-strong)",   color: "var(--text-muted)" },
  neutral: { background: "var(--bg-surface-high)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" },
};

export function ActionBtn({ label, onClick, tone = "accent" }) {
  const s = ACTION_TONES[tone] || ACTION_TONES.accent;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...s,
        borderRadius: "var(--radius-btn)",
        padding: "5px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        cursor: "pointer",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {label}
    </button>
  );
}

const MINI_TONES = {
  accent:  { bg: "var(--accent-muted)",  border: "var(--accent-border)",  color: "var(--accent)" },
  success: { bg: "var(--success-muted)", border: "var(--success-border)", color: "var(--status-success)" },
  warning: { bg: "var(--warning-muted)", border: "var(--warning-border)", color: "var(--status-warning)" },
  muted:   { bg: "transparent",          border: "var(--border-default)", color: "var(--text-muted)" },
};

export function MiniBtn({ label, onClick, tone = "muted" }) {
  const t = MINI_TONES[tone] || MINI_TONES.muted;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.color,
        borderRadius: "var(--radius-btn)",
        padding: "3px 8px",
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
