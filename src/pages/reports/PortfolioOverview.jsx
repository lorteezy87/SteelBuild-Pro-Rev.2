/**
 * Portfolio Overview — cross-portfolio dashboard (thin container).
 * Pure rollups live in ./portfolioOverview/format.ts; presentational
 * sections in ./portfolioOverview/components.tsx.
 */

import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  AlertTriangle, BarChart3, Building2, CalendarDays,
  DollarSign, ShieldAlert, Sparkles,
} from "lucide-react";

import { isActionItemOpen } from "@/lib/entityPredicates";
import { body, mono } from "./constants";
import { exportReportCSV } from "./utils";
import { formatCurrencyShort } from "@/components/shared/formatters";
import { BarChartSVG, DonutChartSVG } from "./charts";
import { severityColor } from "./risks/severity";
import RichEmptyState from "./RichEmptyState";
import ReportShell from "./ReportShell";
import { ToggleGroup } from "./ReportFilters";
import SectionCard from "@/pages/dashboard/sections/SectionCard";

import {
  filterNotDeleted,
  filterOpenRFIs,
  filterOverdueRFIs,
  filterPendingCOs,
  filterOverdueActions,
  filterLateDeliveries,
  filterOpenRisks,
  filterCriticalRisks,
  filterActiveProjects,
  buildProjectRows,
  computePortfolioContract,
  computePortfolioRevised,
  computeBudgetVariance,
  computeTonsProduced,
  computeTonsPlanned,
  computePendingCOValue,
  computeCriticalAlertCount,
  computeHealthRollup,
  filterAndSortProjectRows,
  buildBarChartData,
  buildRfiDonutData,
  buildDriftRows,
  computeTopRisks,
  computeWeeklyActivity,
  formatPortfolioDate,
} from "./portfolioOverview/format";
import {
  HeroKpiStrip,
  ProjectMatrixSection,
  Tile,
  DriftRow,
  UrgentTile,
  WeekStat,
  HealthBucket,
  ChartPanel,
  EmptyMicro,
  ExecutiveColumn,
  ExecutiveLine,
  ExecutiveCallout,
} from "./portfolioOverview/components";

