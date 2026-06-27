/**
 * KpiStrip — the ten-KPI header bar that sits above the filter row.
 * Each KPI is a plain div; clicking one filters the list (Open,
 * Under Review, Critical, Overdue) by calling the parent's setters.
 *
 * Pure presentational: all state lives in the page shell.
 */

import React from "react";
import { mono, KPI_ACCENT_MAP } from "./constants";

function KpiTile({ label, value, color, onClick, extraStyle = {} }) {
  const accent = KPI_ACCENT_MAP[color];
  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 20px",
        borderTop: accent ? `3px solid ${color}` : "3px solid transparent",
        borderRight: "1px solid var(--divider)",
        borderLeft: "none",
        borderBottom: "none",
        cursor: onClick ? "pointer" : "default",
        background: accent || "var(--bg-surface)",
        transition: "filter 0.1s",
        ...extraStyle,
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.filter = "brightness(1.12)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
    >
      <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ ...mono, fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

export default function KpiStrip({ kpis, setFilterStatus, setFilterPriority }) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--divider)", flexShrink: 0 }}>
      <KpiTile label="Open"         value={kpis.open}        color="var(--status-warning)" onClick={() => setFilterStatus("Open")} />
      <KpiTile label="Under Review" value={kpis.underReview} color="var(--status-info)"    onClick={() => setFilterStatus("Under Review")} />
      <KpiTile label="Answered"     value={kpis.answered}    color="var(--status-success)" />
      <KpiTile label="Closed"       value={kpis.closed}      color="var(--text-muted)" />
      <KpiTile label="Critical"     value={kpis.critical}    color="var(--status-error)"   onClick={() => setFilterPriority("Critical")} />
      <KpiTile
        label="Overdue"
        value={kpis.overdue}
        color={kpis.overdue > 0 ? "var(--status-error)" : "var(--text-secondary)"}
        onClick={() => setFilterStatus("Open")}
        extraStyle={kpis.overdue > 0 ? { borderTop: "2px solid var(--status-error)" } : {}}
      />
      <KpiTile
        label="Due This Week"
        value={kpis.dueThisWeek}
        color={kpis.dueThisWeek > 0 ? "var(--status-warning)" : "var(--text-secondary)"}
      />
      <KpiTile
        label="Avg Response"
        value={kpis.avgResponse != null ? `${kpis.avgResponse}d` : "—"}
        color={
          kpis.avgResponse == null ? "var(--text-muted)"
            : kpis.avgResponse > 14 ? "var(--status-error)"
            : kpis.avgResponse > 7  ? "var(--status-warning)"
            : "var(--status-success)"
        }
      />
      <KpiTile
        label="Cost Exposure"
        value={kpis.costExposure ? `$${kpis.costExposure.toLocaleString()}` : "$0"}
        color={kpis.costExposure > 0 ? "var(--status-warning)" : "var(--text-muted)"}
      />
      <KpiTile
        label="Sched Exposure"
        value={kpis.scheduleDays ? `${kpis.scheduleDays}d` : "0d"}
        color={kpis.scheduleDays > 0 ? "var(--status-error)" : "var(--text-muted)"}
      />
    </div>
  );
}
