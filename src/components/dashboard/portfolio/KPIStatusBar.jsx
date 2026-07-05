import React from "react";
import { formatCurrency } from "../../shared/formatters";
import { KPIBlock, MiniSparkline } from "../portfolioPrimitives";

/**
 * KPIStatusBar — the portfolio KPI strip: the featured Portfolio Value / Cash
 * at Risk / Forecast-at-Completion tiles, the Active Projects + Total Spend
 * blocks, and the five clickable filter tiles (each with a 7-day sparkline).
 * Extracted verbatim from PortfolioView. kpiFilter/setKpiFilter stay owned by
 * the container (they also drive displayMetrics + the health-table filter);
 * sparkFor comes from useLiveHealthSnapshot.
 */
export default function KPIStatusBar({ portfolioKPIs, projects, kpiFilter, setKpiFilter, sparkFor }) {
  return (
      <div
        className="sbd-card"
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--divider)",
          display: "flex",
          flexShrink: 0,
          flexWrap: "wrap",
          padding: 0,
        }}
      >
        {/* Portfolio Value — featured (wider, not filterable).
            Overflow-safe: value span is nowrap + tabular-nums so
            long currency strings don't wrap and line up tidily
            column-to-column. */}
        <div className="sbd-kpi" style={{
          padding: "12px 22px",
          borderRight: "1px solid var(--divider)",
          borderTop: "3px solid var(--accent)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minWidth: 220,
          overflow: "hidden",
        }}>
          <span className="sbd-kpi-label" style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--text-muted)", whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
            margin: 0,
          }}>
            Portfolio Value
          </span>
          <span
            title={formatCurrency(portfolioKPIs.portfolioValue)}
            className="sbd-kpi-value sbd-num"
            style={{
              fontFamily: "var(--font-mono)", fontSize: 24,
              fontWeight: 800, lineHeight: 1.1, color: "var(--accent)",
              whiteSpace: "nowrap", overflow: "hidden",
              textOverflow: "ellipsis",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatCurrency(portfolioKPIs.portfolioValue).replace(/\.\d+/, "")}
          </span>
        </div>

        {/* Cash at risk — featured (wider, not filterable). Complements
            the portfolio-value tile by answering "how much cash is exposed
            right now?" = pending CO value + over-budget exposure. Only
            rendered when there's actual exposure to surface — when the
            number is 0, the tile silently hides so it doesn't read as a
            fake metric. Tooltip breaks down the two components for exec
            scrutiny. Color flips to error when ≥5% of portfolio value. */}
        {portfolioKPIs.cashAtRisk > 0 && (
          <div
            title={[
              `Pending CO value: ${formatCurrency(portfolioKPIs.pendingCOValue).replace(/\.\d+/, "")}`,
              `Over-budget exposure: ${formatCurrency(portfolioKPIs.overBudgetExposure).replace(/\.\d+/, "")}`,
            ].join("\n")}
            className="sbd-kpi"
            style={{
              padding: "12px 22px",
              borderRight: "1px solid var(--divider)",
              borderTop: `3px solid ${
                portfolioKPIs.cashAtRisk > portfolioKPIs.portfolioValue * 0.05
                  ? "var(--status-error)"
                  : "var(--status-warning)"
              }`,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              minWidth: 220,
              overflow: "hidden",
            }}
          >
            <span className="sbd-kpi-label" style={{
              fontFamily: "var(--font-mono)", fontSize: 9,
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: "var(--text-muted)", whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis",
              margin: 0,
            }}>
              Cash at Risk
            </span>
            <span
              title={formatCurrency(portfolioKPIs.cashAtRisk)}
              className="sbd-kpi-value sbd-num"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 24,
                fontWeight: 800,
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontVariantNumeric: "tabular-nums",
                color: portfolioKPIs.cashAtRisk > portfolioKPIs.portfolioValue * 0.05
                  ? "var(--status-error)"
                  : "var(--status-warning)",
              }}
            >
              {formatCurrency(portfolioKPIs.cashAtRisk).replace(/\.\d+/, "")}
            </span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 8,
              color: "var(--text-muted)", letterSpacing: "0.06em",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {portfolioKPIs.pendingCOValue > 0 && portfolioKPIs.overBudgetExposure > 0
                ? "PENDING COs + OVERRUN"
                : portfolioKPIs.pendingCOValue > 0
                  ? "PENDING COs"
                  : "OVER BUDGET"}
            </span>
          </div>
        )}
        <KPIBlock label="Active Projects" value={projects.filter((p) => p.status === "Active" || !p.status).length} bordered color="var(--accent)" />
        <KPIBlock
          label="Total Spend"
          value={formatCurrency(portfolioKPIs.totalSpend).replace(/\.\d+/, "")}
          bordered
          color={portfolioKPIs.totalSpend > (portfolioKPIs.totalBudget || 0) ? "var(--status-error)" : "var(--status-success)"}
        />
        {/* Forecast at Completion (FAC) — portfolio-wide estimated final
            cost. Green when below budget (margin gain), red when above
            (margin fade). Sub-label surfaces the delta so the exec sees
            direction and magnitude without hovering. */}
        {portfolioKPIs.forecastAtCompletion > 0 && (
          <div
            title={[
              `Forecast at Completion: ${formatCurrency(portfolioKPIs.forecastAtCompletion)}`,
              `Total Budget: ${formatCurrency(portfolioKPIs.totalBudget)}`,
              `${portfolioKPIs.forecastVariance > 0 ? "Margin fade" : portfolioKPIs.forecastVariance < 0 ? "Margin gain" : "On budget"}: ${(portfolioKPIs.forecastVariance >= 0 ? "+" : "−")}${formatCurrency(Math.abs(portfolioKPIs.forecastVariance))}`,
              "",
              "FAC = Σ max(budget, actual + pending COs) across active projects",
            ].join("\n")}
            style={{
              padding: "12px 20px",
              borderRight: "1px solid var(--divider)",
              borderTop: `3px solid ${
                portfolioKPIs.forecastVariance > 0
                  ? "var(--status-error)"
                  : "var(--status-success)"
              }`,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              minWidth: 160,
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              Forecast at Completion
            </span>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 20,
              fontWeight: 800,
              lineHeight: 1,
              color: portfolioKPIs.forecastVariance > 0
                ? "var(--status-error)"
                : "var(--status-success)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {formatCurrency(portfolioKPIs.forecastAtCompletion).replace(/\.\d+/, "")}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
              {portfolioKPIs.forecastVariance === 0
                ? "ON BUDGET"
                : portfolioKPIs.forecastVariance > 0
                  ? `MARGIN FADE · ${formatCurrency(portfolioKPIs.forecastVariance).replace(/\.\d+/, "")}`
                  : `MARGIN GAIN · ${formatCurrency(Math.abs(portfolioKPIs.forecastVariance)).replace(/\.\d+/, "")}`}
            </span>
          </div>
        )}
        {/* Open RFIs — clickable filter with sparkline */}
        {[
          { key: "openRFIs",       label: "Open RFIs",       val: portfolioKPIs.openRFIs,       warn: portfolioKPIs.openRFIs > 3,       color: "var(--status-warning)", sparkField: "openRFIs" },
          { key: "overdueRFIs",    label: "Overdue RFIs",    val: portfolioKPIs.overdueRFIs,    warn: portfolioKPIs.overdueRFIs > 0,     color: "var(--status-error)",   sparkField: "overdueRFIs" },
          { key: "pendingCOs",     label: "Pending COs",     val: portfolioKPIs.pendingCOs,     warn: portfolioKPIs.pendingCOs > 0,      color: "var(--status-warning)", sparkField: "pendingCOs" },
          { key: "lateDeliveries", label: "Late Deliveries", val: portfolioKPIs.lateDeliveries, warn: portfolioKPIs.lateDeliveries > 0,  color: "var(--status-error)",   sparkField: "lateDeliveries" },
          { key: "atRisk",         label: "At Risk / Watch", val: portfolioKPIs.atRisk,         warn: portfolioKPIs.atRisk > 0,          color: "var(--status-error)",   sparkField: "atRisk" },
        ].map((tile, idx) => {
          const isActive = kpiFilter === tile.key;
          return (
            <div
              key={tile.key}
              onClick={() => setKpiFilter(isActive ? null : tile.key)}
              style={{
                padding: "10px 18px",
                borderRight: idx < 4 ? "1px solid var(--divider)" : "none",
                borderTop: `3px solid ${isActive || tile.warn ? tile.color : "transparent"}`,
                background: isActive
                  ? `color-mix(in srgb, ${tile.color} 14%, transparent)`
                  : tile.warn
                  ? `color-mix(in srgb, ${tile.color} 8%, transparent)`
                  : "transparent",
                display: "flex", flexDirection: "column", gap: 3,
                cursor: "pointer",
                boxShadow: isActive
                  ? `0 0 18px color-mix(in srgb, ${tile.color} 20%, transparent), 0 0 36px color-mix(in srgb, ${tile.color} 8%, transparent)`
                  : "none",
                transition: "box-shadow 0.2s, border-top 0.2s, background 0.2s",
                // Bumped from 100px to 140px — the sparkline + 2-digit
                // count previously squeezed against the label and
                // clipped on denser layouts. Also adds overflow:hidden
                // so the label chip never pokes into the next tile.
                minWidth: 140,
                overflow: "hidden",
                position: "relative",
              }}
            >
              {isActive && (
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 10,
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: tile.color,
                    boxShadow: `0 0 6px ${tile.color}`,
                  }}
                />
              )}
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: isActive ? tile.color : tile.warn ? tile.color : "var(--text-muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {tile.label}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 20,
                  fontWeight: 800, lineHeight: 1.1,
                  color: tile.warn ? tile.color : "var(--status-success)",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}>
                  {tile.val}
                </span>
                <MiniSparkline data={sparkFor(tile.sparkField)} color={tile.warn ? tile.color : "var(--text-muted)"} />
              </div>
            </div>
          );
        })}
      </div>
  );
}
