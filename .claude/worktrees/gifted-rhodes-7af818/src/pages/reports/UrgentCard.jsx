/**
 * UrgentCard — fixed-width card for the horizontally-scrolling
 * "Urgent Items" strip. Left border color + severity label hint at
 * how hot the item is. Optional `onClick` is used to route to the
 * relevant module (RFIs, ChangeOrders, Deliveries, etc.).
 */

import React from "react";
import { mono, body, CARD } from "./constants";

const SEVERITY_COLORS = {
  critical: "var(--status-error)",
  high:     "var(--status-warning)",
  medium:   "var(--status-info)",
  low:      "var(--text-muted)",
};

export default function UrgentCard({ title, subtitle, severity, meta, onClick }) {
  const color = SEVERITY_COLORS[severity] || "var(--text-muted)";
  return (
    <div
      onClick={onClick}
      style={{
        minWidth: 240,
        maxWidth: 280,
        ...CARD,
        borderLeft: `3px solid ${color}`,
        padding: "14px 16px",
        cursor: onClick ? "pointer" : "default",
        flexShrink: 0,
      }}
    >
      <div style={{ ...mono, fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
        {severity?.toUpperCase() || "INFO"}
      </div>
      <div style={{ ...body, fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, lineHeight: 1.3 }}>
        {title}
      </div>
      <div style={{ ...body, fontSize: 11, color: "var(--text-secondary)", marginBottom: 6, lineHeight: 1.4 }}>
        {subtitle}
      </div>
      {meta && (
        <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {meta}
        </div>
      )}
    </div>
  );
}
