import React, { useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import { formatCurrencyShort } from "../shared/formatters";

/**
 * "True Health" chart — per-project EVM snapshot showing BAC, EV, and AC side-by-side.
 *
 * The key insight: if AC > EV the project is burning more than it's earning (CPI < 1).
 * Even if both are below BAC, a gap between AC and EV signals trouble.
 *
 * Bars:  BAC (budget at completion) — grey reference
 *        EV  (earned value)         — teal
 *        AC  (actual cost)          — coloured red/amber/green by CPI
 * Line:  CPI per project            — right axis
 */
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const cpiColor = d.cpi >= 1 ? "var(--status-success)" : d.cpi >= 0.9 ? "var(--status-warning)" : "var(--status-error)";
  return (
    <div style={{
      background: "var(--bg-surface-secondary)",
      border: "1px solid var(--border-default)",
      borderRadius: 10,
      padding: "12px 16px",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      minWidth: 200,
    }}>
      <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, fontSize: 12 }}>{d.fullName}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Row label="BAC" value={formatCurrencyShort(d.bac)} color="var(--text-muted)" />
        <Row label="Earned Value (EV)" value={formatCurrencyShort(d.ev)} color="var(--accent)" />
        <Row label="Actual Cost (AC)" value={formatCurrencyShort(d.ac)} color={d.acColor} />
        <div style={{ borderTop: "1px solid var(--divider)", marginTop: 4, paddingTop: 6 }}>
          <Row label="CPI" value={d.cpi != null ? d.cpi.toFixed(3) : "—"} color={cpiColor} bold />
          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
            {d.cpi == null ? "No cost data yet" : d.cpi >= 1 ? "✓ Ahead of budget" : d.cpi >= 0.9 ? "⚠ Slight cost overrun" : "✗ Significant overrun"}
          </div>
        </div>
      </div>
    </div>
  );
};

const Row = ({ label, value, color, bold }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
    <span style={{ color: "rgba(160,175,210,0.55)" }}>{label}</span>
    <span style={{ color, fontWeight: bold ? 700 : 500 }}>{value}</span>
  </div>
);

