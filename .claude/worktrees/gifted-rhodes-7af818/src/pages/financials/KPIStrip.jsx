import React, { useState } from "react";
import { formatCurrencyShort } from "@/components/shared/formatters";
import { mono, body, HEALTH_COLOR } from "./utils";

export function SummaryCard({ label, value, detail, tone = "var(--accent)" }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: "14px 16px",
        borderTop: `2px solid ${tone}`,
      }}
    >
      <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: tone, marginBottom: 4 }}>
        {value}
      </div>
      {detail ? <div style={{ ...body, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>{detail}</div> : null}
    </div>
  );
}

function KPICard({ title, primary, supporting, health, onClick }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${title} — open detail drawer`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: hovered ? "var(--bg-surface-low)" : "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderLeft: `4px solid ${HEALTH_COLOR[health] || HEALTH_COLOR.amber}`,
        borderRadius: "var(--radius-card)",
        padding: "14px 16px",
        cursor: "pointer",
        transition: "background 0.15s",
        minWidth: 0,
        outline: focused ? "2px solid var(--accent)" : "none",
        outlineOffset: focused ? "2px" : 0,
      }}
    >
      <div style={{
        fontFamily: "'Space Grotesk', var(--font-display)",
        fontSize: 9,
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{
        ...mono,
        fontSize: 24,
        fontWeight: 700,
        color: HEALTH_COLOR[health] || "var(--text-primary)",
        lineHeight: 1.1,
        marginBottom: 6,
      }}>
        {primary}
      </div>
      <div style={{
        ...mono,
        fontSize: 11,
        color: "var(--text-secondary)",
        lineHeight: 1.6,
      }}>
        {supporting}
      </div>
    </div>
  );
}

function KPISkeleton() {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderLeft: "4px solid var(--border-default)",
      borderRadius: "var(--radius-card)",
      padding: "14px 16px",
    }}>
      <div style={{ width: 80, height: 10, borderRadius: 4, background: "var(--hover-bg)", marginBottom: 10 }} />
      <div style={{ width: 60, height: 22, borderRadius: 4, background: "var(--hover-bg)", marginBottom: 8 }} />
      <div style={{ width: "90%", height: 10, borderRadius: 4, background: "var(--hover-bg)" }} />
    </div>
  );
}

export function KPIStrip({ kpis, loading, onCardClick }) {
  if (loading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPISkeleton /><KPISkeleton /><KPISkeleton /><KPISkeleton />
      </div>
    );
  }

  const { changeOrderImpact: co, laborUtilization: lab, billingVsCost: bvc, daysSalesOutstanding: dso } = kpis;

  const coGrowth = co.contractGrowthPercent != null
    ? `+${co.contractGrowthPercent.toFixed(1)}%`
    : "\u2014";
  const coSupport = co.approved.count > 0 || co.pending.count > 0
    ? `${co.approved.count} approved \u00b7 ${co.pending.count} pending \u00b7 avg margin ${co.approved.avgMarginPercent.toFixed(1)}%`
    : "No change orders";

  const labPrimary = lab.utilizationRatio != null
    ? lab.utilizationRatio.toFixed(2)
    : "\u2014";

  const bvcPrimary = bvc.ratio != null
    ? bvc.ratio.toFixed(2)
    : "\u2014";
  const bvcSupport = bvc.ratio != null
    ? `${bvc.position} \u00b7 ${bvc.overUnderDollars >= 0 ? "+" : ""}${formatCurrencyShort(bvc.overUnderDollars)}`
    : "Insufficient data";

  const dsoPrimary = dso.avgDSO != null
    ? `${Math.round(dso.avgDSO)}d`
    : "\u2014";
  const dsoSupport = dso.outstandingInvoices.length > 0 || dso.avgDSO != null
    ? `${dso.outstandingInvoices.length} outstanding \u00b7 oldest ${dso.oldestOutstandingDays != null ? `${dso.oldestOutstandingDays}d` : "\u2014"} \u00b7 ${formatCurrencyShort(dso.totalOutstandingValue)}`
    : "No billing data";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
      <KPICard title="CO Impact"          primary={coGrowth}   supporting={coSupport}  health={co.health}  onClick={() => onCardClick("co")} />
      <KPICard title="Labor Utilization"  primary={labPrimary} supporting={
        <span>
          {lab.utilizationRatio != null ? (
            <>
              {lab.percentLaborConsumed.toFixed(1)}% consumed &middot; {lab.percentScopeComplete.toFixed(1)}% complete
              {lab.percentScopeCompleteSource === "override" && (
                <span style={{
                  display: "inline-block",
                  marginLeft: 4,
                  padding: "1px 5px",
                  borderRadius: 3,
                  background: "var(--accent-muted)",
                  border: "1px solid var(--accent-border)",
                  fontFamily: "'Space Grotesk', var(--font-display)",
                  fontSize: 8,
                  fontWeight: 700,
                  color: "var(--accent)",
                  letterSpacing: "0.08em",
                  verticalAlign: "middle",
                }}>OVERRIDE</span>
              )}
              <br />overrun {lab.projectedOverrun != null ? formatCurrencyShort(lab.projectedOverrun) : "\u2014"}
            </>
          ) : (
            <em style={{ fontStyle: "italic", color: "var(--text-muted)" }}>Insufficient data</em>
          )}
        </span>
      } health={lab.health} onClick={() => onCardClick("labor")} />
      <KPICard title="Billing / Cost"    primary={bvcPrimary} supporting={bvcSupport} health={bvc.health} onClick={() => onCardClick("billing")} />
      <KPICard title="DSO"               primary={dsoPrimary} supporting={dsoSupport} health={dso.health} onClick={() => onCardClick("dso")} />
    </div>
  );
}
