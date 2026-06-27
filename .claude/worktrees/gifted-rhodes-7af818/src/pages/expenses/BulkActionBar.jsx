/**
 * BulkActionBar — fixed bottom bar, visible when rows are selected.
 * Offers MARK PAID / MARK VOIDED / DELETE SELECTED quick actions.
 * Disabled during in-flight bulk operations so the same button
 * can't be fired twice.
 */

import React from "react";

export default function BulkActionBar({ count, isPending, onMarkPaid, onMarkVoided, onDelete, onClear }) {
  if (count === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 500,
        background: "var(--bg-elevated)",
        borderTop: "1px solid var(--accent-border)",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 -8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", fontWeight: 700, letterSpacing: "0.08em" }}>
        {count} SELECTED
      </span>
      <div style={{ flex: 1 }} />
      <ActionBtn onClick={onMarkPaid}   disabled={isPending} color="var(--status-success)" muted="var(--success-muted)" border="var(--success-border)">MARK PAID</ActionBtn>
      <ActionBtn onClick={onMarkVoided} disabled={isPending} color="var(--status-warning)" muted="var(--warning-muted)" border="var(--warning-border)">MARK VOIDED</ActionBtn>
      <ActionBtn onClick={onDelete}     disabled={isPending} color="var(--danger)"         muted="var(--danger-muted)"  border="var(--danger-border)">DELETE SELECTED</ActionBtn>
      <button
        onClick={onClear}
        style={{
          background: "transparent",
          border: "1px solid var(--border-default)",
          borderRadius: 6,
          padding: "6px 10px",
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}

function ActionBtn({ onClick, disabled, color, muted, border, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: muted,
        border: `1px solid ${border}`,
        borderRadius: 6,
        padding: "6px 14px",
        color,
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        letterSpacing: "0.08em",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}
