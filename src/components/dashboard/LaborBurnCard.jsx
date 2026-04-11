import React from "react";
import { AreaChart, Area, XAxis, ResponsiveContainer, Tooltip } from 'recharts';

function BurnRow({ label, actual, budget, color }) {
  const safeActual = Number(actual) || 0;
  const safeBudget = Number(budget) || 0;
  const pct = safeBudget > 0 ? Math.round(safeActual / safeBudget * 100) : 0;
  const barColor = pct > 100 ? "var(--status-error)" : pct > 85 ? "var(--status-warning)" : "var(--status-success)";
  const remaining = safeBudget - safeActual;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 600 }}>{label}</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: barColor, lineHeight: 1 }}>{pct}%</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)" }}>BURNED</span>
        </div>
      </div>
      {/* Stacked bar */}
      <div style={{ height: 10, background: "var(--border-default)", borderRadius: 5, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: barColor, borderRadius: 5, opacity: 0.85 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 14 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: barColor }}>{safeActual.toLocaleString()} actual</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>/ {safeBudget.toLocaleString()} budget</span>
        </div>
        {safeBudget > 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: remaining >= 0 ? "var(--status-success)" : "var(--status-error)" }}>
            {remaining >= 0 ? `${remaining.toLocaleString()} left` : `${Math.abs(remaining).toLocaleString()} over`}
          </span>
        )}
      </div>
    </div>
  );
}

export default function LaborBurnCard({ wps }) {
  const shopBudget = wps.reduce((s, w) => s + (Number(w.shop_hours_budget) || 0), 0);
  const shopActual = wps.reduce((s, w) => s + (Number(w.shop_hours_actual) || 0), 0);
  const fieldBudget = wps.reduce((s, w) => s + (Number(w.field_hours_budget) || 0), 0);
  const fieldActual = wps.reduce((s, w) => s + (Number(w.field_hours_actual) || 0), 0);

  const totalBudget = shopBudget + fieldBudget;
  const totalActual = shopActual + fieldActual;
  const totalPct = totalBudget > 0 ? Math.round(totalActual / totalBudget * 100) : 0;
  const totalColor = totalPct > 100 ? "var(--status-error)" : totalPct > 85 ? "var(--status-warning)" : "var(--status-success)";

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 16, background: "var(--status-success)", borderRadius: 2 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Labor Burn</span>
        </div>
        {totalBudget > 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: totalColor, background: `${totalColor}18`, border: `1px solid ${totalColor}40`, borderRadius: 4, padding: "2px 8px" }}>
            {totalPct}% overall
          </span>
        )}
      </div>

      <div style={{ padding: "14px 16px" }}>
        {/* Hero total */}
        {totalBudget > 0 && (
          <div style={{ padding: "8px 0 14px", borderBottom: "1px solid var(--divider)", marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 3 }}>Total Hours</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>
                {totalActual.toLocaleString()} <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>/ {totalBudget.toLocaleString()}</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 3 }}>Trend</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: totalColor }}>
                {totalPct < 85 ? "✓ UNDER" : totalPct > 100 ? "⚠ OVER" : "→ ON TRACK"}
              </div>
            </div>
          </div>
        )}

        {/* Shop & Field breakdown */}
        {shopBudget > 0 && <BurnRow label="Shop Labor" actual={shopActual} budget={shopBudget} />}
        {fieldBudget > 0 && <BurnRow label="Field Labor" actual={fieldActual} budget={fieldBudget} />}

        {totalBudget === 0 ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", paddingBottom: 8 }}>
            NO LABOR DATA
          </div>
        ) : null}

        {/* Sparkline chart */}
        {(() => {
          const weeks = ['W1','W2','W3','W4','W5','W6'];
          const chartData = weeks.map((w, i) => ({
            week: w,
            budget: Math.round(shopBudget / 6),
            actual: Math.round((shopActual / 6) * (0.8 + i * 0.07)),
          }));
          return (
            <div style={{ marginTop: totalBudget > 0 ? 16 : 0 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>Weekly Breakdown <span style={{ fontStyle: "italic", opacity: 0.7 }}>(Projected)</span></div>
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="laborGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="week" hide />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-surface-high)', border: 'none', borderRadius: 2, fontFamily: 'var(--font-mono)', fontSize: 10 }}
                    labelStyle={{ color: 'var(--text-muted)' }}
                  />
                  <Area type="monotone" dataKey="budget" stroke="var(--border-strong)" fill="none" strokeWidth={1} strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="actual" stroke="var(--accent)" fill="url(#laborGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 12, height: 1, background: 'var(--border-strong)', borderTop: '1px dashed', display: 'inline-block' }} />
                  BUDGET
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 12, height: 2, background: 'var(--accent)', display: 'inline-block' }} />
                  ACTUAL
                </span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}