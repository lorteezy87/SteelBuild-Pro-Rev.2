import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export default function BudgetOverviewChart({ summary }) {
  const data = [
    {
      name: "Budget vs Actual",
      Budget: Math.round(summary.budget / 1000),
      Actual: Math.round(summary.actual / 1000),
      Forecast: Math.round(summary.forecast / 1000),
    },
  ];

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "12px",
        padding: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.10em" }}>
          Budget Performance
        </h3>
        {/* Donut */}
        {(() => {
          const donutData = [
            { name: 'Spent',     value: summary?.actual || 0,                                               color: 'var(--accent)' },
            { name: 'Remaining', value: Math.max(0, (summary?.budget || 0) - (summary?.actual || 0)),       color: 'var(--bg-surface-highest)' },
          ];
          const burnPct = summary?.budget > 0 ? Math.round((summary.actual / summary.budget) * 100) : 0;
          return (
            <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={38} outerRadius={52} dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}>
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-surface-high)', border: 'none', borderRadius: 2, fontFamily: 'var(--font-mono)', fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{burnPct}%</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.10em', marginTop: 3 }}>BURNED</span>
              </div>
            </div>
          );
        })()}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
          <XAxis dataKey="name" stroke="var(--text-muted)" />
          <YAxis stroke="var(--text-muted)" />
          <Tooltip
            contentStyle={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: "8px",
              color: "var(--text-primary)",
            }}
          />
          <Legend />
          <Bar dataKey="Budget" fill="var(--accent)" />
          <Bar dataKey="Actual" fill="var(--status-warning)" />
          <Bar dataKey="Forecast" fill="var(--status-info)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}