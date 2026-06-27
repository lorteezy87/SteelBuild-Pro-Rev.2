/**
 * BulkActionBar — fixed bottom bar that appears when at least one
 * row is selected. Offers quick bulk-transition buttons (In Transit
 * / Delivered / Partial), selection-scoped CSV export, and clear.
 *
 * Disabled when `isPending` so a user can't spam the same transition
 * during an in-flight batch update.
 */

import React from "react";

export default function BulkActionBar({ count, isPending, onSetStatus, onExport, onClear }) {
  if (count === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        background: "var(--bg-surface)",
        borderTop: "1px solid var(--divider)",
        padding: "10px 20px",
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>
        {count} SELECTED
      </span>
      <StatusBtn onClick={() => onSetStatus("In Transit")} disabled={isPending}
        color="var(--status-info)" bg="rgba(0,229,255,0.06)">→ IN TRANSIT</StatusBtn>
      <StatusBtn onClick={() => onSetStatus("Delivered")} disabled={isPending}
        color="var(--status-success)" bg="rgba(34,197,94,0.12)">✓ DELIVERED</StatusBtn>
      <StatusBtn onClick={() => onSetStatus("Partial")} disabled={isPending}
        color="var(--status-warning)" bg="rgba(234,179,8,0.12)">PARTIAL</StatusBtn>
      <button
        onClick={onExport}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid var(--divider)",
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          cursor: "pointer",
        }}
      >
        EXPORT CSV
      </button>
      <button
        onClick={onClear}
        style={{
          marginLeft: "auto",
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid var(--divider)",
          background: "var(--bg-surface)",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          cursor: "pointer",
        }}
      >
        Deselect All
      </button>
    </div>
  );
}

function StatusBtn({ onClick, disabled, color, bg, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 10px",
        borderRadius: 6,
        border: `1px solid ${color}`,
        background: bg,
        color,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}
