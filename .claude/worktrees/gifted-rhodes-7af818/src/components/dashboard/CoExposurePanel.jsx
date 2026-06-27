import React from "react";
import { formatCurrency } from "../shared/formatters";

/**
 * CoExposurePanel — four-bucket breakdown of portfolio change orders.
 *
 * Answers the PM question "how much cash is committed vs at risk vs
 * unknown?" by splitting every non-void CO into one of four buckets
 * (see the coExposure memo in PortfolioView for bucket definitions)
 * and rendering the totals as a single-row of click-through tiles,
 * plus a compact "top exposures" list of the biggest ticket items so
 * you can drill into the specific COs driving the number.
 *
 * Deliberately shows NO exposure subtotal — "total exposure" adds
 * pending + disputed, but the tile row already has both, and the PMs
 * I'm watching prefer the buckets split rather than summed.
 */
export default function CoExposurePanel({ data, projectMap, onOpenCO, onOpenProject }) {
  const buckets = [
    { key: "approved", label: "Approved",  color: "var(--status-success)", hint: "Committed — in the contract" },
    { key: "pending",  label: "Pending",   color: "var(--status-warning)", hint: "Submitted / Under Review — will hit budget" },
    { key: "unpriced", label: "Unpriced",  color: "var(--text-muted)",     hint: "Submitted without a $ amount — unknown exposure" },
    { key: "disputed", label: "Disputed",  color: "var(--status-error)",   hint: "Rejected but still live — often re-negotiated" },
  ];

  // Top exposures = the biggest individual CO amounts across the
  // buckets that actually count as exposure (pending + disputed +
  // approved for context). We show up to 6 so the list stays scannable.
  const topExposures = [
    ...(data.pending.items || []),
    ...(data.disputed.items || []),
    ...(data.approved.items || []),
  ]
    .sort((a, b) => (Number(b.co_amount ?? b.cost_impact_amount ?? 0)) - (Number(a.co_amount ?? a.cost_impact_amount ?? 0)))
    .slice(0, 6);

  const anyExposure = data.totalExposure > 0 || data.approved.amount > 0 || data.unpriced.items.length > 0;

  return (
    <div
      className="sbd-card"
      style={{
        gridColumn: "span 12",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        padding: 0,
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--divider)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            CO Exposure
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
            {data.totalExposure > 0
              ? `${formatCurrency(data.totalExposure).replace(/\.\d+/, "")} at risk (pending + disputed)`
              : "No open exposure across the portfolio"}
          </div>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Click any tile to review COs
        </span>
      </div>

      {/* Four-tile row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 0 }}>
        {buckets.map((b, i) => {
          const bucket = data[b.key];
          return (
            <div
              key={b.key}
              title={b.hint}
              onClick={() => {
                // Open Change Orders page — we don't have a query-arg
                // bucket filter yet, so just open the list and rely on
                // the user applying a status filter there. Passing a
                // representative CO's project_id keeps the deep link
                // contextual when exactly one project is involved.
                const rep = bucket.items[0];
                if (rep && onOpenCO) onOpenCO(rep);
              }}
              className={bucket.items.length > 0 ? "sbd-card-hover" : undefined}
              style={{
                padding: "14px 16px",
                borderRight: i < buckets.length - 1 ? "1px solid var(--divider)" : "none",
                borderTop: `3px solid ${b.color}`,
                background: bucket.amount > 0 || bucket.items.length > 0
                  ? `color-mix(in srgb, ${b.color} 6%, transparent)`
                  : "transparent",
                cursor: bucket.items.length > 0 ? "pointer" : "default",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                minHeight: 82,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span className="sbd-kpi-label" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: b.color, margin: 0 }}>
                  {b.label}
                </span>
                <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                  {bucket.items.length} CO{bucket.items.length !== 1 ? "s" : ""}
                </span>
              </div>
              <span className="sbd-kpi-value sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {b.key === "unpriced" && bucket.items.length > 0 && bucket.amount === 0
                  ? "—"
                  : formatCurrency(bucket.amount).replace(/\.\d+/, "")}
              </span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)" }}>
                {b.hint}
              </span>
            </div>
          );
        })}
      </div>

      {/* Top exposures list */}
      {anyExposure && topExposures.length > 0 && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--divider)", background: "var(--bg-surface-low)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
            Top Exposures
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topExposures.map((co) => {
              const amt = Number(co.co_amount ?? co.cost_impact_amount ?? 0);
              const proj = projectMap[co.project_id] || {};
              const bucket =
                co.status === "Approved" ? "approved"
                : co.status === "Rejected" ? "disputed"
                : "pending";
              const bucketSpec = buckets.find((b) => b.key === bucket) || buckets[1];
              return (
                <div
                  key={co.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.target.dataset?.proj === "1") return;
                    onOpenCO?.(co);
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "64px minmax(0, 1fr) 90px 110px",
                    gap: 10,
                    alignItems: "center",
                    padding: "6px 8px",
                    borderRadius: 3,
                    cursor: "pointer",
                    background: "transparent",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span
                    data-proj="1"
                    onClick={(e) => { e.stopPropagation(); if (proj?.project_number && onOpenProject) onOpenProject(co.project_id); }}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", cursor: "pointer", whiteSpace: "nowrap" }}
                    title="Open project dashboard"
                  >
                    {proj.project_number || "—"}
                  </span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginRight: 6 }}>
                      {co.co_number || ""}
                    </span>
                    {co.title || co.description || "(untitled)"}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: bucketSpec.color,
                      textAlign: "center",
                      padding: "2px 6px",
                      borderRadius: 2,
                      background: `color-mix(in srgb, ${bucketSpec.color} 12%, transparent)`,
                    }}
                  >
                    {co.status}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {amt > 0 ? formatCurrency(amt).replace(/\.\d+/, "") : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
