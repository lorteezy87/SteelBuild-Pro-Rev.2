import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatCurrency } from "../shared/formatters";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

function FinRow({ label, value, valueColor, isTotal = false }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      padding: isTotal ? "9px 0" : "6px 0",
      borderBottom: isTotal ? "none" : "1px solid var(--border-default)",
      borderTop: isTotal ? "1px solid var(--border-strong)" : "none",
      marginTop: isTotal ? 4 : 0,
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: isTotal ? "var(--text-secondary)" : "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: isTotal ? 700 : 400 }}>{label}</span>
      <span style={{ fontFamily: isTotal ? "var(--font-display)" : "var(--font-mono)", fontSize: isTotal ? 16 : 11, fontWeight: isTotal ? 800 : 500, color: valueColor || "var(--text-secondary)" }}>{value}</span>
    </div>
  );
}

export default function FinancialSnapshotCard({ financials = {} }) {
  const navigate = useNavigate();
  const contractValue = Number(financials.contractValue) || 0;
  const approvedCOVal = Number(financials.approvedCOVal) || 0;
  const revisedValue = Number(financials.revisedValue) || 0;
  const actualSpend = Number(financials.actualSpend) || 0;
  const pendingCOVal = Number(financials.pendingCOVal) || 0;
  const budgetCommitted = Number(financials.budgetCommitted) || 0;
  const committedCosts = Number(financials.committedCosts) || 0;

  const variance = revisedValue - actualSpend;
  const costPct = budgetCommitted > 0 ? Math.round(actualSpend / budgetCommitted * 100) : 0;
  const varianceColor = variance >= 0 ? "var(--status-success)" : "var(--status-error)";

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 16, background: "var(--accent)", borderRadius: 2 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Financial Snapshot</span>
        </div>
        <button onClick={() => navigate(createPageUrl("CostHub"))} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", letterSpacing: "0.10em", fontWeight: 600 }}>DETAIL →</button>
      </div>

      <div style={{ padding: "10px 16px 16px" }}>
        {/* Empty state CTA */}
        {contractValue === 0 && budgetCommitted === 0 && actualSpend === 0 && (
          <div style={{ textAlign: "center", padding: "24px 12px" }}>
            <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.5 }}>◎</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 8 }}>Awaiting Budget Data</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.5 }}>Set a contract value in Project Settings, then add cost codes and expenses to see your financials here.</div>
            <button onClick={() => navigate(createPageUrl("CostHub"))} style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--accent)", background: "var(--accent-muted)", border: "1px solid var(--accent-border)", borderRadius: "var(--radius-btn)", padding: "8px 16px", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" }}>Set Up Budget →</button>
          </div>
        )}
        {/* Financial content — only when data exists */}
        {(contractValue > 0 || budgetCommitted > 0 || actualSpend > 0) && <>
          <div style={{ padding: "12px 0 10px", borderBottom: "1px solid var(--divider)", marginBottom: 8 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>Revised Contract Value</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>
              {formatCurrency(revisedValue).replace(/\.\d+/, "")}
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 5 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-success)" }}>Base: {formatCurrency(contractValue).replace(/\.\d+/, "")}</span>
              {approvedCOVal !== 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-warning)" }}>+COs: {formatCurrency(approvedCOVal).replace(/\.\d+/, "")}</span>}
            </div>
          </div>

          <FinRow label="Budget Committed" value={formatCurrency(budgetCommitted).replace(/\.\d+/, "")} />
          <FinRow label="Cost to Date" value={`${formatCurrency(actualSpend).replace(/\.\d+/, "")} (${costPct}%)`} valueColor={costPct > 100 ? "var(--status-error)" : costPct > 85 ? "var(--status-warning)" : "var(--text-secondary)"} />
          <FinRow label="Committed Costs" value={formatCurrency(committedCosts).replace(/\.\d+/, "")} valueColor="var(--chart-4)" />
          {pendingCOVal > 0 && <FinRow label="Pending CO Exposure" value={formatCurrency(pendingCOVal).replace(/\.\d+/, "")} valueColor="var(--status-warning)" />}
          <FinRow label="Cost Variance" value={`${variance >= 0 ? "+" : ""}${formatCurrency(variance).replace(/\.\d+/, "")}`} valueColor={varianceColor} isTotal />

          {/* Cost burn bar */}
          {budgetCommitted > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Budget Burn</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: costPct > 100 ? "var(--status-error)" : "var(--status-success)", fontWeight: 700 }}>{costPct}%</span>
              </div>
              <div style={{ height: 7, background: "var(--border-default)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, costPct)}%`, background: costPct > 100 ? "var(--status-error)" : costPct > 85 ? "var(--status-warning)" : "var(--accent)", borderRadius: 4 }} />
              </div>

              {/* Mini spend breakdown bar chart */}
              <div style={{ marginTop: 14 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Spend Breakdown</span>
                <ResponsiveContainer width="100%" height={70}>
                  <BarChart
                    layout="vertical"
                    data={[{ name: "Cost", actual: Math.round(actualSpend / 1000), committed: Math.round(committedCosts / 1000), pending: Math.round(pendingCOVal / 1000) }]}
                    margin={{ top: 6, right: 0, left: -32, bottom: 0 }}
                    barSize={10}
                  >
                    <XAxis type="number" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" hide />
                    <Tooltip
                      contentStyle={{ background: "var(--bg-surface-high)", border: "none", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 10 }}
                      formatter={(v, n) => [`$${v}K`, n.charAt(0).toUpperCase() + n.slice(1)]}
                      cursor={{ fill: "var(--hover-bg)" }}
                    />
                    <Bar dataKey="actual" name="actual" fill="var(--accent)" radius={[2, 2, 2, 2]} />
                    <Bar dataKey="committed" name="committed" fill="var(--status-warning)" radius={[2, 2, 2, 2]} />
                    {pendingCOVal > 0 && <Bar dataKey="pending" name="pending" fill="var(--status-error)" radius={[2, 2, 2, 2]} />}
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", gap: 12, marginTop: 2 }}>
                  {[["var(--accent)", "Actual"], ["var(--status-warning)", "Committed"], ...(pendingCOVal > 0 ? [["var(--status-error)", "Pending CO"]] : [])].map(([color, label]) => (
                    <span key={label} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ width: 8, height: 2, background: color, display: "inline-block", borderRadius: 1 }} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>}
      </div>
    </div>
  );
}
