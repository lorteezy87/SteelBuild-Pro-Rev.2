/**
 * Portfolio Overview — the flagship dashboard report.
 *
 * Lifted verbatim from the previous /Reports page (it's the dashboard
 * Nick already trusts) and dropped into the new ReportShell so it
 * matches the rest of the report module. Composition is unchanged:
 *
 *   - KPI strip (clickable, drives the row filter below)
 *   - optional Weekly Summary panel
 *   - executive summary panel (visible in Executive view mode)
 *   - ProjectStatusMatrix table
 *   - Budget-vs-Actual + RFI-status charts
 *   - Urgent items strip
 *
 * Every existing component (KPICard, ProjectStatusMatrix, charts,
 * UrgentCard, ExecutiveSummary, WeeklySummary, RichEmptyState) is
 * reused as-is — no rewrites.
 */

import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import {
  mono, body, CARD, CARD_TITLE, DATE_RANGES,
} from "./constants";
import {
  formatCurrency, computeHealth, exportReportCSV,
} from "./utils";
import { BarChartSVG, DonutChartSVG } from "./charts";
import RichEmptyState from "./RichEmptyState";
import KPICard from "./KPICard";
import InfoIcon from "./InfoIcon";
import UrgentCard from "./UrgentCard";
import ExecutiveSummary from "./ExecutiveSummary";
import WeeklySummary from "./WeeklySummary";
import ProjectStatusMatrix from "./ProjectStatusMatrix";
import ReportShell from "./ReportShell";
import { ToggleGroup } from "./ReportFilters";

