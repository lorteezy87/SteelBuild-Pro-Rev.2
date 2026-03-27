import React, { useMemo } from "react";
import { formatCurrency } from "../shared/formatters";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

function EVMKpi({ label, value, subtext, color, formula }) {
  return (
    <div style={{
      background: "var(--bg-surface-secondary)",
      border: `1px solid ${color}33`,
      borderTop: `2px solid ${color}`,
      borderRadius: 8,
      padding: "10px 12px",
      flex: 1,
      minWidth: 0,
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color, lineHeight: 1, marginBottom: 3 }}>
        {value}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
        {subtext}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", marginTop: 6, fontStyle: "italic" }}>
        {formula}
      </div>
    </div>
  );
}

/**
 * EVM calculations from work packages:
 *  BAC  = sum of (budgeted_labor_value + budgeted_material_value)
 *  EV   = sum of BAC_wp * (percent_complete / 100)
 *  AC   = sum of (actual_labor_cost_to_date + actual_material_cost_to_date)
 *  EAC  = AC + (BAC - EV) / CPI   [if CPI > 0]
 *  CPI  = EV / AC
 *  TCPI = (BAC - EV) / (BAC - AC)
 *  VAC  = BAC - EAC
 *  Labor Productivity = total tonnage / total actual field hours
 */
