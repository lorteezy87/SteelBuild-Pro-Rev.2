import React from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from "recharts";

const STAGES = [
  { key: "Detailing",   label: "DETAILING",   color: "var(--phase-detailing)", phase: "Detailing" },
  { key: "Approval",    label: "APPROVAL",    color: "var(--accent)",          phase: "Detailing" },
  { key: "Released",    label: "RELEASED",    color: "var(--status-warning)",  phase: "Fabrication" },
  { key: "Fabrication", label: "FABRICATION", color: "var(--status-warning)",  phase: "Fabrication" },
  { key: "Shipped",     label: "SHIPPED",     color: "var(--status-warning)",  phase: "Delivery" },
  { key: "Erected",     label: "ERECTED",     color: "var(--phase-erection)",  phase: "Erection" },
];

export default function SteelExecutionStatusCard({ wps, drawings }) {
  const totalTons = wps.reduce((s, w) => s + (Number(w.tonnage) || 0), 0) || 1;
  const approvedDrawings = drawings.filter((d) => ["OFS", "BFS", "FFF", "Released", "IFC", "Issued for Construction", "Approved"].includes(String(d.stage || d.status || "").trim())).length;
  const totalDrawings = drawings.length || 1;

  const phaseRank = (phase) => ({ Detailing: 1, Fabrication: 2, Delivery: 3, Erection: 4 }[phase] || 0);

  const stageProgress = (wp, targetRank) => {
    const tonnage = Number(wp.tonnage) || 0;
    if (tonnage <= 0) return 0;

    const rank = phaseRank(wp.phase);
    const rawPct = Math.min(100, Math.max(0, Number(wp.percent_complete) || 0)) / 100;
    const status = String(wp.status || "");
    const shopBudget = Number(wp.shop_hours_budget) || 0;
    const shopActual = Number(wp.shop_hours_actual) || 0;
    const fieldBudget = Number(wp.field_hours_budget) || 0;
    const fieldActual = Number(wp.field_hours_actual) || 0;

    if (rank > targetRank) return tonnage;

    if (targetRank === 1) return rank > 1 ? tonnage : tonnage * rawPct;
    if (targetRank === 2) {
      if (rank < 2) return 0;
      if (rank > 2 || status === "Complete") return tonnage;
      if (shopBudget > 0) return tonnage * Math.min(1, shopActual / shopBudget);
      return tonnage * rawPct;
    }
    if (targetRank === 3) {
      if (rank < 3) return 0;
      if (rank > 3 || status === "Complete") return tonnage;
      return tonnage * Math.max(rawPct, 0.5);
    }
    if (targetRank === 4) {
      if (rank < 4) return 0;
      if (status === "Complete") return tonnage;
      if (fieldBudget > 0) return tonnage * Math.min(1, fieldActual / fieldBudget);
      return tonnage * rawPct;
    }
    return 0;
  };

  const detailingTons = wps.reduce((s, wp) => s + stageProgress(wp, 1), 0);
  const releasedTons = wps.reduce((s, wp) => s + (phaseRank(wp.phase) >= 2 ? (Number(wp.tonnage) || 0) : 0), 0);
  const fabTons = wps.reduce((s, wp) => s + stageProgress(wp, 2), 0);
  const shippedTons = wps.reduce((s, wp) => s + stageProgress(wp, 3), 0);
  const erectedTons = wps.reduce((s, wp) => s + stageProgress(wp, 4), 0);

  const metrics = [
    { key: "Detailing",   value: Math.round(detailingTons * 10) / 10, pct: Math.round(detailingTons / totalTons * 100), unit: "T", color: "var(--phase-detailing)" },
    { key: "Approval",    value: approvedDrawings, pct: Math.round(approvedDrawings / totalDrawings * 100), unit: "DWG", color: "var(--accent)" },
    { key: "Released",    value: Math.round(releasedTons * 10) / 10, pct: Math.round(releasedTons / totalTons * 100), unit: "T", color: "var(--status-warning)" },
    { key: "Fabrication", value: Math.round(fabTons * 10) / 10, pct: Math.round(fabTons / totalTons * 100), unit: "T", color: "var(--secondary)" },
    { key: "Shipped",     value: Math.round(shippedTons * 10) / 10, pct: Math.round(shippedTons / totalTons * 100), unit: "T", color: "var(--status-success)" },
    { key: "Erected",     value: Math.round(erectedTons * 10) / 10, pct: Math.round(erectedTons / totalTons * 100), unit: "T", color: "var(--phase-erection)" },
  ];

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ width: 3, height: 16, background: "var(--accent)", borderRadius: 2 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Steel Execution Status</span>
      </div>

      {/* Pipeline bars */}
      <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {metrics.map((m) => (
          <div key={m.key}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-muted)", fontWeight: 600 }}>{m.key.toUpperCase()}</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 800, color: m.color, lineHeight: 1 }}>
                  {m.value.toLocaleString()}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{m.unit}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: m.color, fontWeight: 700, minWidth: 32, textAlign: "right" }}>{m.pct}%</span>
              </div>
            </div>
            <div style={{ height: 8, background: "var(--border-default)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, m.pct)}%`,
                background: m.color,
                borderRadius: 4,
                transition: "width 0.6s ease",
                opacity: 0.85,
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Radar chart */}
      <div style={{ padding: "0 16px 4px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>Stage Coverage</div>
        <ResponsiveContainer width="100%" height={160}>
          <RadarChart data={metrics.map(m => ({ subject: m.key, value: m.pct, fullMark: 100 }))} margin={{ top: 0, right: 16, left: 16, bottom: 0 }}>
            <PolarGrid stroke="var(--divider)" />
            <PolarAngleAxis dataKey="subject" tick={{ fontFamily: "var(--font-mono)", fontSize: 7, fill: "var(--text-muted)" }} />
            <Radar dataKey="value" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.15} strokeWidth={1.5} />
            <Tooltip
              contentStyle={{ background: "var(--bg-surface-high)", border: "none", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 10 }}
              formatter={v => [`${v}%`, "Coverage"]}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Pipeline flow visual */}
      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 14 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.14em", marginBottom: 10, textTransform: "uppercase" }}>Workflow Pipeline</div>
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {STAGES.map((s, idx) => {
              const m = metrics.find(x => x.key === s.key);
              const done = m && m.pct > 0;
              return (
                <React.Fragment key={s.key}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: done ? s.color : "var(--bg-hover)",
                      border: `2px solid ${done ? s.color : "var(--border-default)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: done && m.pct < 100
                        ? `0 0 12px ${s.color}66`
                        : done
                        ? `0 0 8px ${s.color}44`
                        : "none",
                      transition: "all 0.3s",
                    }}>
                      {done
                        ? <span style={{ color: "#fff", fontSize: 8, fontWeight: 700 }}>{m.pct}%</span>
                        : <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{idx + 1}</span>
                      }
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 6, color: done ? s.color : "var(--text-muted)", textAlign: "center", letterSpacing: "0.08em" }}>
                      {s.label}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: done ? s.color : "var(--text-muted)", textAlign: "center" }}>
                      {m.value}{m.unit}
                    </span>
                  </div>
                  {idx < STAGES.length - 1 && (
                    <div style={{ width: 16, height: 3, background: done ? s.color : "var(--divider)", flexShrink: 0, marginBottom: 22 }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