export default function TrueHealthChart({ projects, wps }) {
  const data = useMemo(() => {
    return projects.map(p => {
      const projectWPs = wps.filter(wp => wp.project_id === p.id);

      const bac = projectWPs.reduce((s, wp) =>
        s + (Number(wp.budgeted_labor_value) || 0) + (Number(wp.budgeted_material_value) || 0), 0);

      const effectiveBac = bac > 0 ? bac : (Number(p.original_budget_at_completion) || 0);

      const ev = projectWPs.reduce((s, wp) => {
        const wpBac = (Number(wp.budgeted_labor_value) || 0) + (Number(wp.budgeted_material_value) || 0);
        return s + wpBac * ((Number(wp.percent_complete) || 0) / 100);
      }, 0);

      const ac = projectWPs.reduce((s, wp) =>
        s + (Number(wp.actual_labor_cost_to_date) || 0) + (Number(wp.actual_material_cost_to_date) || 0), 0);

      const cpi = ac > 0 ? ev / ac : null;
      const acColor = cpi == null ? "var(--text-muted)" : cpi >= 1 ? "var(--status-success)" : cpi >= 0.9 ? "var(--status-warning)" : "var(--status-error)";

      return {
        name: p.project_number || p.name?.slice(0, 10),
        fullName: p.name,
        bac: effectiveBac,
        ev,
        ac,
        cpi,
        acColor,
      };
    }).filter(d => d.bac > 0 || d.ev > 0 || d.ac > 0);
  }, [projects, wps]);

  const hasData = data.length > 0;

  // Custom bar shape for AC — coloured by CPI health
  const ACBar = (props) => {
    const { x, y, width, height, acColor } = props;
    if (!height || height <= 0) return null;
    return <rect x={x} y={y} width={width} height={height} fill={acColor} rx={3} ry={3} />;
  };

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: 12,
      padding: "18px 20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 3, height: 16, background: "var(--accent)", borderRadius: 2 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
              True Project Health — EVM Snapshot
            </span>
          </div>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginLeft: 13, marginTop: 0 }}>
            Even if AC is under budget, if Earned Value is lower you are losing ground. CPI &lt; 1 = cost overrun.
          </p>
        </div>
        {/* Legend pills */}
        <div style={{ display: "flex", gap: 10, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {[
            { color: "var(--text-muted)", label: "BAC" },
            { color: "var(--accent)", label: "EV" },
            { color: "var(--status-success)", label: "AC (CPI≥1)" },
            { color: "var(--status-warning)", label: "AC (CPI 0.9–1)" },
            { color: "var(--status-error)", label: "AC (CPI<0.9)" },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em" }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.35)", letterSpacing: "0.12em", lineHeight: 1.8 }}>
            SET BUDGETED + ACTUAL VALUES ON WORK PACKAGES<br />TO ENABLE EVM VISUALIZATION
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
           <ComposedChart data={data} margin={{ top: 4, right: 50, left: 0, bottom: 4 }} barGap={3} barCategoryGap="30%">
             <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
             <XAxis
               dataKey="name"
               tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
               axisLine={{ stroke: "var(--border-default)" }}
               tickLine={false}
             />
             <YAxis
               yAxisId="left"
               tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
               tickFormatter={v => formatCurrencyShort(v)}
               axisLine={false}
               tickLine={false}
               width={60}
             />
             <YAxis
               yAxisId="right"
               orientation="right"
               tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
               tickFormatter={v => v.toFixed(2)}
               domain={[0, 'auto']}
               axisLine={false}
               tickLine={false}
               width={40}
               label={{ value: "CPI", angle: 90, position: "insideRight", fill: "var(--text-muted)", fontSize: 9, fontFamily: "var(--font-mono)", dy: -20 }}
             />
             <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--hover-bg)" }} />

             {/* CPI = 1 reference line */}
             <ReferenceLine yAxisId="right" y={1} stroke="var(--border-strong)" strokeDasharray="6 3"
               label={{ value: "CPI=1", position: "right", fill: "var(--text-muted)", fontSize: 9, fontFamily: "var(--font-mono)" }} />

             <Bar yAxisId="left" dataKey="bac" name="BAC" fill="var(--text-muted)" radius={[3, 3, 0, 0]} maxBarSize={28} />
             <Bar yAxisId="left" dataKey="ev" name="Earned Value" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={28} />
            {/* AC rendered with dynamic fill via custom shape */}
            <Bar
              yAxisId="left"
              dataKey="ac"
              name="Actual Cost"
              maxBarSize={28}
              radius={[3, 3, 0, 0]}
              shape={(props) => {
                const item = data.find(d => d.name === props.name) || {};
                return <ACBar {...props} acColor={item.acColor || "#6B7280"} />;
              }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cpi"
              name="CPI"
              stroke="var(--info)"
              strokeWidth={2}
              dot={{ fill: "var(--info)", r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: "var(--info)" }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Risk signal row */}
      {hasData && (
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {data.map(d => {
            const cpi = d.cpi;
            if (cpi == null) return null;
            const colorVars = cpi >= 1 
              ? { color: "var(--status-success)", bg: "var(--success-muted)", border: "var(--success-border)" }
              : cpi >= 0.9 
              ? { color: "var(--status-warning)", bg: "var(--warning-muted)", border: "var(--warning-border)" }
              : { color: "var(--status-error)", bg: "var(--danger-muted)", border: "var(--danger-border)" };
            const label = cpi >= 1 ? "Healthy" : cpi >= 0.9 ? "Watch" : "At Risk";
            return (
              <div key={d.name} style={{
                background: colorVars.bg,
                border: `1px solid ${colorVars.border}`,
                borderRadius: 6,
                padding: "4px 10px",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: colorVars.color }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: colorVars.color, letterSpacing: "0.06em" }}>
                  {d.name} — CPI {cpi.toFixed(2)} ({label})
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}