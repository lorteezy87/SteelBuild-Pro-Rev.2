import React from "react";

const STAGES = [
  { key: "Detailing",   label: "DETAILING",   color: "var(--phase-detailing)", phase: "Detailing" },
  { key: "Approval",    label: "APPROVAL",    color: "var(--accent)",          phase: "Detailing" },
  { key: "Released",    label: "RELEASED",    color: "var(--status-warning)",  phase: "Fabrication" },
  { key: "Fabrication", label: "FABRICATION", color: "var(--status-warning)",  phase: "Fabrication" },
  { key: "Shipped",     label: "SHIPPED",     color: "var(--status-warning)",  phase: "Delivery" },
  { key: "Erected",     label: "ERECTED",     color: "var(--phase-erection)",  phase: "Erection" },
];

export default function SteelExecutionStatusCard({ wps = [], drawings = [] }) {
  // Calculate tonnage per stage from WPs
  const totalTons = wps.reduce((s, w) => s + (Number(w.tonnage) || 0), 0) || 1;

  const detailingTons = wps
    .filter(w => w.phase === "Detailing")
    .reduce((s, w) => s + ((Number(w.tonnage) || 0) * ((Number(w.percent_complete) || 0) / 100)), 0);
  const approvedDrawings = drawings.filter(d => ["OFS","BFS","FFF","Released"].includes(d.stage)).length;
  const totalDrawings = drawings.length || 1;
  const releasedTons = wps.filter(w => ["Fabrication","Delivery","Erection"].includes(w.phase)).reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const fabTons = wps.filter(w => w.phase === "Fabrication" && (w.status === "In Progress" || w.status === "Complete")).reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const shippedTons = wps.filter(w => w.phase === "Delivery" || w.status === "Shipped").reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const erectedTons = wps.filter(w => w.phase === "Erection" || w.status === "Erected").reduce((s, w) => s + (Number(w.tonnage) || 0), 0);

  const metrics = [
    { key: "Detailing",   value: detailingTons, pct: Math.round(detailingTons / totalTons * 100), unit: "T", color: "var(--phase-detailing)" },
    { key: "Approval",    value: approvedDrawings, pct: Math.round(approvedDrawings / totalDrawings * 100), unit: "DWG", color: "var(--accent)" },
    { key: "Released",    value: releasedTons, pct: Math.round(releasedTons / totalTons * 100), unit: "T", color: "var(--status-warning)" },
    { key: "Fabrication", value: fabTons, pct: Math.round(fabTons / totalTons * 100), unit: "T", color: "var(--status-warning)" },
    { key: "Shipped",     value: shippedTons, pct: Math.round(shippedTons / totalTons * 100), unit: "T", color: "var(--status-warning)" },
    { key: "Erected",     value: erectedTons, pct: Math.round(erectedTons / totalTons * 100), unit: "T", color: "var(--phase-erection)" },
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
