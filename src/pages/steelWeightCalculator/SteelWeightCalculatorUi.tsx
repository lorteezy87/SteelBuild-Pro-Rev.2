/**
 * Presentational bits + shared style tokens for Steel Weight Calculator.
 */
// @ts-nocheck
import React from "react";
import { mono } from "./steelWeightCalculatorStyleHelpers";

export {
  mono,
  body,
  cardStyle,
  inputStyle,
  selectStyle,
  labelStyle,
  tdBase,
  tdLeft,
  tdRight,
} from "./steelWeightCalculatorStyleHelpers";

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

