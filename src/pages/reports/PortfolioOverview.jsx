/**
 * Portfolio Overview — the flagship cross-portfolio dashboard.
 *
 * Rewritten in two passes:
 *
 *   1. LOGIC AUDIT
 *      - Active projects keyed off `phase !== "Closeout"`, NOT a
 *        non-existent `status` column. Projects has no `status` field
 *        (see migration 001) — the original page was silently treating
 *        every project as Active.
 *      - Pending COs filter on the canonical statuses `Submitted` and
 *        `Under Review` (per migration 013 CHECK). The original page
 *        looked for `Pending`, which is not a valid CO status — every
 *        Submitted CO was being missed.
 *      - Approved CO weekly rollup reads `approved_date` (the actual
 *        column) instead of `approval_date` (which doesn't exist).
 *      - Late deliveries filter on `scheduled_date` and `actual_date`
 *        — the actual columns. The original `expected_delivery_date`
 *        / `actual_delivery_date` reads always returned undefined, so
 *        late deliveries was always 0.
 *      - Completed actions weekly rollup uses `updated_at` as a proxy
 *        because `action_items` has no `completed_date` column. Flagged
 *        for follow-up if the user wants exact completion timestamps.
 *      - Defensive `is_deleted` filters on every collection — covers
 *        the entities that aren't auto-filtered (projects, action_items,
 *        cost_codes) and stays safe on the ones that are.
 *      - "Critical Alerts" KPI synthesised from critical-priority
 *        unanswered RFIs + open Critical risks + late deliveries.
 *      - "Tons Produced" KPI synthesised from work-package tonnage at
 *        100% complete. Both are documented as derived metrics.
 *
 *   2. VISUAL REDESIGN
 *      Brings the page into the project dashboard's visual vocabulary
 *      (SectionCard, Tile, mono eyebrows, flat borders) instead of the
 *      legacy boxy CARD/CARD_TITLE shadow look. The new layout:
 *
 *        [hero KPI strip — 8 tiles]
 *
 *        [Health at a Glance]    — RAG rollup
 *        [Schedule Drift]        — per-project elapsed vs complete
 *        [Financial Snapshot]    — totals + bar chart + donut
 *        [Active Risks]          — top 5 critical/high open risks
 *        [This Week's Activity]  — 7-day rollup grid
 *        [Urgent Items]          — overdue RFIs / pending COs / late deliveries
 *        [Project Matrix]        — sortable, KPI-filterable
 *
 *      The Date Range picker was removed (it didn't filter anything
 *      meaningful in the original) and the WeeklySummary toggle was
 *      consolidated into the new "This Week's Activity" section.
 */

import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Activity, AlertTriangle, BarChart3, Building2, CalendarDays,
  CircleDot, DollarSign, Layers, ShieldAlert, Sparkles, TrendingUp,
} from "lucide-react";

import {
  isActionItemOpen,
} from "@/lib/entityPredicates";
import { mono, body } from "./constants";
import { exportReportCSV } from "./utils";
import { formatCurrencyShort } from "@/components/shared/formatters";
import { BarChartSVG, DonutChartSVG } from "./charts";
import { severityColor } from "./risks/severity";
import RichEmptyState from "./RichEmptyState";
import ProjectStatusMatrix from "./ProjectStatusMatrix";
import ReportShell from "./ReportShell";
import { ToggleGroup } from "./ReportFilters";
import SectionCard from "@/pages/dashboard/sections/SectionCard";
import {
  buildBarChartData,
  buildDriftRows,
  buildHealthRollup,
  buildProjectRows,
  buildRfiDonutData,
  buildTopRisks,
  buildUrgentItems,
  buildWeeklySummary,
  countCriticalAlerts,
  filterAndSortProjectRows,
  filterSoftDeleted,
  selectActiveProjects,
  selectCriticalRisks,
  selectLateDeliveries,
  selectOpenRfis,
  selectOpenRisks,
  selectOverdueActionItems,
  selectOverdueRfis,
  selectPendingChangeOrders,
  sumBudgetVariance,
  sumPendingChangeOrderValue,
  sumPlannedTonnage,
  sumPortfolioContract,
  sumPortfolioRevised,
  sumProducedTonnage,
} from "./portfolioOverview.derive";
import {
  ChartPanel,
  DriftRow,
  EmptyMicro,
  ExecutiveCallout,
  ExecutiveColumn,
  ExecutiveLine,
  HealthBucket,
  Tile,
  UrgentTile,
  WeekStat,
} from "./portfolioOverviewComponents";

