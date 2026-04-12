import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatCurrency, isOverdue, daysOverdue } from "../shared/formatters";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import StatusBadge from "../shared/StatusBadge";
import ProgressBar from "../shared/ProgressBar";

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
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color, fontWeight: 700, lineHeight: 1 }}>
          {trendChar}
        </span>
      )}
    </div>
  );
}

/* ── Aggressive health scoring — real signals, not optimistic defaults ────── */
function computeWeightedHealth(p) {
  const reasons = [];

  // Factor 1: RFI health (30%) — any overdue = immediate penalty
  let rfiScore = 100;
  if (p.overdueRFIs > 0) {
    rfiScore = p.overdueRFIs >= 3 ? 10 : p.overdueRFIs >= 2 ? 30 : 50;
    reasons.push(`${p.overdueRFIs} overdue RFI${p.overdueRFIs > 1 ? "s" : ""}`);
  } else if (p.openRFIs > 5) {
    rfiScore = 65;
    reasons.push(`${p.openRFIs} open RFIs (backlog)`);
  }

  // Factor 2: Budget health (25%) — burn rate matters
  let budgetScore = 100;
  if (p.hasBudgetData && p.budget > 0) {
    const burnPct = p.actual / p.budget;
    if (burnPct > 1.10) { budgetScore = 0; reasons.push("Budget exceeded by 10%+"); }
    else if (burnPct > 1.05) { budgetScore = 25; reasons.push("Over budget"); }
    else if (burnPct > 0.95) { budgetScore = 55; reasons.push("Budget burn > 95%"); }
    else if (burnPct > 0.85) budgetScore = 80;
  } else if (!p.hasBudgetData) {
    budgetScore = 70; // Unknown = not healthy, penalize missing data
    reasons.push("No budget set up");
  }

  // Factor 3: Delivery performance (25%) — late = critical in steel
  let delScore = 100;
  if (p.lateDeliveries > 0) {
    delScore = p.lateDeliveries >= 3 ? 10 : p.lateDeliveries >= 2 ? 35 : 55;
    reasons.push(`${p.lateDeliveries} late deliver${p.lateDeliveries > 1 ? "ies" : "y"}`);
  }

  // Factor 4: Production health (20%) — stalled = blocked job
  let prodScore = 100;
  if (p.stalledWPs > 0) {
    prodScore = Math.max(0, 100 - p.stalledWPs * 30);
    reasons.push(`${p.stalledWPs} stalled WP${p.stalledWPs > 1 ? "s" : ""}`);
  }
  if (p.avgProgress < 15 && p.stalledWPs > 0) prodScore = Math.min(prodScore, 30);

  // CO exposure penalty (bonus factor) — pending COs = financial risk
  const coPenalty = p.pendingCOs?.length >= 3 ? 10 : p.pendingCOs?.length >= 1 ? 5 : 0;
  if (p.pendingCOs?.length > 0) reasons.push(`${p.pendingCOs.length} pending CO${p.pendingCOs.length > 1 ? "s" : ""}`);

  const raw = Math.round(
    rfiScore    * 0.30 +
    budgetScore * 0.25 +
    delScore    * 0.25 +
    prodScore   * 0.20
  ) - coPenalty;
  const score = Math.min(100, Math.max(0, raw));

  let label;
  if (score >= 75) label = "On Track";
  else if (score >= 50) label = "Watch";
  else label = "At Risk";

  return {
    score,
    label,
    reasons,
    factors: { rfi: rfiScore, budget: budgetScore, delivery: delScore, production: prodScore },
  };
}

/* ── Health pill with score + reason tooltip ──────────────────────────────── */
function HealthPill({ status, score, reasons }) {
  const cfg = {
    "On Track": { bg: "var(--status-success)", text: "#fff", label: "ON TRACK" },
    "Watch":    { bg: "var(--status-warning)", text: "#000", label: "WATCH" },
    "At Risk":  { bg: "var(--status-error)",   text: "#fff", label: "AT RISK" },
  };
  const s = cfg[status] || cfg["On Track"];
  const tip = reasons?.length > 0 ? reasons.join(" · ") : "All signals healthy";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }} title={tip}>
      {score != null && (
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800,
          color: s.bg, lineHeight: 1, minWidth: 20, textAlign: "right",
        }}>
          {score}
        </span>
      )}
      <span style={{
        background: s.bg, color: s.text,
        fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
        letterSpacing: "0.08em", padding: "3px 10px",
        borderRadius: 999, whiteSpace: "nowrap",
      }}>
        {s.label}
      </span>
    </div>
  );
}

