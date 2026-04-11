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

/* ── Weighted health scoring (0-100) with factor breakdown ────────────────── */
function computeWeightedHealth(p) {
  // Factor 1: RFI health (30%) — overdue ratio penalizes score
  let rfiScore = 100;
  if (p.openRFIs > 0) {
    const overdueRatio = p.overdueRFIs / Math.max(p.openRFIs, 1);
    rfiScore = Math.max(0, 100 - overdueRatio * 100);
    if (p.overdueRFIs > 3) rfiScore = Math.min(rfiScore, 20);
  }

  // Factor 2: Budget health (25%) — variance from budget
  let budgetScore = 100;
  if (p.hasBudgetData && p.budget > 0) {
    const variance = (p.actual - p.budget) / p.budget;
    if (variance < 0.02) budgetScore = 100;
    else if (variance < 0.05) budgetScore = 80;
    else if (variance < 0.10) budgetScore = 60;
    else if (variance < 0.20) budgetScore = 30;
    else budgetScore = 0;
  }

  // Factor 3: Delivery performance (25%) — late deliveries
  let delScore = 100;
  if (p.lateDeliveries > 0) {
    delScore = Math.max(0, 100 - p.lateDeliveries * 25);
  }

  // Factor 4: Production health (20%) — stalled WPs and progress
  let prodScore = 100;
  if (p.stalledWPs > 0) prodScore -= p.stalledWPs * 20;
  if (p.avgProgress < 10 && p.stalledWPs > 0) prodScore -= 20;
  prodScore = Math.max(0, prodScore);

  const score = Math.round(
    rfiScore    * 0.30 +
    budgetScore * 0.25 +
    delScore    * 0.25 +
    prodScore   * 0.20
  );
  const clamped = Math.min(100, Math.max(0, score));

  let label;
  if (clamped >= 80) label = "On Track";
  else if (clamped >= 60) label = "Watch";
  else label = "At Risk";

  return {
    score: clamped,
    label,
    factors: { rfi: rfiScore, budget: budgetScore, delivery: delScore, production: prodScore },
  };
}

