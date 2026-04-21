import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";

function TonBar({ label, tons, totalTons, color }) {
  const pct = totalTons > 0 ? Math.min(100, Math.round(tons / totalTons * 100)) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>{label}</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, color, lineHeight: 1 }}>{Math.round(tons).toLocaleString()}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>T</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color, fontWeight: 700 }}>{pct}%</span>
        </div>
      </div>
      <div style={{ height: 6, background: "var(--border-default)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, opacity: 0.85 }} />
      </div>
    </div>
  );
}

export default function FabShipmentProgressCard({ wps = [] }) {
  const navigate = useNavigate();

  const totalTons = wps.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const releasedTons = wps.filter(w => ["Fabrication","Delivery","Erection"].includes(w.phase)).reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const fabTons = wps.filter(w => ["Fabrication","Delivery","Erection"].includes(w.phase) && (w.status === "In Progress" || w.status === "Complete")).reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const shippedTons = wps.filter(w => ["Delivery","Erection"].includes(w.phase)).reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const erectedTons = wps.filter(w => w.phase === "Erection").reduce((s, w) => s + (Number(w.tonnage) || 0), 0);

  const wpTotal = wps.length;
  const wpComplete = wps.filter(w => w.status === "Complete").length;
  const wpInProgress = wps.filter(w => w.status === "In Progress").length;
  const wpOnHold = wps.filter(w => w.status === "On Hold").length;
  const wpNotStarted = wps.filter(w => w.status === "Not Started").length;

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 16, background: "var(--accent)", borderRadius: 2 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Fab & Shipment Progress</span>
        </div>
        <button onClick={() => navigate(createPageUrl("WorkPackages"))} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", letterSpacing: "0.10em", fontWeight: 600 }}>WPs →</button>
      </div>

      <div style={{ padding: "14px 16px" }}>
        {/* Total tonnage hero */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--divider)" }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>Total Tonnage</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>{Math.round(totalTons).toLocaleString()}<span style={{ fontSize: 14, color: "var(--text-muted)", marginLeft: 4 }}>T</span></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>Work Packages</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 800, color: "var(--chart-4)", lineHeight: 1 }}>{wpTotal}</div>
          </div>
        </div>

        {/* Tonnage progress bars */}
        <TonBar label="Released" tons={releasedTons} totalTons={totalTons} color="var(--status-warning-bright)" />
        <TonBar label="Fabricated" tons={fabTons} totalTons={totalTons} color="var(--accent)" />
        <TonBar label="Shipped" tons={shippedTons} totalTons={totalTons} color="#FF9A60" />
        <TonBar label="Erected" tons={erectedTons} totalTons={totalTons} color="#00E676" />

        {/* Tonnage flow area chart */}
        {totalTons > 0 && (() => {
          const phases = ["Released", "Fabricated", "Shipped", "Erected"];
          const vals = [releasedTons, fabTons, shippedTons, erectedTons];
          const colors = ["var(--status-warning-bright)", "var(--accent)", "#FF9A60", "#00E676"];
          const chartData = phases.map((p, i) => ({ phase: p, tons: Math.round(vals[i]) }));
          return (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>Tonnage Flow</div>
              <ResponsiveContainer width="100%" height={70}>
                <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tonGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="phase" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-surface-high)", border: "none", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 10 }}
                    formatter={v => [`${v.toLocaleString()} T`, "Tonnage"]}
                  />
                  <Area type="monotone" dataKey="tons" stroke="var(--accent)" fill="url(#tonGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          );
        })()}

        {/* WP status breakdown */}
        <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 12, marginTop: 4 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>Work Package Status</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              { label: "In Progress", val: wpInProgress, color: "var(--status-warning)" },
              { label: "Complete", val: wpComplete, color: "var(--status-success)" },
              { label: "On Hold", val: wpOnHold, color: "var(--status-error)" },
              { label: "Not Started", val: wpNotStarted, color: "var(--text-muted)" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: "var(--bg-hover)", borderRadius: 6 }}>
                 <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                 <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", flex: 1 }}>{label}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}