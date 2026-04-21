/**
 * Small presentational atoms for the Deliveries page — status pill
 * (used by rows, drawer header, lookahead cards), detail-drawer
 * Section / GridRow layout helpers.
 */

import React from "react";
import { STATUS_COLORS } from "./constants";

export function StatusPill({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.Scheduled;
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 2,
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.08em",
        background: colors.bg,
        color: colors.text,
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

export function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

export function GridRow({ label, value, action, actionLabel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{value}</span>
        {action && (
          <button
            onClick={action}
            style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid var(--divider)", background: "var(--bg-surface)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9 }}
          >
            {actionLabel || "Open"}
          </button>
        )}
      </div>
    </div>
  );
}