export default function PortfolioOverview() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [kpiFilter, setKpiFilter] = useState(null);
  const [viewMode, setViewMode] = useState("pm");

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
  const { data: rawExpenses = [] } = useQuery({
    queryKey: ["expenses-all"],
    queryFn: () => entities.Expense.list(),
  });
  const { data: rawRisks = [] } = useQuery({
    queryKey: ["risks-all"],
    queryFn: () => entities.Risk.list(),
  });

  const projects = useMemo(() => filterNotDeleted(rawProjects), [rawProjects]);
  const rfis = useMemo(() => filterNotDeleted(rawRfis), [rawRfis]);
  const changeOrders = useMemo(() => filterNotDeleted(rawCOs), [rawCOs]);
  const actionItems = useMemo(() => filterNotDeleted(rawActions), [rawActions]);
  const deliveries = useMemo(() => filterNotDeleted(rawDeliveries), [rawDeliveries]);
  const workPackages = useMemo(() => filterNotDeleted(rawWPs), [rawWPs]);
  const costCodes = useMemo(() => filterNotDeleted(rawCostCodes), [rawCostCodes]);
  const expenses = useMemo(() => filterNotDeleted(rawExpenses), [rawExpenses]);
  const risks = useMemo(() => filterNotDeleted(rawRisks), [rawRisks]);

  // Local midnight so items due today don't count as overdue mid-day
  // (the date-only shim parses "YYYY-MM-DD" as local noon) — matches
  // the shared formatters.isOverdue convention.
  const now = useMemo(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return midnight;
  }, []);

  const openRFIs = useMemo(() => filterOpenRFIs(rfis), [rfis]);
  const overdueRFIs = useMemo(
    () => filterOverdueRFIs(openRFIs, now),
    [openRFIs, now],
  );
  const pendingCOs = useMemo(() => filterPendingCOs(changeOrders), [changeOrders]);
  const pendingCOValue = useMemo(
    () => computePendingCOValue(pendingCOs),
    [pendingCOs],
  );
  const overdueActions = useMemo(
    () => filterOverdueActions(actionItems, now),
    [actionItems, now],
  );
  const lateDeliveries = useMemo(
    () => filterLateDeliveries(deliveries, now),
    [deliveries, now],
  );
  const openRisks = useMemo(() => filterOpenRisks(risks), [risks]);
  const criticalRisks = useMemo(() => filterCriticalRisks(openRisks), [openRisks]);
  const activeProjects = useMemo(() => filterActiveProjects(projects), [projects]);

  const projectRows = useMemo(
    () =>
      buildProjectRows({
        projects,
        costCodes,
        expenses,
        rfis,
        changeOrders,
        workPackages,
        now,
      }),
    [projects, costCodes, expenses, rfis, changeOrders, workPackages, now],
  );

  const portfolioContract = useMemo(
    () => computePortfolioContract(projects),
    [projects],
  );
  const portfolioRevised = useMemo(
    () => computePortfolioRevised(projectRows),
    [projectRows],
  );
  const budgetVariance = useMemo(
    () => computeBudgetVariance(projectRows),
    [projectRows],
  );
  const tonsProduced = useMemo(
    () => computeTonsProduced(workPackages),
    [workPackages],
  );
  const tonsPlanned = useMemo(
    () => computeTonsPlanned(workPackages),
    [workPackages],
  );
  const criticalAlertCount = useMemo(
    () => computeCriticalAlertCount(openRFIs, criticalRisks, lateDeliveries),
    [openRFIs, criticalRisks, lateDeliveries],
  );
  const healthRollup = useMemo(
    () => computeHealthRollup(projectRows),
    [projectRows],
  );

  const filteredRows = useMemo(
    () =>
      filterAndSortProjectRows({
        projectRows,
        kpiFilter,
        search,
        sortField,
        sortDir,
        overdueActions,
        criticalRisks,
        openRFIs,
        lateDeliveries,
      }),
    [
      projectRows, kpiFilter, search, sortField, sortDir,
      overdueActions, criticalRisks, openRFIs, lateDeliveries,
    ],
  );

  const handleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const barChartData = useMemo(() => buildBarChartData(projectRows), [projectRows]);
  const rfiDonutData = useMemo(() => buildRfiDonutData(rfis), [rfis]);
  const driftRows = useMemo(() => buildDriftRows(projectRows), [projectRows]);

  const urgentItems = useMemo(() => {
    const items = [];
    overdueRFIs.slice(0, 6).forEach((r) => {
      const proj = projects.find((p) => p.id === r.project_id);
      items.push({
        kind: "RFI",
        title: r.rfi_number || r.title || "RFI",
        subtitle: r.title || r.subject || r.question || "Overdue response",
        severity: r.priority === "Critical" ? "critical" : r.priority === "High" ? "high" : "medium",
        meta: proj ? proj.name : "",
        onClick: () => navigate(createPageUrl("RFIs")),
      });
    });
    pendingCOs.slice(0, 4).forEach((c) => {
      const proj = projects.find((p) => p.id === c.project_id);
      items.push({
        kind: "CO",
        title: c.co_number || "CO",
        subtitle: `${c.title || c.description || "Change order"} · ${formatCurrencyShort(c.co_amount)}`,
        severity: (Number(c.co_amount) || 0) > 50000 ? "high" : "medium",
        meta: proj ? proj.name : "",
        onClick: () => navigate(createPageUrl("ChangeOrders")),
      });
    });
    lateDeliveries.slice(0, 4).forEach((d) => {
      const proj = projects.find((p) => p.id === d.project_id);
      items.push({
        kind: "DELIVERY",
        title: d.po_number || d.vendor || "Delivery",
        subtitle: d.description || d.vendor || "Late delivery",
        severity: "high",
        meta: proj ? proj.name : "",
        onClick: () => navigate(createPageUrl("Deliveries")),
      });
    });
    return items;
  }, [overdueRFIs, pendingCOs, lateDeliveries, projects, navigate]);

  const topRisks = useMemo(() => computeTopRisks(openRisks), [openRisks]);
  const weekly = useMemo(
    () =>
      computeWeeklyActivity({
        rfis,
        changeOrders,
        actionItems,
        deliveries,
        now,
      }),
    [rfis, changeOrders, actionItems, deliveries, now],
  );

  const handleExportCSV = () =>
    exportReportCSV(
      filteredRows,
      portfolioRevised,
      openRFIs.length,
      pendingCOs.length,
      budgetVariance,
    );

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

  return (
    <ReportShell
      title="Portfolio Overview"
      count={projects.length}
      unit=" · PROJECTS"
      subtitle={`Live as of ${formatPortfolioDate(now)} · ${activeProjects.length} active · ${healthRollup.risk} at risk`}
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
      <HeroKpiStrip
        projectsCount={projects.length}
        activeProjectsCount={activeProjects.length}
        portfolioRevised={portfolioRevised}
        portfolioContract={portfolioContract}
        openRFIsCount={openRFIs.length}
        overdueRFIsCount={overdueRFIs.length}
        rfisTotal={rfis.length}
        pendingCOsCount={pendingCOs.length}
        pendingCOValue={pendingCOValue}
        criticalAlertCount={criticalAlertCount}
        critRfisCount={openRFIs.filter((r) => r.priority === "Critical").length}
        criticalRisksCount={criticalRisks.length}
        lateDeliveriesCount={lateDeliveries.length}
        overdueActionsCount={overdueActions.length}
        openActionsCount={actionItems.filter(isActionItemOpen).length}
        tonsProduced={tonsProduced}
        tonsPlanned={tonsPlanned}
        kpiFilter={kpiFilter}
        onKpiFilter={setKpiFilter}
      />

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
          <HealthBucket label="Healthy" count={healthRollup.good || 0} color="var(--status-success)" description="Actual ≤ budget" />
          <HealthBucket label="Watch" count={healthRollup.watch || 0} color="var(--status-warning)" description="0–5% over budget" />
          <HealthBucket label="At Risk" count={healthRollup.risk || 0} color="var(--status-error)" description=">5% over budget" />
          <HealthBucket label="Neutral" count={healthRollup.neutral || 0} color="var(--text-muted)" description="No budget set" />
        </div>
      </SectionCard>

      <SectionCard
        icon={CalendarDays}
        iconColor="warning"
        title="Schedule Drift"
        subtitle="Schedule elapsed vs work complete — top 8 by drift"
        stats={[
          { value: driftRows.filter((r) => r.drift >= 25).length, label: "BEHIND", color: "error" },
          { value: driftRows.filter((r) => r.drift >= 10 && r.drift < 25).length, label: "WATCH", color: "warning" },
          { value: driftRows.filter((r) => r.drift < 10).length, label: "ON PACE", color: "success" },
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
          <Tile label="Original Contract" value={formatCurrencyShort(portfolioContract)} sub="Sum across portfolio" accent="var(--text-secondary)" />
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
            accent="#F97316"
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
          <ChartPanel title="Budget vs Actual" subtitle="Per-project comparison · top 12 by spend">
            {barChartData.length > 0 ? (
              <BarChartSVG data={barChartData} width={420} height={200} />
            ) : (
              <EmptyMicro label="No budget data yet" />
            )}
          </ChartPanel>
          <ChartPanel title="RFI Status Distribution" subtitle="All RFIs across the portfolio">
            {rfiDonutData.length > 0 ? (
              <DonutChartSVG segments={rfiDonutData} />
            ) : (
              <EmptyMicro label="No RFIs logged yet" />
            )}
          </ChartPanel>
        </div>
      </SectionCard>

      <SectionCard
        icon={ShieldAlert}
        iconColor="error"
        title="Active Risks"
        subtitle="Top open Critical and High risks across the portfolio"
        stats={[
          { value: criticalRisks.length, label: "CRITICAL", color: "error" },
          { value: openRisks.filter((r) => r.severity === "High").length, label: "HIGH", color: "warning" },
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
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: severityColor(r.severity) }} />
                  <div style={{ overflow: "hidden" }}>
                    <div style={{
                      ...body, fontSize: 12, fontWeight: 600,
                      color: "var(--text-primary)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {r.title}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
                      letterSpacing: "0.08em", textTransform: "uppercase",
                    }}>
                      {r.category || "Uncategorized"}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
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
                    fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
                    color: "var(--text-primary)", textAlign: "right",
                  }}>
                    {(Number(r.probability) || 0) * (Number(r.impact) || 0)}/25
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => navigate(createPageUrl("Reports") + "/top-risks")}
              style={{
                alignSelf: "flex-end", marginTop: 4,
                background: "transparent", border: "none",
                color: "var(--accent)", cursor: "pointer",
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.10em", textTransform: "uppercase",
              }}
            >
              View all risks →
            </button>
          </div>
        )}
      </SectionCard>

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
          <WeekStat label="New COs" value={weekly.newCOs} color="#F97316" />
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
            paddingBottom: 6, scrollbarWidth: "thin",
          }}>
            {urgentItems.map((item, i) => (
              <UrgentTile key={`${item.kind}-${i}`} item={item} onClick={item.onClick} />
            ))}
          </div>
        </SectionCard>
      )}

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
              <ExecutiveLine label="Pending COs" value={formatCurrencyShort(pendingCOValue)} color="#F97316" />
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
                <ExecutiveCallout color="#F97316">
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

      <ProjectMatrixSection
        viewMode={viewMode}
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
