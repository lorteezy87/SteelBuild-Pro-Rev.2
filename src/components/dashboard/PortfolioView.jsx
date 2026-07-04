import React, { useMemo, useState, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { formatCurrency } from "../shared/formatters";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { formatLocalDate } from "@/utils/dates";
import {
  computeCoExposure, summarizeSchedulesByProject, computeTotalTons,
  computeFabricatedTonnage, computeDeliveriesStats, computeRfiTurnaround,
  computeDataIssues, computeFinancials, computeProductionData,
  computeProjectMap, computeProjectMetrics, enrichProjectMetrics, computeBudgetChartData,
  computePortfolioKPIs, computePccData,
  applyMetricsView, selectWatchlist,
  computeTodayLabel,
} from "./portfolioDerive";
import { Button } from "@/components/design-system";
import { MiniSparkline, Card, HeaderBar, KPIBlock } from "./portfolioPrimitives";
import DeliveryRail from "./DeliveryRail";
import CoExposurePanel from "./CoExposurePanel";
import { useLiveHealthSnapshot } from "./useLiveHealthSnapshot";
import ProjectHealthRow from "./portfolio/ProjectHealthRow";
import PriorityColumn from "./portfolio/PriorityColumn";
import WaitingOnColumn from "./portfolio/WaitingOnColumn";
import RiskWatchColumn from "./portfolio/RiskWatchColumn";
import SidebarHealthGauge from "./portfolio/SidebarHealthGauge";

// Lazy-load the only recharts visual on this route so the ~600 kB
// vendor-charts chunk is fetched on demand (when the Financial Control
// panel renders) instead of eagerly blocking the portfolio landing.
const PortfolioBudgetChart = lazyWithRetry(() => import("./PortfolioBudgetChart"));

export default function PortfolioView({
  projects = [],
  allRFIs = [],
  allCOs = [],
  allCodes = [],
  allWPs = [],
  allDeliveries = [],
  allActionItems = [],
  allExpenses = [],
  allScheduleTasks = [],
}) {
  // ── CO Exposure breakdown ─────────────────────────────────────────
  //
  // Splits every CO into four trust buckets so a PM can answer "how
  // much of this is committed, how much is at risk, and how much is
  // still unknown?" without opening ChangeOrders.
  //
  //   - approved : status=Approved — already committed, hardens the
  //                final contract number
  //   - pending  : Draft / Submitted / Under Review with a priced
  //                co_amount — will likely hit the budget soon
  //   - unpriced : Submitted / Under Review with co_amount = 0 or null
  //                (owner hasn't priced the scope yet — unknown spend)
  //   - disputed : Rejected with co_amount > 0 still on the table
  //                (often re-negotiated; counts toward exposure until
  //                Void'd)
  //
  // Void COs are excluded entirely — they're dead. `cost_impact_amount`
  // is the legacy pre-migration field; we still honour it so older
  // rows don't disappear.
  const coExposure = useMemo(() => computeCoExposure(allCOs), [allCOs]);

  // Per-project schedule summary → keyed by project_id so each row can
  // look its own up in O(1). Recomputed when schedule_tasks change.
  const projectScheduleSummaries = useMemo(() => summarizeSchedulesByProject(allScheduleTasks), [allScheduleTasks]);
  const navigate = useNavigate();
  const { setActiveProject } = useProjectContext();
  const [sortMode, setSortMode] = useState("health");
  const [kpiFilter, setKpiFilter] = useState(null);

  /**
   * Open the single-project dashboard for a given project id.
   *
   * The legacy code pointed these clicks at `/ProjectDashboard?project=X`,
   * but there is no standalone `/ProjectDashboard` route — the single-
   * project dashboard is rendered by `Dashboard.jsx` when an active
   * project is set via `useProjectContext`. Attempting to navigate
   * there directly 404'd. This helper selects the project in context,
   * then routes to `/Dashboard`.
   */
  const openProjectDashboard = (projectId) => {
    if (!projectId) return;
    const proj = (projects || []).find((p) => p.id === projectId);
    if (proj) setActiveProject(proj);
    navigate("/Dashboard");
  };

  const projectMap = useMemo(() => computeProjectMap(projects), [projects]);
  const today = useMemo(() => computeTodayLabel(), []);

  const projectMetrics = useMemo(
    () => computeProjectMetrics(projects, allRFIs, allCOs, allCodes, allWPs, allDeliveries, allExpenses),
    [projects, allRFIs, allCOs, allCodes, allWPs, allDeliveries, allExpenses],
  );

  const enrichedMetrics = useMemo(() => enrichProjectMetrics(projectMetrics), [projectMetrics]);

  const displayMetrics = useMemo(
    () => applyMetricsView(enrichedMetrics, { sortMode, kpiFilter, allDeliveries }),
    [enrichedMetrics, sortMode, kpiFilter, allDeliveries],
  );

  const portfolioKPIs = useMemo(
    () => computePortfolioKPIs(projects, allRFIs, allCOs, allCodes, allWPs, allExpenses, allDeliveries, enrichedMetrics),
    [projects, allRFIs, allCOs, allCodes, allWPs, allExpenses, allDeliveries, enrichedMetrics],
  );

  // ── Sparkline history: 7-day KPI snapshots persisted once per day (localStorage) ──
  const { sparkFor } = useLiveHealthSnapshot(portfolioKPIs);

  const budgetChartData = useMemo(() => computeBudgetChartData(projectMetrics), [projectMetrics]);

  // ── PCC: Priority Command Center data ──────────────────────────────────────
  const pccData = useMemo(
    () => computePccData(allRFIs, allActionItems, allDeliveries, allCOs, projectMap, enrichedMetrics),
    [allRFIs, allActionItems, allDeliveries, allCOs, projectMap, enrichedMetrics],
  );

  const totalTons = useMemo(() => computeTotalTons(allWPs), [allWPs]);
  const fabricatedTonnage = useMemo(() => computeFabricatedTonnage(allWPs), [allWPs]);
  const deliveriesStats = useMemo(() => computeDeliveriesStats(allDeliveries), [allDeliveries]);
  const rfiTurnaround = useMemo(() => computeRfiTurnaround(allRFIs), [allRFIs]);

  // ── Data completeness scoring ──────────────────────────────────────────────
  const dataIssues = useMemo(() => computeDataIssues(enrichedMetrics, allRFIs, allCOs), [enrichedMetrics, allRFIs, allCOs]);

  // ── Financial control layer — CO pipeline + margin at risk ────────────────
  const financials = useMemo(() => computeFinancials(allCOs, portfolioKPIs), [allCOs, portfolioKPIs]);

  // ── Production readiness per project ──────────────────────────────────────
  const productionData = useMemo(() => computeProductionData(enrichedMetrics, allWPs), [enrichedMetrics, allWPs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 92px)", background: "var(--bg-page)" }}>
      {/* Brand Header */}
      <div
        style={{
          background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-low) 78%, #000 22%) 0%, color-mix(in srgb, var(--bg-surface) 94%, #000 6%) 100%)",
          borderBottom: "1px solid var(--divider)",
          padding: "22px 24px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          boxShadow: "0 14px 34px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
            <rect x="4" y="4" width="28" height="5" rx="1" fill="var(--accent)" />
            <rect x="15" y="9" width="6" height="18" rx="0" fill="var(--accent)" />
            <rect x="4" y="27" width="28" height="5" rx="1" fill="var(--accent)" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span
              style={{
                fontFamily: "Space Grotesk, var(--font-display)",
                fontWeight: 800,
                fontSize: 22,
                letterSpacing: "-0.02em",
                color: "var(--text-primary)",
                textTransform: "uppercase",
              }}
            >
              SteelBuild Pro
            </span>
            <span
              style={{
                fontFamily: "IBM Plex Mono, var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Structural Steel Construction Management — S&H Steel
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              fontFamily: "IBM Plex Mono, var(--font-mono)",
              fontSize: 10,
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {today.replace(/,/g, " ·")}
          </div>
          <Button variant="primary" icon="plus" onClick={() => navigate("/Projects")}>
            New Project
          </Button>
        </div>
      </div>

      {/* ── Priority Watchlist — surfaces the top 3 projects in worst health,
           each with a 1-line "what's wrong" narrative. Click-to-drill opens
           that project's dashboard. When every project is On Track we show an
           all-clear state so the slot doesn't collapse and feel like a bug.
           Consumes enrichedMetrics, which already carries healthScore +
           healthReasons, so zero extra computation. */}
      {(() => {
        const sorted = selectWatchlist(enrichedMetrics);
        const hasRisks = sorted.length > 0;
        return (
          <div
            style={{
              background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-low) 72%, #000 28%) 0%, color-mix(in srgb, var(--bg-surface) 96%, #000 4%) 100%)",
              borderBottom: "1px solid var(--divider)",
              padding: "14px 24px",
              display: "flex",
              alignItems: "stretch",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 160 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: hasRisks ? "var(--status-error)" : "var(--status-success)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                {hasRisks ? "Priority Watchlist" : "All Clear"}
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginTop: 2, lineHeight: 1.25 }}>
                {hasRisks ? "Top projects needing your attention" : "No projects flagged this hour"}
              </div>
            </div>
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${Math.max(sorted.length, 1)}, minmax(0, 1fr))`, gap: 10 }}>
              {hasRisks ? sorted.map((p) => {
                const sev = p.effectiveHealth === "At Risk" ? "error" : p.effectiveHealth === "Watch" ? "warning" : "info";
                const sevColor = sev === "error" ? "var(--status-error)" : sev === "warning" ? "var(--status-warning)" : "var(--status-info)";
                const reasons = (p.healthReasons || []).slice(0, 2);
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${p.name || p.project_name || "project"} dashboard — ${p.effectiveHealth}`}
                    onClick={() => openProjectDashboard(p.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProjectDashboard(p.id); } }}
                    className="sbd-card sbd-card-hover"
                    style={{
                      background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-high) 76%, #000 24%) 0%, var(--bg-surface) 100%)",
                      border: `1px solid var(--border-default)`,
                      borderLeft: `3px solid ${sevColor}`,
                      borderRadius: 14,
                      padding: "10px 12px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      transition: "border-color 0.12s, transform 0.12s, box-shadow 0.12s",
                      boxShadow: "0 10px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 16px 30px rgba(0,0,0,0.24), 0 0 20px color-mix(in srgb, var(--accent) 12%, transparent), inset 0 1px 0 rgba(255,255,255,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-default)";
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "0 10px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.06em" }}>
                        {p.project_number || "—"}
                      </span>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {p.name || p.project_name || "—"}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 3, background: `color-mix(in srgb, ${sevColor} 14%, transparent)`, color: sevColor, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                        {p.effectiveHealth}
                      </span>
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4, overflow: "hidden" }}>
                      {reasons.length > 0 ? reasons.join(" · ") : "No specific signals available"}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                        Health {p.healthScore ?? "—"}/100
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.06em" }}>
                        Open →
                      </span>
                    </div>
                  </div>
                );
              }) : (
                <div
                  style={{
                    background: "var(--success-muted)",
                    border: "1px solid var(--success-border)",
                    borderRadius: 4,
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--status-success)" }}>✓</span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)" }}>
                    Every project is tracking on schedule. Keep an eye on pending COs and long-lead deliveries to stay ahead.
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Status Bar — all tiles are clickable filters with sparklines */}
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

      {/* Stale RFI Bottleneck Alert — open RFIs >30 days old */}
      {portfolioKPIs.staleRFIs30 && portfolioKPIs.staleRFIs30.length > 0 && (
        <div
          role="button"
          tabIndex={0}
          aria-label={`${portfolioKPIs.staleRFIs30.length} stale RFIs open more than 30 days — click to review`}
          onClick={() => navigate(createPageUrl("RFIs"))}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(createPageUrl("RFIs")); } }}
          style={{
            background: "rgba(248,81,73,0.10)",
            borderBottom: "2px solid var(--status-error)",
            padding: "8px 24px", display: "flex", alignItems: "center", gap: 14, flexShrink: 0, cursor: "pointer",
          }}
          title="RFIs that have been open for more than 30 days — these are the highest schedule-risk bottlenecks"
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, color: "var(--status-error)", letterSpacing: "0.12em", flexShrink: 0, background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 3, padding: "2px 8px" }}>
            BOTTLENECK · 30+ DAYS
          </span>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
            {portfolioKPIs.staleRFIs30.length} RFI{portfolioKPIs.staleRFIs30.length !== 1 ? "s" : ""} open more than 30 days — schedule-impact risk
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>
            {portfolioKPIs.staleRFIs30.slice(0, 3).map(r => r.rfi_number || r.title?.slice(0, 20)).filter(Boolean).join(" · ")}
            {portfolioKPIs.staleRFIs30.length > 3 ? ` · +${portfolioKPIs.staleRFIs30.length - 3} more` : ""}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--accent)", background: "var(--accent-muted)", border: "1px solid var(--accent-border)", borderRadius: 3, padding: "2px 8px", flexShrink: 0 }}>
            REVIEW →
          </span>
        </div>
      )}

      {/* PCC Alert Strip — top priority only */}
      {pccData.priorities.length > 0 && (
        <div style={{
          background: pccData.priorities[0]?.severity === "critical" ? "rgba(248,81,73,0.12)" : "rgba(227,179,65,0.08)",
          borderBottom: `2px solid ${pccData.priorities[0]?.severity === "critical" ? "var(--status-error)" : "var(--status-warning)"}`,
          padding: "8px 24px", display: "flex", alignItems: "center", gap: 16, flexShrink: 0,
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, color: "var(--status-error)", letterSpacing: "0.12em", flexShrink: 0 }}>
            #1 PRIORITY
          </span>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
            {pccData.priorities[0].title}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
            {pccData.priorities[0].project}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--accent)", background: "var(--accent-muted)", border: "1px solid var(--accent-border)", borderRadius: 3, padding: "2px 8px", flexShrink: 0 }}>
            {pccData.priorities[0].action}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginLeft: "auto", flexShrink: 0 }}>
            Owner: <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{pccData.priorities[0].owner}</span>
          </span>
          {pccData.priorities[0].days > 0 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, color: "var(--status-error)", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 3, padding: "2px 8px", flexShrink: 0 }}>
              {pccData.priorities[0].days}D OVERDUE
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", flex: 1, alignItems: "flex-start", overflow: "visible" }}>
      {/* Main content area */}
      <div
        style={{
          padding: "20px 24px",
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 16,
          flex: 1,
          overflowY: "visible",
          background: "var(--bg-page)",
          alignContent: "start",
        }}
      >
        {/* ── 30-Day Delivery Rail — upcoming deliveries bucketed by day across
             the whole portfolio. Answers "what's hitting site this month?" at
             a glance. Click a day with deliveries → popover listing each PO
             with a deep link. Intentionally lives ABOVE the project grid so
             the first thing a PM sees (after the tiles + watchlist) is the
             time axis of physical arrivals, not a table of health. */}
        <ErrorBoundary label="30-Day Delivery Rail">
          <DeliveryRail
            deliveries={allDeliveries}
            projectMap={projectMap}
            onOpenDelivery={(d) => navigate(`${createPageUrl("Deliveries")}?project=${d.project_id}&id=${d.id}`)}
            onOpenProject={openProjectDashboard}
          />
        </ErrorBoundary>

        {/* ── CO Exposure — four-bucket breakdown of every change order
             across the portfolio. Answers "how much is committed vs at
             risk vs unknown?" in one glance. Each tile is click-through
             to the Change Orders page, filtered to that bucket. Driven
             by the coExposure memo above. */}
        <ErrorBoundary label="CO Exposure">
          <CoExposurePanel
            data={coExposure}
            projectMap={projectMap}
            onOpenCO={(co) => navigate(`${createPageUrl("ChangeOrders")}?project=${co.project_id}`)}
            onOpenProject={openProjectDashboard}
          />
        </ErrorBoundary>

        {/* Project Health Table */}
        <ErrorBoundary label="Project Health Overview">
        <Card style={{ gridColumn: "span 12" }}>
          <HeaderBar
            title="Project Health Overview"
            count={displayMetrics.length}
            right={
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {[
                  { key: "health", label: "Default" },
                  { key: "rfi", label: "Most RFIs" },
                  { key: "deadline", label: "Soonest Deadline" },
                ].map((opt) => (
                  <Button
                    key={opt.key}
                    onClick={() => setSortMode(opt.key)}
                    variant={sortMode === opt.key ? "primary" : "secondary"}
                    size="sm"
                  >
                    {opt.label}
                  </Button>
                ))}
                {kpiFilter && (
                  <Button onClick={() => setKpiFilter(null)} variant="danger" size="sm">
                    Clear Filter ✕
                  </Button>
                )}
                <Button onClick={() => navigate("/Projects")} variant="secondary" size="sm">
                  Manage Projects →
                </Button>
              </div>
            }
          />
          {/* Project Health Overview scroll wrapper
           *
           * Keeps horizontal scrolling for the 14-column table on narrow
           * screens. The vertical bound is now viewport-proportional
           * (`min(980px, 78vh)`) so a 15-project portfolio shows roughly
           * 12-14 rows at a glance on a 1080p monitor — up from the old
           * 520px hard cap that only surfaced 6-7 rows. The outer grid
           * scroll still catches anything past the card height, so no
           * data is hidden, it just flows past the fold. */}
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "min(980px, 78vh)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-low) 74%, #000 26%) 0%, color-mix(in srgb, var(--bg-surface) 96%, #000 4%) 100%)" }}>
                  {["#", "Project", "Phase", "Timeline", "Health", "Budget", "Actual", "Variance", "Proj. Margin", "Open RFIs", "Overdue RFIs", "WP Progress", "Pending COs", "Tonnage", ""].map((h, idx) => (
                    <th
                      key={idx}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: "var(--text-muted)",
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        padding: "10px 8px",
                        textAlign: idx <= 2 ? "left" : "center",
                        whiteSpace: "nowrap",
                        position: "sticky",
                        top: 0,
                        background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-low) 74%, #000 26%) 0%, color-mix(in srgb, var(--bg-surface) 96%, #000 4%) 100%)",
                        zIndex: 2,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayMetrics.map((p, i) => (
                  <ProjectHealthRow
                    key={p.id}
                    p={p}
                    i={i}
                    projectScheduleSummaries={projectScheduleSummaries}
                    openProjectDashboard={openProjectDashboard}
                    navigate={navigate}
                  />
                ))}
                {displayMetrics.length === 0 && (
                  <tr>
                    <td colSpan={15} style={{ textAlign: "center", padding: 28, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexDirection: "column" }}>
                        {kpiFilter ? (
                          <>
                            No projects match the active filter.
                            <button
                              onClick={() => setKpiFilter(null)}
                              style={{
                                background: "var(--bg-surface)",
                                color: "var(--accent)",
                                borderRadius: "var(--radius-btn)",
                                border: "1px solid var(--accent-border)",
                                fontFamily: "var(--font-mono)",
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "6px 12px",
                                letterSpacing: "0.08em",
                                cursor: "pointer",
                              }}
                            >
                              Clear Filter
                            </button>
                          </>
                        ) : (
                          <>
                            <svg width="48" height="48" viewBox="0 0 36 36" aria-hidden style={{ opacity: 0.15 }}>
                              <rect x="4" y="4" width="28" height="5" rx="1" fill="var(--text-muted)" />
                              <rect x="15" y="9" width="6" height="18" rx="0" fill="var(--text-muted)" />
                              <rect x="4" y="27" width="28" height="5" rx="1" fill="var(--text-muted)" />
                            </svg>
                            NO ACTIVE PROJECTS — Add a project to begin tracking
                            <button
                              onClick={() => navigate("/Projects")}
                              style={{
                                background: "var(--accent)",
                                color: "var(--accent-text)",
                                borderRadius: "var(--radius-btn)",
                                border: "1px solid var(--accent-border)",
                                fontFamily: "var(--font-mono)",
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "6px 12px",
                                letterSpacing: "0.08em",
                                cursor: "pointer",
                              }}
                            >
                              + New Project
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        </ErrorBoundary>
        {/* ═══ FINANCIAL CONTROL LAYER ═══ */}
        <ErrorBoundary label="Financial Control">
        <Card style={{ gridColumn: "span 8" }}>
          <HeaderBar title="Financial Control" right={
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em" }} title="Budget from Cost Codes · Actual from Paid Expenses · COs from Change Orders">
              SOURCE: COST CODES + EXPENSES + COs
            </span>
          } />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {/* Left: Budget vs Actual chart */}
            {/* Budget vs Actual — chart height scales per-project and
             * bars are now thicker (14px vs 10px) so the legend is
             * readable on a tablet. Per-row spacing bumped to 44px so
             * the two bars per project (Budget + Actual) aren't
             * stacked on top of each other. */}
            <div style={{ padding: "12px 16px", borderRight: "1px solid var(--divider)", height: budgetChartData.some((d) => d.Budget > 0 || d.Actual > 0) ? Math.max(320, budgetChartData.length * 44 + 56) : 320 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.10em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>Budget vs Actual</div>
              {budgetChartData.some((d) => d.Budget > 0 || d.Actual > 0) ? (
                <Suspense fallback={
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "90%", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                    LOADING CHART…
                  </div>
                }>
                  <PortfolioBudgetChart data={budgetChartData} />
                </Suspense>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "80%", gap: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--status-warning)", fontWeight: 600 }}>NO FINANCIAL DATA</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center", maxWidth: 240, lineHeight: 1.5 }}>
                    Set up cost codes and enter expenses to enable financial tracking and cost control.
                  </div>
                  <Button onClick={() => navigate("/Projects")} variant="primary" size="sm">
                    Set Up Cost Codes
                  </Button>
                </div>
              )}
            </div>
            {/* Right: CO Pipeline + Financial KPIs */}
            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.10em", color: "var(--text-muted)", textTransform: "uppercase" }}>Change Order Pipeline</div>
              {/* CO Status buckets */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {[
                  { label: "Approved", count: financials.approvedCOs, value: financials.approvedValue, color: "var(--status-success)" },
                  { label: "Pending", count: financials.pendingCOs, value: financials.pendingValue, color: "var(--status-warning)" },
                  { label: "Rejected", count: financials.rejectedCOs, value: financials.rejectedValue, color: "var(--status-error)" },
                ].map((b) => (
                  <div key={b.label} style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${b.color} 12%, var(--bg-surface-high)) 0%, color-mix(in srgb, ${b.color} 4%, var(--bg-surface)) 100%)`, border: `1px solid color-mix(in srgb, ${b.color} 34%, var(--border-default) 66%)`, borderRadius: 14, padding: "10px 10px 9px", textAlign: "center", boxShadow: "0 12px 24px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.10em", color: b.color, textTransform: "uppercase" }}>{b.label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 800, color: b.color }}>{b.count}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{formatCurrency(b.value).replace(/\.\d+/, "")}</div>
                  </div>
                ))}
              </div>
              {/* Financial KPIs */}
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {[
                  { label: "Total Budget", value: formatCurrency(financials.totalBudget).replace(/\.\d+/, ""), color: "var(--text-primary)", tip: "Sum of all cost code budgets" },
                  { label: "Total Spend", value: formatCurrency(financials.totalSpend).replace(/\.\d+/, ""), color: financials.totalSpend > financials.totalBudget ? "var(--status-error)" : "var(--text-primary)", tip: "Sum of paid expenses" },
                  { label: "Remaining", value: formatCurrency(Math.max(0, financials.remaining)).replace(/\.\d+/, ""), color: financials.remaining < 0 ? "var(--status-error)" : "var(--status-success)", tip: "Budget minus spend" },
                  { label: "CO Exposure (Pending)", value: formatCurrency(financials.pendingValue).replace(/\.\d+/, ""), color: financials.pendingValue > 0 ? "var(--status-warning)" : "var(--text-muted)", tip: "Total value of pending change orders — at risk if rejected" },
                  { label: "Margin at Risk", value: formatCurrency(financials.marginAtRisk).replace(/\.\d+/, ""), color: financials.marginAtRisk > 0 ? "var(--status-error)" : "var(--status-success)", tip: "Pending CO value + any over-budget amount" },
                ].map((m) => (
                  <div key={m.label} title={m.tip} style={{ display: "flex", justifyContent: "space-between", padding: "5px 8px", borderBottom: "1px solid var(--divider)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>{m.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: m.color }}>{m.value}</span>
                  </div>
                ))}
              </div>
              {financials.marginAtRisk > 0 && (
                <div style={{ borderLeft: "3px solid var(--status-error)", background: "var(--danger-muted)", borderRadius: "0 4px 4px 0", padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", fontWeight: 600 }}>
                  {formatCurrency(financials.pendingValue).replace(/\.\d+/, "")} at risk unless {financials.pendingCOs} pending CO{financials.pendingCOs !== 1 ? "s" : ""} approved
                </div>
              )}
            </div>
          </div>
        </Card>
        </ErrorBoundary>

        {/* Data Issues Panel */}
        <ErrorBoundary label="Data Issues">
        <Card style={{ gridColumn: "span 4" }}>
          <HeaderBar title="Data Issues" count={dataIssues.length} right={
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: dataIssues.length > 0 ? "var(--status-warning)" : "var(--status-success)", letterSpacing: "0.08em" }}>
              {dataIssues.length > 0 ? "ACTION NEEDED" : "ALL COMPLETE"}
            </span>
          } />
          {/* Data Issues — relaxed cap so up to ~8 issues are visible
           * before internal scrolling kicks in (was 300px → ~3 items). */}
          <div style={{ padding: "10px 12px", maxHeight: "min(600px, 62vh)", overflowY: "auto" }}>
            {dataIssues.length === 0 ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-success)", fontWeight: 700, padding: 16, textAlign: "center" }}>
                ALL DATA COMPLETE
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", fontWeight: 400, marginTop: 4 }}>
                  Every project has budget, phase, and contract value configured.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {dataIssues.map((issue, i) => (
                  <div key={i} style={{ borderLeft: `3px solid ${issue.severity === "high" ? "var(--status-warning)" : "var(--text-muted)"}`, background: issue.severity === "high" ? "var(--warning-muted)" : "transparent", borderRadius: "0 3px 3px 0", padding: "5px 8px", cursor: issue.projectId ? "pointer" : "default" }}
                    onClick={() => openProjectDashboard(issue.projectId)}>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-primary)", fontWeight: 500 }}>{issue.project}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{issue.issue}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", background: "var(--accent-muted)", borderRadius: 2, padding: "1px 5px", fontWeight: 600 }}>{issue.fix}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
        </ErrorBoundary>

        {/* ═══ PRODUCTION & ERECTION READINESS ═══ */}
        <ErrorBoundary label="Production & Readiness">
        <Card style={{ gridColumn: "span 12" }}>
          <HeaderBar title="Production & Erection Readiness" right={
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em" }} title="Fab status from Work Packages · Constraints from RFIs + Deliveries + WP status">
              SOURCE: WORK PACKAGES + RFIs + DELIVERIES
            </span>
          } />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-low) 74%, #000 26%) 0%, color-mix(in srgb, var(--bg-surface) 96%, #000 4%) 100%)" }}>
                  {["Project", "WPs", "In Fab", "Complete", "On Hold", "Fab %", "Tonnage", "Erection Ready", "Constraints"].map((h) => (
                    <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", padding: "10px 8px", textAlign: h === "Constraints" ? "left" : "center", whiteSpace: "nowrap", position: "sticky", top: 0, background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-low) 74%, #000 26%) 0%, color-mix(in srgb, var(--bg-surface) 96%, #000 4%) 100%)", zIndex: 1 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productionData.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--divider)", cursor: "pointer" }}
                    onClick={() => openProjectDashboard(p.id)}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "6px 8px", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>
                      {p.name || p.project_number}
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{p.project_number}</div>
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{p.wpTotal}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--status-warning)" }}>{p.inFabCount}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--status-success)" }}>{p.completeCount}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: p.onHoldCount > 0 ? "var(--status-error)" : "var(--text-muted)" }}>{p.onHoldCount}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                        <div style={{ width: 50, height: 6, background: "var(--border-default)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${p.fabPct}%`, background: p.fabPct >= 80 ? "var(--status-success)" : p.fabPct >= 50 ? "var(--accent)" : "var(--status-warning)", borderRadius: 3, transition: "width 0.3s" }} />
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: p.fabPct >= 80 ? "var(--status-success)" : "var(--text-secondary)" }}>{p.fabPct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }} title={`${p.fabTon}T fabricated of ${p.totalTon}T total`}>
                      {p.totalTon > 0 ? <span>{p.fabTon}T / <span style={{ color: "var(--text-muted)" }}>{p.totalTon}T</span></span> : <span style={{ fontSize: 8, color: "var(--text-muted)" }}>0T</span>}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      {p.erectionReady ? (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--status-success)", background: "var(--success-muted)", border: "1px solid var(--success-border)", borderRadius: 3, padding: "2px 8px" }}>READY</span>
                      ) : (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--status-error)", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 3, padding: "2px 8px" }}>BLOCKED</span>
                      )}
                    </td>
                    <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", maxWidth: 200 }}>
                      {p.constraints.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {p.constraints.map((c, ci) => (
                            <span key={ci} style={{ color: "var(--status-error)", fontSize: 8 }}>{c}</span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "var(--status-success)", fontSize: 8 }}>No constraints</span>
                      )}
                    </td>
                  </tr>
                ))}
                {productionData.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: "center", padding: 24, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>No work packages created — add work packages to track production</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        </ErrorBoundary>

    {/* ═══ PRIORITY COMMAND CENTER ═══ */}
    <ErrorBoundary label="Priority Command Center">
    <Card style={{ gridColumn: "span 12" }}>
      <HeaderBar title="Priority Command Center" count={pccData.priorities.length + pccData.waitingOn.length}
        right={<span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em" }}>DETERMINISTIC · RANKED BY SIGNAL SEVERITY</span>}
      />
      {/* Priority Command Center — min-height bumped so the three
       * columns read as a substantial surface even when only 1-2 items
       * are present per column, and so there's always room for the
       * column header + 2-3 items without feeling cramped. */}
      <div style={{ display: "grid", gridTemplateColumns: "5fr 4fr 3fr", gap: 0, minHeight: 320, background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-high) 68%, #000 32%) 0%, color-mix(in srgb, var(--bg-surface) 96%, #000 4%) 100%)" }}>

        {/* Column 1: TODAY'S PRIORITIES */}
        <PriorityColumn priorities={pccData.priorities} rfiTurnaround={rfiTurnaround} navigate={navigate} />

        {/* Column 2: WAITING ON */}
        <WaitingOnColumn waitingOn={pccData.waitingOn} navigate={navigate} />

        {/* Column 3: RISK WATCHLIST */}
        <RiskWatchColumn riskWatch={pccData.riskWatch} openProjectDashboard={openProjectDashboard} />
      </div>
    </Card>
    </ErrorBoundary>
  </div>

      {/* ── Contextual Insights Sidebar ─────────────────────────────────────── */}
      <div
        style={{
          width: 280,
          flexShrink: 0,
          alignSelf: "stretch",
          position: "sticky",
          top: 0,
          maxHeight: "calc(100vh - 92px)",
          background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-low) 78%, #000 22%) 0%, color-mix(in srgb, var(--bg-surface) 92%, #000 8%) 100%)",
          borderLeft: "1px solid var(--divider)",
          overflowY: "auto",
          padding: "18px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "inset 1px 0 0 rgba(255,255,255,0.03)",
        }}
      >
        {/* Portfolio Health Gauge */}
        <SidebarHealthGauge enrichedMetrics={enrichedMetrics} />

        {/* Key Metrics */}
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 3, height: 12, background: "var(--accent)", borderRadius: 1 }} />
            Key Metrics
          </div>
          {[
            { label: "Avg RFI Turnaround", value: rfiTurnaround ? `${rfiTurnaround}d` : "N/A", color: rfiTurnaround && Number(rfiTurnaround) > 14 ? "var(--status-warning)" : "var(--accent)" },
            { label: "Active Work Packages", value: portfolioKPIs.activeWPs, color: "var(--status-info)" },
            { label: "Total Tonnage", value: `${totalTons.toFixed(0)}T`, color: "var(--accent)" },
            { label: "Fab Complete", value: totalTons > 0 ? `${Math.round((fabricatedTonnage / totalTons) * 100)}%` : "0%", color: "var(--status-success)" },
            { label: "Portfolio Burn", value: portfolioKPIs.totalBudget > 0 ? `${Math.round((portfolioKPIs.totalSpend / portfolioKPIs.totalBudget) * 100)}%` : "—", color: portfolioKPIs.totalSpend > portfolioKPIs.totalBudget ? "var(--status-error)" : "var(--text-secondary)" },
          ].map((m) => (
            <div key={m.label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 8px", borderBottom: "1px solid var(--divider)",
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>{m.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: m.color }}>{m.value}</span>
            </div>
          ))}
        </div>

        {/* Next Delivery */}
        {deliveriesStats.nextDelivery && (
          <div style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)", borderRadius: "var(--radius-card)", padding: "10px 12px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>Next Delivery</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>{deliveriesStats.nextDelivery.description || deliveriesStats.nextDelivery.vendor || "—"}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)" }}>{projectMap[deliveriesStats.nextDelivery.project_id] || "—"}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)", marginTop: 4 }}>{formatLocalDate(deliveriesStats.nextDelivery.scheduled_date, "en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
          </div>
        )}

        {/* Health Score Breakdown — what's driving the numbers */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 3, height: 12, background: "var(--status-info)", borderRadius: 1 }} />
            How Health is Scored
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", lineHeight: 1.5, padding: "10px 10px", background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-high) 70%, #000 30%) 0%, var(--bg-surface) 100%)", border: "1px solid var(--border-default)", borderRadius: 14, boxShadow: "0 12px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
            <div style={{ marginBottom: 4, color: "var(--text-secondary)", fontWeight: 600 }}>Score = weighted average (0–100)</div>
            {[
              { label: "RFI Health", weight: "30%", desc: "Overdue ratio, open backlog" },
              { label: "Budget Health", weight: "25%", desc: "Burn rate vs budget" },
              { label: "Delivery", weight: "25%", desc: "Late deliveries count" },
              { label: "Production", weight: "20%", desc: "Stalled WPs, progress" },
            ].map((f) => (
              <div key={f.label} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--divider)", padding: "3px 0" }}>
                <span>{f.label} <span style={{ color: "var(--accent)" }}>({f.weight})</span></span>
              </div>
            ))}
            <div style={{ marginTop: 6, fontSize: 9, color: "var(--text-muted)" }}>
              75+ = On Track · 50–74 = Watch · 49- = At Risk
              <br />Missing budget data penalizes score (70/100)
            </div>
          </div>
        </div>

        {/* Delivery stats */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 3, height: 12, background: "var(--accent)", borderRadius: 1 }} />
            Delivery Status
          </div>
          {[
            { label: "Scheduled", value: deliveriesStats.scheduled, color: "var(--accent)" },
            { label: "In Transit", value: deliveriesStats.inTransit, color: "var(--status-info)" },
            { label: "Late", value: deliveriesStats.late, color: deliveriesStats.late > 0 ? "var(--status-error)" : "var(--text-muted)" },
          ].map((r) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: 10, borderBottom: "1px solid var(--divider)", background: "color-mix(in srgb, var(--bg-surface) 92%, #000 8%)", borderRadius: 10 }}>
              <span style={{ color: "var(--text-secondary)" }}>{r.label}</span>
              <span style={{ fontWeight: 700, color: r.color }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
      {/* End sidebar */}
      </div>
      {/* End flex wrapper */}
</div>
);
}
