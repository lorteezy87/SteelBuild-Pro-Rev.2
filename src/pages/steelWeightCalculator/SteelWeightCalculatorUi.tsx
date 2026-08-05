/**
 * Presentational bits + shared style tokens for Steel Weight Calculator.
 */
// @ts-nocheck
import React from "react";

export const mono = { fontFamily: "var(--font-mono)" };
export const body = { fontFamily: "var(--font-body)" };

export const cardStyle = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  overflow: "hidden",
};
export const inputStyle = {
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
export const selectStyle = {
  ...inputStyle,
  padding: "9px 12px",
  cursor: "pointer",
};
export const labelStyle = {
  ...mono,
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  marginBottom: 6,
  display: "block",
};

export function ResultRow({ label, value, emphasize, highlight }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      marginBottom: 6,
      gap: 12,
    }}>
      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{
        ...mono,
        fontSize: emphasize ? 18 : 12,
        fontWeight: emphasize ? 800 : 600,
        color: highlight ? "var(--accent)" : "var(--text-primary)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
    </div>
  );
}

export const tdBase = {
  ...mono,
  fontSize: 11,
  color: "var(--text-primary)",
  padding: "8px 12px",
  borderBottom: "1px solid var(--divider)",
  fontVariantNumeric: "tabular-nums",
};
export const tdLeft = { ...tdBase, textAlign: "left" };
export const tdRight = { ...tdBase, textAlign: "right" };
