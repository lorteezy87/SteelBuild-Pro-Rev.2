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
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Activity, AlertTriangle, BarChart3, Building2, CalendarDays,
  CircleDot, DollarSign, Layers, ShieldAlert, Sparkles, TrendingUp,
} from "lucide-react";

import {
  isRfiOpen,
  isCoPending,
  isActionItemOpen,
} from "@/lib/entityPredicates";
import { mono, body } from "./constants";
import { computeHealth, exportReportCSV } from "./utils";
import { formatCurrencyShort } from "@/components/shared/formatters";
import { BarChartSVG, DonutChartSVG } from "./charts";
import { severityColor } from "./risks/severity";
import RichEmptyState from "./RichEmptyState";
import ProjectStatusMatrix from "./ProjectStatusMatrix";
import ReportShell from "./ReportShell";
import { ToggleGroup } from "./ReportFilters";
import SectionCard from "@/pages/dashboard/sections/SectionCard";

/* ── one shared "Tile" component shaped like the project dashboard's ── */
function Tile({ icon: Icon, label, value, sub, accent, active, onClick, badge }) {
  const interactive = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${active ? accent : "var(--border-default)"}`,
        borderRadius: 10,
        padding: "14px 16px",
        cursor: interactive ? "pointer" : "default",
        transition: "border-color 0.12s, transform 0.12s",
        position: "relative",
        outline: active ? `1px solid ${accent}` : "none",
      }}
      onMouseEnter={(e) => {
        if (interactive) e.currentTarget.style.borderColor = accent;
      }}
      onMouseLeave={(e) => {
        if (interactive && !active) e.currentTarget.style.borderColor = "var(--border-default)";
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 8, gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Icon && (
            <div style={{
              width: 24, height: 24, borderRadius: 6,
              background: accent + "1A",
              color: accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Icon size={13} />
            </div>
          )}
          <div style={{
            ...mono, fontSize: 9, fontWeight: 700,
            letterSpacing: "0.10em", textTransform: "uppercase",
            color: "var(--text-muted)",
          }}>
            {label}
          </div>
        </div>
        {badge != null && (
          <span style={{
            ...mono, fontSize: 8, fontWeight: 700,
            color: "#fff", background: "var(--status-error)",
            borderRadius: "var(--radius-badge)",
            padding: "2px 6px",
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{
        ...mono, fontSize: 22, fontWeight: 700,
        color: accent || "var(--text-primary)",
        lineHeight: 1.1, marginBottom: 4,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          ...body, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* ── small drift bar: schedule elapsed vs work complete ── */
function DriftRow({ row, onClick }) {
  const elapsed = Math.max(0, Math.min(100, row.elapsedPct || 0));
  const complete = Math.max(0, Math.min(100, row.wpPct || 0));
  const drift = elapsed - complete;
  const driftColor =
    drift >= 25 ? "var(--status-error)"
      : drift >= 10 ? "var(--status-warning)"
      : "var(--status-success)";
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(180px, 2fr) 1fr 90px",
        gap: 14,
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: 8,
        cursor: onClick ? "pointer" : "default",
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-row-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-surface-low)")}
    >
      <div style={{ overflow: "hidden" }}>
        <div style={{
          ...body, fontSize: 12, fontWeight: 600,
          color: "var(--text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {row.name}
        </div>
        <div style={{
          ...mono, fontSize: 9, color: "var(--text-muted)",
          letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2,
        }}>
          {row.phase}
        </div>
      </div>
      <div style={{ position: "relative", height: 18 }}>
        {/* schedule (elapsed) bar — wider, muted */}
        <div style={{
          position: "absolute", inset: 0,
          height: 6, top: 4,
          background: "var(--bg-surface-high)",
          borderRadius: 3,
        }} />
        <div style={{
          position: "absolute", left: 0, top: 4,
          width: `${elapsed}%`, height: 6,
          background: "var(--text-muted)",
          borderRadius: 3,
          opacity: 0.7,
        }} />
        {/* progress (complete) bar — overlaid, full color */}
        <div style={{
          position: "absolute", left: 0, top: 4,
          width: `${complete}%`, height: 6,
          background: driftColor,
          borderRadius: 3,
        }} />
      </div>
      <div style={{
        ...mono, fontSize: 11, fontWeight: 700,
        color: driftColor,
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
      }}>
        {complete.toFixed(0)}% / {elapsed.toFixed(0)}%
      </div>
    </div>
  );
}

/* ── compact urgent-item card ── */
function UrgentTile({ item, onClick }) {
  const SEV = {
    critical: "var(--status-error)",
    high:     "var(--status-warning)",
    medium:   "var(--status-info)",
    low:      "var(--text-muted)",
  };
  const color = SEV[item.severity] || SEV.medium;
  return (
    <div
      onClick={onClick}
      style={{
        minWidth: 240, maxWidth: 280, flexShrink: 0,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: "12px 14px",
        cursor: onClick ? "pointer" : "default",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = color)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
    >
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: 6,
      }}>
        <span style={{
          ...mono, fontSize: 8, fontWeight: 700, color,
          textTransform: "uppercase", letterSpacing: "0.10em",
        }}>
          {item.kind}
        </span>
        <span style={{
          ...mono, fontSize: 8, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          {item.severity}
        </span>
      </div>
      <div style={{
        ...body, fontSize: 12, fontWeight: 600,
        color: "var(--text-primary)", marginBottom: 4, lineHeight: 1.3,
      }}>
        {item.title}
      </div>
      <div style={{
        ...body, fontSize: 11, color: "var(--text-secondary)",
        marginBottom: 4, lineHeight: 1.4,
        overflow: "hidden", textOverflow: "ellipsis",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
      }}>
        {item.subtitle}
      </div>
      {item.meta && (
        <div style={{
          ...mono, fontSize: 8, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "0.08em",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.meta}
        </div>
      )}
    </div>
  );
}

/* ── small numeric stat block for "this week" ── */
function WeekStat({ label, value, color = "var(--text-primary)", sub }) {
  return (
    <div style={{
      padding: "12px 14px",
      background: "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      borderRadius: 8,
    }}>
      <div style={{
        ...mono, fontSize: 9, fontWeight: 700,
        letterSpacing: "0.10em", textTransform: "uppercase",
        color: "var(--text-muted)", marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        ...mono, fontSize: 18, fontWeight: 700,
        color, lineHeight: 1, fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

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
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });
  const { data: rawRfis = [] } = useQuery({
    queryKey: ["rfis"],
    queryFn: () => base44.entities.RFI.list(),
  });
  const { data: rawCOs = [] } = useQuery({
    queryKey: ["change-orders-global"],
    queryFn: () => base44.entities.ChangeOrder.list(),
  });
  const { data: rawActions = [] } = useQuery({
    queryKey: ["action-items-all"],
    queryFn: () => base44.entities.ActionItem.list(),
  });
  const { data: rawDeliveries = [] } = useQuery({
    queryKey: ["deliveries-all"],
    queryFn: () => base44.entities.Delivery.list(),
  });
  const { data: rawWPs = [] } = useQuery({
    queryKey: ["work-packages-global"],
    queryFn: () => base44.entities.WorkPackage.list(),
  });
  const { data: rawCostCodes = [] } = useQuery({
    queryKey: ["cost-codes-global"],
    queryFn: () => base44.entities.CostCode.list(),
  });
  // Expenses carry the real "actuals" — `cost_codes.actual_cost` is
  // populated on only ~2 of 150 rows in production, so the matrix
  // previously rendered $0 for actual on every project. Sum from
  // expenses (excluding Voided) per project to get the real number.
  const { data: rawExpenses = [] } = useQuery({
    queryKey: ["expenses-all"],
    queryFn: () => base44.entities.Expense.list(),
  });
  const { data: rawRisks = [] } = useQuery({
    queryKey: ["risks-all"],
    queryFn: () => base44.entities.Risk.list(),
  });

  /* ── Defensive soft-delete filters. Most of these collections come
       through entities that already auto-filter, but the page also
       reads from `projects`, `action_items`, and `cost_codes` which
       don't have soft-delete columns yet — and the filter is a no-op
       for rows without `is_deleted`. ── */
  const projects     = useMemo(() => rawProjects.filter((p) => !p?.is_deleted), [rawProjects]);
  const rfis         = useMemo(() => rawRfis.filter((r) => !r?.is_deleted), [rawRfis]);
  const changeOrders = useMemo(() => rawCOs.filter((c) => !c?.is_deleted), [rawCOs]);
  const actionItems  = useMemo(() => rawActions.filter((a) => !a?.is_deleted), [rawActions]);
  const deliveries   = useMemo(() => rawDeliveries.filter((d) => !d?.is_deleted), [rawDeliveries]);
  const workPackages = useMemo(() => rawWPs.filter((w) => !w?.is_deleted), [rawWPs]);
  const costCodes    = useMemo(() => rawCostCodes.filter((c) => !c?.is_deleted), [rawCostCodes]);
  const expenses     = useMemo(() => rawExpenses.filter((e) => !e?.is_deleted), [rawExpenses]);
  const risks        = useMemo(() => rawRisks.filter((r) => !r?.is_deleted), [rawRisks]);

  const now = useMemo(() => new Date(), []);

  /* ── Derived collections ──
       All four "open / pending" predicates come from the shared
       `entityPredicates` module so this report can't drift from the
       project dashboard or ProjectDetails. */
  const openRFIs = useMemo(() => rfis.filter(isRfiOpen), [rfis]);
  const overdueRFIs = useMemo(
    () => openRFIs.filter((r) => r.date_required && new Date(r.date_required) < now),
    [openRFIs] // eslint-disable-line react-hooks/exhaustive-deps
  );
  /** Pending CO = Submitted + Under Review (per change_orders CHECK
   *  constraint). There is no literal "Pending" status. */
  const pendingCOs = useMemo(
    () => changeOrders.filter(isCoPending),
    [changeOrders]
  );
  const pendingCOValue = useMemo(
    () => pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0),
    [pendingCOs]
  );

  const overdueActions = useMemo(
    () =>
      actionItems.filter(
        (a) => isActionItemOpen(a) && a.due_date && new Date(a.due_date) < now
      ),
    [actionItems] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** AUDIT: late deliveries. The deliveries table uses `scheduled_date`
   *  / `actual_date`, not `expected_delivery_date` / `actual_delivery_date`.
   *  The original page read both non-existent columns. */
  const lateDeliveries = useMemo(
    () =>
      deliveries.filter(
        (d) =>
          d.status !== "Delivered" &&
          d.status !== "Cancelled" &&
          d.scheduled_date &&
          new Date(d.scheduled_date) < now
      ),
    [deliveries] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Open risks = anything still on the books. Closed/Mitigated are
   *  considered resolved per `severity.js#isActiveRisk`. */
  const openRisks = useMemo(
    () => risks.filter((r) => !["Closed", "Mitigated"].includes(r.status)),
    [risks]
  );
  const criticalRisks = useMemo(
    () => openRisks.filter((r) => r.severity === "Critical"),
    [openRisks]
  );

  /** AUDIT: Active projects = phase ≠ Closeout. The original page
   *  filtered `p.status` which doesn't exist on the projects table —
   *  every project was silently treated as Active. */
  const activeProjects = useMemo(
    () => projects.filter((p) => p.phase !== "Closeout"),
    [projects]
  );

  /* ── Per-project rollup ── */
  const projectRows = useMemo(() => {
    return projects.map((p) => {
      const pCodes = costCodes.filter((c) => c.project_id === p.id);
      const ccBudget = pCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
      const baseContract = Number(p.original_contract_value) || 0;
      // Approved-CO delta lifts the working budget so a project that
      // gained $200K in approved COs reads as "in budget" against the
      // revised number, not the original.
      const approvedDelta = changeOrders
        .filter((c) => c.project_id === p.id && c.status === "Approved")
        .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
      const revisedContract = baseContract + approvedDelta;
      // Use cost-code budget when populated, else revised contract.
      const budget = ccBudget || revisedContract || baseContract;
      // Sum actuals from `expenses` (the canonical source — Voided rows
      // excluded). cost_codes.actual_cost was empty on 148 of 150 live
      // rows, so the prior calc rendered $0 actual for every project
      // even when the project had paid expenses. Fall back to the
      // cost-code actual_cost only when no expenses exist for a
      // project (covers any historical row that pre-dates the
      // expenses table).
      const pExpenses = expenses.filter((e) => e.project_id === p.id && e.payment_status !== "Voided");
      const expenseActual = pExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const ccActual = pCodes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
      const actual = expenseActual > 0 ? expenseActual : ccActual;
      const variance = budget > 0 ? actual - budget : 0;
      const var_pct = budget > 0 ? (variance / budget) * 100 : 0;
      const health = computeHealth(budget, actual);

      const pRFIs = rfis.filter((r) => r.project_id === p.id && isRfiOpen(r));
      const pCOs  = changeOrders.filter((c) => c.project_id === p.id && isCoPending(c));
      const pWPs = workPackages.filter((w) => w.project_id === p.id);
      const wpTotal = pWPs.length;
      // wpPct uses percent_complete average rather than the binary
      // status check the original used (which left "Shipped" — a
      // non-canonical WP status — as a dead branch).
      const wpPct = wpTotal > 0
        ? pWPs.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / wpTotal
        : 0;

      // Schedule elapsed % (for the drift micro-bar). Mirrors
      // timelineElapsedPct() in projectMetrics so the matrix and the
      // project dashboard read the same number.
      const startDate = p.start_date ? new Date(p.start_date) : null;
      const targetDate = p.target_completion_date
        ? new Date(p.target_completion_date)
        : (p.forecast_completion_date ? new Date(p.forecast_completion_date) : null);
      let elapsedPct = 0;
      if (startDate && targetDate && targetDate > startDate) {
        const total = targetDate - startDate;
        const used = Math.max(0, now - startDate);
        elapsedPct = Math.min(100, Math.max(0, (used / total) * 100));
      }

      return {
        id: p.id,
        number: p.project_number || `P-${p.id.slice(0, 6)}`,
        name: p.name || "Untitled Project",
        phase: p.phase || "Unknown",
        health,
        budget,
        actual,
        variance,
        var_pct,
        revisedContract,
        approvedDelta,
        openRFIs: pRFIs.length,
        openCOs: pCOs.length,
        wpPct,
        elapsedPct,
        raw: p,
      };
    });
  }, [projects, costCodes, expenses, rfis, changeOrders, workPackages, now]);

  /* ── Portfolio totals ── */
  const portfolioContract = useMemo(
    () => projects.reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0),
    [projects]
  );
  const portfolioRevised = useMemo(
    () => projectRows.reduce((s, r) => s + r.revisedContract, 0),
    [projectRows]
  );
  const budgetVariance = useMemo(
    () => projectRows.reduce((s, r) => s + r.variance, 0),
    [projectRows]
  );

  /* ── Tons produced (derived) — sum of WP tonnage at 100% complete.
       Flagged as a derived rollup; callers wanting "actually erected"
       tonnage should swap in the proper field once it lands. ── */
  const tonsProduced = useMemo(() => {
    return workPackages
      .filter((w) => Number(w.percent_complete) >= 100 || w.status === "Complete")
      .reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  }, [workPackages]);
  const tonsPlanned = useMemo(
    () => workPackages.reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
    [workPackages]
  );

  /* ── Critical alerts (derived). Composite of the things that page
       owners on today: critical-priority open RFIs + open Critical
       risks + late deliveries. Not pulled from a single Alerts
       entity — that would be a wider rewrite. ── */
  const criticalAlertCount = useMemo(() => {
    const critRFIs = openRFIs.filter((r) => r.priority === "Critical").length;
    return critRFIs + criticalRisks.length + lateDeliveries.length;
  }, [openRFIs, criticalRisks, lateDeliveries]);

  /* ── Health rollup ── */
  const healthRollup = useMemo(() => {
    const acc = { good: 0, watch: 0, risk: 0, neutral: 0 };
    for (const r of projectRows) acc[r.health] = (acc[r.health] || 0) + 1;
    return acc;
  }, [projectRows]);

  /* ── Filter + sort the matrix ── */
  const filteredRows = useMemo(() => {
    let rows = [...projectRows];
    if (kpiFilter === "value") rows = rows.filter((r) => r.revisedContract > 0);
    else if (kpiFilter === "active")
      rows = rows.filter((r) => r.phase !== "Closeout");
    else if (kpiFilter === "rfis") rows = rows.filter((r) => r.openRFIs > 0);
    else if (kpiFilter === "cos") rows = rows.filter((r) => r.openCOs > 0);
    else if (kpiFilter === "variance") rows = rows.filter((r) => r.variance !== 0);
    else if (kpiFilter === "overdue") {
      const ids = new Set(overdueActions.map((a) => a.project_id));
      rows = rows.filter((r) => ids.has(r.id));
    } else if (kpiFilter === "risks") {
      const ids = new Set(criticalRisks.map((r) => r.project_id));
      rows = rows.filter((r) => ids.has(r.id));
    } else if (kpiFilter === "alerts") {
      const ids = new Set([
        ...openRFIs.filter((r) => r.priority === "Critical").map((r) => r.project_id),
        ...criticalRisks.map((r) => r.project_id),
        ...lateDeliveries.map((d) => d.project_id),
      ]);
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

  /* ── Drift rows — projects sorted by drift descending, top 8. ── */
  const driftRows = useMemo(() => {
    return [...projectRows]
      .filter((r) => r.phase !== "Closeout")
      .map((r) => ({
        ...r,
        drift: (r.elapsedPct || 0) - (r.wpPct || 0),
      }))
      .sort((a, b) => b.drift - a.drift)
      .slice(0, 8);
  }, [projectRows]);

  /* ── Top urgent items ── */
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

  /* ── Top open risks (Critical + High by score) ── */
  const topRisks = useMemo(() => {
    return [...openRisks]
      .filter((r) => ["Critical", "High"].includes(r.severity))
      .map((r) => ({ ...r, _score: (Number(r.probability) || 0) * (Number(r.impact) || 0) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
  }, [openRisks]);

  /* ── This week's activity (last 7 days) ──
       AUDIT: action_items has no `completed_date` column. We use
       `updated_at` as the proxy for "completed-this-week" — close
       enough since closing a row writes updated_at. */
  const weekly = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoIso = weekAgo.toISOString();

    const newRFIs = rfis.filter(
      (r) => (r.created_at || r.created_date || r.submitted_date) &&
             new Date(r.created_at || r.created_date || r.submitted_date) >= weekAgo
    );
    const closedRFIs = rfis.filter(
      (r) => r.status === "Closed" && r.date_answered &&
             new Date(r.date_answered) >= weekAgo
    );
    const newCOs = changeOrders.filter(
      (c) => (c.created_at || c.created_date) &&
             new Date(c.created_at || c.created_date) >= weekAgo
    );
    /* AUDIT FIX: use approved_date, not approval_date. */
    const approvedCOs = changeOrders.filter(
      (c) => c.status === "Approved" && c.approved_date &&
             new Date(c.approved_date) >= weekAgo
    );
    const approvedCOValue = approvedCOs.reduce(
      (s, c) => s + (Number(c.co_amount) || 0), 0
    );
    /* AUDIT NOTE: action_items has no completed_date — proxy on
       updated_at for status that became Complete/Closed/Resolved. */
    const completedActions = actionItems.filter(
      (a) =>
        ["Complete", "Closed", "Resolved"].includes(a.status) &&
        a.updated_at && a.updated_at >= weekAgoIso
    );
    /* AUDIT FIX: deliveries.actual_date, not actual_delivery_date. */
    const recentDeliveries = deliveries.filter(
      (d) => d.status === "Delivered" && d.actual_date &&
             new Date(d.actual_date) >= weekAgo
    );

    return {
      newRFIs: newRFIs.length,
      closedRFIs: closedRFIs.length,
      newCOs: newCOs.length,
      approvedCOs: approvedCOs.length,
      approvedCOValue,
      completedActions: completedActions.length,
      recentDeliveries: recentDeliveries.length,
      weekStart: weekAgo.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weekEnd: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };
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
          accent="#F97316"
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

/* ── Local subcomponents ── */
function HealthBucket({ label, count, color, description }) {
  return (
    <div style={{
      padding: "12px 14px",
      background: "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      borderLeft: `3px solid ${color}`,
      borderRadius: 8,
    }}>
      <div style={{
        ...mono, fontSize: 9, fontWeight: 700,
        letterSpacing: "0.10em", textTransform: "uppercase",
        color: "var(--text-muted)", marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        ...mono, fontSize: 22, fontWeight: 700, color, lineHeight: 1,
        marginBottom: 6, fontVariantNumeric: "tabular-nums",
      }}>
        {count}
      </div>
      <div style={{
        ...body, fontSize: 11, color: "var(--text-secondary)",
      }}>
        {description}
      </div>
    </div>
  );
}

function ChartPanel({ title, subtitle, children }) {
  return (
    <div style={{
      background: "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      borderRadius: 10,
      padding: "14px 16px",
    }}>
      <div style={{
        ...mono, fontSize: 9, fontWeight: 700,
        letterSpacing: "0.10em", textTransform: "uppercase",
        color: "var(--text-primary)", marginBottom: 4,
      }}>
        {title}
      </div>
      {subtitle && (
        <div style={{
          ...body, fontSize: 11, color: "var(--text-muted)", marginBottom: 12,
        }}>
          {subtitle}
        </div>
      )}
      {children}
    </div>
  );
}

function EmptyMicro({ label }) {
  return (
    <div style={{
      padding: "32px 16px", textAlign: "center",
      ...mono, fontSize: 10,
      color: "var(--text-muted)",
      letterSpacing: "0.08em", textTransform: "uppercase",
    }}>
      {label}
    </div>
  );
}

function ExecutiveColumn({ title, accent, children }) {
  return (
    <div>
      <div style={{
        ...mono, fontSize: 9, fontWeight: 700,
        letterSpacing: "0.12em", color: accent, marginBottom: 10,
      }}>
        {title.toUpperCase()}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function ExecutiveLine({ label, value, color }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      alignItems: "center",
    }}>
      <span style={{ ...body, fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{
        ...mono, fontSize: 14, fontWeight: 700, color,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
    </div>
  );
}

function ExecutiveCallout({ color, children }) {
  return (
    <div style={{
      ...body, fontSize: 12, color,
      borderLeft: `3px solid ${color}`, paddingLeft: 10,
    }}>
      {children}
    </div>
  );
}
