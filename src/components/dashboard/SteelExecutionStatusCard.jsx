import React from "react";
import { statusIs, statusIn } from "@/components/shared/formatters";
import ChevronPipeline from "@/components/shared/ChevronPipeline";

const STAGES = [
  { key: "Detailing",   label: "DETAILING",   color: "var(--phase-detailing)" },
  { key: "Approval",    label: "APPROVAL",    color: "var(--accent)" },
  { key: "Released",    label: "RELEASED",    color: "var(--status-warning)" },
  { key: "Fabrication", label: "FABRICATION", color: "var(--status-warning)" },
  { key: "Shipped",     label: "SHIPPED",     color: "var(--status-warning)" },
  { key: "Erected",     label: "ERECTED",     color: "var(--phase-erection)" },
];

export default function SteelExecutionStatusCard({ wps = [], drawings = [] }) {
  const totalTons = wps.reduce((s, w) => s + (Number(w.tonnage) || 0), 0) || 1;

  // Phase progression order — used for cumulative tonnage
  const PHASE_RANK = { Detailing: 0, Fabrication: 1, Delivery: 2, Erection: 3 };
  const rank = (w) => PHASE_RANK[w.phase] ?? -1;
  const tons = (w) => Number(w.tonnage) || 0;
  const active = (w) => statusIn(w.status, ["In Progress", "Complete"]);

  const detailingTons = wps
    .filter(w => statusIs(w.phase, "Detailing"))
    .reduce((s, w) => s + (tons(w) * ((Number(w.percent_complete) || 0) / 100)), 0);
  const approvedDrawings = drawings.filter(d => statusIn(d.stage, ["OFS","BFS","FFF","Released"])).length;
  const totalDrawings = drawings.length || 1;

  // Released = all tonnage that has left Detailing (phase >= Fabrication)
  const releasedTons = wps.filter(w => rank(w) >= 1).reduce((s, w) => s + tons(w), 0);

  // Cumulative fabricated = tonnage at Fabrication or later AND actively worked (not "Not Started")
  const fabTons = wps.filter(w => rank(w) >= 1 && active(w)).reduce((s, w) => s + tons(w), 0);

  // Cumulative shipped = tonnage at Delivery or later
  const shippedTons = wps.filter(w => rank(w) >= 2).reduce((s, w) => s + tons(w), 0);

  // Cumulative erected = tonnage at Erection phase
  const erectedTons = wps.filter(w => rank(w) >= 3).reduce((s, w) => s + tons(w), 0);

  const metrics = [
    { key: "Detailing",   value: detailingTons, total: totalTons, pct: Math.round(detailingTons / totalTons * 100), unit: "T", color: "var(--phase-detailing)" },
    { key: "Approval",    value: approvedDrawings, total: totalDrawings, pct: Math.round(approvedDrawings / totalDrawings * 100), unit: "DWG", color: "var(--accent)" },
    { key: "Released",    value: releasedTons, total: totalTons, pct: Math.round(releasedTons / totalTons * 100), unit: "T", color: "var(--status-warning)" },
    { key: "Fabrication", value: fabTons, total: totalTons, pct: Math.round(fabTons / totalTons * 100), unit: "T", color: "var(--status-warning)" },
    { key: "Shipped",     value: shippedTons, total: totalTons, pct: Math.round(shippedTons / totalTons * 100), unit: "T", color: "var(--status-warning)" },
    { key: "Erected",     value: erectedTons, total: totalTons, pct: Math.round(erectedTons / totalTons * 100), unit: "T", color: "var(--phase-erection)" },
  ];

  // Determine active stage for ChevronPipeline
  const activeIdx = metrics.findIndex(m => m.pct > 0 && m.pct < 100);
  const chevronStages = STAGES.map((s, idx) => {
    const m = metrics[idx];
    let status = "upcoming";
    if (m.pct >= 100) status = "complete";
    else if (idx === activeIdx || (activeIdx === -1 && m.pct > 0)) status = "active";
    return { key: s.key, label: s.label, status, color: s.color };
  });

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ width: 3, height: 16, background: "var(--accent)", borderRadius: 2 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Steel Execution Status</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>
          {Math.round(erectedTons)}/{Math.round(totalTons)}T erected
        </span>
      </div>

      {/* Chevron Pipeline */}
      <div style={{ padding: "16px 16px 8px" }}>
        <ChevronPipeline stages={chevronStages} height={32} />
      </div>

      {/* Stage metrics with tonnage ratios */}
      <div style={{ padding: "8px 16px 16px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {metrics.map((m) => (
          <div key={m.key} style={{
            background: "var(--bg-surface-low)",
            borderRadius: 8,
            padding: "8px 10px",
            borderLeft: `3px solid ${m.color}`,
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>
              {m.key}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: m.color, lineHeight: 1 }}>
                {Math.round(m.value)}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                / {Math.round(m.total)} {m.unit}
              </span>
            </div>
            <div style={{ height: 4, background: "var(--border-default)", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, m.pct)}%`,
                background: m.color,
                borderRadius: 2,
                transition: "width 0.6s ease",
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