const ROW_HEIGHT = 40;
const HEALTH_ORDER = { "At Risk": 0, "Watch": 1, "On Track": 2 };

const PHASE_DOT = {
  Detailing: "var(--status-info)",
  Fabrication: "var(--accent)",
  Delivery: "var(--status-warning)",
  "Erection/Installation": "#8B5CF6",
  Closeout: "var(--status-success)",
};

function healthColor(status) {
  switch (status) {
    case "On Track": return "var(--status-success)";
    case "Watch": return "var(--status-warning)";
    case "At Risk": return "var(--status-error)";
    default: return "var(--text-muted)";
  }
}

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
      background: "var(--bg-sidebar)",
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

const KPIBlock = ({ label, value, color, bordered, onClick, active }) => (
  <div
    onClick={onClick}
    style={{
      padding: "12px 24px",
      borderRight: bordered ? "1px solid var(--divider)" : "none",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      cursor: onClick ? "pointer" : "default",
      borderTop: active ? "3px solid var(--accent)" : "3px solid transparent",
      boxShadow: active ? "0 0 12px rgba(59,130,246,0.25)" : "none",
      transition: "box-shadow 0.2s, border-top 0.2s",
    }}
  >
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 7,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 22,
        fontWeight: 800,
        lineHeight: 1,
        color: color || "var(--text-primary)",
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
}) {
  const navigate = useNavigate();
  const [sortMode, setSortMode] = useState("health");
  const [kpiFilter, setKpiFilter] = useState(null);
  const [phaseFilter, setPhaseFilter] = useState(null);

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
        const pExpenses = allExpenses.filter((e) => e.project_id === p.id && e.payment_status !== "Voided");
        const approvedCOTotal = pCOs.filter((c) => c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
        const budget = pCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0) + approvedCOTotal;
        const hasBudgetData = pCodes.length > 0;
        // Committed (all non-voided expenses) is the true exposure; paid is a subset
        const actual = pExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const hasActualData = pExpenses.length > 0;
        const openRFIs = pRFIs.filter((r) => !["Answered", "Closed"].includes(r.status)).length;
        const overdueRFIs = pRFIs.filter((r) => isOverdue(r.due_date, r.status, ["Answered", "Closed"])).length;
        const avgProgress = pWPs.length > 0 ? Math.round(pWPs.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / pWPs.length) : 0;
        const pendingCOs = pCOs.filter((c) => ["Submitted", "Under Review"].includes(c.status));
        const pendingCOValue = pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
        const lateDeliveries = pDeliveries.filter((d) => d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered").length;
        const tonnage = Math.round(pWPs.reduce((s, w) => s + (Number(w.tonnage) || 0), 0));
        const stalledWPs = pWPs.filter((w) => w.status === "On Hold").length;

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
      .sort((a, b) => (HEALTH_ORDER[a.health_status] ?? 3) - (HEALTH_ORDER[b.health_status] ?? 3) || (a.name || "").localeCompare(b.name || ""));
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
    // Apply phase filter
    if (phaseFilter) {
      list = list.filter((p) => p.phase === phaseFilter);
    }
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
      list.sort((a, b) => {
        const aDate = allDeliveries.filter((d) => d.project_id === a.id && d.status !== "Delivered").reduce((min, d) => {
          const dt = d.scheduled_date ? new Date(d.scheduled_date).getTime() : Infinity;
          return dt < min ? dt : min;
        }, Infinity);
        const bDate = allDeliveries.filter((d) => d.project_id === b.id && d.status !== "Delivered").reduce((min, d) => {
          const dt = d.scheduled_date ? new Date(d.scheduled_date).getTime() : Infinity;
          return dt < min ? dt : min;
        }, Infinity);
        return aDate - bDate;
      });
    }
    // default "health" sort is already applied from projectMetrics
    return list;
  }, [enrichedMetrics, sortMode, kpiFilter, phaseFilter, allDeliveries]);

  const portfolioKPIs = useMemo(() => {
    const portfolioValue =
      projects.reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0) +
      allCOs.filter((c) => c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const totalBudget = allCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
    const totalSpend = allExpenses.filter((e) => e.payment_status === "Paid").reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const overdueRFIs = allRFIs.filter((r) => isOverdue(r.due_date, r.status, ["Answered", "Closed"])).length;
    const openRFIs = allRFIs.filter((r) => !["Answered", "Closed"].includes(r.status)).length;
    const pendingCOs = allCOs.filter((c) => ["Submitted", "Under Review"].includes(c.status)).length;
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const lateDeliveries = allDeliveries.filter((d) => d.scheduled_date && new Date(d.scheduled_date + "T00:00:00") < todayStart && d.status !== "Delivered").length;
    const atRisk = enrichedMetrics.filter((p) => p.effectiveHealth === "At Risk" || p.effectiveHealth === "Watch").length;
    const activeWPs = allWPs.filter((w) => w.status === "In Progress").length;
    // Stale RFIs: open RFIs whose age (created_date) exceeds 30 days. These are
    // the bottlenecks most likely to cause schedule delay.
    const thirtyDaysAgo = todayStart.getTime() - 30 * 86400000;
    const staleRFIs30 = allRFIs.filter((r) => {
      if (["Answered", "Closed"].includes(r.status)) return false;
      const opened = r.created_date || r.created_at || r.submitted_date;
      if (!opened) return false;
      return new Date(opened).getTime() < thirtyDaysAgo;
    });
    return { portfolioValue, totalBudget, totalSpend, overdueRFIs, openRFIs, pendingCOs, lateDeliveries, atRisk, activeWPs, staleRFIs30 };
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
      .filter((d) => d.status !== "Delivered" && d.scheduled_date && new Date(d.scheduled_date) < now)
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));
    lateDeliveries.forEach((d) => {
      const days = Math.max(0, Math.floor((now - new Date(d.scheduled_date)) / 86400000));
      priorities.push({
        rank: days >= 7 ? 1 : 3,
        type: "DEL", id: d.delivery_id || "—",
        title: d.delivery_title || d.vendor || "Delivery",
        project: projectMap[d.project_id] || "",
        owner: d.vendor || "Vendor",
        days, severity: days >= 7 ? "high" : "medium",
        action: days >= 7 ? "Expedite — blocking production" : "Track status with vendor",
        nav: "Deliveries",
      });
    });

    // Overdue action items
    const overdueAI = allActionItems
      .filter((a) => a.status !== "Complete" && a.due_date && new Date(a.due_date) < now)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    overdueAI.forEach((a) => {
      const days = Math.max(0, Math.floor((now - new Date(a.due_date)) / 86400000));
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

    // WAITING ON — items pending external response
    const waitingOn = [];
    // RFIs submitted, waiting for response
    allRFIs.filter((r) => r.status === "Submitted" || r.status === "Open").forEach((r) => {
      waitingOn.push({
        type: "RFI", id: r.rfi_number || "—",
        title: r.title, project: r.project_name || projectMap[r.project_id] || "",
        waitingFor: r.assigned_to || r.ball_in_court || "Architect/Engineer",
        submitted: r.submitted_date,
        days: r.submitted_date ? Math.max(0, Math.floor((now - new Date(r.submitted_date)) / 86400000)) : 0,
        nav: "RFIs",
      });
    });
    // COs under review
    allCOs.filter((c) => c.status === "Submitted" || c.status === "Under Review").forEach((c) => {
      waitingOn.push({
        type: "CO", id: c.co_number || "—",
        title: c.title, project: c.project_name || projectMap[c.project_id] || "",
        waitingFor: "Owner/GC",
        submitted: c.submitted_date,
        days: c.submitted_date ? Math.max(0, Math.floor((now - new Date(c.submitted_date)) / 86400000)) : 0,
        amount: Number(c.co_amount) || 0,
        nav: "ChangeOrders",
      });
    });
    // Deliveries in transit
    allDeliveries.filter((d) => d.status === "In Transit").forEach((d) => {
      waitingOn.push({
        type: "DEL", id: d.delivery_id || "—",
        title: d.delivery_title || d.vendor || "Delivery",
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
  const fabricatedTonnage = useMemo(
    () => allWPs.filter((w) => w.status === "Complete").reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
    [allWPs]
  );
  const deliveriesStats = useMemo(() => {
    const today = new Date();
    const scheduled = allDeliveries.filter((d) => d.status === "Scheduled").length;
    const inTransit = allDeliveries.filter((d) => d.status === "In Transit").length;
    const late = allDeliveries.filter((d) => d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered").length;
    const lateList = allDeliveries
      .filter((d) => d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered")
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
      .slice(0, 3)
      .map((d) => ({
        ...d,
        daysLate: Math.max(0, Math.floor((today - new Date(d.scheduled_date)) / 86400000)),
      }));
    // Next upcoming delivery
    const upcoming = allDeliveries
      .filter((d) => d.scheduled_date && new Date(d.scheduled_date) >= today && d.status !== "Delivered")
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));
    const nextDelivery = upcoming[0] || null;
    return { scheduled, inTransit, late, lateList, nextDelivery };
  }, [allDeliveries]);

  // ── RFI turnaround metric ──────────────────────────────────────────────────
  const rfiTurnaround = useMemo(() => {
    const closed = allRFIs.filter((r) => ["Answered", "Closed"].includes(r.status) && r.submitted_date && r.responded_date);
    if (closed.length === 0) return null;
    const totalDays = closed.reduce((s, r) => {
      const submitted = new Date(r.submitted_date);
      const responded = new Date(r.responded_date);
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
    const rfisNoDue = allRFIs.filter((r) => !r.due_date && !["Answered", "Closed"].includes(r.status));
    if (rfisNoDue.length > 0) issues.push({ project: `${rfisNoDue.length} RFIs`, projectId: null, issue: "RFIs missing due dates", severity: "high", fix: "Add due dates" });
    // COs without values
    const cosNoVal = allCOs.filter((c) => !c.co_amount && !["Rejected", "Void"].includes(c.status));
    if (cosNoVal.length > 0) issues.push({ project: `${cosNoVal.length} COs`, projectId: null, issue: "COs missing dollar values", severity: "medium", fix: "Add CO amounts" });
    return issues;
  }, [enrichedMetrics, allRFIs, allCOs]);

  // ── Financial control layer — CO pipeline + margin at risk ────────────────
  const financials = useMemo(() => {
    const approvedCOs = allCOs.filter((c) => c.status === "Approved");
    const pendingCOs = allCOs.filter((c) => ["Submitted", "Under Review"].includes(c.status));
    const rejectedCOs = allCOs.filter((c) => c.status === "Rejected");
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
    const todayMs = new Date().setHours(0, 0, 0, 0);
    return enrichedMetrics.map((p) => {
      const pWPs = allWPs.filter((w) => w.project_id === p.id);
      const inFab = pWPs.filter((w) => w.status === "In Progress");
      const complete = pWPs.filter((w) => w.status === "Complete");
      const onHold = pWPs.filter((w) => w.status === "On Hold");
      const totalTon = pWPs.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
      const fabTon = complete.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
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
          background: "var(--bg-sidebar)",
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
        {/* Portfolio Value — featured (wider, not filterable) */}
        <div style={{
          padding: "12px 28px",
          borderRight: "1px solid var(--divider)",
          borderTop: "3px solid var(--accent)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minWidth: 200,
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)" }}>Portfolio Value</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 800, lineHeight: 1, color: "var(--accent)" }}>
            {formatCurrency(portfolioKPIs.portfolioValue).replace(/\.\d+/, "")}
          </span>
        </div>
        <KPIBlock label="Active Projects" value={projects.filter((p) => p.status === "Active" || !p.status).length} bordered color="var(--accent)" />
        <KPIBlock
          label="Total Spend"
          value={formatCurrency(portfolioKPIs.totalSpend).replace(/\.\d+/, "")}
          bordered
          color={portfolioKPIs.totalSpend > (portfolioKPIs.totalBudget || 0) ? "var(--status-error)" : "var(--status-success)"}
        />
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
                borderTop: isActive ? "3px solid var(--accent)" : tile.warn ? `3px solid ${tile.color}` : "3px solid transparent",
                background: isActive ? "rgba(59,130,246,0.08)" : tile.warn ? `${tile.color}10` : "transparent",
                display: "flex", flexDirection: "column", gap: 3,
                cursor: "pointer",
                boxShadow: isActive ? "0 0 12px rgba(59,130,246,0.25)" : "none",
                transition: "box-shadow 0.2s, border-top 0.2s, background 0.2s",
                minWidth: 100,
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.14em", textTransform: "uppercase", color: tile.warn ? tile.color : "var(--text-muted)" }}>
                {tile.label}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800, lineHeight: 1, color: tile.warn ? tile.color : "var(--status-success)" }}>
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
                <span style={{ width: 1, height: 16, background: "var(--divider)", margin: "0 4px" }} />
                {Object.entries(PHASE_DOT).map(([phase, color]) => (
                  <button
                    key={phase}
                    onClick={() => setPhaseFilter(phaseFilter === phase ? null : phase)}
                    style={{
                      background: phaseFilter === phase ? `${color}` : "var(--bg-surface)",
                      color: phaseFilter === phase ? "#fff" : "var(--text-secondary)",
                      border: phaseFilter === phase ? `1px solid ${color}` : "1px solid var(--border-default)",
                      borderRadius: 999,
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "5px 12px",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                      transition: "background 0.15s, color 0.15s",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: phaseFilter === phase ? "#fff" : color, flexShrink: 0 }} />
                    {phase}
                  </button>
                ))}
                {(kpiFilter || phaseFilter) && (
                  <button
                    onClick={() => { setKpiFilter(null); setPhaseFilter(null); }}
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
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 520 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-sidebar)" }}>
                  {["#", "Project", "Phase", "Health", "Budget", "Actual", "Variance", "Proj. Margin", "Open RFIs", "Overdue RFIs", "WP Progress", "Pending COs", "Tonnage", ""].map((h, idx) => (
                    <th
                      key={idx}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 7,
                        color: "var(--text-muted)",
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        padding: "10px 8px",
                        textAlign: idx <= 2 ? "left" : "center",
                        whiteSpace: "nowrap",
                        position: "sticky",
                        top: 0,
                        background: "var(--bg-sidebar)",
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
                      onClick={() => navigate(`/ProjectDashboard?project=${p.id}`)}
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
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>
                        <HealthPill status={hStatus} score={p.healthScore} reasons={p.healthReasons} />
                        {p.healthReasons?.length > 0 && hStatus !== "On Track" && (
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", marginTop: 2, maxWidth: 130, lineHeight: 1.3 }}>
                            {p.healthReasons[0]}
                          </div>
                        )}
                      </td>
                      {/* Budget */}
                      <td
                        title={p.hasBudgetData ? `Budget: ${formatCurrency(p.budget)} · Source: Cost Codes` : "No cost codes set up — add cost codes to track budget"}
                        style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: p.hasBudgetData ? "var(--text-primary)" : "var(--status-warning)" }}
                      >
                        {p.hasBudgetData ? formatCurrency(p.budget).replace(/\.\d+/, "") : (
                          <span style={{ fontSize: 8, fontWeight: 600, color: "var(--status-warning)", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderRadius: 3, padding: "1px 5px" }}>
                            SET UP
                          </span>
                        )}
                      </td>
                      {/* Actual */}
                      <td
                        title={p.hasActualData ? `Actual spend: ${formatCurrency(p.actual)} · Source: Paid Expenses` : "No expense data — enter expenses to track actuals"}
                        style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: p.hasActualData ? "var(--text-primary)" : "var(--text-muted)" }}
                      >
                        {p.hasActualData ? formatCurrency(p.actual).replace(/\.\d+/, "") : (
                          <span style={{ fontSize: 8, color: "var(--text-muted)" }}>$0</span>
                        )}
                      </td>
                      {/* Variance = Budget - Actual (positive = under budget) */}
                      <td
                        title={`Budget: ${p.hasBudgetData ? formatCurrency(p.budget) : "N/A"} | Actual: ${p.hasActualData ? formatCurrency(p.actual) : "N/A"} | Variance: ${variance !== null ? (isOverBudget ? "-" : "+") + formatCurrency(Math.abs(variance)) : "N/A"}`}
                        style={{
                          padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                          color: variance === null ? "var(--text-muted)" : isOverBudget ? "var(--status-error)" : "var(--status-success)",
                          background: isOverBudget ? "rgba(248,81,73,0.06)" : "transparent",
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
                      {/* Projected Margin = Contract Value − max(budget, actual + pending CO exposure) */}
                      <td
                        title={p.projectedMargin === null
                          ? "No contract value entered — set original_contract_value to see projected margin"
                          : `Contract: ${formatCurrency(p.contractValue)} · Est. cost at completion: ${formatCurrency(p.estimatedCostAtCompletion)} · Margin: ${(p.projectedMarginPct ?? 0).toFixed(1)}%`}
                        style={{
                          padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                          color: p.projectedMargin === null ? "var(--text-muted)" : p.projectedMargin < 0 ? "var(--status-error)" : (p.projectedMarginPct ?? 0) < 5 ? "var(--status-warning)" : "var(--status-success)",
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
                        title={`${p.openRFIs} open, ${p.overdueRFIs} overdue`}
                        style={{
                          padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)",
                          color: p.overdueRFIs > 0 ? "var(--status-error)" : p.openRFIs > 3 ? "var(--status-warning)" : "var(--text-primary)",
                          fontSize: 16, fontWeight: 800,
                          background: p.overdueRFIs > 2 ? "rgba(248,81,73,0.08)" : p.openRFIs > 5 ? "rgba(227,179,65,0.06)" : "transparent",
                        }}
                      >
                        {p.openRFIs}
                      </td>
                      <td
                        title={`${p.openRFIs} open, ${p.overdueRFIs} overdue`}
                        style={{
                          padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)",
                          color: p.overdueRFIs > 0 ? "var(--status-error)" : "var(--text-muted)",
                          fontSize: 10, fontWeight: p.overdueRFIs > 0 ? 700 : 400,
                          background: p.overdueRFIs > 0 ? "rgba(248,81,73,0.06)" : "transparent",
                        }}
                      >
                        {p.overdueRFIs > 0 ? (
                          <span style={{ background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 3, padding: "1px 6px" }}>
                            {p.overdueRFIs}
                          </span>
                        ) : p.overdueRFIs}
                      </td>
                      <td style={{ padding: "6px 8px", minWidth: 130 }}>
                        <ProgressBar value={p.avgProgress || 0} />
                      </td>
                      <td
                        title={`${p.pendingCOs.length} pending COs totaling ${formatCurrency(p.pendingCOValue)}`}
                        style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: p.pendingCOs.length > 0 ? 16 : 10, fontWeight: p.pendingCOs.length > 0 ? 800 : 400, color: p.pendingCOs.length > 0 ? "var(--status-warning)" : "var(--text-muted)" }}
                      >
                        {p.pendingCOs.length > 0 ? `${p.pendingCOs.length} · ${formatCurrency(p.pendingCOValue).replace(/\.\d+/, "")}` : "—"}
                      </td>
                      <td title={p.tonnage > 0 ? `${p.tonnage}T total · ${p.avgProgress}% WP progress · Source: Work Packages` : "No tonnage entered — add tonnage to work packages"} style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: p.tonnage > 0 ? "var(--text-secondary)" : "var(--text-muted)" }}>{p.tonnage > 0 ? `${p.tonnage}T` : <span style={{ fontSize: 8 }}>0T</span>}</td>
                      <td style={{ padding: "6px 6px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                          {[
                            { label: "DASH", nav: `/ProjectDashboard?project=${p.id}`, primary: true },
                            ...(p.openRFIs > 0 ? [{ label: "RFIs", nav: createPageUrl("RFIs"), accent: "var(--status-warning)" }] : []),
                            ...(p.lateDeliveries > 0 ? [{ label: "DEL", nav: createPageUrl("Deliveries"), accent: "var(--status-error)" }] : []),
                          ].slice(0, 3).map((btn) => (
                            <button
                              key={btn.label}
                              onClick={(e) => { e.stopPropagation(); navigate(btn.nav); }}
                              style={{
                                background: btn.primary ? "var(--accent-muted)" : "var(--bg-surface)",
                                border: `1px solid ${btn.primary ? "var(--accent-border)" : btn.accent ? `${btn.accent}44` : "var(--border-default)"}`,
                                borderRadius: 3,
                                color: btn.primary ? "var(--accent)" : btn.accent || "var(--text-secondary)",
                                fontFamily: "var(--font-mono)",
                                fontSize: 7,
                                fontWeight: 700,
                                padding: "3px 6px",
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
                      <td colSpan={14} style={{ padding: 0, border: "none" }}>
                        <div style={{ width: "100%", height: 3, background: "var(--bg-sidebar)" }}>
                          <div style={{ width: `${Math.min(p.avgProgress || 0, 100)}%`, height: 3, background: hColor, transition: "width 0.3s ease" }} />
                        </div>
                      </td>
                    </tr>
                    </React.Fragment>
                  );
                })}
                {displayMetrics.length === 0 && (
                  <tr>
                    <td colSpan={14} style={{ textAlign: "center", padding: 28, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
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
            <div style={{ padding: "12px 16px", borderRight: "1px solid var(--divider)", height: budgetChartData.some((d) => d.Budget > 0 || d.Actual > 0) ? Math.max(280, budgetChartData.length * 36 + 40) : 280 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.10em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>Budget vs Actual</div>
              {budgetChartData.some((d) => d.Budget > 0 || d.Actual > 0) ? (
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={budgetChartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <YAxis dataKey="name" type="category" tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "var(--font-mono)" }} width={80} />
                    <XAxis type="number" tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                    <Tooltip content={<PhoenixTooltip />} />
                    <Bar dataKey="Budget" name="Budget" fill="var(--bg-surface-highest)" barSize={10} />
                    <Bar dataKey="Actual" name="Actual" barSize={10}>
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
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.10em", color: b.color, textTransform: "uppercase" }}>{b.label}</div>
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
          <div style={{ padding: "10px 12px", maxHeight: 300, overflowY: "auto" }}>
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
                    onClick={() => issue.projectId && navigate(`/ProjectDashboard?project=${issue.projectId}`)}>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-primary)", fontWeight: 500 }}>{issue.project}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{issue.issue}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--accent)", background: "var(--accent-muted)", borderRadius: 2, padding: "1px 5px", fontWeight: 600 }}>{issue.fix}</span>
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
                <tr style={{ background: "var(--bg-sidebar)" }}>
                  {["Project", "WPs", "In Fab", "Complete", "On Hold", "Fab %", "Tonnage", "Erection Ready", "Constraints"].map((h) => (
                    <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", padding: "8px 8px", textAlign: h === "Constraints" ? "left" : "center", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--bg-sidebar)", zIndex: 1 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productionData.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--divider)", cursor: "pointer" }}
                    onClick={() => navigate(`/ProjectDashboard?project=${p.id}`)}
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
      <div style={{ display: "grid", gridTemplateColumns: "5fr 4fr 3fr", gap: 0, minHeight: 200 }}>

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
                <div key={i} onClick={() => navigate(`/ProjectDashboard?project=${p.projectId}`)} style={{
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
          background: "var(--bg-sidebar)",
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
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>Next Delivery</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>{deliveriesStats.nextDelivery.delivery_title || deliveriesStats.nextDelivery.vendor || "—"}</div>
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
            <div style={{ marginTop: 4, fontSize: 7, color: "var(--text-muted)" }}>
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
