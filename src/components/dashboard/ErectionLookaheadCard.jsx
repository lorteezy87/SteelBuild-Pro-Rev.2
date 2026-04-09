import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatDate } from "../shared/formatters";

export default function ErectionLookaheadCard({ wps, deliveries, drawings, tasks }) {
  const navigate = useNavigate();
  const today = new Date(); today.setHours(0,0,0,0);
  const threeWeeks = new Date(today.getTime() + 21 * 86400000);

  const erectionWPs = wps.filter(w => w.phase === "Erection");
  const blocked = erectionWPs.filter(w => w.status === "On Hold");

  const upcomingDeliveries = deliveries.filter(d =>
    d.scheduled_date &&
    new Date(d.scheduled_date) >= today &&
    new Date(d.scheduled_date) <= threeWeeks &&
    d.status !== "Delivered"
  ).sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

  const erectionTasks = tasks.filter(t =>
    (t.task_type === "Install" || t.phase === "Erection") &&
    t.end_date && new Date(t.end_date) >= today
  ).sort((a, b) => new Date(a.start_date || a.end_date) - new Date(b.start_date || b.end_date)).slice(0, 5);

  const totalErection = erectionWPs.length;
  const completedErection = erectionWPs.filter(w => w.status === "Complete").length;
  const erectionPct = totalErection > 0 ? Math.round(completedErection / totalErection * 100) : 0;

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 16, background: "var(--status-success)", borderRadius: 2 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>3-Week Erection Lookahead</span>
        </div>
        <button onClick={() => navigate(createPageUrl("Schedule"))} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-success)", background: "none", border: "none", cursor: "pointer", letterSpacing: "0.10em", fontWeight: 600 }}>SCHEDULE →</button>
      </div>

      <div style={{ padding: "12px 16px" }}>
        {/* Readiness summary */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[
            { label: "Total Erection WPs", value: totalErection, color: "var(--text-primary)" },
            { label: "Complete", value: completedErection, color: "var(--status-success)" },
            { label: "Blocked", value: blocked.length, color: blocked.length > 0 ? "var(--status-error)" : "var(--text-muted)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: "center", padding: "8px 6px", background: "var(--bg-hover)", borderRadius: 6 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color, lineHeight: 1, marginBottom: 3 }}>{value}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Erection progress bar */}
        {totalErection > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Erection Complete</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-success)", fontWeight: 700 }}>{erectionPct}%</span>
            </div>
            <div style={{ height: 7, background: "var(--border-default)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${erectionPct}%`, background: "var(--status-success)", borderRadius: 4, opacity: 0.85 }} />
            </div>
          </div>
        )}

        {/* Upcoming deliveries for erection */}
        {upcomingDeliveries.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>Incoming Material</div>
            {upcomingDeliveries.slice(0, 3).map(d => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderLeft: "2px solid var(--accent)", marginBottom: 4, background: "var(--accent-muted)", borderRadius: "0 4px 4px 0" }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{d.delivery_title || d.vendor}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{formatDate(d.scheduled_date)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming erection tasks */}
        {erectionTasks.length > 0 && (
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>Scheduled Activities</div>
            {erectionTasks.map(t => {
              const statusColor = t.status === "Complete" ? "var(--status-success)" : t.status === "Delayed" ? "var(--status-error)" : t.status === "In Progress" ? "var(--status-warning)" : "var(--text-muted)";
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--divider)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.task_name}</span>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", flexShrink: 0 }}>{formatDate(t.end_date)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Blocked WPs */}
        {blocked.length > 0 && (
          <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 10, marginTop: 10 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--status-error)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>Blocked Sequences</div>
            {blocked.slice(0, 3).map(w => (
              <div key={w.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 8px", borderLeft: "2px solid var(--status-error)", marginBottom: 4, background: "var(--danger-muted)", borderRadius: "0 4px 4px 0" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", fontWeight: 700 }}>{w.wp_number}</span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, margin: "0 8px" }}>{w.name}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--status-error)", fontWeight: 700 }}>HOLD</span>
              </div>
            ))}
          </div>
        )}

        {totalErection === 0 && erectionTasks.length === 0 && (
          <div style={{ textAlign: "center", padding: "20px 0", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>NO ERECTION DATA</div>
        )}
      </div>
    </div>
  );
}