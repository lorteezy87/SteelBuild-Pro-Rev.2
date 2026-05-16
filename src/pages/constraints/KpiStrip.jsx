/**
 * KpiStrip — six tiles across the top: Open / Overdue / Critical /
 * In Progress / Resolved / Total. Colors trip on counts (e.g. Overdue
 * turns red if > 0, muted otherwise). Derived counts live in the
 * `kpis` object built by the page shell's useMemo.
 */

import React from "react";

export default function KpiStrip({ kpis }) {
  const cards = [
    { label: "Open",        value: kpis.open.length,     color: kpis.open.length     ? "var(--status-warning)" : "var(--status-success)" },
    { label: "Overdue",     value: kpis.overdue.length,  color: kpis.overdue.length  ? "var(--status-error)"   : "var(--text-muted)" },
    { label: "Critical",    value: kpis.critical.length, color: kpis.critical.length ? "var(--status-error)"   : "var(--text-muted)" },
    { label: "System",      value: kpis.generated.length, color: kpis.generated.length ? "var(--accent)"        : "var(--text-muted)" },
    { label: "In Progress", value: kpis.inProg.length,   color: "var(--accent)" },
    { label: "Resolved",    value: kpis.resolved.length, color: "var(--status-success)" },
    { label: "Total",       value: kpis.total,           color: "var(--text-muted)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: "var(--bg-surface)",
            borderRadius: "var(--radius-card)",
            borderTop: `2px solid ${c.color}`,
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600, color: c.color, lineHeight: 1.1 }}>
            {c.value}
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}
