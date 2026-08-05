/**
 * Shared presentational stat chip used by import-preview modals
 * (shipping list, drawing log, model elements, production status, Tekla EPM).
 */
import React from "react";

export default function ImportStatChip({ label, value, tone }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      borderRadius: 999,
      border: "1px solid var(--border-default)",
      background: "var(--bg-surface-low)",
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      color: "var(--text-muted)",
    }}>
      {label}<strong style={{ color: tone, fontSize: 12 }}>{value}</strong>
    </span>
  );
}
