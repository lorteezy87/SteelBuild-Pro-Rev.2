/**
 * WeeklySummary — three-column "last 7 days" snapshot. ACTIVITY (new/
 * closed RFIs + new/approved COs), PROGRESS (completed actions +
 * deliveries received), RISK ITEMS (critical RFIs, high-value pending
 * COs, overdue actions, late deliveries).
 *
 * Fed by `weeklySummary` computed in the page shell. The close button
 * hands control back via `onClose`.
 */

import React from "react";
import { mono, body, CARD, CARD_TITLE } from "./constants";
import { formatCurrency } from "./utils";

export default function WeeklySummary({ weeklySummary, onClose }) {
  const activity = [
    { label: "New RFIs",     value: weeklySummary.newRFIs,      color: "var(--status-info)" },
    { label: "Closed RFIs",  value: weeklySummary.closedRFIs,   color: "var(--status-success)" },
    { label: "New COs",      value: weeklySummary.newCOs,       color: "#F97316" },
    { label: "Approved COs", value: `${weeklySummary.approvedCOs} (${formatCurrency(weeklySummary.approvedCOValue)})`, color: "var(--status-success)" },
  ];
  const progress = [
    { label: "Actions Completed",    value: weeklySummary.completedActions, color: "var(--status-success)" },
    { label: "Deliveries Received",  value: weeklySummary.recentDeliveries, color: "var(--status-info)" },
  ];
  const risks = [
    { label: "Critical RFIs",           value: weeklySummary.criticalRFIs,    color: "var(--status-error)" },
    { label: "High-Value COs (>$50K)",  value: weeklySummary.highValueCOs,    color: "#F97316" },
    { label: "Overdue Actions",         value: weeklySummary.overdueActions,  color: "var(--status-error)" },
    { label: "Late Deliveries",         value: weeklySummary.lateDeliveries,  color: "var(--status-warning)" },
  ];

  return (
    <div style={{ ...CARD, borderLeft: "3px solid var(--accent)", padding: "18px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ ...CARD_TITLE, marginBottom: 2 }}>Weekly Summary Report</div>
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
            {weeklySummary.weekStart} — {weeklySummary.weekEnd}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <Column title="ACTIVITY"    accent="var(--accent)"       rows={activity} />
        <Column title="PROGRESS"    accent="var(--accent)"       rows={progress} />
        <Column title="RISK ITEMS"  accent="var(--status-error)" rows={risks} />
      </div>
    </div>
  );
}

function Column({ title, accent, rows }) {
  return (
    <div>
      <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 8 }}>{title}</div>
      {rows.map((item) => {
        const valueColor = typeof item.value === "number" && item.value === 0 ? "var(--text-muted)" : item.color;
        return (
          <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--divider)" }}>
            <span style={{ ...body, fontSize: 11, color: "var(--text-secondary)" }}>{item.label}</span>
            <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: valueColor }}>{item.value}</span>
          </div>
        );
      })}
    </div>
  );
}
