/**
 * FinancialControlsSection — middle panel of the project dashboard.
 *
 * Header tile-strip:
 *   Original Contract · Approved COs (+) · Pending COs · Current Value · $/ton
 *
 * Body:
 *   Cost Analysis (left)        Cash Flow (right)
 *   - Committed Costs           - Total Billed
 *   - Burn Rate (per day)       - Collected
 *   - Projected Final Cost      - Pending Payment
 *   - Projected Margin          - Retention Held
 *
 * Footer:
 *   Budget Consumption progress bar with `X% of contract value`
 *   tinted by remaining headroom (green/yellow/red).
 *
 * Health hints layered on top of the prototype:
 *   - Projected Margin row turns red when < 5%, amber when < 15%
 *     so under-margined jobs visually pop without the user opening the
 *     full Financials page.
 *   - Projected Final Cost row turns red when projected exceeds the
 *     revised contract — the canonical "you're losing money" signal.
 */

import React, { useMemo } from "react";
import { DollarSign } from "lucide-react";
import SectionCard from "./SectionCard";
import {
  revisedContractValue,
  pendingCOTotal,
  pricePerTon,
  committedCosts,
  burnRatePerDay,
  projectedFinalCost,
  projectedMargin,
  totalBilled,
  cashCollected,
  pendingPayment,
  retentionHeld,
  budgetHoursVariance,
} from "../projectMetrics";
import { formatCurrency, formatCurrencyShort } from "@/components/shared/formatters";
import InlineEditField from "@/components/shared/InlineEditField";

const ROW_STYLE = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 14px",
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  marginBottom: 6,
};

export default function FinancialControlsSection({
  project,
  cos = [],
  expenses = [],
  wps = [],
  sovItems = [],
  budgetHourItems = [],
  onNavigate,
}) {
  const baseContract = Number(project?.original_contract_value) || 0;
  const approvedDelta = useMemo(
    () => cos.filter((c) => c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0),
    [cos],
  );
  const pendingTotal = useMemo(() => pendingCOTotal(cos), [cos]);
  const pendingCount = useMemo(
    () => cos.filter((c) => ["Submitted", "Under Review"].includes(c.status)).length,
    [cos],
  );
  const contractVal = useMemo(() => revisedContractValue(project, cos), [project, cos]);
  const ppt = useMemo(() => pricePerTon(project, cos, wps), [project, cos, wps]);
  const committed = useMemo(() => committedCosts(expenses), [expenses]);
  const burn = useMemo(() => burnRatePerDay(expenses, project), [expenses, project]);
  const projFinal = useMemo(() => projectedFinalCost(expenses, project), [expenses, project]);
  const projMargin = useMemo(() => projectedMargin(project, cos, expenses), [project, cos, expenses]);
  const billed = useMemo(() => totalBilled(sovItems), [sovItems]);
  const collected = useMemo(() => cashCollected(sovItems), [sovItems]);
  const pendingPay = useMemo(() => pendingPayment(sovItems), [sovItems]);
  const retention = useMemo(() => retentionHeld(sovItems), [sovItems]);
  const hoursVar = useMemo(() => budgetHoursVariance(budgetHourItems, wps), [budgetHourItems, wps]);

  const consumedPct = contractVal > 0 ? Math.min(150, (projFinal / contractVal) * 100) : 0;
  const consumedColor =
    consumedPct >= 100 ? "var(--status-error)"
      : consumedPct >= 90 ? "var(--status-warning)"
      : "var(--status-success-bright)";

  const marginColor =
    projMargin < 5 ? "var(--status-error)"
      : projMargin < 15 ? "var(--status-warning)"
      : "var(--status-success-bright)";

  const projFinalColor =
    projFinal > contractVal ? "var(--status-error)" : "var(--text-primary)";

  const stats = [
    { value: formatCurrencyShort(contractVal), label: "Current Value", color: "accent" },
    { value: `${projMargin.toFixed(1)}%`, label: "Margin",
      color: projMargin < 5 ? "error" : projMargin < 15 ? "warning" : "success" },
    { value: formatCurrencyShort(pendingTotal), label: "Pending",
      color: pendingTotal > 0 ? "warning" : "muted" },
  ];

  return (
    <SectionCard
      icon={DollarSign}
      iconColor="success"
      title="Financial Controls"
      subtitle="Budget tracking, projections, and cash flow"
      stats={stats}
    >
      {/* Top tile strip — six fields side-by-side */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 8,
        marginBottom: 16,
      }}>
        <Tile
          label="Original Contract"
          value={
            <InlineEditField
              project={project}
              field="original_contract_value"
              value={baseContract}
              type="currency"
              display="value"
              emptyText="Set value"
            />
          }
        />
        <Tile
          label="Approved COs"
          value={`${approvedDelta >= 0 ? "+" : ""}${formatCurrency(approvedDelta)}`}
          color={approvedDelta > 0 ? "var(--status-success)" : "var(--text-secondary)"}
          tint="var(--success-muted)"
        />
        <Tile
          label="Pending COs"
          value={formatCurrency(pendingTotal)}
          sub={pendingCount > 0 ? `${pendingCount} pending` : null}
          color="var(--status-warning)"
          tint="var(--warning-muted)"
        />
        <Tile
          label="Current Value"
          value={formatCurrency(contractVal)}
          color="var(--accent)"
          tint="var(--accent-muted)"
        />
        <Tile
          label="Price / Ton"
          value={ppt != null ? formatCurrency(ppt) : "—"}
          color="var(--text-secondary)"
        />
        <HoursVarianceTile hoursVar={hoursVar} onNavigate={onNavigate} />
      </div>

      {/* Cost Analysis / Cash Flow split */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        marginBottom: 16,
      }}>
        <div>
          <SubHeading>Cost Analysis</SubHeading>
          <Row label="Committed Costs" value={formatCurrency(committed)} />
          <Row label="Burn Rate (per day)" value={burn > 0 ? formatCurrency(burn) : "$0"} />
          <Row
            label="Projected Final Cost (at current rate)"
            value={formatCurrency(projFinal)}
            valueColor={projFinalColor}
          />
          <Row
            label="Projected Margin"
            value={`${projMargin.toFixed(1)}%`}
            valueColor={marginColor}
          />
        </div>
        <div>
          <SubHeading>Cash Flow</SubHeading>
          <Row label="Total Billed" value={formatCurrency(billed)} />
          <Row label="Collected" value={formatCurrency(collected)} />
          <Row
            label={`Pending Payment ${pendingPay.count > 0 ? `(${pendingPay.count} app${pendingPay.count === 1 ? "" : "s"})` : ""}`}
            value={formatCurrency(pendingPay.total)}
            valueColor={pendingPay.count > 0 ? "var(--status-warning)" : undefined}
          />
          <Row label="Retention Held" value={formatCurrency(retention)} />
        </div>
      </div>

      {/* Budget Consumption bar */}
      <div>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.10em", textTransform: "uppercase",
          color: "var(--text-muted)", marginBottom: 6,
        }}>
          <span>Budget Consumption</span>
          <span style={{ color: consumedColor }}>
            {consumedPct.toFixed(1)}% of contract value
          </span>
        </div>
        <div style={{
          height: 10,
          background: "var(--bg-surface-low)",
          borderRadius: 5,
          overflow: "hidden",
          border: "1px solid var(--border-default)",
        }}>
          <div style={{
            width: `${Math.min(100, consumedPct)}%`,
            height: "100%",
            background: consumedColor,
            transition: "width 0.3s",
          }} />
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between",
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: "var(--text-muted)", letterSpacing: "0.06em",
          marginTop: 4,
        }}>
          <span>$0</span>
          <span>{formatCurrencyShort(contractVal)}</span>
        </div>
      </div>
    </SectionCard>
  );
}

