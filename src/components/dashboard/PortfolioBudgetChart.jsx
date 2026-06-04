import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { PhoenixTooltip } from "./portfolioPrimitives";

/**
 * PortfolioBudgetChart — the single recharts visual on the portfolio
 * landing dashboard, split into its own module so recharts (the
 * ~600 kB `vendor-charts` chunk) is dynamic-imported instead of eagerly
 * pulled into the portfolio route. PortfolioView wraps this in
 * `React.lazy` + `<Suspense>`; the rest of the dashboard (sparklines,
 * KPI tiles, timelines) renders without ever fetching recharts.
 *
 * Renders Budget vs Actual per project. Bar colors encode budget state:
 * red = over budget, amber = work happening but not yet invoiced
 * (accounting delayed), muted = not started, accent = on track.
 */
export default function PortfolioBudgetChart({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height="90%">
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <YAxis dataKey="name" type="category" tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "var(--font-mono)" }} width={80} />
        <XAxis type="number" tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
        <Tooltip content={<PhoenixTooltip />} />
        <Bar dataKey="Budget" name="Budget" fill="var(--bg-surface-highest)" barSize={14} />
        <Bar dataKey="Actual" name="Actual" barSize={14}>
          {data.map((entry, index) => {
            let fill = "var(--accent)";
            if (entry.overBudget) fill = "var(--status-error)";
            else if (entry.accountingDelayed) fill = "var(--status-warning)"; // work happening but not invoiced
            else if (entry.notStarted) fill = "var(--text-muted)"; // not started
            return <Cell key={`cell-${index}`} fill={fill} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
