import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatCurrency, isOverdue, daysOverdue, parseUTCDate, statusIn } from "../shared/formatters";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { useProjectContext } from "@/components/shared/useProjectContext";
import ProgressBar from "../shared/ProgressBar";
import { computeWeightedHealth, HealthPill, HEALTH_ORDER, healthColor } from "./portfolioHealth";
import {
  PHASE_DOT,
  parseTaskDate,
  summarizeProjectSchedule,
  MiniProjectTimeline,
} from "./portfolioTimeline";

/* ── Enhanced Mini SVG Sparkline with area fill and trend arrow ────────────── */
function MiniSparkline({ data = [], color = "var(--accent)", width = 56, height = 22, showTrend = true }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const id = `spark-${Math.random().toString(36).slice(2, 8)}`;
  const coords = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * (height - 4) - 2,
  }));
  const linePoints = coords.map(c => `${c.x},${c.y}`).join(" ");
  const areaPoints = `0,${height} ${linePoints} ${width},${height}`;
  const trend = data[data.length - 1] - data[0];
  const trendChar = trend > 0 ? "▲" : trend < 0 ? "▼" : "—";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill={`url(#${id})`} />
        <polyline points={linePoints} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={coords[coords.length-1].x} cy={coords[coords.length-1].y} r={2} fill={color} />
      </svg>
      {showTrend && trend !== 0 && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color, fontWeight: 700, lineHeight: 1 }}>
          {trendChar}
        </span>
      )}
    </div>
  );
}

const ROW_HEIGHT = 40;

const PhoenixTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--bg-surface-high)",
        border: "1px solid var(--accent-border)",
        borderRadius: 2,
        padding: "8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--text-primary)",
      }}
    >
      <div style={{ marginBottom: 4, color: "var(--accent)" }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value).replace(/\.\d+/, "")}
        </div>
      ))}
    </div>
  );
};

const Card = ({ children, style = {} }) => (
  <div
    style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-card)",
      boxShadow: "var(--shadow-card)",
      overflow: "hidden",
      ...style,
    }}
  >
    {children}
  </div>
);

const HeaderBar = ({ title, right, count }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: "1px solid var(--divider)",
      background: "var(--bg-surface-low)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 3, height: 16, background: "var(--accent)", borderRadius: 2 }} />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.10em",
          color: "var(--text-primary)",
          textTransform: "uppercase",
        }}
      >
        {title}
      </span>
      {count != null && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 2,
            background: "var(--accent-muted)",
            color: "var(--accent)",
            border: "1px solid var(--accent-border)",
          }}
        >
          {count}
        </span>
      )}
    </div>
    {right}
  </div>
);