/* ── Stoplight health pill with numeric score ─────────────────────────────── */
function HealthPill({ status, score }) {
  const cfg = {
    "On Track": { bg: "var(--status-success)", text: "#fff", label: "ON TRACK" },
    "Watch":    { bg: "var(--status-warning)", text: "#000", label: "WATCH" },
    "At Risk":  { bg: "var(--status-error)",   text: "#fff", label: "AT RISK" },
  };
  const s = cfg[status] || cfg["On Track"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
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

const RISK_COLOR = {
  green: { bg: "var(--success-muted)", text: "var(--status-success)" },
  yellow: { bg: "var(--warning-muted)", text: "var(--status-warning)" },
  red: { bg: "var(--danger-muted)", text: "var(--status-error)" },
};

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

function riskCell(level) {
  const c = RISK_COLOR[level];
  return (
    <div
      style={{
        background: c.bg,
        color: c.text,
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        borderRadius: 2,
        padding: "3px 6px",
        textAlign: "center",
      }}
    >
      {level === "green" ? "ON TRACK" : level === "yellow" ? "WATCH" : "AT RISK"}
    </div>
  );
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
        const budget = pCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
        const hasBudgetData = pCodes.length > 0;
        const actual = pExpenses.filter((e) => e.payment_status === "Paid").reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const hasActualData = pExpenses.length > 0;
        const openRFIs = pRFIs.filter((r) => !["Answered", "Closed"].includes(r.status)).length;
        const overdueRFIs = pRFIs.filter((r) => isOverdue(r.due_date, r.status, ["Answered", "Closed"])).length;
        const avgProgress = pWPs.length > 0 ? Math.round(pWPs.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / pWPs.length) : 0;
        const pendingCOs = pCOs.filter((c) => ["Submitted", "Under Review"].includes(c.status));
        const pendingCOValue = pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
        const lateDeliveries = pDeliveries.filter((d) => d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered").length;
        const tonnage = Math.round(pWPs.reduce((s, w) => s + (Number(w.tonnage) || 0), 0));
        const stalledWPs = pWPs.filter((w) => w.status === "On Hold").length;
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
        };
      })
      .sort((a, b) => (HEALTH_ORDER[a.health_status] ?? 3) - (HEALTH_ORDER[b.health_status] ?? 3));
  }, [projects, allRFIs, allCOs, allCodes, allWPs, allDeliveries, allExpenses]);

  // Enrich metrics with weighted health scoring
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
  }, [enrichedMetrics, sortMode, kpiFilter, allDeliveries]);

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
    return { portfolioValue, totalBudget, totalSpend, overdueRFIs, openRFIs, pendingCOs, lateDeliveries, atRisk, activeWPs };
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
      projectMetrics.slice(0, 8).map((p) => ({
        name: p.project_number || p.name?.slice(0, 8),
        Budget: p.budget,
        Actual: p.actual,
        overBudget: p.actual > p.budget,
      })),
    [projectMetrics]
  );

  const urgentItems = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdueRFIs = allRFIs.filter((r) => isOverdue(r.due_date, r.status, ["Answered", "Closed"]));
    const overdueAI = allActionItems.filter((a) => a.status !== "Complete" && a.due_date && new Date(a.due_date) < today);
    const overdueDeliveries = allDeliveries.filter((d) => d.status !== "Delivered" && d.scheduled_date && new Date(d.scheduled_date) < today);
    const pendingCOs = allCOs.filter((c) => c.status === "Submitted" || c.status === "Under Review");
    return [
      ...overdueRFIs.map((r) => ({
        type: "RFI",
        id: r.rfi_number || "—",
        title: r.title,
        project: r.project_name,
        days: Math.max(0, daysOverdue(r.due_date)),
        severity: r.priority === "Critical" ? "critical" : "high",
        nav: "RFIs",
      })),
      ...overdueAI.map((a) => ({
        type: "AI",
        id: "—",
        title: a.title || "Action Item",
        project: a.project_name,
        days: Math.max(0, Math.floor((today - new Date(a.due_date)) / 86400000)),
        severity: "high",
        nav: "ActionItems",
      })),
      ...overdueDeliveries.map((d) => ({
        type: "DEL",
        id: d.delivery_id || "—",
        title: d.delivery_title || d.vendor || "Delivery",
        project: projectMap[d.project_id] || "",
        days: Math.max(0, Math.floor((today - new Date(d.scheduled_date)) / 86400000)),
        severity: "warning",
        nav: "Deliveries",
      })),
      ...pendingCOs.map((c) => ({
        type: "CO",
        id: c.co_number || "—",
        title: c.title,
        project: c.project_name,
        days: 0,
        severity: "warning",
        nav: "ChangeOrders",
      })),
    ].sort((a, b) => {
      const ord = { critical: 0, high: 1, warning: 2 };
      return (ord[a.severity] ?? 3) - (ord[b.severity] ?? 3);
    });
  }, [allRFIs, allActionItems, allDeliveries, allCOs, projectMap]);

  const totalTons = useMemo(() => allWPs.reduce((s, w) => s + (Number(w.tonnage) || 0), 0), [allWPs]);
  const fabricatedTonnage = useMemo(
    () => allWPs.filter((w) => w.status === "Complete").reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
    [allWPs]
  );
  const pipelineBuckets = useMemo(() => {
    const byStatus = { "Not Started": 0, "In Progress": 0, Complete: 0, "On Hold": 0 };
    allWPs.forEach((w) => {
      byStatus[w.status] = (byStatus[w.status] || 0) + 1;
    });
    return byStatus;
  }, [allWPs]);
  const stageColors = ["var(--text-muted)", "var(--status-warning)", "var(--status-success)", "var(--status-error)"];

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

  const stageTons = useMemo(() => {
    const stages = ["drawings_approved", "material_on_hand", "released", "in_fab", "fabricated", "finish", "rts"];
    const values = {
      drawings_approved: 0,
      material_on_hand: 0,
      released: 0,
      in_fab: 0,
      fabricated: 0,
      finish: 0,
      rts: 0,
    };

    // Map WP phase/status to the pipeline stage it has reached
    const phaseToStage = {
      "Detailing": "drawings_approved",
      "Approval": "drawings_approved",
      "Fabrication": "in_fab",
      "Delivery": "released",
      "Shipping": "released",
      "Erection": "rts",
    };

    allWPs.forEach((w) => {
      const ton = Number(w.tonnage) || 0;
      const pct = Number(w.percent_complete) || 0;

      if (w.status === "Complete") {
        // Complete WPs count toward all stages
        stages.forEach((s) => (values[s] += ton));
        return;
      }

      // Determine the furthest stage this WP has reached
      let reachedStage = null;
      if (pct >= 75) reachedStage = "finish";
      else if (pct >= 25 || w.status === "In Progress") reachedStage = "in_fab";
      else if (w.released_date) reachedStage = "released";
      else if (w.vif_confirmed && w.load_list_complete) reachedStage = "material_on_hand";
      else if (w.phase && phaseToStage[w.phase]) reachedStage = phaseToStage[w.phase];
      else reachedStage = "drawings_approved";

      // Add tonnage to the reached stage and all preceding stages
      const reachedIdx = stages.indexOf(reachedStage);
      if (reachedIdx >= 0) {
        for (let i = 0; i <= reachedIdx; i++) {
          values[stages[i]] += ton;
        }
      }
    });

    return values;
  }, [allWPs]);

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

      {urgentItems.length > 0 && (
        <div
          style={{
            background: "var(--danger-muted)",
            border: "1px solid var(--danger-border)",
            padding: "10px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            overflowX: "auto",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--status-error)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            ⚑ Urgent
          </span>
          {urgentItems.slice(0, 8).map((item, i) => {
            const isCrit = item.severity === "critical";
            return (
              <div
                key={i}
                onClick={() => navigate(createPageUrl(item.nav))}
                style={{
                  background: "rgba(255,61,61,0.12)",
                  border: "1px solid rgba(255,61,61,0.25)",
                  borderRadius: 3,
                  padding: "4px 10px",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                  color: "var(--text-primary)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    color: "var(--status-error)",
                  }}
                >
                  {item.type}
                </span>
                <span style={{ fontSize: 10, fontFamily: "var(--font-body)", maxWidth: 160, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                  {item.title}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{item.project}</span>
                {item.days > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      color: "var(--status-error)",
                      background: isCrit ? "rgba(255,61,61,0.18)" : "var(--danger-muted)",
                      padding: "1px 6px",
                      borderRadius: 2,
                    }}
                  >
                    {item.days}D
                  </span>
                )}
              </div>
            );
          })}
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
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 520 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-sidebar)" }}>
                  {["#", "Project", "Phase", "Health", "Budget", "Actual", "Variance", "Open RFIs", "Overdue RFIs", "WP Progress", "Pending COs", "Tonnage", ""].map((h, idx) => (
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
                        <HealthPill status={hStatus} score={p.healthScore} />
                      </td>
                      {/* Budget */}
                      <td
                        title={`Budget: ${p.hasBudgetData ? formatCurrency(p.budget) : "N/A"} | Actual: ${p.hasActualData ? formatCurrency(p.actual) : "N/A"} | Variance: ${variance !== null ? (isOverBudget ? "-" : "+") + formatCurrency(Math.abs(variance)) : "N/A"}`}
                        style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: p.hasBudgetData ? "var(--text-primary)" : "var(--text-muted)", fontStyle: p.hasBudgetData ? "normal" : "italic" }}
                      >
                        {p.hasBudgetData ? formatCurrency(p.budget).replace(/\.\d+/, "") : "Pending"}
                      </td>
                      {/* Actual */}
                      <td
                        title={`Budget: ${p.hasBudgetData ? formatCurrency(p.budget) : "N/A"} | Actual: ${p.hasActualData ? formatCurrency(p.actual) : "N/A"} | Variance: ${variance !== null ? (isOverBudget ? "-" : "+") + formatCurrency(Math.abs(variance)) : "N/A"}`}
                        style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: p.hasActualData ? "var(--text-primary)" : "var(--text-muted)", fontStyle: p.hasActualData ? "normal" : "italic" }}
                      >
                        {p.hasActualData ? formatCurrency(p.actual).replace(/\.\d+/, "") : "Pending"}
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
                      <td title={`${p.tonnage}T total tonnage, ${p.avgProgress}% WP progress`} style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>{p.tonnage > 0 ? `${p.tonnage}T` : "—"}</td>
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
                      <td colSpan={13} style={{ padding: 0, border: "none" }}>
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
                    <td colSpan={13} style={{ textAlign: "center", padding: 28, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
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
        {/* Budget + Risk */}
        <ErrorBoundary label="Budget vs Actual">
        <Card style={{ gridColumn: "span 8" }}>
          <HeaderBar title="Budget vs Actual — All Projects" />
          <div style={{ padding: "12px 16px", height: budgetChartData.some((d) => d.Budget > 0 || d.Actual > 0) ? Math.max(320, budgetChartData.length * 36 + 40) : 320 }}>
            {budgetChartData.some((d) => d.Budget > 0 || d.Actual > 0) ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={budgetChartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <YAxis dataKey="name" type="category" tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "var(--font-mono)" }} width={80} />
                    <XAxis type="number" tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                    <Tooltip content={<PhoenixTooltip />} />
                    <Bar dataKey="Budget" name="Budget" fill="var(--bg-surface-highest)" barSize={10} />
                    <Bar dataKey="Actual" name="Actual" barSize={10}>
                      {budgetChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.overBudget ? "var(--status-error)" : "var(--accent)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
                  Amounts shown in USD · Red bars indicate over-budget
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
                <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden style={{ opacity: 0.15 }}>
                  <rect x="4" y="36" width="8" height="16" rx="2" fill="var(--text-muted)" />
                  <rect x="16" y="24" width="8" height="28" rx="2" fill="var(--text-muted)" />
                  <rect x="28" y="16" width="8" height="36" rx="2" fill="var(--text-muted)" />
                  <rect x="40" y="8" width="8" height="44" rx="2" fill="var(--text-muted)" />
                </svg>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                  WAITING FOR FINANCIAL DATA
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", maxWidth: 280, textAlign: "center", lineHeight: 1.5 }}>
                  Budget and actual cost data will appear here once cost codes and expenses are entered for your projects.
                </span>
              </div>
            )}
          </div>
        </Card>
        </ErrorBoundary>

        <ErrorBoundary label="Risk Heatmap">
        <Card style={{ gridColumn: "span 4" }}>
          <HeaderBar title="Risk Heatmap" right={
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
              WEIGHTED HEALTH
            </span>
          } />
          <div style={{ padding: "12px 14px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "2px" }}>
              <thead>
                <tr>
                  <th style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", padding: "4px 6px", textAlign: "left" }}>
                    Project
                  </th>
                  {["RFIs", "Cost", "Delivery", "Production", "Score"].map((h) => (
                    <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: h === "Score" ? "var(--accent)" : "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.10em", padding: "4px 4px", textAlign: "center", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enrichedMetrics.map((p) => {
                  const factors = p.healthFactors || {};
                  const cells = [
                    { key: "rfi", val: factors.rfi ?? 100, tip: `${p.overdueRFIs} overdue / ${p.openRFIs} open` },
                    { key: "budget", val: factors.budget ?? 100, tip: p.hasBudgetData ? `${Math.round(((p.actual || 0) / Math.max(p.budget, 1)) * 100)}% of budget` : "No budget data" },
                    { key: "delivery", val: factors.delivery ?? 100, tip: `${p.lateDeliveries} late deliveries` },
                    { key: "production", val: factors.production ?? 100, tip: `${p.stalledWPs} stalled WPs · ${p.avgProgress}% avg` },
                  ];
                  const heatColor = (val) => {
                    if (val >= 80) return { bg: "rgba(63,185,80,0.20)", border: "rgba(63,185,80,0.35)", text: "var(--status-success)" };
                    if (val >= 60) return { bg: "rgba(227,179,65,0.18)", border: "rgba(227,179,65,0.30)", text: "var(--status-warning)" };
                    if (val >= 40) return { bg: "rgba(248,81,73,0.15)", border: "rgba(248,81,73,0.28)", text: "var(--status-warning)" };
                    return { bg: "rgba(248,81,73,0.28)", border: "rgba(248,81,73,0.45)", text: "var(--status-error)" };
                  };
                  const scoreColor = heatColor(p.healthScore || 100);
                  return (
                    <tr key={p.id}>
                      <td style={{ padding: "5px 6px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-primary)", whiteSpace: "nowrap", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis" }}>
                        <span style={{ color: "var(--accent)", marginRight: 3 }}>{p.project_number}</span>
                      </td>
                      {cells.map((c) => {
                        const hc = heatColor(c.val);
                        return (
                          <td key={c.key} title={c.tip} style={{ padding: "3px 2px", textAlign: "center" }}>
                            <div style={{
                              background: hc.bg, border: `1px solid ${hc.border}`,
                              borderRadius: 3, padding: "4px 2px", minWidth: 32,
                              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                              color: hc.text, cursor: "default",
                              transition: "transform 0.12s",
                            }}>
                              {Math.round(c.val)}
                            </div>
                          </td>
                        );
                      })}
                      <td style={{ padding: "3px 2px", textAlign: "center" }}>
                        <div style={{
                          background: scoreColor.bg, border: `2px solid ${scoreColor.border}`,
                          borderRadius: 4, padding: "4px 6px",
                          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800,
                          color: scoreColor.text, minWidth: 36,
                        }}>
                          {p.healthScore ?? "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {projectMetrics.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>NO DATA</td>
                  </tr>
                )}
              </tbody>
            </table>
            {/* Heat legend */}
            <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
              <span>RISK INTENSITY:</span>
              {[
                { label: "100–80", bg: "rgba(63,185,80,0.25)" },
                { label: "79–60", bg: "rgba(227,179,65,0.25)" },
                { label: "59–40", bg: "rgba(248,81,73,0.18)" },
                { label: "39–0", bg: "rgba(248,81,73,0.35)" },
              ].map((l) => (
                <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 12, height: 8, borderRadius: 2, background: l.bg, display: "inline-block" }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
        </Card>
        </ErrorBoundary>

        {/* Production Snapshot */}
        <ErrorBoundary label="Production Snapshot">
        <Card style={{ gridColumn: "span 12" }}>
          <HeaderBar title="Production Snapshot" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, padding: "16px 18px" }}>
            {/* Fabrication Pipeline */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Fabrication Pipeline
              </div>
              <div style={{ display: "flex", height: 24, border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
                {["Not Started", "In Progress", "Complete", "On Hold"].map((s, idx) => {
                  const count = pipelineBuckets[s] || 0;
                  const total = Object.values(pipelineBuckets).reduce((a, b) => a + b, 0) || 1;
                  const width = `${(count / total) * 100}%`;
                  return <div key={s} style={{ width, background: stageColors[idx], opacity: 0.35 }} title={`${s}: ${count}`} />;
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>
                {["Not Started", "In Progress", "Complete", "On Hold"].map((s, idx) => (
                  <span key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 10, height: 6, background: stageColors[idx], display: "inline-block", opacity: 0.6 }} />
                    {s}: {pipelineBuckets[s] || 0}
                  </span>
                ))}
              </div>
            </div>

            {/* Tonnage Tracker */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Tonnage Tracker
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 32, color: "var(--accent)" }}>{fabricatedTonnage.toFixed(1)}T</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em" }}>TONS FABRICATED</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>of {totalTons.toFixed(1)}T total</div>
              <ProgressBar value={totalTons > 0 ? Math.round((fabricatedTonnage / totalTons) * 100) : 0} />
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)" }}>{totalTons > 0 ? Math.round((fabricatedTonnage / totalTons) * 100) : 0}%</div>
            </div>

            {/* Delivery Watch */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Delivery Watch
              </div>
              {[
                { label: "Scheduled", value: deliveriesStats.scheduled, color: "var(--accent)" },
                { label: "In Transit", value: deliveriesStats.inTransit, color: "var(--status-info)" },
                { label: "Late", value: deliveriesStats.late, color: deliveriesStats.late > 0 ? "var(--status-error)" : "var(--text-secondary)" },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 11, color: row.color }}>
                  <span>{row.label.toUpperCase()}</span>
                  <span>{row.value}</span>
                </div>
              ))}
      {deliveriesStats.lateList.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {deliveriesStats.lateList.map((d) => (
            <div
              key={d.id}
                      style={{
                        borderLeft: "3px solid var(--status-error)",
                        background: "var(--danger-muted)",
                        borderRadius: "0 2px 2px 0",
                        padding: "6px 8px",
                        fontFamily: "var(--font-body)",
                        fontSize: 11,
                        color: "var(--text-primary)",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {d.delivery_title || d.vendor || "Delivery"}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{projectMap[d.project_id] || "—"}</div>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", flexShrink: 0 }}>{d.daysLate}D</span>
                    </div>
                  ))}
                </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-success)", fontWeight: 600 }}>
                ALL DELIVERIES ON TRACK
              </div>
              {deliveriesStats.nextDelivery && (
                <div style={{
                  borderLeft: "3px solid var(--accent)",
                  background: "var(--accent-muted)",
                  borderRadius: "0 2px 2px 0",
                  padding: "6px 8px",
                  fontFamily: "var(--font-body)",
                  fontSize: 10,
                }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 2 }}>Next Delivery</div>
                  <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 11 }}>
                    {deliveriesStats.nextDelivery.delivery_title || deliveriesStats.nextDelivery.vendor || "—"}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                    {projectMap[deliveriesStats.nextDelivery.project_id] || "—"} · {new Date(deliveriesStats.nextDelivery.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
              )}
              {rfiTurnaround && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", marginTop: 4 }}>
                  Avg RFI turnaround: <span style={{ color: "var(--accent)", fontWeight: 700 }}>{rfiTurnaround} days</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
    </ErrorBoundary>

    {/* Urgent Items card */}
    <ErrorBoundary label="Urgent Items">
    <Card style={{ gridColumn: "span 12" }}>
      <HeaderBar title="Urgent Items — All Projects" count={urgentItems.length} />
      {urgentItems.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 16px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ color: "var(--status-success)", fontWeight: 700 }}>ALL CLEAR</span>
            <span>No urgent items across portfolio</span>
            {rfiTurnaround && <span>· Avg RFI turnaround: <span style={{ color: "var(--accent)", fontWeight: 700 }}>{rfiTurnaround}d</span></span>}
            {deliveriesStats.nextDelivery && (
              <span>· Next delivery: <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                {new Date(deliveriesStats.nextDelivery.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span></span>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8, padding: 12 }}>
          {urgentItems.slice(0, 12).map((item, i) => {
            const isCrit = item.severity === "critical";
            const borderColor = isCrit ? "var(--status-error)" : item.severity === "warning" ? "var(--status-warning)" : "var(--status-error)";
            return (
              <div
                key={i}
                onClick={() => navigate(createPageUrl(item.nav))}
                style={{
                  borderLeft: `3px solid ${borderColor}`,
                  background: isCrit ? "var(--danger-muted)" : "var(--hover-bg)",
                  borderRadius: "0 2px 2px 0",
                  padding: "8px 10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: borderColor, letterSpacing: "0.10em", fontWeight: 600 }}>
                    {item.type} · {item.id}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 11,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.title}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{item.project}</div>
                </div>
                {item.days > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      color: "var(--status-error)",
                      background: "var(--danger-muted)",
                      border: "1px solid var(--danger-border)",
                      borderRadius: 2,
                      padding: "2px 6px",
                      flexShrink: 0,
                    }}
                  >
                    {item.days}d
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
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
          <div style={{
            background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
            borderRadius: "var(--radius-card)", padding: "10px 12px",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>
              Next Delivery
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
              {deliveriesStats.nextDelivery.delivery_title || deliveriesStats.nextDelivery.vendor || "—"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)" }}>
              {projectMap[deliveriesStats.nextDelivery.project_id] || "—"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)", marginTop: 4 }}>
              {new Date(deliveriesStats.nextDelivery.scheduled_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </div>
          </div>
        )}

        {/* Worst-performing factors */}
        {enrichedMetrics.length > 0 && (() => {
          const worstRFI = [...enrichedMetrics].sort((a, b) => (a.healthFactors?.rfi ?? 100) - (b.healthFactors?.rfi ?? 100))[0];
          const worstBudget = [...enrichedMetrics].sort((a, b) => (a.healthFactors?.budget ?? 100) - (b.healthFactors?.budget ?? 100))[0];
          const alerts = [];
          if (worstRFI && (worstRFI.healthFactors?.rfi ?? 100) < 60)
            alerts.push({ label: "Worst RFI Health", project: worstRFI.project_number || worstRFI.name, score: worstRFI.healthFactors.rfi, color: "var(--status-error)" });
          if (worstBudget && (worstBudget.healthFactors?.budget ?? 100) < 60)
            alerts.push({ label: "Worst Budget Health", project: worstBudget.project_number || worstBudget.name, score: worstBudget.healthFactors.budget, color: "var(--status-warning)" });
          if (alerts.length === 0) return null;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 3, height: 12, background: "var(--status-error)", borderRadius: 1 }} />
                Attention Needed
              </div>
              {alerts.map((a) => (
                <div key={a.label} style={{
                  borderLeft: `3px solid ${a.color}`,
                  background: `${a.color}10`,
                  borderRadius: "0 4px 4px 0",
                  padding: "6px 10px",
                }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: a.color, fontWeight: 600, letterSpacing: "0.06em" }}>{a.label}</div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", fontWeight: 600 }}>{a.project}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: a.color, fontWeight: 800 }}>Score: {Math.round(a.score)}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Arizona Project Map Widget */}
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)", overflow: "hidden",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em",
            color: "var(--text-muted)", textTransform: "uppercase",
            padding: "8px 10px", borderBottom: "1px solid var(--divider)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <div style={{ width: 3, height: 12, background: "var(--status-info)", borderRadius: 1 }} />
            Project Locations — AZ
          </div>
          <div style={{ position: "relative", height: 180, background: "var(--bg-surface-low)", overflow: "hidden" }}>
            {/* Stylized Arizona SVG map */}
            <svg viewBox="0 0 260 200" width="100%" height="100%" style={{ opacity: 0.9 }}>
              {/* AZ state outline (simplified) */}
              <path
                d="M40,20 L210,20 L230,30 L240,180 L180,190 L140,160 L40,180 Z"
                fill="var(--bg-surface-high)" stroke="var(--border-default)" strokeWidth={1}
              />
              {/* Major city markers */}
              <text x="130" y="100" fill="var(--text-muted)" fontSize="7" fontFamily="var(--font-mono)" textAnchor="middle" opacity={0.5}>ARIZONA</text>
              {/* Phoenix metro area */}
              <circle cx="150" cy="110" r="3" fill="var(--text-muted)" opacity={0.3} />
              <text x="160" y="113" fill="var(--text-muted)" fontSize="6" fontFamily="var(--font-mono)" opacity={0.4}>PHX</text>
              {/* Tucson area */}
              <circle cx="155" cy="155" r="2" fill="var(--text-muted)" opacity={0.3} />
              <text x="163" y="158" fill="var(--text-muted)" fontSize="6" fontFamily="var(--font-mono)" opacity={0.4}>TUC</text>
              {/* Flagstaff area */}
              <circle cx="120" cy="42" r="2" fill="var(--text-muted)" opacity={0.3} />
              <text x="128" y="45" fill="var(--text-muted)" fontSize="6" fontFamily="var(--font-mono)" opacity={0.4}>FLG</text>

              {/* Project pins — health-coded */}
              {enrichedMetrics.map((p, idx) => {
                const pinColor = p.effectiveHealth === "At Risk" ? "var(--status-error)"
                  : p.effectiveHealth === "Watch" ? "var(--status-warning)" : "var(--status-success)";
                // Distribute projects across AZ map area
                const cx = 100 + ((idx * 37 + 15) % 120);
                const cy = 50 + ((idx * 43 + 20) % 110);
                return (
                  <g key={p.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/ProjectDashboard?project=${p.id}`)}>
                    <circle cx={cx} cy={cy} r={8} fill={pinColor} opacity={0.2} />
                    <circle cx={cx} cy={cy} r={4.5} fill={pinColor} stroke="var(--bg-surface)" strokeWidth={1.5} />
                    <title>{`${p.project_number || p.name}: ${p.effectiveHealth} (${p.healthScore})`}</title>
                  </g>
                );
              })}
            </svg>

            {/* Map legend overlay */}
            <div style={{
              position: "absolute", bottom: 6, left: 6, right: 6,
              background: "rgba(11,14,17,0.85)", borderRadius: 3, padding: "4px 8px",
              display: "flex", gap: 10, alignItems: "center",
              fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)",
            }}>
              {[
                { label: "On Track", color: "var(--status-success)" },
                { label: "Watch", color: "var(--status-warning)" },
                { label: "At Risk", color: "var(--status-error)" },
              ].map((l) => (
                <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: l.color, display: "inline-block" }} />
                  {l.label}
                </span>
              ))}
              <span style={{ marginLeft: "auto" }}>{enrichedMetrics.length} projects</span>
            </div>
          </div>
        </div>

        {/* Tonnage Pipeline mini-view */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 3, height: 12, background: "var(--accent)", borderRadius: 1 }} />
            Tonnage Pipeline
          </div>
          {[
            { label: "Drawings Approved", val: stageTons.drawings_approved },
            { label: "Material on Hand", val: stageTons.material_on_hand },
            { label: "Released", val: stageTons.released },
            { label: "In Fabrication", val: stageTons.in_fab },
            { label: "Fabricated", val: stageTons.fabricated },
            { label: "Finish", val: stageTons.finish },
            { label: "RTS", val: stageTons.rts },
          ].map((stage) => {
            const pct = totalTons > 0 ? (stage.val / totalTons) * 100 : 0;
            return (
              <div key={stage.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)" }}>
                  <span>{stage.label}</span>
                  <span>{Math.round(stage.val)}T</span>
                </div>
                <div style={{ height: 4, background: "var(--border-default)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: "var(--accent)", borderRadius: 2, transition: "width 0.3s" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* End sidebar */}
      </div>
      {/* End flex wrapper */}
</div>
);
}