export default function PortfolioOverview() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [kpiFilter, setKpiFilter] = useState(null);
  const [viewMode, setViewMode] = useState("pm");

  /* ── Data queries ── */
  const { data: rawProjects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });
  const { data: rawRfis = [] } = useQuery({
    queryKey: ["rfis"],
    queryFn: () => entities.RFI.list(),
  });
  const { data: rawCOs = [] } = useQuery({
    queryKey: ["change-orders-global"],
    queryFn: () => entities.ChangeOrder.list(),
  });
  const { data: rawActions = [] } = useQuery({
    queryKey: ["action-items-all"],
    queryFn: () => entities.ActionItem.list(),
  });
  const { data: rawDeliveries = [] } = useQuery({
    queryKey: ["deliveries-all"],
    queryFn: () => entities.Delivery.list(),
  });
  const { data: rawWPs = [] } = useQuery({
    queryKey: ["work-packages-global"],
    queryFn: () => entities.WorkPackage.list(),
  });
  const { data: rawCostCodes = [] } = useQuery({
    queryKey: ["cost-codes-global"],
    queryFn: () => entities.CostCode.list(),
  });
  // Expenses carry the real "actuals" — `cost_codes.actual_cost` is
  // populated on only ~2 of 150 rows in production, so the matrix
  // previously rendered $0 for actual on every project. Sum from
  // expenses (excluding Voided) per project to get the real number.
  const { data: rawExpenses = [] } = useQuery({
    queryKey: ["expenses-all"],
    queryFn: () => entities.Expense.list(),
  });
  const { data: rawRisks = [] } = useQuery({
    queryKey: ["risks-all"],
    queryFn: () => entities.Risk.list(),
  });

  /* ── Defensive soft-delete filters. Most of these collections come
       through entities that already auto-filter, but the page also
       reads from `projects`, `action_items`, and `cost_codes` which
       don't have soft-delete columns yet — and the filter is a no-op
       for rows without `is_deleted`. ── */
  const projects     = useMemo(() => filterSoftDeleted(rawProjects), [rawProjects]);
  const rfis         = useMemo(() => filterSoftDeleted(rawRfis), [rawRfis]);
  const changeOrders = useMemo(() => filterSoftDeleted(rawCOs), [rawCOs]);
  const actionItems  = useMemo(() => filterSoftDeleted(rawActions), [rawActions]);
  const deliveries   = useMemo(() => filterSoftDeleted(rawDeliveries), [rawDeliveries]);
  const workPackages = useMemo(() => filterSoftDeleted(rawWPs), [rawWPs]);
  const costCodes    = useMemo(() => filterSoftDeleted(rawCostCodes), [rawCostCodes]);
  const expenses     = useMemo(() => filterSoftDeleted(rawExpenses), [rawExpenses]);
  const risks        = useMemo(() => filterSoftDeleted(rawRisks), [rawRisks]);

  const now = useMemo(() => new Date(), []);

  /* ── Derived collections ──
       All four "open / pending" predicates come from the shared
       `entityPredicates` module so this report can't drift from the
       project dashboard or ProjectDetails. */
  const openRFIs = useMemo(() => selectOpenRfis(rfis), [rfis]);
  const overdueRFIs = useMemo(
    () => selectOverdueRfis(openRFIs, now),
    [openRFIs] // eslint-disable-line react-hooks/exhaustive-deps
  );
  /** Pending CO = Submitted + Under Review (per change_orders CHECK
   *  constraint). There is no literal "Pending" status. */
  const pendingCOs = useMemo(
    () => selectPendingChangeOrders(changeOrders),
    [changeOrders]
  );
  const pendingCOValue = useMemo(
    () => sumPendingChangeOrderValue(pendingCOs),
    [pendingCOs]
  );

  const overdueActions = useMemo(
    () => selectOverdueActionItems(actionItems, now),
    [actionItems] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** AUDIT: late deliveries. The deliveries table uses `scheduled_date`
   *  / `actual_date`, not `expected_delivery_date` / `actual_delivery_date`.
   *  The original page read both non-existent columns. */
  const lateDeliveries = useMemo(
    () => selectLateDeliveries(deliveries, now),
    [deliveries] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Open risks = anything still on the books. Closed/Mitigated are
   *  considered resolved per `severity.js#isActiveRisk`. */
  const openRisks = useMemo(
    () => selectOpenRisks(risks),
    [risks]
  );
  const criticalRisks = useMemo(
    () => selectCriticalRisks(openRisks),
    [openRisks]
  );

  /** AUDIT: Active projects = phase ≠ Closeout. The original page
   *  filtered `p.status` which doesn't exist on the projects table —
   *  every project was silently treated as Active. */
  const activeProjects = useMemo(
    () => selectActiveProjects(projects),
    [projects]
  );

  /* ── Per-project rollup ── */
  const projectRows = useMemo(() => {
    return buildProjectRows({
      projects,
      costCodes,
      expenses,
      rfis,
      changeOrders,
      workPackages,
      now,
    });
  }, [projects, costCodes, expenses, rfis, changeOrders, workPackages, now]);

  /* ── Portfolio totals ── */
  const portfolioContract = useMemo(
    () => sumPortfolioContract(projects),
    [projects]
  );
  const portfolioRevised = useMemo(
    () => sumPortfolioRevised(projectRows),
    [projectRows]
  );
  const budgetVariance = useMemo(
    () => sumBudgetVariance(projectRows),
    [projectRows]
  );

  /* ── Tons produced (derived) — sum of WP tonnage at 100% complete.
       Flagged as a derived rollup; callers wanting "actually erected"
       tonnage should swap in the proper field once it lands. ── */
  const tonsProduced = useMemo(() => {
    return sumProducedTonnage(workPackages);
  }, [workPackages]);
  const tonsPlanned = useMemo(
    () => sumPlannedTonnage(workPackages),
    [workPackages]
  );

  /* ── Critical alerts (derived). Composite of the things that page
       owners on today: critical-priority open RFIs + open Critical
       risks + late deliveries. Not pulled from a single Alerts
       entity — that would be a wider rewrite. ── */
  const criticalAlertCount = useMemo(() => {
    return countCriticalAlerts({
      openRfis: openRFIs,
      criticalRisks,
      lateDeliveries,
    });
  }, [openRFIs, criticalRisks, lateDeliveries]);

  /* ── Health rollup ── */
  const healthRollup = useMemo(() => {
    return buildHealthRollup(projectRows);
  }, [projectRows]);

  /* ── Filter + sort the matrix ── */
  const filteredRows = useMemo(() => {
    return filterAndSortProjectRows({
      projectRows,
      kpiFilter,
      search,
      sortField,
      sortDir,
      overdueActions,
      criticalRisks,
      openRfis: openRFIs,
      lateDeliveries,
    });
  }, [
    projectRows, kpiFilter, search, sortField, sortDir,
    overdueActions, criticalRisks, openRFIs, lateDeliveries,
  ]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  /* ── Charts ── */
  const barChartData = useMemo(
    () => buildBarChartData(projectRows),
    [projectRows]
  );

  const rfiDonutData = useMemo(() => {
    return buildRfiDonutData(rfis);
  }, [rfis]);

  /* ── Drift rows — projects sorted by drift descending, top 8. ── */
  const driftRows = useMemo(() => {
    return buildDriftRows(projectRows);
  }, [projectRows]);

  /* ── Top urgent items ── */
  const urgentItems = useMemo(() => {
    return buildUrgentItems({
      overdueRfis: overdueRFIs,
      pendingChangeOrders: pendingCOs,
      lateDeliveries,
      projects,
    }).map((item) => ({
      ...item,
      onClick: () => navigate(createPageUrl(item.page)),
    }));
  }, [overdueRFIs, pendingCOs, lateDeliveries, projects, navigate]);

  /* ── Top open risks (Critical + High by score) ── */
  const topRisks = useMemo(() => {
    return buildTopRisks(openRisks);
  }, [openRisks]);

  /* ── This week's activity (last 7 days) ──
       AUDIT: action_items has no `completed_date` column. We use
       `updated_at` as the proxy for "completed-this-week" — close
       enough since closing a row writes updated_at. */
  const weekly = useMemo(() => {
    return buildWeeklySummary({
      rfis,
      changeOrders,
      actionItems,
      deliveries,
      now,
    });
  }, [rfis, changeOrders, actionItems, deliveries, now]);

  const handleExportCSV = () =>
    exportReportCSV(
      filteredRows,
      portfolioRevised,
      openRFIs.length,
      pendingCOs.length,
      budgetVariance
    );

  /* ── EMPTY STATE ── */
  if (projects.length === 0) {
    return (
      <ReportShell
        title="Portfolio Overview"
        subtitle="Cross-portfolio KPIs and project status"
        onExportCSV={null}
        onPrint={null}
      >
        <RichEmptyState navigate={navigate} />
      </ReportShell>
    );
  }

  /* ── MAIN RENDER ── */
  return (
    <ReportShell
      title="Portfolio Overview"
      count={projects.length}
      unit=" · PROJECTS"
      subtitle={`Live as of ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${activeProjects.length} active · ${healthRollup.risk} at risk`}
      onExportCSV={handleExportCSV}
      filters={
        <div style={{
          display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects by name, number, phase..."
            style={{
              flex: 1, minWidth: 280,
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-input)",
              padding: "9px 12px",
              color: "var(--text-primary)",
              ...body, fontSize: 12,
            }}
          />
          <ToggleGroup
            options={[
              { key: "pm", label: "PM VIEW" },
              { key: "executive", label: "EXECUTIVE" },
            ]}
            active={viewMode}
            onChange={setViewMode}
          />
        </div>
      }
    >
      {/* ── Hero KPI strip — 8 tiles, click to filter the matrix below ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 10,
      }}>
        <Tile
          icon={Building2}
          label="Total Projects"
          value={projects.length}
          sub={`${activeProjects.length} active · ${projects.length - activeProjects.length} closed`}
          accent="var(--accent)"
        />
        <Tile
          icon={Activity}
          label="Active Projects"
          value={activeProjects.length}
          sub={`${projects.length - activeProjects.length} in Closeout`}
          accent="var(--status-info)"
          active={kpiFilter === "active"}
          onClick={() => setKpiFilter(kpiFilter === "active" ? null : "active")}
        />
        <Tile
          icon={DollarSign}
          label="Contract Value"
          value={formatCurrencyShort(portfolioRevised)}
          sub={`Original ${formatCurrencyShort(portfolioContract)} · revised ${formatCurrencyShort(portfolioRevised - portfolioContract)}`}
          accent="var(--status-success-bright)"
          active={kpiFilter === "value"}
          onClick={() => setKpiFilter(kpiFilter === "value" ? null : "value")}
        />
        <Tile
          icon={CircleDot}
          label="Open RFIs"
          value={openRFIs.length}
          sub={`${overdueRFIs.length} overdue · ${rfis.length} total`}
          accent="var(--status-warning)"
          badge={overdueRFIs.length > 0 ? `${overdueRFIs.length} overdue` : null}
          active={kpiFilter === "rfis"}
          onClick={() => setKpiFilter(kpiFilter === "rfis" ? null : "rfis")}
        />
        <Tile
          icon={Layers}
          label="Pending COs"
          value={pendingCOs.length}
          sub={`${formatCurrencyShort(pendingCOValue)} pending value`}
          accent="var(--status-review)"
          active={kpiFilter === "cos"}
          onClick={() => setKpiFilter(kpiFilter === "cos" ? null : "cos")}
        />
        <Tile
          icon={ShieldAlert}
          label="Critical Alerts"
          value={criticalAlertCount}
          sub={`${openRFIs.filter((r) => r.priority === "Critical").length} crit RFIs · ${criticalRisks.length} crit risks · ${lateDeliveries.length} late deliv.`}
          accent="var(--status-error)"
          active={kpiFilter === "alerts"}
          onClick={() => setKpiFilter(kpiFilter === "alerts" ? null : "alerts")}
        />
        <Tile
          icon={AlertTriangle}
          label="Overdue Actions"
          value={overdueActions.length}
          sub={`${actionItems.filter(isActionItemOpen).length} open total`}
          accent="var(--status-error)"
          badge={overdueActions.length > 0 ? "past due" : null}
          active={kpiFilter === "overdue"}
          onClick={() => setKpiFilter(kpiFilter === "overdue" ? null : "overdue")}
        />
        <Tile
          icon={TrendingUp}
          label="Tons Produced"
          value={tonsProduced.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          sub={tonsPlanned > 0 ? `${((tonsProduced / tonsPlanned) * 100).toFixed(0)}% of ${tonsPlanned.toLocaleString("en-US", { maximumFractionDigits: 0 })}t planned` : "no WP tonnage"}
          accent="var(--phase-fab)"
        />
      </div>

      {/* ── Health at a Glance ── */}
      <SectionCard
        icon={Sparkles}
        iconColor="success"
        title="Health at a Glance"
        subtitle="Project-level RAG rollup based on cost variance"
        stats={[
          { value: healthRollup.good || 0, label: "HEALTHY", color: "success" },
          { value: healthRollup.watch || 0, label: "WATCH", color: "warning" },
          { value: healthRollup.risk || 0, label: "AT RISK", color: "error" },
        ]}
      >
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 10,
        }}>
          <HealthBucket
            label="Healthy"
            count={healthRollup.good || 0}
            color="var(--status-success)"
            description="Actual ≤ budget"
          />
          <HealthBucket
            label="Watch"
            count={healthRollup.watch || 0}
            color="var(--status-warning)"
            description="0–5% over budget"
          />
          <HealthBucket
            label="At Risk"
            count={healthRollup.risk || 0}
            color="var(--status-error)"
            description=">5% over budget"
          />
          <HealthBucket
            label="Neutral"
            count={healthRollup.neutral || 0}
            color="var(--text-muted)"
            description="No budget set"
          />
        </div>
      </SectionCard>

      {/* ── Schedule Drift ── */}
      <SectionCard
        icon={CalendarDays}
        iconColor="warning"
        title="Schedule Drift"
        subtitle="Schedule elapsed vs work complete — top 8 by drift"
        stats={[
          {
            value: driftRows.filter((r) => r.drift >= 25).length,
            label: "BEHIND",
            color: "error",
          },
          {
            value: driftRows.filter((r) => r.drift >= 10 && r.drift < 25).length,
            label: "WATCH",
            color: "warning",
          },
          {
            value: driftRows.filter((r) => r.drift < 10).length,
            label: "ON PACE",
            color: "success",
          },
        ]}
      >
        {driftRows.length === 0 ? (
          <EmptyMicro label="No active projects with schedule data" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {driftRows.map((r) => (
              <DriftRow
                key={r.id}
                row={r}
                onClick={() => navigate(createPageUrl("Projects") + `?id=${r.id}`)}
              />
            ))}
            <div style={{
              ...mono, fontSize: 9, color: "var(--text-muted)",
              letterSpacing: "0.08em", textTransform: "uppercase",
              marginTop: 8, display: "flex", gap: 14, justifyContent: "flex-end",
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 14, height: 4, background: "var(--text-muted)", opacity: 0.7, borderRadius: 2 }} />
                Schedule elapsed
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 14, height: 4, background: "var(--status-success)", borderRadius: 2 }} />
                Work complete
              </span>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Financial Snapshot ── */}
      <SectionCard
        icon={DollarSign}
        iconColor="success"
        title="Financial Snapshot"
        subtitle="Contract value, variance, and pending change orders"
        stats={[
          { value: formatCurrencyShort(portfolioRevised), label: "REVISED", color: "success" },
          { value: formatCurrencyShort(pendingCOValue), label: "PENDING COS", color: pendingCOValue > 0 ? "warning" : "muted" },
          {
            value: (budgetVariance >= 0 ? "+" : "") + formatCurrencyShort(budgetVariance),
            label: "VARIANCE",
            color: budgetVariance > 0 ? "error" : "success",
          },
        ]}
      >
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          marginBottom: 14,
        }}>
          <Tile
            label="Original Contract"
            value={formatCurrencyShort(portfolioContract)}
            sub="Sum across portfolio"
            accent="var(--text-secondary)"
          />
          <Tile
            label="Approved CO Delta"
            value={(portfolioRevised - portfolioContract >= 0 ? "+" : "") + formatCurrencyShort(portfolioRevised - portfolioContract)}
            sub="Revised − original"
            accent="var(--status-success)"
          />
          <Tile
            label="Pending CO Value"
            value={formatCurrencyShort(pendingCOValue)}
            sub={`${pendingCOs.length} CO${pendingCOs.length === 1 ? "" : "s"} awaiting approval`}
            accent="var(--status-review)"
          />
          <Tile
            label="Budget Variance"
            value={(budgetVariance >= 0 ? "+" : "") + formatCurrencyShort(budgetVariance)}
            sub={budgetVariance <= 0 ? "Under budget" : "Over budget"}
            accent={budgetVariance <= 0 ? "var(--status-success)" : "var(--status-error)"}
            active={kpiFilter === "variance"}
            onClick={() => setKpiFilter(kpiFilter === "variance" ? null : "variance")}
          />
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 14,
        }}>
          <ChartPanel
            title="Budget vs Actual"
            subtitle="Per-project comparison · top 12 by spend"
          >
            {barChartData.length > 0 ? (
              <BarChartSVG data={barChartData} width={420} height={200} />
            ) : (
              <EmptyMicro label="No budget data yet" />
            )}
          </ChartPanel>
          <ChartPanel
            title="RFI Status Distribution"
            subtitle="All RFIs across the portfolio"
          >
            {rfiDonutData.length > 0 ? (
              <DonutChartSVG segments={rfiDonutData} />
            ) : (
              <EmptyMicro label="No RFIs logged yet" />
            )}
          </ChartPanel>
        </div>
      </SectionCard>

      {/* ── Active Risks ── */}
      <SectionCard
        icon={ShieldAlert}
        iconColor="error"
        title="Active Risks"
        subtitle="Top open Critical and High risks across the portfolio"
        stats={[
          { value: criticalRisks.length, label: "CRITICAL", color: "error" },
          {
            value: openRisks.filter((r) => r.severity === "High").length,
            label: "HIGH",
            color: "warning",
          },
          { value: openRisks.length, label: "OPEN", color: "muted" },
        ]}
      >
        {topRisks.length === 0 ? (
          <EmptyMicro label="No critical or high open risks. Healthy portfolio." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topRisks.map((r) => {
              const proj = projects.find((p) => p.id === r.project_id);
              return (
                <div
                  key={r.id}
                  onClick={() => navigate(createPageUrl("Reports") + "/top-risks")}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "10px minmax(180px, 2fr) 80px 1fr 100px",
                    gap: 12,
                    alignItems: "center",
                    padding: "10px 12px",
                    background: "var(--bg-surface-low)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = severityColor(r.severity))}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
                >
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: severityColor(r.severity),
                  }} />
                  <div style={{ overflow: "hidden" }}>
                    <div style={{
                      ...body, fontSize: 12, fontWeight: 600,
                      color: "var(--text-primary)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {r.title}
                    </div>
                    <div style={{
                      ...mono, fontSize: 9, color: "var(--text-muted)",
                      letterSpacing: "0.08em", textTransform: "uppercase",
                    }}>
                      {r.category || "Uncategorized"}
                    </div>
                  </div>
                  <div style={{
                    ...mono, fontSize: 10, fontWeight: 700,
                    color: severityColor(r.severity),
                    letterSpacing: "0.08em", textTransform: "uppercase",
                  }}>
                    {r.severity}
                  </div>
                  <div style={{
                    ...body, fontSize: 11, color: "var(--text-secondary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {proj?.name || "—"}
                  </div>
                  <div style={{
                    ...mono, fontSize: 11, fontWeight: 700,
                    color: "var(--text-primary)",
                    textAlign: "right",
                  }}>
                    {(Number(r.probability) || 0) * (Number(r.impact) || 0)}/25
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => navigate(createPageUrl("Reports") + "/top-risks")}
              style={{
                alignSelf: "flex-end",
                marginTop: 4,
                background: "transparent",
                border: "none",
                color: "var(--accent)",
                cursor: "pointer",
                ...mono, fontSize: 9, fontWeight: 700,
                letterSpacing: "0.10em", textTransform: "uppercase",
              }}
            >
              View all risks →
            </button>
          </div>
        )}
      </SectionCard>

      {/* ── This Week's Activity ── */}
      <SectionCard
        icon={BarChart3}
        iconColor="info"
        title="This Week's Activity"
        subtitle={`${weekly.weekStart} — ${weekly.weekEnd}`}
        stats={[
          { value: weekly.newRFIs + weekly.closedRFIs, label: "RFI EVENTS", color: "info" },
          { value: weekly.approvedCOs, label: "COS APPROVED", color: "success" },
          { value: weekly.recentDeliveries, label: "RECEIVED", color: "accent" },
        ]}
      >
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 10,
        }}>
          <WeekStat label="New RFIs" value={weekly.newRFIs} color="var(--status-info)" />
          <WeekStat label="Closed RFIs" value={weekly.closedRFIs} color="var(--status-success-bright)" />
          <WeekStat label="New COs" value={weekly.newCOs} color="var(--status-review)" />
          <WeekStat
            label="Approved COs"
            value={weekly.approvedCOs}
            color="var(--status-success-bright)"
            sub={weekly.approvedCOValue > 0 ? formatCurrencyShort(weekly.approvedCOValue) : null}
          />
          <WeekStat label="Actions Completed" value={weekly.completedActions} color="var(--status-success-bright)" sub="proxy: updated_at" />
          <WeekStat label="Deliveries Received" value={weekly.recentDeliveries} color="var(--accent)" />
        </div>
      </SectionCard>

      {/* ── Urgent Items ── */}
      {urgentItems.length > 0 && (
        <SectionCard
          icon={AlertTriangle}
          iconColor="error"
          title="Urgent Items"
          subtitle="Overdue RFIs, pending COs, and late deliveries"
          stats={[
            { value: overdueRFIs.length, label: "OVERDUE RFIS", color: "error" },
            { value: pendingCOs.length, label: "PENDING COS", color: "warning" },
            { value: lateDeliveries.length, label: "LATE DELIV.", color: "warning" },
          ]}
        >
          <div style={{
            display: "flex", gap: 10, overflowX: "auto",
            paddingBottom: 6,
            scrollbarWidth: "thin",
          }}>
            {urgentItems.map((item, i) => (
              <UrgentTile
                key={`${item.kind}-${i}`}
                item={item}
                onClick={item.onClick}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Executive view: portfolio summary panel up top ── */}
      {viewMode === "executive" && (
        <SectionCard
          icon={Building2}
          iconColor="accent"
          title="Executive Summary"
          subtitle="Boardroom rollup of the portfolio's key indicators"
        >
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
          }}>
            <ExecutiveColumn title="Portfolio Health" accent="var(--accent)">
              <ExecutiveLine label="At Risk" value={healthRollup.risk} color="var(--status-error)" />
              <ExecutiveLine label="Watch" value={healthRollup.watch} color="var(--status-warning)" />
              <ExecutiveLine label="Healthy" value={healthRollup.good} color="var(--status-success-bright)" />
              <ExecutiveLine label="Neutral" value={healthRollup.neutral} color="var(--text-muted)" />
            </ExecutiveColumn>
            <ExecutiveColumn title="Financials" accent="var(--accent)">
              <ExecutiveLine label="Revised Value" value={formatCurrencyShort(portfolioRevised)} color="var(--text-primary)" />
              <ExecutiveLine
                label="Variance"
                value={(budgetVariance >= 0 ? "+" : "") + formatCurrencyShort(budgetVariance)}
                color={budgetVariance <= 0 ? "var(--status-success-bright)" : "var(--status-error)"}
              />
              <ExecutiveLine label="Pending COs" value={formatCurrencyShort(pendingCOValue)} color="var(--status-review)" />
            </ExecutiveColumn>
            <ExecutiveColumn title="Action Required" accent="var(--status-error)">
              {overdueRFIs.length > 0 && (
                <ExecutiveCallout color="var(--status-error)">
                  {overdueRFIs.length} overdue RFI{overdueRFIs.length !== 1 ? "s" : ""}
                </ExecutiveCallout>
              )}
              {overdueActions.length > 0 && (
                <ExecutiveCallout color="var(--status-warning)">
                  {overdueActions.length} overdue action item{overdueActions.length !== 1 ? "s" : ""}
                </ExecutiveCallout>
              )}
              {lateDeliveries.length > 0 && (
                <ExecutiveCallout color="var(--status-review)">
                  {lateDeliveries.length} late deliver{lateDeliveries.length !== 1 ? "ies" : "y"}
                </ExecutiveCallout>
              )}
              {criticalRisks.length > 0 && (
                <ExecutiveCallout color="var(--status-error)">
                  {criticalRisks.length} critical open risk{criticalRisks.length !== 1 ? "s" : ""}
                </ExecutiveCallout>
              )}
              {overdueRFIs.length === 0 && overdueActions.length === 0 &&
               lateDeliveries.length === 0 && criticalRisks.length === 0 && (
                <div style={{ ...body, fontSize: 12, color: "var(--status-success-bright)" }}>
                  No critical actions pending.
                </div>
              )}
            </ExecutiveColumn>
          </div>
        </SectionCard>
      )}

      {/* ── Project Matrix (existing component, restyled by its own card) ── */}
      <ProjectStatusMatrix
        title={viewMode === "executive" ? "Project Overview" : "Project Status Matrix"}
        filteredRows={filteredRows}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        kpiFilter={kpiFilter}
        onClearFilter={() => setKpiFilter(null)}
        search={search}
        navigate={navigate}
      />
    </ReportShell>
  );
}
