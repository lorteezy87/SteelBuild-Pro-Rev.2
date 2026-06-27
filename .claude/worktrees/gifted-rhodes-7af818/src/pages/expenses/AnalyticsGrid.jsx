/**
 * AnalyticsGrid — two-column dashboard row below the KPI strip.
 *
 *   Left:  donut-chart of spend by cost code + cost-code budget-vs-actual
 *          bars with per-row variance.
 *   Right: payment-status rollup + top 5 vendors + 6-month trend chart.
 *
 * All aggregates are passed in; this file doesn't recompute.
 */

import React from "react";
import { CATEGORY_COLORS } from "@/components/shared/costCodes";
import { formatCurrencyShort } from "@/components/shared/formatters";
import { PAYMENT_STATUS_COLOR } from "./constants";
import { BudgetDonutChart, MonthlyTrendChart } from "./charts";

export default function AnalyticsGrid({
  spendByCostCode,
  costCodeBudgetVsActual,
  statusBreakdown,
  topVendors,
  expenses,
  totalCommitted,
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 20 }}>
      {/* Left column: donut + budget-vs-actual bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Card title="SPEND BY COST CODE">
          <BudgetDonutChart segments={spendByCostCode} totalCommitted={totalCommitted} />
        </Card>

        <Card title="COST CODE BUDGET vs ACTUAL">
          {costCodeBudgetVsActual.length === 0 ? (
            <Empty>No cost code data</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {costCodeBudgetVsActual.map((cc) => {
                const maxVal = Math.max(cc.budget, cc.actual, 1);
                const budgetPct = (cc.budget / maxVal) * 100;
                const actualPct = (cc.actual / maxVal) * 100;
                const overBudget = cc.actual > cc.budget && cc.budget > 0;
                const barColor = CATEGORY_COLORS[cc.category] || "var(--accent)";
                return (
                  <div key={cc.code}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: overBudget ? "var(--status-error)" : "var(--text-secondary)" }}>
                        {cc.code} — {cc.name}
                      </span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: overBudget ? "var(--status-error)" : "var(--text-muted)" }}>
                          {cc.pctUsed > 900 ? "N/A" : `${cc.pctUsed}%`}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                          {formatCurrencyShort(cc.actual)} / {formatCurrencyShort(cc.budget)}
                        </span>
                      </div>
                    </div>
                    <div style={{ position: "relative", height: 8, background: "var(--bg-surface-highest)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${budgetPct}%`, border: `1px solid ${barColor}55`, borderRadius: 4, boxSizing: "border-box" }} />
                      <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${actualPct}%`, background: overBudget ? "var(--status-error)" : barColor, borderRadius: 4, transition: "width 0.3s ease", opacity: 0.85 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Right column: payment status + top vendors + monthly trend */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Card title="PAYMENT STATUS" flex>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {statusBreakdown.map(({ status, count, total }) => (
              <div key={status} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: PAYMENT_STATUS_COLOR[status] || "var(--text-muted)", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", flex: 1 }}>{status}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{count}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: PAYMENT_STATUS_COLOR[status] || "var(--text-primary)" }}>
                  {formatCurrencyShort(total)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="TOP VENDORS" flex>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topVendors.length === 0 ? (
              <Empty>No vendor data</Empty>
            ) : (
              topVendors.map(({ vendor, total }) => (
                <div key={vendor} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
                    {vendor}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)" }}>
                    {formatCurrencyShort(total)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="MONTHLY SPEND TREND">
          <MonthlyTrendChart expenses={expenses} />
        </Card>
      </div>
    </div>
  );
}

function Card({ title, flex, children }) {
  return (
    <div className="sbd-card" style={{ padding: "18px 20px", ...(flex ? { flex: 1 } : {}) }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>
      {children}
    </div>
  );
}