function Tile({ label, value, sub, color, tint }) {
  // The value slot accepts either a string (the common case) or a
  // React node (e.g. <InlineEditField>). When it's a node we drop the
  // wrapping mono/bold styles since the node draws its own typography.
  const isNode = React.isValidElement(value);
  return (
    <div style={{
      padding: "12px 14px",
      background: tint || "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      borderRadius: 8,
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
        letterSpacing: "0.10em", textTransform: "uppercase",
        color: "var(--text-muted)", marginBottom: 6,
      }}>
        {label}
      </div>
      {isNode ? (
        value
      ) : (
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700,
          color: color || "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}>
          {value}
        </div>
      )}
      {sub && (
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: "var(--text-muted)", marginTop: 4,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function SubHeading({ children }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.10em", textTransform: "uppercase",
      color: "var(--text-muted)", marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

/**
 * Hours Variance tile — Shop / Field % over (or under) budget. Mirrors
 * the rollup on the Budget Hours page so PMs can spot a labor-spend
 * spike without leaving the dashboard. Click navigates to /BudgetHours.
 *
 * Renders a "Set up" CTA when no budget rows exist for the project so
 * the empty state nudges the user to create the kickoff template
 * rather than displaying 0% / 0%.
 */
function HoursVarianceTile({ hoursVar, onNavigate }) {
  const handleClick = onNavigate ? () => onNavigate("budget-hours") : undefined;
  const fmt = (pct) => {
    if (!Number.isFinite(pct)) return "—";
    const v = Math.round(pct * 10) / 10;
    return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
  };
  const colorFor = (pct) =>
    pct >= 10 ? "var(--status-error)"
      : pct > 0 ? "var(--status-warning)"
      : "var(--status-success)";

  if (!hoursVar.hasBudget) {
    return (
      <div
        onClick={handleClick}
        title="Set up budget hours from the Estimating Kickoff template"
        style={{
          padding: "12px 14px",
          background: "var(--bg-surface-low)",
          border: "1px dashed var(--border-default)",
          borderRadius: 8,
          cursor: handleClick ? "pointer" : "default",
          display: "flex", flexDirection: "column", justifyContent: "center",
        }}
      >
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
          letterSpacing: "0.10em", textTransform: "uppercase",
          color: "var(--text-muted)", marginBottom: 6,
        }}>
          Hours Variance
        </div>
        <div style={{
          fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
          color: "var(--accent)",
        }}>
          Set up budget →
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      title="Open Budget Hours"
      style={{
        padding: "12px 14px",
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        cursor: handleClick ? "pointer" : "default",
      }}
    >
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
        letterSpacing: "0.10em", textTransform: "uppercase",
        color: "var(--text-muted)", marginBottom: 6,
      }}>
        Hours Variance
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
        <div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)",
            letterSpacing: "0.10em", textTransform: "uppercase",
          }}>
            Shop
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700,
            color: colorFor(hoursVar.shopVariancePct),
            fontVariantNumeric: "tabular-nums",
          }}>
            {fmt(hoursVar.shopVariancePct)}
          </div>
        </div>
        <div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)",
            letterSpacing: "0.10em", textTransform: "uppercase",
          }}>
            Field
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700,
            color: colorFor(hoursVar.fieldVariancePct),
            fontVariantNumeric: "tabular-nums",
          }}>
            {fmt(hoursVar.fieldVariancePct)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueColor }) {
  return (
    <div style={ROW_STYLE}>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>
        {label}
      </span>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
        color: valueColor || "var(--text-primary)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
    </div>
  );
}
