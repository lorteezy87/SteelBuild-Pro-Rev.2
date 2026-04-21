/**
 * Reports — portfolio-level dashboard.
 *
 * After the carve-up this file owns three things:
 *   1. The React-Query fetches for every entity the dashboard rolls up
 *      (projects, rfis, change orders, expenses, action items,
 *      deliveries, work packages, cost codes).
 *   2. The derived data that cross-cuts those entities: per-project
 *      rows (with health, budget, variance, RFI/CO/WP counts), KPI
 *      rollups, chart datasets, urgent-items list, weekly summary.
 *   3. The composition of feature-folder components in `./reports/`:
 *      RichEmptyState, WeeklySummary, KPICard, ExecutiveSummary,
 *      ProjectStatusMatrix, BarChartSVG, DonutChartSVG, UrgentCard,
 *      InfoIcon.
 *
 * Everything stylistic or visual (charts, skeletons, KPI tiles, the
 * matrix, etc.) lives in `./reports/`. Style tokens + helpers live in
 * `./reports/constants.js` and `./reports/utils.js`.
 */

import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import {
  mono, body, CARD, CARD_TITLE, DATE_RANGES,
} from "./reports/constants";
import {
  formatCurrency, computeHealth, exportReportCSV, printReport,
} from "./reports/utils";
import { BarChartSVG, DonutChartSVG } from "./reports/charts";
import RichEmptyState from "./reports/RichEmptyState";
import KPICard from "./reports/KPICard";
import InfoIcon from "./reports/InfoIcon";
import UrgentCard from "./reports/UrgentCard";
import ExecutiveSummary from "./reports/ExecutiveSummary";
import WeeklySummary from "./reports/WeeklySummary";
import ProjectStatusMatrix from "./reports/ProjectStatusMatrix";
import { CommandBar } from "@/components/design-system";
import { Download, Printer } from "lucide-react";

