/**
 * FinancialSnapshot — right-side hero card on the Project Dashboard.
 *
 * Shows the revised contract value (big gold numeric), then a grid of
 * budget / cost-to-date / committed / variance / burn metrics, then a
 * 6-month spend breakdown bar chart (Committed vs Actual).
 *
 * All values come from the derived metrics in `./projectMetrics`.
 */

import React from "react";
import { formatCurrency } from "@/components/shared/formatters";

// Whole-dollar display — all dashboard tiles. Delegates to the shared
// currency formatter (handles negatives as `-$1,234` natively).
const formatMoney = (n) => formatCurrency(n, 0);

export default function FinancialSnapshot({
  contractValue,
  baseContractValue,
  budget,
  committed,
  paidToDate,
  variance,
  burnPct,
  monthly,
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--accent)",
            letterSpacing: "0.14em",
          }}
        >
          FINANCIAL SNAPSHOT
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            cursor: "pointer",
            letterSpacing: "0.10em",
          }}
        >
          DETAIL →
        </div>
      </div>

      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: "var(--text-muted)",
            letterSpacing: "0.14em",
            marginBottom: 2,
          }}
        >
          REVISED CONTRACT VALUE
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 24,
            fontWeight: 700,
            color: "var(--accent)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatMoney(contractValue)}
        </div>
        {baseContractValue !== contractValue && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
            Base: {formatMoney(baseContractValue)}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          rowGap: 6,
          columnGap: 8,
          alignItems: "baseline",
        }}
      >
        <Row label="BUDGET COMMITTED" value={formatMoney(budget)} />
        <Row
          label="COST TO DATE"
          value={`${formatMoney(paidToDate)} (${budget > 0 ? Math.round((paidToDate / budget) * 100) : 0}%)`}
        />
        <Row label="COMMITTED COSTS" value={formatMoney(committed)} />

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            gridColumn: "1/-1",
            borderTop: "1px solid var(--divider)",
            paddingTop: 8,
            marginTop: 4,
          }}
        />

        <Row
          label="COST VARIANCE"
          value={`${variance >= 0 ? "+" : ""}${formatMoney(variance)}`}
          valueColor={variance >= 0 ? "var(--status-success)" : "var(--status-error)"}
          bold
        />
        <Row label="BUDGET BURN" value={`${burnPct}%`} bold />
      </div>

      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.14em",
            marginBottom: 6,
          }}
        >
          SPEND BREAKDOWN
        </div>
        <SpendChart data={monthly} />
        <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
          <LegendDot color="var(--accent)" label="Actual" />
          <LegendDot color="var(--text-muted)" label="Committed" />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueColor, bold }) {
  return (
    <>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: bold ? "var(--text-secondary)" : "var(--text-muted)",
          letterSpacing: "0.12em",
          fontWeight: bold ? 700 : 400,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: bold ? 12 : 11,
          color: valueColor || "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          fontWeight: bold ? 700 : 400,
        }}
      >
        {value}
      </span>
    </>
  );
}

function SpendChart({ data }) {
  const w = 340;
  const h = 90;
  const pad = 4;
  const max = Math.max(1, ...data.map((d) => Math.max(d.committed, d.actual)));
  const bw = (w - pad * 2) / data.length - 4;

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      {data.map((d, i) => {
        const x = pad + i * (bw + 4);
        const committedH = (d.committed / max) * (h - 18);
        const actualH    = (d.actual    / max) * (h - 18);
        return (
          <g key={d.key || i}>
            <rect x={x} y={h - 16 - committedH} width={bw} height={committedH} fill="var(--text-muted)" opacity="0.3" rx="1" />
            <rect x={x} y={h - 16 - actualH}    width={bw} height={actualH}    fill="var(--accent)" rx="1" />
            <text
              x={x + bw / 2}
              y={h - 4}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontFamily="var(--font-mono)"
              fontSize="8"
              letterSpacing="0.08em"
            >
              {d.month}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LegendDot({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 6, height: 6, borderRadius: 3, background: color }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
        {label}
      </span>
    </div>
  );
}
