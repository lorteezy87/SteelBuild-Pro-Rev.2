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
  applyMetricsView,
  computeTodayLabel,
} from "./portfolioDerive";
import { Button } from "@/components/design-system";
import { Card, HeaderBar } from "./portfolioPrimitives";
import DeliveryRail from "./DeliveryRail";
import CoExposurePanel from "./CoExposurePanel";
import { useLiveHealthSnapshot } from "./useLiveHealthSnapshot";
import PortfolioHeader from "./PortfolioHeader";
import PortfolioProjectTable from "./PortfolioProjectTable";
import PriorityColumn from "./portfolio/PriorityColumn";
import WaitingOnColumn from "./portfolio/WaitingOnColumn";
import RiskWatchColumn from "./portfolio/RiskWatchColumn";
import SidebarHealthGauge from "./portfolio/SidebarHealthGauge";
import KPIStatusBar from "./portfolio/KPIStatusBar";

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
      <PortfolioHeader
        today={today}
        navigate={navigate}
        projects={projects}
        enrichedMetrics={enrichedMetrics}
        openProjectDashboard={openProjectDashboard}
      />

      {/* Status Bar — all tiles are clickable filters with sparklines */}
      <KPIStatusBar portfolioKPIs={portfolioKPIs} projects={projects} kpiFilter={kpiFilter} setKpiFilter={setKpiFilter} sparkFor={sparkFor} />

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
          <PortfolioProjectTable
            displayMetrics={displayMetrics}
            sortMode={sortMode}
            setSortMode={setSortMode}
            kpiFilter={kpiFilter}
            setKpiFilter={setKpiFilter}
            navigate={navigate}
            projectScheduleSummaries={projectScheduleSummaries}
            openProjectDashboard={openProjectDashboard}
          />
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
