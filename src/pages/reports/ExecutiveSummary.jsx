/**
 * ExecutiveSummary — the three-column rollup shown only when the user
 * flips the view to "Executive". Portfolio health (at-risk / watch /
 * healthy counts), financial snapshot (total budget, variance,
 * pending CO value), and the action-required callouts.
 */

import React from "react";
import { mono, body, CARD, CARD_TITLE } from "./constants";
import { formatCurrency } from "./utils";

export default function ExecutiveSummary({
  filteredRows,
  portfolioValue,
  budgetVariance,
  pendingCOValue,
  overdueRFIs,
  overdueActions,
  lateDeliveries,
}) {
  const atRisk   = filteredRows.filter((r) => r.health === "risk").length;
  const watching = filteredRows.filter((r) => r.health === "watch").length;
  const healthy  = filteredRows.filter((r) => r.health === "good").length;

  return (
    <div style={{ ...CARD, padding: "20px 24px" }}>
      <div style={{ ...CARD_TITLE, marginBottom: 16 }}>Executive Summary</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {/* Portfolio Health */}
        <div>
          <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 10 }}>PORTFOLIO HEALTH</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <HealthRow label="At Risk" count={atRisk}   color="var(--status-error)" />
            <HealthRow label="Watch"   count={watching} color="var(--status-warning)" />
            <HealthRow label="Healthy" count={healthy}  color="var(--status-success)" forceColor />
          </div>
        </div>

        {/* Financial Snapshot */}
        <div>
          <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 10 }}>FINANCIAL SNAPSHOT</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <FinRow label="Total Budget"     value={formatCurrency(portfolioValue)} color="var(--text-primary)" />
            <FinRow label="Variance"         value={formatCurrency(budgetVariance)} color={budgetVariance <= 0 ? "var(--status-success)" : "var(--status-error)"} />
            <FinRow label="Pending CO Value" value={formatCurrency(pendingCOValue)} color="var(--status-review)" />
          </div>
        </div>

        {/* Action Required */}
        <div>
          <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--status-error)", letterSpacing: "0.12em", marginBottom: 10 }}>ACTION REQUIRED</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {overdueRFIs.length > 0 && (
              <ActionLine color="var(--status-error)">
                {overdueRFIs.length} overdue RFI{overdueRFIs.length !== 1 ? "s" : ""} need response
              </ActionLine>
            )}
            {overdueActions.length > 0 && (
              <ActionLine color="var(--status-warning)">
                {overdueActions.length} overdue action item{overdueActions.length !== 1 ? "s" : ""}
              </ActionLine>
            )}
            {lateDeliveries.length > 0 && (
              <ActionLine color="var(--status-review)">
                {lateDeliveries.length} late deliver{lateDeliveries.length !== 1 ? "ies" : "y"}
              </ActionLine>
            )}
            {overdueRFIs.length === 0 && overdueActions.length === 0 && lateDeliveries.length === 0 && (
              <div style={{ ...body, fontSize: 12, color: "var(--status-success)" }}>No critical actions pending</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthRow({ label, count, color, forceColor }) {
  const valueColor = forceColor ? color : (count > 0 ? color : "var(--text-muted)");
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ ...body, fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ ...mono, fontSize: 18, fontWeight: 800, color: valueColor }}>{count}</span>
    </div>
  );
}

function FinRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ ...body, fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ ...mono, fontSize: 14, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function ActionLine({ color, children }) {
  return (
    <div style={{ ...body, fontSize: 12, color, borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>
      {children}
    </div>
  );
}
