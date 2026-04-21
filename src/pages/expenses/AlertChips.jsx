/**
 * AlertChips — the row of dismissible red/amber chips that surfaces
 * budget overruns, vendor-concentration warnings, and stale-invoice
 * counts. Built from `visibleAlerts` in the parent.
 */

import React from "react";
import { X } from "lucide-react";

export default function AlertChips({ alerts, onDismiss }) {
  if (alerts.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
      {alerts.map((alert) => {
        const color = alert.severity === "red" ? "var(--status-error)" : "var(--status-warning)";
        const bg = alert.severity === "red" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)";
        const border = alert.severity === "red" ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.4)";
        return (
          <div
            key={alert.key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 20,
              background: bg,
              border: `1px solid ${border}`,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color,
              letterSpacing: "0.04em",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
            {alert.text}
            <button
              onClick={() => onDismiss(alert.key)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                color,
                display: "flex",
                alignItems: "center",
                opacity: 0.7,
              }}
            >
              <X size={10} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