export default function PortfolioOverview() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  // eslint-disable-next-line no-unused-vars
  const [dateRange, setDateRange] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [kpiFilter, setKpiFilter] = useState(null);
  const [viewMode, setViewMode] = useState("pm");
  const [showWeeklySummary, setShowWeeklySummary] = useState(false);

  /* ── Data queries ── */
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });
  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis"],
    queryFn: () => base44.entities.RFI.list(),
  });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders-global"],
    queryFn: () => base44.entities.ChangeOrder.list(),
  });
  const { data: actionItems = [] } = useQuery({
    queryKey: ["action-items-all"],
    queryFn: () => base44.entities.ActionItem.list(),
  });
  const { data: deliveries = [] } = useQuery({
    queryKey: ["deliveries-all"],
    queryFn: () => base44.entities.Delivery.list(),
  });
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages-global"],
    queryFn: () => base44.entities.WorkPackage.list(),
  });
  const { data: costCodes = [] } = useQuery({
    queryKey: ["cost-codes-global"],
    queryFn: () => base44.entities.CostCode.list(),
  });

  /* ── Derived data ── */
  const now = new Date();

  const openRFIs = useMemo(
    () => rfis.filter((r) => !["Answered", "Closed"].includes(r.status)),
    [rfis]
  );
  const overdueRFIs = useMemo(
    () => openRFIs.filter((r) => r.date_required && new Date(r.date_required) < now),
    [openRFIs] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const pendingCOs = useMemo(
    () =>
      changeOrders.filter(
        (c) => c.status === "Pending" || c.status === "Under Review"
      ),
    [changeOrders]
  );
  const pendingCOValue = useMemo(
    () => pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0),
    [pendingCOs]
  );
  const overdueActions = useMemo(
    () =>
      actionItems.filter(
        (a) =>
          a.status !== "Complete" &&
          a.status !== "Closed" &&
          a.due_date &&
          new Date(a.due_date) < now
      ),
    [actionItems] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const lateDeliveries = useMemo(
    () =>
      deliveries.filter(
        (d) =>
          d.status !== "Delivered" &&
          d.status !== "Complete" &&
          d.expected_delivery_date &&
          new Date(d.expected_delivery_date) < now
      ),
    [deliveries] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const projectRows = useMemo(() => {
    return projects.map((p) => {
      const pCodes = costCodes.filter((c) => c.project_id === p.id);
      const budget =
        pCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0) ||
        Number(p.original_contract_value) || 0;
      const actual = pCodes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
      const variance = budget > 0 ? actual - budget : 0;
      const var_pct = budget > 0 ? (variance / budget) * 100 : 0;
      const health = computeHealth(budget, actual);
      const pRFIs = rfis.filter(
        (r) => r.project_id === p.id && !["Answered", "Closed"].includes(r.status)
      );
      const pCOs = changeOrders.filter(
        (c) =>
          c.project_id === p.id &&
          (c.status === "Pending" || c.status === "Under Review")
      );
      const pWPs = workPackages.filter((w) => w.project_id === p.id);
      const wpTotal = pWPs.length;
      const wpComplete = pWPs.filter(
        (w) => w.status === "Complete" || w.status === "Shipped"
      ).length;
      const wpPct = wpTotal > 0 ? (wpComplete / wpTotal) * 100 : 0;
      return {
        id: p.id,
        number: p.project_number || `P-${p.id}`,
        name: p.name || "Untitled Project",
        phase: p.phase || "Unknown",
        health,
        budget,
        actual,
        variance,
        var_pct,
        openRFIs: pRFIs.length,
        openCOs: pCOs.length,
        wpPct,
        raw: p,
      };
    });
  }, [projects, costCodes, rfis, changeOrders, workPackages]);

  const portfolioValue = useMemo(
    () => projectRows.reduce((s, r) => s + r.budget, 0),
    [projectRows]
  );
  const activeCount = projects.filter(
    (p) => p.status !== "Complete" && p.status !== "Closed"
  ).length;
  const budgetVariance = useMemo(
    () => projectRows.reduce((s, r) => s + r.variance, 0),
    [projectRows]
  );

  const filteredRows = useMemo(() => {
    let rows = [...projectRows];
    if (kpiFilter === "value") rows = rows.filter((r) => r.budget > 0);
    else if (kpiFilter === "active")
      rows = rows.filter((r) => {
        const p = r.raw;
        return p.status !== "Complete" && p.status !== "Closed";
      });
    else if (kpiFilter === "rfis") rows = rows.filter((r) => r.openRFIs > 0);
    else if (kpiFilter === "cos") rows = rows.filter((r) => r.openCOs > 0);
    else if (kpiFilter === "variance")
      rows = rows.filter((r) => r.variance !== 0);
    else if (kpiFilter === "overdue") {
      const ids = new Set(overdueActions.map((a) => a.project_id));
      rows = rows.filter((r) => ids.has(r.id));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.number.toLowerCase().includes(q) ||
          r.phase.toLowerCase().includes(q)
      );
    }
    rows.sort((a, b) => {
      let av = a[sortField];
      let bv = b[sortField];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [projectRows, kpiFilter, search, sortField, sortDir, overdueActions]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const barChartData = useMemo(
    () =>
      projectRows
        .filter((r) => r.budget > 0 || r.actual > 0)
        .slice(0, 12)
        .map((r) => ({ name: r.number, budget: r.budget, actual: r.actual })),
    [projectRows]
  );

  const rfiDonutData = useMemo(() => {
    const counts = {
      Open: rfis.filter((r) => r.status === "Open").length,
      "Under Review": rfis.filter((r) => r.status === "Under Review").length,
      Answered: rfis.filter((r) => r.status === "Answered").length,
      Closed: rfis.filter((r) => r.status === "Closed").length,
    };
    return [
      { label: "Open", value: counts.Open, color: "var(--status-warning)" },
      { label: "Under Review", value: counts["Under Review"], color: "var(--status-info)" },
      { label: "Answered", value: counts.Answered, color: "var(--status-success)" },
      { label: "Closed", value: counts.Closed, color: "var(--text-muted)" },
    ].filter((s) => s.value > 0);
  }, [rfis]);

  const urgentItems = useMemo(() => {
    const items = [];
    overdueRFIs.slice(0, 5).forEach((r) => {
      const proj = projects.find((p) => p.id === r.project_id);
      items.push({
        type: "rfi",
        title: r.rfi_number || "RFI",
        subtitle: r.subject || "No subject",
        severity:
          r.priority === "Critical"
            ? "critical"
            : r.priority === "High"
              ? "high"
              : "medium",
        meta: proj ? proj.name : "",
        onClick: () => navigate(createPageUrl("RFIs")),
      });
    });
    pendingCOs.slice(0, 5).forEach((c) => {
      const proj = projects.find((p) => p.id === c.project_id);
      items.push({
        type: "co",
        title: c.co_number || "CO",
        subtitle: `${c.description || "Change order"} - ${formatCurrency(c.co_amount)}`,
        severity: (Number(c.co_amount) || 0) > 50000 ? "high" : "medium",
        meta: proj ? proj.name : "",
        onClick: () => navigate(createPageUrl("ChangeOrders")),
      });
    });
    lateDeliveries.slice(0, 5).forEach((d) => {
      const proj = projects.find((p) => p.id === d.project_id);
      items.push({
        type: "delivery",
        title: d.delivery_number || "Delivery",
        subtitle: d.description || "Late delivery",
        severity: "high",
        meta: proj ? proj.name : "",
        onClick: () => navigate(createPageUrl("Deliveries")),
      });
    });
    return items;
  }, [overdueRFIs, pendingCOs, lateDeliveries, projects, navigate]);

  const weeklySummary = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const newRFIs = rfis.filter(
      (r) => r.created_date && new Date(r.created_date) >= weekAgo
    );
    const closedRFIs = rfis.filter(
      (r) =>
        r.status === "Closed" &&
        r.date_answered &&
        new Date(r.date_answered) >= weekAgo
    );
    const newCOs = changeOrders.filter(
      (c) => c.created_date && new Date(c.created_date) >= weekAgo
    );
    const approvedCOs = changeOrders.filter(
      (c) =>
        c.status === "Approved" &&
        c.approval_date &&
        new Date(c.approval_date) >= weekAgo
    );
    const approvedCOValue = approvedCOs.reduce(
      (s, c) => s + (Number(c.co_amount) || 0),
      0
    );
    const completedActions = actionItems.filter(
      (a) =>
        (a.status === "Complete" || a.status === "Closed") &&
        a.completed_date &&
        new Date(a.completed_date) >= weekAgo
    );
    const recentDeliveries = deliveries.filter(
      (d) =>
        d.status === "Delivered" &&
        d.actual_delivery_date &&
        new Date(d.actual_delivery_date) >= weekAgo
    );
    const criticalRFIs = openRFIs.filter((r) => r.priority === "Critical");
    const highValuePendingCOs = pendingCOs.filter(
      (c) => (Number(c.co_amount) || 0) > 50000
    );
    return {
      newRFIs: newRFIs.length,
      closedRFIs: closedRFIs.length,
      newCOs: newCOs.length,
      approvedCOs: approvedCOs.length,
      approvedCOValue,
      completedActions: completedActions.length,
      recentDeliveries: recentDeliveries.length,
      criticalRFIs: criticalRFIs.length,
      highValueCOs: highValuePendingCOs.length,
      overdueActions: overdueActions.length,
      lateDeliveries: lateDeliveries.length,
      weekStart: weekAgo.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      weekEnd: now.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    };
  }, [
    rfis,
    changeOrders,
    actionItems,
    deliveries,
    openRFIs,
    pendingCOs,
    overdueActions,
    lateDeliveries,
    now,
  ]);

  const handleExportCSV = () =>
    exportReportCSV(
      filteredRows,
      portfolioValue,
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
      subtitle={`As of ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · PM view / Executive view / Weekly summary / CSV + Print`}
      onExportCSV={handleExportCSV}
      headerActions={
        <button
          onClick={() => setShowWeeklySummary((p) => !p)}
          style={{
            background: showWeeklySummary
              ? "var(--accent-muted)"
              : "var(--bg-surface)",
            color: showWeeklySummary ? "var(--accent)" : "var(--text-secondary)",
            border: `1px solid ${
              showWeeklySummary ? "var(--accent)" : "var(--border-default)"
            }`,
            borderRadius: "var(--radius-btn)",
            padding: "8px 12px",
            ...mono,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: "pointer",
          }}
        >
          Weekly Summary
        </button>
      }
      filters={
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects by name, number, phase..."
            style={{
              flex: 1,
              minWidth: 280,
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-input)",
              padding: "9px 12px",
              color: "var(--text-primary)",
              ...body,
              fontSize: 12,
            }}
          />
          <ToggleGroup
            options={DATE_RANGES.map((dr) => ({ key: dr.key, label: dr.label }))}
            active={dateRange}
            onChange={setDateRange}
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
      {showWeeklySummary && (
        <WeeklySummary
          weeklySummary={weeklySummary}
          onClose={() => setShowWeeklySummary(false)}
        />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        <KPICard
          label="Portfolio Value"
          value={formatCurrency(portfolioValue)}
          detail={`${projects.length} total projects`}
          borderColor="var(--status-success)"
          onClick={() => setKpiFilter(kpiFilter === "value" ? null : "value")}
          active={kpiFilter === "value"}
        />
        <KPICard
          label="Active Projects"
          value={activeCount}
          detail={`${projects.length - activeCount} complete/closed`}
          borderColor="var(--status-info)"
          onClick={() => setKpiFilter(kpiFilter === "active" ? null : "active")}
          active={kpiFilter === "active"}
        />
        <KPICard
          label="Open RFIs"
          value={openRFIs.length}
          badge={overdueRFIs.length > 0 ? `${overdueRFIs.length} overdue` : null}
          detail={`${rfis.length} total`}
          borderColor="var(--status-warning)"
          onClick={() => setKpiFilter(kpiFilter === "rfis" ? null : "rfis")}
          active={kpiFilter === "rfis"}
        />
        <KPICard
          label="Pending COs"
          value={pendingCOs.length}
          detail={formatCurrency(pendingCOValue) + " pending value"}
          borderColor="#F97316"
          onClick={() => setKpiFilter(kpiFilter === "cos" ? null : "cos")}
          active={kpiFilter === "cos"}
        />
        <KPICard
          label="Budget Variance"
          value={
            (budgetVariance >= 0 ? "+" : "") + formatCurrency(budgetVariance)
          }
          detail={budgetVariance <= 0 ? "Under budget" : "Over budget"}
          borderColor={
            budgetVariance <= 0 ? "var(--status-success)" : "var(--status-error)"
          }
          onClick={() =>
            setKpiFilter(kpiFilter === "variance" ? null : "variance")
          }
          active={kpiFilter === "variance"}
        />
        <KPICard
          label="Overdue Actions"
          value={overdueActions.length}
          detail={`${actionItems.filter((a) => a.status !== "Complete" && a.status !== "Closed").length} open total`}
          borderColor="var(--status-error)"
          badge={overdueActions.length > 0 ? "past due" : null}
          onClick={() => setKpiFilter(kpiFilter === "overdue" ? null : "overdue")}
          active={kpiFilter === "overdue"}
        />
      </div>

      {viewMode === "executive" && (
        <ExecutiveSummary
          filteredRows={filteredRows}
          portfolioValue={portfolioValue}
          budgetVariance={budgetVariance}
          pendingCOValue={pendingCOValue}
          overdueRFIs={overdueRFIs}
          overdueActions={overdueActions}
          lateDeliveries={lateDeliveries}
        />
      )}

      <ProjectStatusMatrix
        title={
          viewMode === "executive" ? "Project Overview" : "Project Status Matrix"
        }
        filteredRows={filteredRows}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        kpiFilter={kpiFilter}
        onClearFilter={() => setKpiFilter(null)}
        search={search}
        navigate={navigate}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 16,
        }}
      >
        <div style={CARD}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <div style={CARD_TITLE}>Budget vs Actual</div>
            <InfoIcon tooltip="Grouped bar comparison of budget and actual spend per project" />
          </div>
          {barChartData.length > 0 ? (
            <BarChartSVG data={barChartData} width={420} height={200} />
          ) : (
            <div style={{ padding: "48px 0", textAlign: "center" }}>
              <p
                style={{
                  ...mono,
                  fontSize: 10,
                  color: "var(--text-muted)",
                }}
              >
                No budget data available
              </p>
            </div>
          )}
        </div>
        <div style={CARD}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <div style={CARD_TITLE}>RFI Status Distribution</div>
            <InfoIcon tooltip="Breakdown of RFIs by current status across all projects" />
          </div>
          {rfiDonutData.length > 0 ? (
            <DonutChartSVG segments={rfiDonutData} />
          ) : (
            <div style={{ padding: "48px 0", textAlign: "center" }}>
              <p
                style={{
                  ...mono,
                  fontSize: 10,
                  color: "var(--text-muted)",
                }}
              >
                No RFIs logged
              </p>
            </div>
          )}
        </div>
      </div>

      {urgentItems.length > 0 && (
        <div>
          <div style={{ ...CARD_TITLE, marginBottom: 12 }}>Urgent Items</div>
          <div
            style={{
              display: "flex",
              gap: 12,
              overflowX: "auto",
              paddingBottom: 8,
              scrollbarWidth: "thin",
              scrollbarColor:
                "var(--bg-surface-highest) var(--bg-surface-low)",
            }}
          >
            {urgentItems.map((item, i) => (
              <UrgentCard
                key={`${item.type}-${i}`}
                title={item.title}
                subtitle={item.subtitle}
                severity={item.severity}
                meta={item.meta}
                onClick={item.onClick}
              />
            ))}
          </div>
        </div>
      )}
    </ReportShell>
  );
}