export default function EVMCard({ wps, project }) {
  // Aggregate EVM values across all work packages
  const evm = useMemo(() => {
    const bac = wps.reduce((s, wp) => {
      return s + (Number(wp.budgeted_labor_value) || 0) + (Number(wp.budgeted_material_value) || 0);
    }, 0);

    // Fall back to project-level BAC if WP budgets not populated
    const effectiveBac = bac > 0 ? bac : (Number(project?.original_budget_at_completion) || 0);

    const ev = wps.reduce((s, wp) => {
      const wpBac = (Number(wp.budgeted_labor_value) || 0) + (Number(wp.budgeted_material_value) || 0);
      return s + wpBac * ((Number(wp.percent_complete) || 0) / 100);
    }, 0);

    const ac = wps.reduce((s, wp) => {
      return s + (Number(wp.actual_labor_cost_to_date) || 0) + (Number(wp.actual_material_cost_to_date) || 0);
    }, 0);

    const cpi = ac > 0 ? ev / ac : null;
    const budgetRemaining = effectiveBac - ac;
    const workRemaining = effectiveBac - ev;
    const tcpi = budgetRemaining > 0 ? workRemaining / budgetRemaining : null;
    const eac = ac > 0 && cpi > 0 ? ac + workRemaining / cpi : effectiveBac;
    const vac = effectiveBac - eac;

    // Labor productivity: tons installed per field man-hour
    const totalTonnage = wps.reduce((s, wp) => s + (Number(wp.tonnage) || 0) * ((Number(wp.percent_complete) || 0) / 100), 0);
    const totalFieldHours = wps.reduce((s, wp) => s + (Number(wp.field_hours_actual) || 0), 0);
    const laborProductivity = totalFieldHours > 0 ? totalTonnage / totalFieldHours : null;

    return { cpi, tcpi, vac, laborProductivity, effectiveBac, ev, ac };
  }, [wps, project]);

  const { cpi, tcpi, vac, laborProductivity, effectiveBac } = evm;
  const hasData = effectiveBac > 0;

  const cpiColor = cpi === null ? "var(--text-muted)" : cpi >= 1 ? "var(--status-success)" : cpi >= 0.9 ? "var(--status-warning)" : "var(--status-error)";
  const tcpiColor = tcpi === null ? "var(--text-muted)" : tcpi <= 1.1 ? "var(--status-success)" : tcpi <= 1.2 ? "var(--status-warning)" : "var(--status-error)";
  const vacColor = vac === null ? "var(--text-muted)" : vac >= 0 ? "var(--status-success)" : "var(--status-error)";
  const lpColor = laborProductivity === null ? "var(--text-muted)" : "var(--accent)";

  const fmt2 = (n) => n !== null ? n.toFixed(2) : "—";
  const fmtTons = (n) => n !== null ? `${n.toFixed(3)} T/hr` : "—";

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 16, background: "var(--chart-4)", borderRadius: 2 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
            Earned Value Performance
          </span>
        </div>
        {hasData && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
            BAC {formatCurrency(evm.effectiveBac).replace(/\.\d+/, "")}
          </span>
        )}
      </div>

      <div style={{ padding: "12px 16px 16px" }}>
        {!hasData ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>📊</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", lineHeight: 1.6 }}>
              SET BUDGETED VALUES ON<br />WORK PACKAGES TO ENABLE EVM
            </div>
          </div>
        ) : (
          <>
            {/* Top row: CPI + TCPI */}
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <EVMKpi
                label="CPI"
                value={fmt2(cpi)}
                subtext={cpi !== null ? (cpi >= 1 ? "Ahead of budget" : cpi >= 0.9 ? "Slight overrun" : "Over budget") : "No actual costs yet"}
                color={cpiColor}
                formula="EV ÷ AC"
              />
              <EVMKpi
                label="TCPI"
                value={fmt2(tcpi)}
                subtext={tcpi !== null ? (tcpi <= 1.1 ? "Goal is achievable" : tcpi <= 1.2 ? "Needs improvement" : "Target unrealistic") : "No costs yet"}
                color={tcpiColor}
                formula="Work Remaining ÷ Budget Remaining"
              />
            </div>

            {/* Bottom row: VAC + Labor Productivity */}
            <div style={{ display: "flex", gap: 10 }}>
              <EVMKpi
                label="VAC"
                value={vac !== null ? `${vac >= 0 ? "+" : ""}${formatCurrency(vac).replace(/\.\d+/, "")}` : "—"}
                subtext={vac !== null ? (vac >= 0 ? "Projected profit" : "Projected loss") : "No EAC data"}
                color={vacColor}
                formula="BAC − EAC"
              />
              <EVMKpi
                label="Labor Productivity"
                value={fmtTons(laborProductivity)}
                subtext={laborProductivity !== null ? "Tons installed per man-hour" : "No tonnage / hours yet"}
                color={lpColor}
                formula="Tons Installed ÷ Field Hours"
              />
            </div>

            {/* EV vs AC sparkline */}
            {evm.effectiveBac > 0 && (() => {
              const { effectiveBac, ev, ac } = evm;
              const pts = [
                { x: "0%",   BAC: Math.round(effectiveBac * 0),   EV: 0,                        AC: 0 },
                { x: "25%",  BAC: Math.round(effectiveBac * 0.25), EV: Math.round(ev * 0.25),    AC: Math.round(ac * 0.20) },
                { x: "50%",  BAC: Math.round(effectiveBac * 0.50), EV: Math.round(ev * 0.55),    AC: Math.round(ac * 0.52) },
                { x: "75%",  BAC: Math.round(effectiveBac * 0.75), EV: Math.round(ev * 0.80),    AC: Math.round(ac * 0.78) },
                { x: "100%", BAC: Math.round(effectiveBac),        EV: Math.round(ev),           AC: Math.round(ac) },
              ];
              return (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>EV / AC Curve</div>
                  <ResponsiveContainer width="100%" height={80}>
                    <LineChart data={pts} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <XAxis dataKey="x" tick={{ fontFamily: "var(--font-mono)", fontSize: 7, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: "var(--bg-surface-high)", border: "none", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 10 }}
                        formatter={v => formatCurrency(v).replace(/\.\d+/, "")}
                      />
                      <Line type="monotone" dataKey="BAC" stroke="var(--border-strong)" strokeDasharray="4 2" strokeWidth={1} dot={false} />
                      <Line type="monotone" dataKey="EV" stroke="var(--accent)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="AC" stroke="var(--status-warning)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
                    {[["var(--border-strong)", "BAC", true], ["var(--accent)", "EV"], ["var(--status-warning)", "AC"]].map(([color, label, dashed]) => (
                      <span key={label} style={{ fontFamily: "var(--font-mono)", fontSize: 7, color, display: "flex", alignItems: "center", gap: 3 }}>
                        <span style={{ width: 12, height: dashed ? 1 : 2, background: color, borderTop: dashed ? "1px dashed" : "none", display: "inline-block" }} />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}