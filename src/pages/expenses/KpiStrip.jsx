/**
 * KpiStrip — five click-to-filter KPI cards across the top of the
 * Expenses page: Total Budget, Committed, Paid to Date, Remaining
 * (with burndown sparkline), Outstanding.
 *
 * The parent owns `activeKPI` and handles the click routing; this is
 * pure presentation.
 */

import React from "react";
import { formatCurrency, formatCurrencyShort } from "@/components/shared/formatters";
import { MiniProgressRing, BurndownSparkline } from "./charts";

const kpiGlow = (active, borderColor = "var(--accent)") =>
  active
    ? {
        cursor: "pointer",
        border: `1px solid ${borderColor}`,
        boxShadow: `0 0 18px color-mix(in srgb, ${borderColor} 20%, transparent), 0 0 36px color-mix(in srgb, ${borderColor} 8%, transparent)`,
      }
    : {
        cursor: "pointer",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-card)",
      };

export default function KpiStrip({
  activeKPI,
  onClick,
  totalBudget,
  totalCommitted,
  totalPaid,
  paidCount,
  totalRemaining,
  totalOutstanding,
  pctUsed,
  remainingColor,
  remainingBorderColor,
  expenses,
}) {
  const money = (n) => (n >= 10000 ? formatCurrencyShort(n) : formatCurrency(n));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
      {/* Total Budget */}
      <Tile
        onClick={() => onClick("budget")}
        active={activeKPI === "budget"}
        borderColor="var(--accent)"
      >
        <TileBody
          label="Total Budget"
          value={money(totalBudget)}
          ring={<MiniProgressRing ratio={1} size={32} stroke={3} color="var(--accent)" />}
        />
      </Tile>

      {/* Committed */}
      <Tile
        onClick={() => onClick("committed")}
        active={activeKPI === "committed"}
        borderColor={pctUsed >= 75 ? "var(--status-warning)" : "var(--accent)"}
      >
        <TileBody
          label="Committed"
          value={money(totalCommitted)}
          valueColor={pctUsed >= 90 ? "var(--status-error)" : "var(--status-warning)"}
          meta={`${pctUsed}% of budget`}
          ring={<MiniProgressRing ratio={totalBudget > 0 ? totalCommitted / totalBudget : 0} size={32} stroke={3} color={pctUsed >= 90 ? "var(--status-error)" : "var(--status-warning)"} />}
        />
      </Tile>

      {/* Paid to Date */}
      <Tile
        onClick={() => onClick("paid")}
        active={activeKPI === "paid"}
        borderColor="var(--status-success)"
      >
        <TileBody
          label="Paid to Date"
          value={money(totalPaid)}
          valueColor="var(--status-success)"
          meta={`${paidCount} invoices`}
          ring={<MiniProgressRing ratio={totalBudget > 0 ? totalPaid / totalBudget : 0} size={32} stroke={3} color="var(--status-success)" />}
        />
      </Tile>

      {/* Remaining (with burndown sparkline) */}
      <Tile
        onClick={() => onClick("remaining")}
        active={activeKPI === "remaining"}
        borderColor={remainingBorderColor}
      >
        <TileBody
          label="Remaining"
          value={money(Math.max(0, totalRemaining))}
          valueColor={remainingColor}
          meta={
            totalRemaining < 0
              ? `${formatCurrencyShort(Math.abs(totalRemaining))} over budget`
              : `${100 - pctUsed}% remaining`
          }
          metaColor={totalRemaining < 0 ? "var(--status-error)" : "var(--text-muted)"}
          ring={<MiniProgressRing ratio={totalBudget > 0 ? Math.max(0, totalRemaining) / totalBudget : 0} size={32} stroke={3} color={remainingColor} />}
        />
        <BurndownSparkline expenses={expenses} totalBudget={totalBudget} />
      </Tile>

      {/* Outstanding */}
      <Tile
        onClick={() => onClick("outstanding")}
        active={activeKPI === "outstanding"}
        borderColor="var(--status-warning)"
      >
        <TileBody
          label="Outstanding"
          value={money(totalOutstanding)}
          valueColor="var(--status-warning)"
          meta="Unpaid / Pending"
          ring={<MiniProgressRing ratio={totalBudget > 0 ? totalOutstanding / totalBudget : 0} size={32} stroke={3} color="var(--status-warning)" />}
        />
      </Tile>
    </div>
  );
}

function Tile({ onClick, active, borderColor, children }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-card)",
        padding: "14px 16px 12px",
        borderTop: `2px solid ${borderColor}`,
        transition: "all 0.15s",
        position: "relative",
        ...kpiGlow(active, borderColor),
      }}
    >
      {active && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 6,
            height: 6,
            borderRadius: 3,
            background: borderColor,
            boxShadow: `0 0 6px ${borderColor}`,
          }}
        />
      )}
      {children}
    </div>
  );
}

function TileBody({ label, value, valueColor = "var(--text-primary)", meta, metaColor = "var(--text-muted)", ring }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
          {label}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: valueColor }}>
          {value}
        </div>
        {meta && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: metaColor, marginTop: 4 }}>
            {meta}
          </div>
        )}
      </div>
      {ring}
    </div>
  );
}
