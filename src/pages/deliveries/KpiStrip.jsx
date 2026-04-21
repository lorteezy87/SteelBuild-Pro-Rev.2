/**
 * KpiStrip — eight click-to-filter KPI tiles across the top of the
 * page. Tiles that carry a `status` filter the list below on click.
 */

import React from "react";

const TONES = {
  warning: "var(--status-warning)",
  error:   "var(--status-error)",
  info:    "var(--status-info)",
  success: "var(--status-success)",
  accent:  "var(--accent)",
  muted:   "var(--text-muted)",
};

export default function KpiStrip({ kpis, filterStatus, onFilterChange }) {
  const tiles = [
    { label: "SCHEDULED",      value: kpis.scheduled,           tone: "warning", status: "Scheduled"  },
    { label: "IN TRANSIT",     value: kpis.inTransit,           tone: "info",    status: "In Transit" },
    { label: "DELIVERED",      value: kpis.delivered,           tone: "success", status: "Delivered"  },
    { label: "PARTIAL/ISSUES", value: kpis.partial,             tone: "error",   status: "Partial"    },
    { label: "OVERDUE",        value: kpis.overdue,             tone: kpis.overdue ? "error" : "muted", status: null },
    { label: "DUE THIS WEEK",  value: kpis.dueWeek,             tone: "warning", status: null },
    { label: "DUE THIS MONTH", value: kpis.dueMonth,            tone: "accent",  status: null },
    { label: "TONS PENDING",   value: `${kpis.tonsPending}T`,   tone: "accent",  status: null },
  ];

  return (
    <div style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--divider)", display: "flex", flexShrink: 0, overflowX: "auto" }}>
      {tiles.map((k, idx) => {
        const isActive = k.status && filterStatus === k.status;
        return (
          <div
            key={k.label}
            onClick={() => k.status && onFilterChange(isActive ? "ALL" : k.status)}
            title={k.status ? (isActive ? "Click to clear filter" : `Filter by ${k.label}`) : undefined}
            style={{
              padding: "10px 20px",
              borderRight: idx < tiles.length - 1 ? "1px solid var(--divider)" : "none",
              cursor: k.status ? "pointer" : "default",
              background: isActive ? "var(--accent-muted)" : "transparent",
              borderTop: isActive ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "background 0.1s",
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: isActive ? "var(--accent)" : "var(--text-muted)", marginBottom: 4 }}>
              {k.label}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800, color: TONES[k.tone] || TONES.accent }}>
              {k.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