// KPIBlock — shared tile layout for the portfolio KPI strip. Fixes a
// cut-off bug where long currency values ("$125,432,187") wrapped or
// clipped because the number span had no whitespace rule and the
// tile had a too-small min-width. We now clamp the tile to a minimum
// that fits an 11-digit dollar amount at the reduced 20px size +
// pin the value row to a single line with graceful overflow.
const KPIBlock = ({ label, value, color, bordered, onClick, active }) => (
  <div
    onClick={onClick}
    style={{
      padding: "12px 20px",
      borderRight: bordered ? "1px solid var(--divider)" : "none",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      cursor: onClick ? "pointer" : "default",
      borderTop: active ? "3px solid var(--accent)" : "3px solid transparent",
      boxShadow: active ? "0 0 12px rgba(59,130,246,0.25)" : "none",
      transition: "box-shadow 0.2s, border-top 0.2s",
      minWidth: 160,
      overflow: "hidden",
    }}
  >
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {label}
    </span>
    <span
      title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 20,
        fontWeight: 800,
        lineHeight: 1.1,
        color: color || "var(--text-primary)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </span>
  </div>
);

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
  const coExposure = useMemo(() => {
    const byBucket = {
      approved: { amount: 0, items: [] },
      pending:  { amount: 0, items: [] },
      unpriced: { amount: 0, items: [] },
      disputed: { amount: 0, items: [] },
    };
    for (const co of allCOs || []) {
      const amt = Number(co.co_amount ?? co.cost_impact_amount ?? 0);
      const status = String(co.status || "").trim();
      if (status === "Void") continue;

      let bucket = null;
      if (status === "Approved") bucket = "approved";
      else if (["Draft", "Submitted", "Under Review"].includes(status)) {
        bucket = amt > 0 ? "pending" : "unpriced";
      } else if (status === "Rejected" && amt > 0) {
        bucket = "disputed";
      }
      if (!bucket) continue;

      byBucket[bucket].amount += amt;
      byBucket[bucket].items.push(co);
    }
    const totalExposure = byBucket.pending.amount + byBucket.disputed.amount;
    return { ...byBucket, totalExposure };
  }, [allCOs]);

  // Per-project schedule summary → keyed by project_id so each row can
  // look its own up in O(1). Recomputed when schedule_tasks change.
  const projectScheduleSummaries = useMemo(() => {
    const byProject = {};
    for (const t of allScheduleTasks || []) {
      if (!t.project_id) continue;
      if (!byProject[t.project_id]) byProject[t.project_id] = [];
      byProject[t.project_id].push(t);
    }
    const out = {};
    for (const [pid, tasks] of Object.entries(byProject)) {
      out[pid] = summarizeProjectSchedule(tasks);
    }
    return out;
  }, [allScheduleTasks]);
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

  // ── Sparkline history: store 7-day KPI snapshots in localStorage ──────────
  const [sparkHistory, setSparkHistory] = useState({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sbp-portfolio-spark");
      if (raw) setSparkHistory(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);

  const projectMap = useMemo(() => {
    const map = {};
    for (const p of projects || []) map[p.id] = p.name || p.project_name || "";
    return map;
  }, [projects]);
  const today = useMemo(() => {
    const d = new Date();
    return d
      .toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      .toUpperCase();
  }, []);

  const projectMetrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projects
      .map((p) => {
        const pRFIs = allRFIs.filter((r) => r.project_id === p.id);
        const pCOs = allCOs.filter((c) => c.project_id === p.id);
        const pCodes = allCodes.filter((c) => c.project_id === p.id);
        const pWPs = allWPs.filter((w) => w.project_id === p.id);
        const pDeliveries = allDeliveries.filter((d) => d.project_id === p.id);
        const pExpenses = allExpenses.filter((e) => e.project_id === p.id && !statusIn(e.payment_status, ["Voided", "Void"]));
        const budget = pCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
        const hasBudgetData = pCodes.length > 0;
        const paidExpenses = pExpenses.filter((e) => statusIn(e.payment_status, ["Paid"]));
        const actual = paidExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        // hasActualData must mirror the slice that produces `actual` — otherwise
        // a project with only Submitted/Approved (unpaid) expenses shows as
        // "has data" while actual stays $0, faking a green Variance cell.
        const hasActualData = paidExpenses.length > 0;
        const openRFIs = pRFIs.filter((r) => !statusIn(r.status, ["Answered", "Closed"])).length;
        const overdueRFIs = pRFIs.filter((r) => isOverdue(r.due_date, r.status, ["Answered", "Closed"])).length;
        const avgProgress = pWPs.length > 0 ? Math.round(pWPs.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / pWPs.length) : 0;
        const pendingCOs = pCOs.filter((c) => statusIn(c.status, ["Submitted", "Under Review"]));
        const pendingCOValue = pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
        const lateDeliveries = pDeliveries.filter((d) => {
          if (!d.scheduled_date || statusIn(d.status, ["Delivered"])) return false;
          const sched = parseUTCDate(d.scheduled_date);
          return sched && sched < today;
        }).length;
        const tonnage = Math.round(pWPs.reduce((s, w) => s + (Number(w.tonnage) || 0), 0));
        const stalledWPs = pWPs.filter((w) => statusIn(w.status, ["On Hold"])).length;

        // Projected Margin = Contract Value - Estimated Cost at Completion.
        // Estimated cost takes the worst case of (budget) vs (actual + pending CO exposure)
        // so the figure tells us "what the project will actually return if pending COs hit".
        const contractValue = Number(p.original_contract_value) || 0;
        const estimatedCostAtCompletion = Math.max(budget, actual + pendingCOValue);
        const projectedMargin = contractValue > 0 ? contractValue - estimatedCostAtCompletion : null;
        const projectedMarginPct = contractValue > 0 ? (projectedMargin / contractValue) * 100 : null;

        return {
          ...p,
          budget,
          actual,
          hasBudgetData,
          hasActualData,
          openRFIs,
          overdueRFIs,
          avgProgress,
          pendingCOs,
          pendingCOValue,
          lateDeliveries,
          tonnage,
          stalledWPs,
          contractValue,
          estimatedCostAtCompletion,
          projectedMargin,
          projectedMarginPct,
        };
      })
      .sort((a, b) => (HEALTH_ORDER[a.health_status] ?? 3) - (HEALTH_ORDER[b.health_status] ?? 3));
  }, [projects, allRFIs, allCOs, allCodes, allWPs, allDeliveries, allExpenses]);

  // Enrich metrics with weighted health scoring + reason strings
  const enrichedMetrics = useMemo(() =>
    projectMetrics.map((p) => {
      const weighted = computeWeightedHealth(p);
      const manual = p.health_status || "On Track";
      const SEVERITY = { "At Risk": 0, "Watch": 1, "On Track": 2 };
      const autoSev = SEVERITY[weighted.label] ?? 2;
      const manualSev = SEVERITY[manual] ?? 2;
      const effectiveHealth = autoSev <= manualSev ? weighted.label : manual;
      return {
        ...p,
        healthScore: weighted.score,
        healthFactors: weighted.factors,
        healthReasons: weighted.reasons,
        autoHealth: weighted.label,
        effectiveHealth,
      };
    }),
    [projectMetrics]
  );

  const displayMetrics = useMemo(() => {
    let list = [...enrichedMetrics];
    // Apply KPI filter
    if (kpiFilter === "overdueRFIs") {
      list = list.filter((p) => p.overdueRFIs > 0);
    } else if (kpiFilter === "openRFIs") {
      list = list.filter((p) => p.openRFIs > 0);
    } else if (kpiFilter === "atRisk") {
      list = list.filter((p) => p.effectiveHealth === "At Risk" || p.effectiveHealth === "Watch");
    } else if (kpiFilter === "pendingCOs") {
      list = list.filter((p) => p.pendingCOs.length > 0);
    } else if (kpiFilter === "lateDeliveries") {
      list = list.filter((p) => p.lateDeliveries > 0);
    }
    // Apply sort
    if (sortMode === "rfi") {
      list.sort((a, b) => b.openRFIs - a.openRFIs);
    } else if (sortMode === "deadline") {
      const earliest = (pid) =>
        allDeliveries
          .filter((d) => d.project_id === pid && !statusIn(d.status, ["Delivered"]))
          .reduce((min, d) => {
            const sched = parseUTCDate(d.scheduled_date);
            const dt = sched ? sched.getTime() : Infinity;
            return dt < min ? dt : min;
          }, Infinity);
      list.sort((a, b) => earliest(a.id) - earliest(b.id));
    }
    // default "health" sort is already applied from projectMetrics
    return list;
  }, [enrichedMetrics, sortMode, kpiFilter, allDeliveries]);

  const portfolioKPIs = useMemo(() => {
    const portfolioValue =
      projects.reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0) +
      allCOs.filter((c) => statusIn(c.status, ["Approved"])).reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const totalBudget = allCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
    const totalSpend = allExpenses.filter((e) => statusIn(e.payment_status, ["Paid"])).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const overdueRFIs = allRFIs.filter((r) => isOverdue(r.due_date, r.status, ["Answered", "Closed"])).length;
    const openRFIs = allRFIs.filter((r) => !statusIn(r.status, ["Answered", "Closed"])).length;
    const pendingCOs = allCOs.filter((c) => statusIn(c.status, ["Submitted", "Under Review"])).length;
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const lateDeliveries = allDeliveries.filter((d) => {
      if (!d.scheduled_date || statusIn(d.status, ["Delivered"])) return false;
      const sched = parseUTCDate(d.scheduled_date);
      return sched && sched < todayStart;
    }).length;
    const atRisk = enrichedMetrics.filter((p) => p.effectiveHealth === "At Risk" || p.effectiveHealth === "Watch").length;
    const activeWPs = allWPs.filter((w) => statusIn(w.status, ["In Progress"])).length;
    // Stale RFIs: open RFIs whose age exceeds 30 days. We canonicalize on
    // submitted_date (when the RFI was actually issued) and fall back to
    // created_date / created_at only when missing. Parse via parseUTCDate so
    // ISO date-only strings don't drift in negative-UTC timezones.
    const thirtyDaysAgo = todayStart.getTime() - 30 * 86400000;
    const staleRFIs30 = allRFIs.filter((r) => {
      if (statusIn(r.status, ["Answered", "Closed"])) return false;
      const opened = r.submitted_date || r.created_date || r.created_at;
      const d = parseUTCDate(opened);
      if (!d) return false;
      return d.getTime() < thirtyDaysAgo;
    });

    // Cash at risk — the combined dollar value of exposures the PM team
    // should be actively managing right now. Two buckets:
    //   1. Pending change-order value. COs in Submitted/Under Review/
    //      Draft state are dollars that have been proposed but aren't
    //      committed either way. They're "at risk" in the sense that a
    //      rejection erodes margin we thought we had.
    //   2. Over-budget exposure. For each cost_code where actual spend
    //      exceeds the budget amount, we accumulate (actual - budget).
    //      That's the delta we're bleeding past plan.
    // Sum is the single number the exec asks: "how much cash is in
    // limbo across our portfolio right now?"
    const pendingCOValue = allCOs
      .filter((c) => statusIn(c.status, ["Submitted", "Under Review", "Draft"]))
      .reduce((s, c) => s + (Number(c.co_amount) || Number(c.cost_impact_amount) || 0), 0);

    // Build a map of actual-spend-per-cost-code so we can compare to
    // budgets. expenses.cost_code holds the cost-code NUMBER (text); the
    // schema has no cost_code_id on expenses, so cost_code (number) is the
    // only key we can build the spend map from.
    const spendByCode = new Map();
    for (const e of allExpenses) {
      if (!statusIn(e.payment_status, ["Paid"])) continue;
      const key = e.cost_code || null;
      if (!key) continue;
      spendByCode.set(key, (spendByCode.get(key) || 0) + (Number(e.amount) || 0));
    }
    let overBudgetExposure = 0;
    for (const code of allCodes) {
      const budget = Number(code.budget_amount) || 0;
      if (budget <= 0) continue;
      // NOTE: code.code is undefined on the cost_codes row shape (the column
      // is cost_code_number) — this lookup currently always misses, so
      // overBudgetExposure is effectively pinned at 0. Fix is out-of-scope
      // for this dead-branch cleanup and tracked as a separate task.
      const actual = spendByCode.get(code.code) || 0;
      if (actual > budget) overBudgetExposure += (actual - budget);
    }

    const cashAtRisk = pendingCOValue + overBudgetExposure;

    // Portfolio-level Forecast at Completion (FAC):
    //   FAC = sum of per-project estimatedCostAtCompletion, where each
    //         project's estimate = max(budget, actual + pending CO
    //         exposure). Answers the exec question "if everything
    //         pending lands the way we expect, what will these jobs
    //         actually cost us?"
    //
    // Forecast Variance = FAC - Total Budget. Positive = we're
    // forecasting more cost than we budgeted (margin fade); negative
    // = we're forecasting below budget (margin gain).
    const forecastAtCompletion = (enrichedMetrics || []).reduce(
      (sum, p) => sum + (Number(p.estimatedCostAtCompletion) || 0),
      0,
    );
    const forecastVariance = forecastAtCompletion - totalBudget;

    return {
      portfolioValue, totalBudget, totalSpend,
      overdueRFIs, openRFIs, pendingCOs, lateDeliveries, atRisk, activeWPs, staleRFIs30,
      cashAtRisk, pendingCOValue, overBudgetExposure,
      forecastAtCompletion, forecastVariance,
    };
  }, [projects, allRFIs, allCOs, allCodes, allWPs, allExpenses, allDeliveries, enrichedMetrics]);

  // ── Persist sparkline snapshot once per day ────────────────────────────────
  useEffect(() => {
    if (!portfolioKPIs) return;
    try {
      const dateKey = new Date().toISOString().slice(0, 10);
      const hist = { ...sparkHistory };
      hist[dateKey] = {
        overdueRFIs: portfolioKPIs.overdueRFIs,
        openRFIs: portfolioKPIs.openRFIs,
        pendingCOs: portfolioKPIs.pendingCOs,
        lateDeliveries: portfolioKPIs.lateDeliveries,
        atRisk: portfolioKPIs.atRisk,
      };
      // keep last 7 days only
      const keys = Object.keys(hist).sort().slice(-7);
      const trimmed = {};
      keys.forEach((k) => (trimmed[k] = hist[k]));
      localStorage.setItem("sbp-portfolio-spark", JSON.stringify(trimmed));
      setSparkHistory(trimmed);
    } catch { /* noop */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioKPIs]);

  const sparkFor = (field) => {
    const days = Object.keys(sparkHistory).sort();
    if (days.length < 2) return [];
    return days.map((d) => sparkHistory[d]?.[field] ?? 0);
  };

  const budgetChartData = useMemo(
    () =>
      projectMetrics.slice(0, 8).map((p) => {
        const progress = Number(p.avgProgress) || 0;
        const hasActual = p.actual > 0;
        // Distinguishes "haven't started" (0% progress, $0 actual) from
        // "delayed accounting" (>0% progress, $0 actual) so the chart isn't
        // misleading when several rows show $0 spend.
        const accountingDelayed = !hasActual && progress > 5;
        const notStarted = !hasActual && progress <= 5;
        const shortName = p.project_number || (p.name || "").slice(0, 10);
        return {
          name: `${shortName} · ${progress}%`,
          rawName: shortName,
          Budget: p.budget,
          Actual: p.actual,
          progress,
          overBudget: p.actual > p.budget,
          accountingDelayed,
          notStarted,
        };
      }),
    [projectMetrics]
  );

  // ── PCC: Priority Command Center data ──────────────────────────────────────
  const pccData = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // TODAY'S PRIORITIES — ranked by severity, deterministic
    const priorities = [];

    // Overdue RFIs — blocking scope
    const overdueRFIs = allRFIs
      .filter((r) => isOverdue(r.due_date, r.status, ["Answered", "Closed"]))
      .sort((a, b) => new Date(a.due_date || 0) - new Date(b.due_date || 0));
    overdueRFIs.forEach((r) => {
      const days = Math.max(0, daysOverdue(r.due_date));
      priorities.push({
        rank: r.priority === "Critical" ? 0 : days >= 14 ? 1 : 2,
        type: "RFI", id: r.rfi_number || "—",
        title: r.title, project: r.project_name || projectMap[r.project_id] || "",
        owner: r.assigned_to || r.ball_in_court || "Unassigned",
        days, severity: r.priority === "Critical" ? "critical" : days >= 7 ? "high" : "medium",
        action: days >= 14 ? "Escalate immediately" : days >= 7 ? "Follow up today" : "Response needed",
        nav: "RFIs",
      });
    });

    // Late deliveries — blocking erection
    const lateDeliveries = allDeliveries
      .filter((d) => {
        if (statusIn(d.status, ["Delivered"]) || !d.scheduled_date) return false;
        const sched = parseUTCDate(d.scheduled_date);
        return sched && sched < now;
      })
      .sort((a, b) => (parseUTCDate(a.scheduled_date) || 0) - (parseUTCDate(b.scheduled_date) || 0));
    lateDeliveries.forEach((d) => {
      const sched = parseUTCDate(d.scheduled_date);
      const days = sched ? Math.max(0, Math.floor((now - sched) / 86400000)) : 0;
      priorities.push({
        rank: days >= 7 ? 1 : 3,
        type: "DEL", id: d.delivery_id || "—",
        title: d.description || d.vendor || "Delivery",
        project: projectMap[d.project_id] || "",
        owner: d.vendor || "Vendor",
        days, severity: days >= 7 ? "high" : "medium",
        action: days >= 7 ? "Expedite — blocking production" : "Track status with vendor",
        nav: "Deliveries",
      });
    });

    // Overdue action items
    const overdueAI = allActionItems
      .filter((a) => {
        if (statusIn(a.status, ["Complete", "Cancelled", "Closed", "Done"])) return false;
        if (!a.due_date) return false;
        const due = parseUTCDate(a.due_date);
        return due && due < now;
      })
      .sort((a, b) => (parseUTCDate(a.due_date) || 0) - (parseUTCDate(b.due_date) || 0));
    overdueAI.forEach((a) => {
      const due = parseUTCDate(a.due_date);
      const days = due ? Math.max(0, Math.floor((now - due) / 86400000)) : 0;
      priorities.push({
        rank: 4, type: "ACTION", id: "—",
        title: a.title || "Action Item", project: a.project_name || projectMap[a.project_id] || "",
        owner: a.assigned_to || "Unassigned",
        days, severity: days >= 7 ? "medium" : "low",
        action: "Close out or reassign",
        nav: "ActionItems",
      });
    });

    priorities.sort((a, b) => a.rank - b.rank || b.days - a.days);

    // WAITING ON — items pending external response.
    // Use the same "open RFI" definition as the KPI tile (anything NOT
    // Answered/Closed) so the two views can never disagree about counts.
    const waitingOn = [];
    allRFIs.filter((r) => !statusIn(r.status, ["Answered", "Closed", "Draft"])).forEach((r) => {
      const sub = parseUTCDate(r.submitted_date);
      waitingOn.push({
        type: "RFI", id: r.rfi_number || "—",
        title: r.title, project: r.project_name || projectMap[r.project_id] || "",
        waitingFor: r.assigned_to || r.ball_in_court || "Architect/Engineer",
        submitted: r.submitted_date,
        days: sub ? Math.max(0, Math.floor((now - sub) / 86400000)) : 0,
        nav: "RFIs",
      });
    });
    // COs under review
    allCOs.filter((c) => statusIn(c.status, ["Submitted", "Under Review"])).forEach((c) => {
      const sub = parseUTCDate(c.submitted_date);
      waitingOn.push({
        type: "CO", id: c.co_number || "—",
        title: c.title, project: c.project_name || projectMap[c.project_id] || "",
        waitingFor: "Owner/GC",
        submitted: c.submitted_date,
        days: sub ? Math.max(0, Math.floor((now - sub) / 86400000)) : 0,
        amount: Number(c.co_amount) || 0,
        nav: "ChangeOrders",
      });
    });
    // Deliveries in transit
    allDeliveries.filter((d) => statusIn(d.status, ["In Transit"])).forEach((d) => {
      waitingOn.push({
        type: "DEL", id: d.delivery_id || "—",
        title: d.description || d.vendor || "Delivery",
        project: projectMap[d.project_id] || "",
        waitingFor: d.vendor || "Vendor",
        submitted: d.scheduled_date,
        days: 0,
        nav: "Deliveries",
      });
    });
    waitingOn.sort((a, b) => b.days - a.days);

    // RISK WATCHLIST — projects trending toward trouble
    const riskWatch = enrichedMetrics
      .filter((p) => p.effectiveHealth !== "On Track" || p.healthScore < 80)
      .sort((a, b) => (a.healthScore || 0) - (b.healthScore || 0))
      .slice(0, 5)
      .map((p) => ({
        project: p.name || p.project_number,
        projectId: p.id,
        score: p.healthScore,
        status: p.effectiveHealth,
        reasons: p.healthReasons || [],
        topReason: p.healthReasons?.[0] || "Scoring below threshold",
      }));

    return { priorities, waitingOn, riskWatch };
  }, [allRFIs, allActionItems, allDeliveries, allCOs, projectMap, enrichedMetrics]);

  const totalTons = useMemo(() => allWPs.reduce((s, w) => s + (Number(w.tonnage) || 0), 0), [allWPs]);
  const fabricatedTonnage = useMemo(() => {
    const PHASE_RANK = { Detailing: 0, Fabrication: 1, Delivery: 2, Erection: 3 };
    return allWPs
      .filter((w) => (PHASE_RANK[w.phase] ?? -1) >= 1 && ["In Progress", "Complete"].includes(w.status))
      .reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  }, [allWPs]);
  const deliveriesStats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isLate = (d) => {
      if (!d.scheduled_date || statusIn(d.status, ["Delivered"])) return false;
      const sched = parseUTCDate(d.scheduled_date);
      return sched && sched < today;
    };
    const scheduled = allDeliveries.filter((d) => statusIn(d.status, ["Scheduled"])).length;
    const inTransit = allDeliveries.filter((d) => statusIn(d.status, ["In Transit"])).length;
    const lateAll = allDeliveries.filter(isLate);
    const late = lateAll.length;
    const lateList = lateAll
      .sort((a, b) => (parseUTCDate(a.scheduled_date) || 0) - (parseUTCDate(b.scheduled_date) || 0))
      .slice(0, 3)
      .map((d) => {
        const sched = parseUTCDate(d.scheduled_date);
        return {
          ...d,
          daysLate: sched ? Math.max(0, Math.floor((today - sched) / 86400000)) : 0,
        };
      });
    // Next upcoming delivery
    const upcoming = allDeliveries
      .filter((d) => {
        if (statusIn(d.status, ["Delivered"]) || !d.scheduled_date) return false;
        const sched = parseUTCDate(d.scheduled_date);
        return sched && sched >= today;
      })
      .sort((a, b) => (parseUTCDate(a.scheduled_date) || 0) - (parseUTCDate(b.scheduled_date) || 0));
    const nextDelivery = upcoming[0] || null;
    return { scheduled, inTransit, late, lateList, nextDelivery };
  }, [allDeliveries]);

  // ── RFI turnaround metric ──────────────────────────────────────────────────
  const rfiTurnaround = useMemo(() => {
    const closed = allRFIs.filter((r) => statusIn(r.status, ["Answered", "Closed"]) && r.submitted_date && r.responded_date);
    if (closed.length === 0) return null;
    const totalDays = closed.reduce((s, r) => {
      const submitted = parseUTCDate(r.submitted_date);
      const responded = parseUTCDate(r.responded_date);
      if (!submitted || !responded) return s;
      return s + Math.max(0, Math.floor((responded - submitted) / 86400000));
    }, 0);
    return (totalDays / closed.length).toFixed(1);
  }, [allRFIs]);

  // ── Data completeness scoring ──────────────────────────────────────────────
  const dataIssues = useMemo(() => {
    const issues = [];
    enrichedMetrics.forEach((p) => {
      if (!p.hasBudgetData) issues.push({ project: p.name || p.project_number, projectId: p.id, issue: "No budget / cost codes set up", severity: "high", fix: "Set up cost codes" });
      if (!p.original_contract_value) issues.push({ project: p.name || p.project_number, projectId: p.id, issue: "Missing contract value", severity: "high", fix: "Enter contract value" });
      if (!p.phase) issues.push({ project: p.name || p.project_number, projectId: p.id, issue: "No phase assigned", severity: "medium", fix: "Set project phase" });
    });
    // RFIs without due dates
    const rfisNoDue = allRFIs.filter((r) => !r.due_date && !statusIn(r.status, ["Answered", "Closed"]));
    if (rfisNoDue.length > 0) issues.push({ project: `${rfisNoDue.length} RFIs`, projectId: null, issue: "RFIs missing due dates", severity: "high", fix: "Add due dates" });
    // COs without values
    const cosNoVal = allCOs.filter((c) => !c.co_amount && !statusIn(c.status, ["Rejected", "Void"]));
    if (cosNoVal.length > 0) issues.push({ project: `${cosNoVal.length} COs`, projectId: null, issue: "COs missing dollar values", severity: "medium", fix: "Add CO amounts" });
    return issues;
  }, [enrichedMetrics, allRFIs, allCOs]);

  // ── Financial control layer — CO pipeline + margin at risk ────────────────
  const financials = useMemo(() => {
    const approvedCOs = allCOs.filter((c) => statusIn(c.status, ["Approved"]));
    const pendingCOs = allCOs.filter((c) => statusIn(c.status, ["Submitted", "Under Review"]));
    const rejectedCOs = allCOs.filter((c) => statusIn(c.status, ["Rejected"]));
    const approvedValue = approvedCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const pendingValue = pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const rejectedValue = rejectedCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const totalBudget = portfolioKPIs.totalBudget;
    const totalSpend = portfolioKPIs.totalSpend;
    const remaining = totalBudget - totalSpend;
    const marginAtRisk = pendingValue + (totalSpend > totalBudget ? totalSpend - totalBudget : 0);
    return { approvedCOs: approvedCOs.length, pendingCOs: pendingCOs.length, rejectedCOs: rejectedCOs.length, approvedValue, pendingValue, rejectedValue, remaining, marginAtRisk, totalBudget, totalSpend };
  }, [allCOs, portfolioKPIs]);

  // ── Production readiness per project ──────────────────────────────────────
  const productionData = useMemo(() => {
    const PHASE_RANK = { Detailing: 0, Fabrication: 1, Delivery: 2, Erection: 3 };
    return enrichedMetrics.map((p) => {
      const pWPs = allWPs.filter((w) => w.project_id === p.id);
      const inFab = pWPs.filter((w) => statusIn(w.status, ["In Progress"]));
      const complete = pWPs.filter((w) => statusIn(w.status, ["Complete"]));
      const onHold = pWPs.filter((w) => statusIn(w.status, ["On Hold"]));
      const totalTon = pWPs.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
      // Cumulative fab tonnage: WPs at Fabrication or later AND actively worked
      const fabTon = pWPs
        .filter((w) => (PHASE_RANK[w.phase] ?? -1) >= 1 && ["In Progress", "Complete"].includes(w.status))
        .reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
      const fabPct = totalTon > 0 ? Math.round((fabTon / totalTon) * 100) : 0;
      // Constraints: WPs on hold, missing drawings, late deliveries
      const constraints = [];
      if (onHold.length > 0) constraints.push(`${onHold.length} WP${onHold.length > 1 ? "s" : ""} on hold`);
      if (p.overdueRFIs > 0) constraints.push(`${p.overdueRFIs} overdue RFI${p.overdueRFIs > 1 ? "s" : ""} blocking scope`);
      if (p.lateDeliveries > 0) constraints.push(`${p.lateDeliveries} late delivery — material gap`);
      const erectionReady = p.lateDeliveries === 0 && onHold.length === 0 && p.overdueRFIs === 0;
      return { ...p, inFabCount: inFab.length, completeCount: complete.length, onHoldCount: onHold.length, totalTon, fabTon, fabPct, constraints, erectionReady, wpTotal: pWPs.length };
    });
  }, [enrichedMetrics, allWPs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 92px)" }}>
      {/* Brand Header */}
      <div
        style={{
          background: "var(--bg-surface-low)",
          borderBottom: "1px solid var(--divider)",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
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
              padding: "8px 16px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            New Project
          </button>
        </div>
      </div>

      {/* ── Priority Watchlist — surfaces the top 3 projects in worst health,
           each with a 1-line "what's wrong" narrative. Click-to-drill opens
           that project's dashboard. When every project is On Track we show an
           all-clear state so the slot doesn't collapse and feel like a bug.
           Consumes enrichedMetrics, which already carries healthScore +
           healthReasons, so zero extra computation. */}
      {(() => {
        const SEVERITY = { "At Risk": 0, "Watch": 1, "On Track": 2 };
        const sorted = enrichedMetrics
          .filter((p) => p.effectiveHealth !== "On Track" || p.healthScore < 70)
          .sort((a, b) => {
            const sevDiff = (SEVERITY[a.effectiveHealth] ?? 2) - (SEVERITY[b.effectiveHealth] ?? 2);
            if (sevDiff !== 0) return sevDiff;
            return (a.healthScore ?? 100) - (b.healthScore ?? 100);
          })
          .slice(0, 3);
        const hasRisks = sorted.length > 0;
        return (
          <div
            style={{
              background: "var(--bg-surface-low)",
              borderBottom: "1px solid var(--divider)",
              padding: "12px 24px",
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
                    onClick={() => openProjectDashboard(p.id)}
                    style={{
                      background: "var(--bg-surface)",
                      border: `1px solid var(--border-default)`,
                      borderLeft: `3px solid ${sevColor}`,
                      borderRadius: 4,
                      padding: "8px 12px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      transition: "border-color 0.12s, transform 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-default)";
                      e.currentTarget.style.transform = "none";
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
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--divider)",
          display: "flex",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {/* Portfolio Value — featured (wider, not filterable).
            Overflow-safe: value span is nowrap + tabular-nums so
            long currency strings don't wrap and line up tidily
            column-to-column. */}
        <div style={{
          padding: "12px 22px",
          borderRight: "1px solid var(--divider)",
          borderTop: "3px solid var(--accent)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minWidth: 220,
          overflow: "hidden",
        }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--text-muted)", whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
          }}>
            Portfolio Value
          </span>
          <span
            title={formatCurrency(portfolioKPIs.portfolioValue)}
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
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9,
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: "var(--text-muted)", whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis",
            }}>
              Cash at Risk
            </span>
            <span
              title={formatCurrency(portfolioKPIs.cashAtRisk)}
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
          onClick={() => navigate(createPageUrl("RFIs"))}
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

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Main content area */}
      <div
        style={{
          padding: "20px 24px",
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 16,
          flex: 1,
          overflowY: "auto",
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
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {[
                  { key: "health", label: "Default" },
                  { key: "rfi", label: "Most RFIs" },
                  { key: "deadline", label: "Soonest Deadline" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSortMode(opt.key)}
                    style={{
                      background: sortMode === opt.key ? "var(--accent)" : "var(--bg-surface)",
                      color: sortMode === opt.key ? "var(--accent-text)" : "var(--text-secondary)",
                      border: sortMode === opt.key ? "1px solid var(--accent-border)" : "1px solid var(--border-default)",
                      borderRadius: 999,
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "5px 12px",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
                {kpiFilter && (
                  <button
                    onClick={() => setKpiFilter(null)}
                    style={{
                      background: "var(--danger-muted)",
                      color: "var(--status-error)",
                      border: "1px solid var(--danger-border)",
                      borderRadius: 999,
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "5px 12px",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    Clear Filter ✕
                  </button>
                )}
                <button
                  onClick={() => navigate("/Projects")}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-btn)",
                    color: "var(--accent)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "6px 10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    cursor: "pointer",
                  }}
                >
                  Manage Projects →
                </button>
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
                <tr style={{ background: "var(--bg-surface-low)" }}>
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
                        background: "var(--bg-surface-low)",
                        zIndex: 2,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayMetrics.map((p, i) => {
                  const variance = p.hasBudgetData ? p.budget - p.actual : null;
                  const isOverBudget = variance !== null && variance < 0;
                  const hStatus = p.effectiveHealth || p.health_status;
                  const rowBg = hStatus === "At Risk" ? "rgba(255,61,61,0.04)" : hStatus === "Watch" ? "rgba(245,158,11,0.03)" : "transparent";
                  const hColor = healthColor(hStatus);
                  return (
                    <React.Fragment key={p.id}>
                    <tr
                      onClick={() => openProjectDashboard(p.id)}
                      style={{
                        borderBottom: "1px solid var(--divider)",
                        background: rowBg,
                        height: ROW_HEIGHT,
                        cursor: "pointer",
                        transition: "background 0.12s",
                        borderLeft: `4px solid ${hColor}`,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--hover-bg)"}
                      onMouseLeave={e => e.currentTarget.style.background = rowBg}
                    >
                      <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)" }}>{i + 1}</td>
                      <td style={{ padding: "6px 8px", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", minWidth: 160 }}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 700 }}>{p.name || p.project_number}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{p.project_number}</span>
                        </div>
                      </td>
                      <td style={{ padding: "6px 8px", fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: PHASE_DOT[p.phase] || "var(--text-muted)", display: "inline-block", marginRight: 6 }} />
                        {p.phase || "—"}
                      </td>
                      {/* Timeline — compact per-project mini-Gantt. The bars
                          are now individually clickable: phase bar → Schedule
                          scoped to this project + filtered to that phase; any
                          other part of the strip → the full schedule. We stop
                          propagation inside so neither firing triggers the
                          outer row click ("open project dashboard"). */}
                      <td
                        style={{ padding: "6px 8px", textAlign: "center" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MiniProjectTimeline
                          summary={projectScheduleSummaries[p.id]}
                          onTimelineClick={() => navigate(`${createPageUrl("Schedule")}?project=${p.id}`)}
                          onPhaseClick={(phaseKey) => navigate(`${createPageUrl("Schedule")}?project=${p.id}&phase=${encodeURIComponent(phaseKey)}`)}
                        />
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>
                        <HealthPill status={hStatus} score={p.healthScore} reasons={p.healthReasons} />
                        {p.healthReasons?.length > 0 && hStatus !== "On Track" && (
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2, maxWidth: 140, lineHeight: 1.3 }}>
                            {p.healthReasons[0]}
                          </div>
                        )}
                      </td>
                      {/* Budget — click drills into Expenses scoped to project.
                          The Expenses page is the closest surface to budget +
                          cost-code data today; long-term a dedicated Costs
                          page would land these three columns cleaner. */}
                      <td
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`${createPageUrl("Expenses")}?project=${p.id}`);
                        }}
                        title={p.hasBudgetData ? `Budget: ${formatCurrency(p.budget)} · Source: Cost Codes · Click to view expenses` : "No cost codes set up — click to open Expenses"}
                        style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: p.hasBudgetData ? "var(--text-primary)" : "var(--status-warning)", cursor: "pointer" }}
                      >
                        {p.hasBudgetData ? formatCurrency(p.budget).replace(/\.\d+/, "") : (
                          <span style={{ fontSize: 8, fontWeight: 600, color: "var(--status-warning)", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderRadius: 3, padding: "1px 5px" }}>
                            SET UP
                          </span>
                        )}
                      </td>
                      {/* Actual — drills into Expenses */}
                      <td
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`${createPageUrl("Expenses")}?project=${p.id}`);
                        }}
                        title={p.hasActualData ? `Actual spend: ${formatCurrency(p.actual)} · Source: Paid Expenses · Click to view` : "No expense data — click to open Expenses"}
                        style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: p.hasActualData ? "var(--text-primary)" : "var(--text-muted)", cursor: "pointer" }}
                      >
                        {p.hasActualData ? formatCurrency(p.actual).replace(/\.\d+/, "") : (
                          <span style={{ fontSize: 8, color: "var(--text-muted)" }}>$0</span>
                        )}
                      </td>
                      {/* Variance = Budget - Actual (positive = under budget) — drills into Expenses */}
                      <td
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`${createPageUrl("Expenses")}?project=${p.id}`);
                        }}
                        title={`Budget: ${p.hasBudgetData ? formatCurrency(p.budget) : "N/A"} | Actual: ${p.hasActualData ? formatCurrency(p.actual) : "N/A"} | Variance: ${variance !== null ? (isOverBudget ? "-" : "+") + formatCurrency(Math.abs(variance)) : "N/A"} · Click to view expenses`}
                        style={{
                          padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                          color: variance === null ? "var(--text-muted)" : isOverBudget ? "var(--status-error)" : "var(--status-success)",
                          background: isOverBudget ? "rgba(248,81,73,0.06)" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        {variance === null ? "—" : (
                          <span style={{
                            background: isOverBudget ? "var(--danger-muted)" : "var(--success-muted)",
                            border: `1px solid ${isOverBudget ? "var(--danger-border)" : "var(--success-border)"}`,
                            borderRadius: 3, padding: "1px 6px",
                          }}>
                            {(isOverBudget ? "−" : "+") + formatCurrency(Math.abs(variance)).replace(/\.\d+/, "")}
                          </span>
                        )}
                      </td>
                      {/* Projected Margin = Contract Value − max(budget, actual + pending CO exposure).
                          Drills into Change Orders because pending COs are the
                          primary variable pushing the margin around. */}
                      <td
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`${createPageUrl("ChangeOrders")}?project=${p.id}`);
                        }}
                        title={p.projectedMargin === null
                          ? "No contract value entered — set original_contract_value to see projected margin"
                          : `Contract: ${formatCurrency(p.contractValue)} · Est. cost at completion: ${formatCurrency(p.estimatedCostAtCompletion)} · Margin: ${(p.projectedMarginPct ?? 0).toFixed(1)}% · Click to review COs`}
                        style={{
                          padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                          color: p.projectedMargin === null ? "var(--text-muted)" : p.projectedMargin < 0 ? "var(--status-error)" : (p.projectedMarginPct ?? 0) < 5 ? "var(--status-warning)" : "var(--status-success)",
                          cursor: "pointer",
                        }}
                      >
                        {p.projectedMargin === null ? "—" : (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.1 }}>
                            <span style={{
                              background: p.projectedMargin < 0 ? "var(--danger-muted)" : (p.projectedMarginPct ?? 0) < 5 ? "var(--warning-muted)" : "var(--success-muted)",
                              border: `1px solid ${p.projectedMargin < 0 ? "var(--danger-border)" : (p.projectedMarginPct ?? 0) < 5 ? "var(--warning-border)" : "var(--success-border)"}`,
                              borderRadius: 3, padding: "1px 6px",
                            }}>
                              {(p.projectedMargin < 0 ? "−" : "+") + formatCurrency(Math.abs(p.projectedMargin)).replace(/\.\d+/, "")}
                            </span>
                            <span style={{ fontSize: 8, color: "var(--text-muted)", marginTop: 2 }}>{(p.projectedMarginPct ?? 0).toFixed(1)}%</span>
                          </div>
                        )}
                      </td>
                      <td
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`${createPageUrl("RFIs")}?project=${p.id}`);
                        }}
                        title={`${p.openRFIs} open, ${p.overdueRFIs} overdue · Click to open RFIs`}
                        style={{
                          padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)",
                          color: p.overdueRFIs > 0 ? "var(--status-error)" : p.openRFIs > 3 ? "var(--status-warning)" : "var(--text-primary)",
                          fontSize: 16, fontWeight: 800,
                          background: p.overdueRFIs > 2 ? "rgba(248,81,73,0.08)" : p.openRFIs > 5 ? "rgba(227,179,65,0.06)" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        {p.openRFIs}
                      </td>
                      <td
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`${createPageUrl("RFIs")}?project=${p.id}`);
                        }}
                        title={`${p.openRFIs} open, ${p.overdueRFIs} overdue · Click to open RFIs`}
                        style={{
                          padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)",
                          color: p.overdueRFIs > 0 ? "var(--status-error)" : "var(--text-muted)",
                          fontSize: 10, fontWeight: p.overdueRFIs > 0 ? 700 : 400,
                          background: p.overdueRFIs > 0 ? "rgba(248,81,73,0.06)" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        {p.overdueRFIs > 0 ? (
                          <span style={{ background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 3, padding: "1px 6px" }}>
                            {p.overdueRFIs}
                          </span>
                        ) : p.overdueRFIs}
                      </td>
                      <td
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`${createPageUrl("WorkPackages")}?project=${p.id}`);
                        }}
                        title="WP progress · Click to open Work Packages"
                        style={{ padding: "6px 8px", minWidth: 130, cursor: "pointer" }}
                      >
                        <ProgressBar value={p.avgProgress || 0} />
                      </td>
                      <td
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`${createPageUrl("ChangeOrders")}?project=${p.id}`);
                        }}
                        title={`${p.pendingCOs.length} pending COs totaling ${formatCurrency(p.pendingCOValue)} · Click to review`}
                        style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: p.pendingCOs.length > 0 ? 16 : 10, fontWeight: p.pendingCOs.length > 0 ? 800 : 400, color: p.pendingCOs.length > 0 ? "var(--status-warning)" : "var(--text-muted)", cursor: "pointer" }}
                      >
                        {p.pendingCOs.length > 0 ? `${p.pendingCOs.length} · ${formatCurrency(p.pendingCOValue).replace(/\.\d+/, "")}` : "—"}
                      </td>
                      <td
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`${createPageUrl("WorkPackages")}?project=${p.id}`);
                        }}
                        title={p.tonnage > 0 ? `${p.tonnage}T total · ${p.avgProgress}% WP progress · Source: Work Packages · Click to open` : "No tonnage entered — click to open Work Packages"}
                        style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: p.tonnage > 0 ? "var(--text-secondary)" : "var(--text-muted)", cursor: "pointer" }}
                      >{p.tonnage > 0 ? `${p.tonnage}T` : <span style={{ fontSize: 8 }}>0T</span>}</td>
                      <td style={{ padding: "6px 6px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                          {[
                            // DASH uses a callback to switch the active project AND go to /Dashboard
                            // (there is no standalone /ProjectDashboard route). Peer buttons navigate
                            // via URL and carry `?project=<id>` so the destination page filters to
                            // this row's project (previously they dumped the user on ALL RFIs / ALL
                            // deliveries, losing context from the click that just happened).
                            //
                            // SCHED is always rendered — every PM reviews the schedule, even when
                            // there's no signal. RFIs / DEL stay conditional so they only appear when
                            // there's something to act on (keeps the 3-slot row uncluttered).
                            { label: "DASH",  nav: () => openProjectDashboard(p.id), primary: true },
                            { label: "SCHED", nav: `${createPageUrl("Schedule")}?project=${p.id}`, accent: "var(--status-info)" },
                            ...(p.openRFIs > 0
                              ? [{ label: "RFIs", nav: `${createPageUrl("RFIs")}?project=${p.id}`, accent: "var(--status-warning)" }]
                              : []),
                            ...(p.lateDeliveries > 0
                              ? [{ label: "DEL", nav: `${createPageUrl("Deliveries")}?project=${p.id}`, accent: "var(--status-error)" }]
                              : []),
                          ].slice(0, 3).map((btn) => (
                            <button
                              key={btn.label}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (typeof btn.nav === "function") btn.nav();
                                else navigate(btn.nav);
                              }}
                              style={{
                                background: btn.primary ? "var(--accent-muted)" : "var(--bg-surface)",
                                border: `1px solid ${btn.primary ? "var(--accent-border)" : btn.accent ? `${btn.accent}44` : "var(--border-default)"}`,
                                borderRadius: 3,
                                color: btn.primary ? "var(--accent)" : btn.accent || "var(--text-secondary)",
                                fontFamily: "var(--font-mono)",
                                fontSize: 8,
                                fontWeight: 700,
                                padding: "3px 7px",
                                cursor: "pointer",
                                letterSpacing: "0.04em",
                                whiteSpace: "nowrap",
                                transition: "background 0.12s, color 0.12s",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = btn.primary ? "var(--accent)" : (btn.accent || "var(--accent)"); e.currentTarget.style.color = "#fff"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = btn.primary ? "var(--accent-muted)" : "var(--bg-surface)"; e.currentTarget.style.color = btn.primary ? "var(--accent)" : (btn.accent || "var(--text-secondary)"); }}
                            >
                              {btn.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                    <tr style={{ height: 3, padding: 0 }}>
                      <td colSpan={15} style={{ padding: 0, border: "none" }}>
                        <div style={{ width: "100%", height: 3, background: "var(--bg-surface-low)" }}>
                          <div style={{ width: `${Math.min(p.avgProgress || 0, 100)}%`, height: 3, background: hColor, transition: "width 0.3s ease" }} />
                        </div>
                      </td>
                    </tr>
                    </React.Fragment>
                  );
                })}
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
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={budgetChartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <YAxis dataKey="name" type="category" tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "var(--font-mono)" }} width={80} />
                    <XAxis type="number" tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                    <Tooltip content={<PhoenixTooltip />} />
                    <Bar dataKey="Budget" name="Budget" fill="var(--bg-surface-highest)" barSize={14} />
                    <Bar dataKey="Actual" name="Actual" barSize={14}>
                      {budgetChartData.map((entry, index) => {
                        let fill = "var(--accent)";
                        if (entry.overBudget) fill = "var(--status-error)";
                        else if (entry.accountingDelayed) fill = "var(--status-warning)"; // work happening but not invoiced
                        else if (entry.notStarted) fill = "var(--text-muted)"; // not started
                        return <Cell key={`cell-${index}`} fill={fill} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "80%", gap: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--status-warning)", fontWeight: 600 }}>NO FINANCIAL DATA</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center", maxWidth: 240, lineHeight: 1.5 }}>
                    Set up cost codes and enter expenses to enable financial tracking and cost control.
                  </div>
                  <button onClick={() => navigate("/Projects")} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "6px 14px", cursor: "pointer", letterSpacing: "0.06em" }}>
                    SET UP COST CODES
                  </button>
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
                  <div key={b.label} style={{ background: `${b.color}10`, border: `1px solid ${b.color}30`, borderRadius: 4, padding: "8px 10px", textAlign: "center" }}>
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
                <tr style={{ background: "var(--bg-surface-low)" }}>
                  {["Project", "WPs", "In Fab", "Complete", "On Hold", "Fab %", "Tonnage", "Erection Ready", "Constraints"].map((h) => (
                    <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", padding: "8px 8px", textAlign: h === "Constraints" ? "left" : "center", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--bg-surface-low)", zIndex: 1 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "5fr 4fr 3fr", gap: 0, minHeight: 320 }}>

        {/* Column 1: TODAY'S PRIORITIES */}
        <div style={{ borderRight: "1px solid var(--divider)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: "var(--status-error)", textTransform: "uppercase", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 3, height: 12, background: "var(--status-error)", borderRadius: 1 }} />
            Today's Priorities
          </div>
          {pccData.priorities.length === 0 ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-success)", fontWeight: 700, padding: 12, textAlign: "center" }}>
              ALL CLEAR — No overdue items
              {rfiTurnaround && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", fontWeight: 400, marginTop: 4 }}>Avg RFI turnaround: {rfiTurnaround}d</div>}
            </div>
          ) : (
            pccData.priorities.slice(0, 8).map((item, i) => {
              const sevColor = item.severity === "critical" ? "var(--status-error)" : item.severity === "high" ? "var(--status-error)" : "var(--status-warning)";
              return (
                <div key={i} onClick={() => navigate(createPageUrl(item.nav))} style={{
                  borderLeft: `3px solid ${sevColor}`,
                  background: i === 0 ? `${sevColor}12` : "transparent",
                  borderRadius: "0 4px 4px 0", padding: "8px 10px", cursor: "pointer",
                  transition: "background 0.12s",
                }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"} onMouseLeave={(e) => e.currentTarget.style.background = i === 0 ? `${sevColor}12` : "transparent"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 800, color: sevColor }}>#{i + 1}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: sevColor, letterSpacing: "0.06em" }}>{item.type} {item.id}</span>
                      </div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.title}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 1 }}>{item.project}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)", background: "var(--accent-muted)", border: "1px solid var(--accent-border)", borderRadius: 3, padding: "1px 6px" }}>
                          {item.action}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                          Owner: <span style={{ color: "var(--text-primary)" }}>{item.owner}</span>
                        </span>
                      </div>
                    </div>
                    {item.days > 0 && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, color: "var(--status-error)", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 3, padding: "2px 6px", flexShrink: 0 }}>
                        {item.days}D
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Column 2: WAITING ON */}
        <div style={{ borderRight: "1px solid var(--divider)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: "var(--status-warning)", textTransform: "uppercase", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 3, height: 12, background: "var(--status-warning)", borderRadius: 1 }} />
            Waiting On ({pccData.waitingOn.length})
          </div>
          {pccData.waitingOn.length === 0 ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", padding: 12, textAlign: "center" }}>
              Nothing blocked externally
            </div>
          ) : (
            pccData.waitingOn.slice(0, 8).map((item, i) => (
              <div key={i} onClick={() => navigate(createPageUrl(item.nav))} style={{
                padding: "6px 8px", borderBottom: "1px solid var(--divider)", cursor: "pointer",
                transition: "background 0.12s",
              }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--status-warning)" }}>{item.type}</span>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{item.title}</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 1 }}>
                      Waiting on: <span style={{ color: "var(--status-warning)" }}>{item.waitingFor}</span>
                      {item.amount ? <span> · {formatCurrency(item.amount).replace(/\.\d+/, "")}</span> : null}
                    </div>
                  </div>
                  {item.days > 0 && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: item.days >= 14 ? "var(--status-error)" : "var(--text-muted)", fontWeight: 600, flexShrink: 0 }}>
                      {item.days}d
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Column 3: RISK WATCHLIST */}
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 3, height: 12, background: "var(--text-muted)", borderRadius: 1 }} />
            Risk Watchlist
          </div>
          {pccData.riskWatch.length === 0 ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-success)", padding: 12, textAlign: "center", fontWeight: 700 }}>
              ALL PROJECTS HEALTHY
            </div>
          ) : (
            pccData.riskWatch.map((p, i) => {
              const color = p.status === "At Risk" ? "var(--status-error)" : "var(--status-warning)";
              return (
                <div key={i} onClick={() => openProjectDashboard(p.projectId)} style={{
                  borderLeft: `3px solid ${color}`,
                  background: `${color}08`, borderRadius: "0 4px 4px 0",
                  padding: "6px 8px", cursor: "pointer",
                }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"} onMouseLeave={(e) => e.currentTarget.style.background = `${color}08`}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{p.project}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, color }}>{p.score}</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color, marginTop: 2 }}>
                    {p.topReason}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Card>
    </ErrorBoundary>
  </div>

      {/* ── Contextual Insights Sidebar ─────────────────────────────────────── */}
      <div
        style={{
          width: 280,
          flexShrink: 0,
          background: "var(--bg-surface-low)",
          borderLeft: "1px solid var(--divider)",
          overflowY: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Portfolio Health Gauge */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "10px 0" }}>
          {(() => {
            const avgScore = enrichedMetrics.length > 0
              ? Math.round(enrichedMetrics.reduce((s, p) => s + (p.healthScore || 0), 0) / enrichedMetrics.length)
              : 100;
            const circumference = 2 * Math.PI * 38;
            const offset = circumference * (1 - avgScore / 100);
            const color = avgScore >= 80 ? "var(--status-success)" : avgScore >= 60 ? "var(--status-warning)" : "var(--status-error)";
            const label = avgScore >= 80 ? "HEALTHY" : avgScore >= 60 ? "WATCH" : "AT RISK";
            return (
              <>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Portfolio Health
                </div>
                <svg width={96} height={96} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={48} cy={48} r={38} fill="none" stroke="var(--border-default)" strokeWidth={5} />
                  <circle cx={48} cy={48} r={38} fill="none" stroke={color} strokeWidth={5}
                    strokeDasharray={circumference} strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.6s ease-out", filter: `drop-shadow(0 0 6px ${color}66)` }}
                  />
                  <text x={48} y={48} textAnchor="middle" dy="0.35em"
                    style={{ fontSize: 28, fontFamily: "var(--font-display)", fontWeight: 800, fill: color, transform: "rotate(90deg)", transformOrigin: "48px 48px" }}
                  >
                    {avgScore}
                  </text>
                </svg>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                  color, letterSpacing: "0.10em",
                  background: `${color}18`, border: `1px solid ${color}44`,
                  borderRadius: 4, padding: "3px 10px",
                }}>
                  {label}
                </span>
              </>
            );
          })()}
        </div>

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
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)", marginTop: 4 }}>{new Date(deliveriesStats.nextDelivery.scheduled_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
          </div>
        )}

        {/* Health Score Breakdown — what's driving the numbers */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 3, height: 12, background: "var(--status-info)", borderRadius: 1 }} />
            How Health is Scored
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", lineHeight: 1.5, padding: "6px 8px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 4 }}>
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
            <div style={{ marginTop: 4, fontSize: 9, color: "var(--text-muted)" }}>
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
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", fontFamily: "var(--font-mono)", fontSize: 10, borderBottom: "1px solid var(--divider)" }}>
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

