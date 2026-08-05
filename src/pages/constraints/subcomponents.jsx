/**
 * Presentational atoms for the Constraint Log: `Meta` (label + value
 * pair used in the expanded row), `ActionBtn` (large full-width button
 * in ExpandedRow), and `MiniBtn` (compact board-card action button).
 * Pure display — no state.
 */

import React from "react";
import {
  CONSTRAINT_ACTION_TONES as ACTION_TONES,
  CONSTRAINT_MINI_TONES as MINI_TONES,
} from "./constraintsChromeHelpers";

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