export default function Reports() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [kpiFilter, setKpiFilter] = useState(null);
  const [viewMode, setViewMode] = useState("pm"); // "pm" | "executive"
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
  // eslint-disable-next-line no-unused-vars
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses-all"],
    queryFn: () => base44.entities.Expense.list(),
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
    [openRFIs]
  );
  const pendingCOs = useMemo(
    () => changeOrders.filter((c) => c.status === "Pending" || c.status === "Under Review"),
    [changeOrders]
  );
  const pendingCOValue = useMemo(
    () => pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0),
    [pendingCOs]
  );
  const overdueActions = useMemo(
    () =>
      actionItems.filter(
        (a) => a.status !== "Complete" && a.status !== "Closed" && a.due_date && new Date(a.due_date) < now
      ),
    [actionItems]
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
    [deliveries]
  );

  /* Per-project computed rows (feeds the matrix + KPI aggregates). */
  const projectRows = useMemo(() => {
    return projects.map((p) => {
      const pCodes = costCodes.filter((c) => c.project_id === p.id);
      const budget = pCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0) || Number(p.original_contract_value) || 0;
      const actual = pCodes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
      const variance = budget > 0 ? actual - budget : 0;
      const var_pct = budget > 0 ? (variance / budget) * 100 : 0;
      const health = computeHealth(budget, actual);

      const pRFIs = rfis.filter((r) => r.project_id === p.id && !["Answered", "Closed"].includes(r.status));
      const pCOs = changeOrders.filter((c) => c.project_id === p.id && (c.status === "Pending" || c.status === "Under Review"));
      const pWPs = workPackages.filter((w) => w.project_id === p.id);
      const wpTotal = pWPs.length;
      const wpComplete = pWPs.filter((w) => w.status === "Complete" || w.status === "Shipped").length;
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

  /* KPIs */
  const portfolioValue = useMemo(
    () => projectRows.reduce((s, r) => s + r.budget, 0),
    [projectRows]
  );
  const activeCount = projects.filter((p) => p.status !== "Complete" && p.status !== "Closed").length;
  const budgetVariance = useMemo(
    () => projectRows.reduce((s, r) => s + r.variance, 0),
    [projectRows]
  );

  /* Filter & sort project rows */
  const filteredRows = useMemo(() => {
    let rows = [...projectRows];

    // KPI filter
    if (kpiFilter === "value") {
      rows = rows.filter((r) => r.budget > 0);
    } else if (kpiFilter === "active") {
      rows = rows.filter((r) => {
        const p = r.raw;
        return p.status !== "Complete" && p.status !== "Closed";
      });
    } else if (kpiFilter === "rfis") {
      rows = rows.filter((r) => r.openRFIs > 0);
    } else if (kpiFilter === "cos") {
      rows = rows.filter((r) => r.openCOs > 0);
    } else if (kpiFilter === "variance") {
      rows = rows.filter((r) => r.variance !== 0);
    } else if (kpiFilter === "overdue") {
      const overdueProjectIds = new Set(overdueActions.map((a) => a.project_id));
      rows = rows.filter((r) => overdueProjectIds.has(r.id));
    }

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.number.toLowerCase().includes(q) ||
          r.phase.toLowerCase().includes(q)
      );
    }

    // Sort
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

  /* Sort handler */
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  /* Chart data */
  const barChartData = useMemo(
    () =>
      projectRows
        .filter((r) => r.budget > 0 || r.actual > 0)
        .slice(0, 12)
        .map((r) => ({
          name: r.number,
          budget: r.budget,
          actual: r.actual,
        })),
    [projectRows]
  );

  const rfiDonutData = useMemo(() => {
    const open = rfis.filter((r) => r.status === "Open").length;
    const underReview = rfis.filter((r) => r.status === "Under Review").length;
    const answered = rfis.filter((r) => r.status === "Answered").length;
    const closed = rfis.filter((r) => r.status === "Closed").length;
    return [
      { label: "Open",         value: open,        color: "var(--status-warning)" },
      { label: "Under Review", value: underReview, color: "var(--status-info)"    },
      { label: "Answered",     value: answered,    color: "var(--status-success)" },
      { label: "Closed",       value: closed,      color: "var(--text-muted)"     },
    ].filter((s) => s.value > 0);
  }, [rfis]);

  /* Urgent items */
  const urgentItems = useMemo(() => {
    const items = [];
    overdueRFIs.slice(0, 5).forEach((r) => {
      const proj = projects.find((p) => p.id === r.project_id);
      items.push({
        type: "rfi",
        title: r.rfi_number || "RFI",
        subtitle: r.subject || "No subject",
        severity: r.priority === "Critical" ? "critical" : r.priority === "High" ? "high" : "medium",
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

  /* ── Weekly Summary Data ── */
  const weeklySummary = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const newRFIs = rfis.filter((r) => r.created_date && new Date(r.created_date) >= weekAgo);
    const closedRFIs = rfis.filter((r) => r.status === "Closed" && r.date_answered && new Date(r.date_answered) >= weekAgo);
    const newCOs = changeOrders.filter((c) => c.created_date && new Date(c.created_date) >= weekAgo);
    const approvedCOs = changeOrders.filter((c) => c.status === "Approved" && c.approval_date && new Date(c.approval_date) >= weekAgo);
    const approvedCOValue = approvedCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const completedActions = actionItems.filter(
      (a) => (a.status === "Complete" || a.status === "Closed") && a.completed_date && new Date(a.completed_date) >= weekAgo
    );
    const recentDeliveries = deliveries.filter(
      (d) => d.status === "Delivered" && d.actual_delivery_date && new Date(d.actual_delivery_date) >= weekAgo
    );

    const criticalRFIs = openRFIs.filter((r) => r.priority === "Critical");
    const highValuePendingCOs = pendingCOs.filter((c) => (Number(c.co_amount) || 0) > 50000);

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
      weekStart: weekAgo.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weekEnd: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };
  }, [rfis, changeOrders, actionItems, deliveries, openRFIs, pendingCOs, overdueActions, lateDeliveries]);

  /* ── FULL EMPTY STATE ── */
  if (projects.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Header projectsCount={0} now={now} />
        <RichEmptyState navigate={navigate} />
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </div>
    );
  }

  /* ── MAIN RENDER ── */
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow="PORTFOLIO"
        title="Reports"
        count={projects.length}
        unit=" · PROJECTS"
        subtitle={`As of ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · PM view / Executive view / Weekly summary / CSV + PDF export`}
      >
        <button
          onClick={() => setShowWeeklySummary((p) => !p)}
          style={{
            background: showWeeklySummary ? "var(--accent-muted)" : "var(--bg-surface)",
            color: showWeeklySummary ? "var(--accent)" : "var(--text-secondary)",
            border: `1px solid ${showWeeklySummary ? "var(--accent)" : "var(--border-default)"}`,
            borderRadius: "var(--radius-btn)", padding: "8px 12px",
            ...mono, fontSize: 10, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer",
          }}
        >
          Weekly Summary
        </button>
        <button
          onClick={() => exportReportCSV(filteredRows, portfolioValue, openRFIs.length, pendingCOs.length, budgetVariance)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--bg-surface)", color: "var(--text-secondary)",
            border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)",
            padding: "8px 12px", ...mono, fontSize: 10, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer",
          }}
        >
          <Download size={12} /> CSV
        </button>
        <button
          onClick={printReport}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--accent)", color: "var(--bg-base)", border: "none",
            borderRadius: "var(--radius-btn)", padding: "8px 14px",
            ...mono, fontSize: 10, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <Printer size={12} /> PDF
        </button>
      </CommandBar>

      {/* Filter / view bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
          options={DATE_RANGES.map((dr) => ({ key: dr.key, label: dr.label }))}
          active={dateRange}
          onChange={setDateRange}
        />
        <ToggleGroup
          options={[{ key: "pm", label: "PM VIEW" }, { key: "executive", label: "EXECUTIVE" }]}
          active={viewMode}
          onChange={setViewMode}
        />
      </div>

      {showWeeklySummary && (
        <WeeklySummary weeklySummary={weeklySummary} onClose={() => setShowWeeklySummary(false)} />
      )}

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
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
          value={(budgetVariance >= 0 ? "+" : "") + formatCurrency(budgetVariance)}
          detail={budgetVariance <= 0 ? "Under budget" : "Over budget"}
          borderColor={budgetVariance <= 0 ? "var(--status-success)" : "var(--status-error)"}
          onClick={() => setKpiFilter(kpiFilter === "variance" ? null : "variance")}
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

      {/* Executive summary (only when viewMode === "executive") */}
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

      {/* Project status matrix */}
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

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <div style={CARD}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={CARD_TITLE}>Budget vs Actual</div>
            <InfoIcon tooltip="Grouped bar comparison of budget and actual spend per project" />
          </div>
          {barChartData.length > 0 ? (
            <BarChartSVG data={barChartData} width={420} height={200} />
          ) : (
            <div style={{ padding: "48px 0", textAlign: "center" }}>
              <p style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>No budget data available</p>
            </div>
          )}
        </div>
        <div style={CARD}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={CARD_TITLE}>RFI Status Distribution</div>
            <InfoIcon tooltip="Breakdown of RFIs by current status across all projects" />
          </div>
          {rfiDonutData.length > 0 ? (
            <DonutChartSVG segments={rfiDonutData} />
          ) : (
            <div style={{ padding: "48px 0", textAlign: "center" }}>
              <p style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>No RFIs logged</p>
            </div>
          )}
        </div>
      </div>

      {/* Urgent items strip */}
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
              scrollbarColor: "var(--bg-surface-highest) var(--bg-surface-low)",
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

      {/* Shimmer animation + print rules (scoped inline on purpose) */}
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @media print {
          body { background: #fff !important; color: #000 !important; }
          button, input, select { display: none !important; }
          div[style*="overflowX"] { overflow: visible !important; }
          div[style*="gap: 8"] { gap: 4px !important; }
        }
      `}</style>
    </div>
  );
}

/* ── Local atoms: not worth a file each, not reused anywhere else ── */

function Header({ projectsCount, now }) {
  return (
    <div>
      <h1
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 22,
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        Portfolio Reports
      </h1>
      <p
        style={{
          ...mono,
          fontSize: 10,
          color: "var(--text-muted)",
          marginTop: 4,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {projectsCount} project{projectsCount !== 1 ? "s" : ""} &middot;{" "}
        {now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </p>
    </div>
  );
}

function ToggleGroup({ options, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 0, border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
      {options.map((o, i) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            background: active === o.key ? "var(--accent-muted)" : "transparent",
            color: active === o.key ? "var(--accent)" : "var(--text-secondary)",
            border: "none",
            borderRight: i < options.length - 1 ? "1px solid var(--border-default)" : "none",
            padding: "8px 12px",
            ...mono,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: "pointer",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
