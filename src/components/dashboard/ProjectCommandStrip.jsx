import React from "react";
import { formatCurrency, formatDate } from "../shared/formatters";
import StatusBadge from "../shared/StatusBadge";

const HEALTH_COLOR = {
  "On Track":      "var(--status-success)",
  "Watch":         "var(--status-warning)",
  "At Risk":       "var(--status-error)",
  "Awaiting Data": "var(--text-muted)",
};

export default function ProjectCommandStrip({ project, wps, cos, financials, onClearProject }) {
  const today = new Date(); today.setHours(0,0,0,0);

  const daysToEnd = project.target_completion_date
    ? Math.ceil((new Date(project.target_completion_date).getTime() - today.getTime()) / 86400000) : null;

  const totalTonnage = wps.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const fabTonnage = wps.filter(w => ["Fabrication", "Delivery", "Erection"].includes(w.phase) && w.status === "Complete")
    .reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const erectedTonnage = wps.filter(w => w.phase === "Erection" && w.status === "Complete")
    .reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const fabPct = totalTonnage > 0 ? Math.round(fabTonnage / totalTonnage * 100) : 0;
  const erectionPct = totalTonnage > 0 ? Math.round(erectedTonnage / totalTonnage * 100) : 0;
  const avgProgress = wps.length > 0
    ? Math.round(wps.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / wps.length) : 0;

  // Derive a smarter status: if no WP data exists and meaningful time has elapsed,
  // override the stored "On Track" with "Awaiting Data" so it isn't misleading.
  const derivedStatus = (() => {
    if (wps.length === 0 && totalTonnage === 0) return "Awaiting Data";
    return project.health_status;
  })();

  const healthColor = HEALTH_COLOR[derivedStatus] || "var(--accent)";

  // Timeline bar: map start → target completion
  const startTs = project.start_date ? new Date(project.start_date).getTime() : null;
  const endTs = project.target_completion_date ? new Date(project.target_completion_date).getTime() : null;
  const nowTs = today.getTime();
  const timelinePct = (startTs && endTs && endTs > startTs)
    ? Math.min(100, Math.max(0, Math.round((nowTs - startTs) / (endTs - startTs) * 100)))
    : null;

  const fields = [
    project.client && ["CLIENT", project.client],
    project.general_contractor && ["GC", project.general_contractor],
    project.contract_type && ["CONTRACT", project.contract_type],
    project.phase && ["PHASE", project.phase],
  ].filter(Boolean);

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderTop: `3px solid ${healthColor}`,
      borderRadius: 12,
      overflow: "hidden",
    }}>
      {/* Main header row */}
      <div style={{ padding: "14px 18px 10px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        {/* Left: Identity */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <button onClick={onClearProject} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 10px", marginTop: 2,
            background: "var(--bg-hover)",
            border: "1px solid var(--border-default)",
            borderRadius: 6, color: "var(--text-muted)",
            fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.10em",
            cursor: "pointer", fontWeight: 600, transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.borderColor = "var(--accent-border)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border-default)"; }}>
            ← ALL
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", fontWeight: 700, letterSpacing: "0.06em" }}>{project.project_number}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.02em" }}>{project.name}</span>
              <StatusBadge status={derivedStatus} />
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              {fields.map(([label, value]) => (
                <div key={label}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>{label} </span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Key financials */}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>Revised Contract</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>
              {formatCurrency(financials.revisedValue).replace(/\.\d+/, "")}
            </div>
            {financials.approvedCOVal > 0 && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-success)", marginTop: 2 }}>+{formatCurrency(financials.approvedCOVal).replace(/\.\d+/, "")} CO</div>
            )}
          </div>
          {daysToEnd != null && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>Days Remaining</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, lineHeight: 1, color: daysToEnd < 30 ? "var(--status-error)" : daysToEnd < 60 ? "var(--status-warning)" : "var(--status-success)" }}>
                {daysToEnd < 0 ? `${Math.abs(daysToEnd)}d LATE` : `${daysToEnd}d`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar row */}
      <div style={{ padding: "0 18px 14px", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
        {/* Dates */}
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {project.start_date && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Start</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>{formatDate(project.start_date)}</div>
            </div>
          )}
          {project.target_completion_date && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Target Complete</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>{formatDate(project.target_completion_date)}</div>
            </div>
          )}
          {project.forecast_completion_date && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Forecast</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>{formatDate(project.forecast_completion_date)}</div>
            </div>
          )}
        </div>

        {/* Timeline bar */}
        {timelinePct !== null && (
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Project Timeline</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)" }}>{timelinePct}% elapsed</span>
            </div>
            <div style={{ height: 6, background: "var(--border-default)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
              <div style={{ height: "100%", width: `${timelinePct}%`, background: timelinePct > 90 ? "var(--status-error)" : timelinePct > 75 ? "var(--status-warning)" : "var(--accent)", borderRadius: 3 }} />
              {/* Overall WP progress marker */}
              <div style={{
                position: "absolute", top: -1, bottom: -1,
                left: `${Math.min(avgProgress, 98)}%`,
                width: 2, background: "var(--status-success)",
                borderRadius: 1,
              }} title={`Overall WP progress: ${avgProgress}%`} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--status-success)" }}>▲ WP: {avgProgress}%</span>
            </div>
          </div>
        )}

        {/* Steel progress pills */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "FAB", pct: fabPct, color: "var(--status-warning)" },
            { label: "ERECTED", pct: erectionPct, color: "var(--status-success)" },
            { label: "WP PROGRESS", pct: avgProgress, color: "var(--chart-4)" },
          ].map(({ label, pct, color }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 60, height: 5, background: "var(--border-default)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color, fontWeight: 700 }}>{pct}%</span>
              </div>
            </div>
          ))}
          {totalTonnage > 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "rgba(160,175,210,0.40)", letterSpacing: "0.12em", textTransform: "uppercase" }}>TOTAL TONS</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>{Math.round(totalTonnage).toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}