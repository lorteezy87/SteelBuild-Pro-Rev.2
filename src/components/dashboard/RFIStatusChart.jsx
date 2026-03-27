import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";

export default function RFIStatusChart({ rfis }) {
  const data = [
    { name: "Open", value: rfis.filter((r) => r.status === "Open").length },
    { name: "Under Review", value: rfis.filter((r) => r.status === "Under Review").length },
    { name: "Answered", value: rfis.filter((r) => r.status === "Answered").length },
    { name: "Closed", value: rfis.filter((r) => r.status === "Closed").length },
  ].filter((d) => d.value > 0);

  const COLORS = [
    "var(--status-error)",
    "var(--status-warning)",
    "var(--status-info)",
    "var(--status-success)",
  ];

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: "12px",
      padding: "16px",
    }}>
      <h3 style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        fontWeight: 700,
        color: "var(--text-primary)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        margin: "0 0 12px 0",
      }}>
        RFI Status
      </h3>

      {(() => {
        const chartData = [
          { name: 'Open',     count: rfis.filter(r => r.status === 'Open').length,         color: 'var(--status-warning)' },
          { name: 'Review',   count: rfis.filter(r => r.status === 'Under Review').length,  color: 'var(--status-info)' },
          { name: 'Answered', count: rfis.filter(r => r.status === 'Answered').length,      color: 'var(--status-success)' },
          { name: 'Closed',   count: rfis.filter(r => r.status === 'Closed').length,        color: 'var(--text-muted)' },
        ];
        return (
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={chartData} barSize={24} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-muted)', textTransform: 'uppercase' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface-high)', border: 'none', borderRadius: 2, fontFamily: 'var(--font-mono)', fontSize: 10 }}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );
      })()}

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" stroke="none">
              {data.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: "6px", color: "var(--text-primary)" }}
            />
            <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)" }} />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
          No RFIs
        </div>
      )}
    </div>
  );
}