/**
 * DeliveryRail — horizontal 30-day strip showing upcoming deliveries
 * bucketed by day across the entire portfolio.
 *
 * Layout:
 *   - Header: title + summary count, on-track vs late breakdown
 *   - Day columns: one per day from today → today+29. Weekends get a
 *     muted tint so the week cadence is obvious.
 *   - Per-day: a count + a stacked dot per delivery (up to 4 visible,
 *     then "+N" overflow badge). Dot color encodes status — late/
 *     overdue = red, scheduled = accent, ready/on-site = green.
 *   - Click a day → popover lists each delivery for that day with
 *     PO, vendor, project number, tonnage. Each row links to the
 *     delivery on /Deliveries.
 *
 * Intentionally DOES NOT group by project (per-project rows would be
 * sparse and forced endless horizontal scroll for <20 projects). The
 * chronological bucketing answers "what's hitting site this month" —
 * which is the portfolio question a PM leadership team cares about.
 */
function DeliveryRail({ deliveries = [], projectMap = {}, onOpenDelivery, onOpenProject }) {
  const todayStart = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const DAYS = 30;

  // Bucket deliveries by day-offset-from-today. Skip delivered items
  // and anything outside the 30-day window.
  const { byDay, totals } = React.useMemo(() => {
    const b = Array.from({ length: DAYS }, () => []);
    const totals = { total: 0, late: 0, scheduled: 0, ready: 0, tonsTotal: 0 };
    const msPerDay = 86400000;
    const maxTs = todayStart.getTime() + DAYS * msPerDay;
    for (const d of deliveries || []) {
      if (!d.scheduled_date) continue;
      const when = parseUTCDate(d.scheduled_date);
      if (!when) continue;
      const ts = when.getTime();
      if (ts < todayStart.getTime() || ts >= maxTs) continue;
      if (statusIn(d.status, ["Delivered"])) continue;
      const offset = Math.floor((ts - todayStart.getTime()) / msPerDay);
      if (offset < 0 || offset >= DAYS) continue;
      b[offset].push(d);
      totals.total += 1;
      totals.tonsTotal += Number(d.weight_tons) || 0;
      const statusLower = (d.status || "").toLowerCase();
      if (statusLower.includes("ready") || statusLower.includes("on-site") || statusLower.includes("onsite")) {
        totals.ready += 1;
      } else if (statusLower.includes("late") || statusLower.includes("delay")) {
        totals.late += 1;
      } else {
        totals.scheduled += 1;
      }
    }
    return { byDay: b, totals };
  }, [deliveries, todayStart]);

  // Selected-day popover state. null = no popover.
  const [selectedDay, setSelectedDay] = React.useState(null);

  // Early return — empty state when no upcoming deliveries.
  if (totals.total === 0) {
    return (
      <div style={{ gridColumn: "span 12", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>30-Day Delivery Rail</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            No deliveries scheduled in the next 30 days across the portfolio.
          </div>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--status-success)", padding: "3px 10px", borderRadius: 3, background: "var(--success-muted)", border: "1px solid var(--success-border)" }}>
          ✓ ALL CLEAR
        </span>
      </div>
    );
  }

  // Day header labels: weekday letter + day number. Every 7 days gets a
  // divider-row tick so the user can eyeball week boundaries.
  const dayHeaders = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(todayStart);
    d.setDate(d.getDate() + i);
    const day = d.getDay();
    return {
      iso:         d.toISOString().slice(0, 10),
      weekday:     day,
      dateNum:     d.getDate(),
      monthShort:  d.toLocaleDateString("en-US", { month: "short" }),
      weekdayLetter: d.toLocaleDateString("en-US", { weekday: "narrow" }),
      isWeekend:   day === 0 || day === 6,
      isToday:     i === 0,
      isMonthFirst: d.getDate() === 1 || i === 0,
    };
  });

  return (
    <div style={{ gridColumn: "span 12", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 4, overflow: "hidden" }}>
      {/* Header row */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            30-Day Delivery Rail
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
            {totals.total} upcoming · {totals.tonsTotal.toFixed(1)}T
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 10 }}>
          {totals.late > 0 && (
            <span style={{ color: "var(--status-error)", padding: "3px 8px", borderRadius: 3, background: "var(--danger-muted)", border: "1px solid var(--danger-border)", fontWeight: 700 }}>
              {totals.late} LATE
            </span>
          )}
          <span style={{ color: "var(--accent)", padding: "3px 8px", borderRadius: 3, background: "var(--accent-muted)", border: "1px solid var(--accent-border)", fontWeight: 700 }}>
            {totals.scheduled} SCHEDULED
          </span>
          {totals.ready > 0 && (
            <span style={{ color: "var(--status-success)", padding: "3px 8px", borderRadius: 3, background: "var(--success-muted)", border: "1px solid var(--success-border)", fontWeight: 700 }}>
              {totals.ready} READY
            </span>
          )}
        </div>
      </div>

      {/* Day strip */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${DAYS}, minmax(0, 1fr))`, padding: "8px 0", background: "var(--bg-surface-low)" }}>
        {dayHeaders.map((h, i) => {
          const items = byDay[i] || [];
          const count = items.length;
          const isSelected = selectedDay === i;
          const hasLate = items.some((d) => (d.status || "").toLowerCase().includes("late") || (d.status || "").toLowerCase().includes("delay"));
          return (
            <div
              key={i}
              onClick={() => count > 0 && setSelectedDay(isSelected ? null : i)}
              style={{
                padding: "4px 2px",
                borderLeft: h.weekday === 1 ? "2px solid var(--divider)" : "none",  // week boundary
                background: isSelected
                  ? "var(--accent-muted)"
                  : h.isToday
                    ? "rgba(184,134,11,0.06)"
                    : h.isWeekend
                      ? "rgba(2,6,23,0.025)"
                      : "transparent",
                borderTop: h.isToday ? "2px solid var(--accent)" : "2px solid transparent",
                cursor: count > 0 ? "pointer" : "default",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                minHeight: 60,
                position: "relative",
              }}
              title={count > 0
                ? `${count} deliver${count === 1 ? "y" : "ies"} on ${h.monthShort} ${h.dateNum}`
                : `${h.monthShort} ${h.dateNum} — no deliveries`}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: h.isToday ? "var(--accent)" : "var(--text-muted)", letterSpacing: "0.04em" }}>
                {h.weekdayLetter}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, color: h.isToday ? "var(--accent)" : "var(--text-primary)", lineHeight: 1 }}>
                {h.dateNum}
              </span>
              {h.isMonthFirst && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em", marginTop: 1 }}>
                  {h.monthShort}
                </span>
              )}
              {/* Delivery dots — stacked vertically, max 4 + overflow */}
              {count > 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, marginTop: 3 }}>
                  {items.slice(0, 4).map((d) => {
                    const status = (d.status || "").toLowerCase();
                    const color = status.includes("late") || status.includes("delay")
                      ? "var(--status-error)"
                      : status.includes("ready") || status.includes("on-site") || status.includes("onsite")
                        ? "var(--status-success)"
                        : "var(--accent)";
                    return <span key={d.id} style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />;
                  })}
                  {count > 4 && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: hasLate ? "var(--status-error)" : "var(--text-muted)", marginTop: 1 }}>
                      +{count - 4}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Popover — list of deliveries for the selected day */}
      {selectedDay !== null && byDay[selectedDay]?.length > 0 && (
        <div style={{ borderTop: "1px solid var(--divider)", padding: "10px 14px", background: "var(--bg-surface)", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {(() => {
                const h = dayHeaders[selectedDay];
                return `${h.monthShort} ${h.dateNum} · ${byDay[selectedDay].length} deliver${byDay[selectedDay].length === 1 ? "y" : "ies"}`;
              })()}
            </span>
            <button
              onClick={() => setSelectedDay(null)}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10 }}
            >
              ✕ Close
            </button>
          </div>
          {byDay[selectedDay].map((d) => {
            const status = (d.status || "").toLowerCase();
            const accent = status.includes("late") || status.includes("delay")
              ? "var(--status-error)"
              : status.includes("ready") || status.includes("on-site") || status.includes("onsite")
                ? "var(--status-success)"
                : "var(--accent)";
            const projectName = projectMap[d.project_id] || "(unknown project)";
            return (
              <div
                key={d.id}
                onClick={() => onOpenDelivery?.(d)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 10px",
                  background: "var(--bg-surface-low)",
                  border: "1px solid var(--border-default)",
                  borderLeft: `3px solid ${accent}`,
                  borderRadius: 3,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.borderLeftColor = accent; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.borderLeftColor = accent; }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: accent, minWidth: 70, whiteSpace: "nowrap" }}>
                  {d.po_number || "(no PO)"}
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); if (d.project_id) onOpenProject?.(d.project_id); }}
                  style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", textDecoration: "underline", textDecorationColor: "transparent", transition: "text-decoration-color 0.1s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.textDecorationColor = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.textDecorationColor = "transparent"; }}
                >
                  {projectName}
                </span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.description || d.vendor || "—"}
                </span>
                {d.weight_tons && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-secondary)" }}>
                    {Number(d.weight_tons).toFixed(1)}T
                  </span>
                )}
                {d.pieces && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                    {d.pieces} pcs
                  </span>
                )}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: accent, padding: "2px 8px", borderRadius: 3, background: `color-mix(in srgb, ${accent} 12%, transparent)`, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {d.status || "Scheduled"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
function CoExposurePanel({ data, projectMap, onOpenCO, onOpenProject }) {
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
      style={{
        gridColumn: "span 12",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
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
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: b.color }}>
                  {b.label}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                  {bucket.items.length} CO{bucket.items.length !== 1 ? "s" : ""}
                </span>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
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
