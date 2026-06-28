import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Radar,
  RadarChart,
  PolarAngleAxis,
  PolarGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, DollarSign, Layers3, Search, ShieldCheck, Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { computeCostCodeTotals } from "@/services/costRollup";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import { formatCurrency, formatCurrencyShort, formatDate, isOverdue, statusIn } from "@/components/shared/formatters";
import PlanningStudio from "@/components/reports/PlanningStudio";
import { Button, CommandBar } from "@/components/design-system";
import { useProjectId } from "@/hooks/useProjectId";

const CLOSED_RFI = ["Answered", "Closed", "Void"];
const CLOSED_ACTION = ["Complete", "Cancelled", "Closed"];
const RISK_COLORS = {
  healthy: "#22c55e",
  watch: "#f59e0b",
  risk: "#ef4444",
  accent: "#3b82f6",
  steel: "#94a3b8",
};

const tooltipStyle = {
  contentStyle: {
    background: "var(--bg-surface-high)",
    border: "1px solid var(--border-default)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: 10,
  },
  labelStyle: { color: "var(--text-muted)" },
};

const cardStyle = {
  background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 92%, #000 8%) 0%, color-mix(in srgb, var(--bg-surface-low) 86%, #000 14%) 100%)",
  border: "1px solid color-mix(in srgb, var(--border-default) 88%, white 12%)",
  borderRadius: 18,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 14px 30px rgba(0,0,0,0.30)",
  overflow: "hidden",
};

const chartFrameStyle = (height) => ({
  width: "100%",
  minWidth: 0,
  height,
  minHeight: height,
});

function n(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function dateValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntil(value) {
  const d = dateValue(value);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function statusColor(label) {
  if (label === "At Risk") return RISK_COLORS.risk;
  if (label === "Watch") return RISK_COLORS.watch;
  return RISK_COLORS.healthy;
}

function computeProjectModel(project, data) {
  const {
    rfis,
    cos,
    codes,
    wps,
    deliveries,
    actionItems,
    scheduleTasks,
  } = data;

  const projectRfis = rfis.filter((r) => r.project_id === project.id);
  const projectCos = cos.filter((c) => c.project_id === project.id);
  const projectCodes = codes.filter((c) => c.project_id === project.id);
  const projectWps = wps.filter((w) => w.project_id === project.id);
  const projectDeliveries = deliveries.filter((d) => d.project_id === project.id);
  const projectActions = actionItems.filter((a) => a.project_id === project.id);
  const projectTasks = scheduleTasks.filter((t) => t.project_id === project.id);

  // budget + actual via the shared rollup (n() ≡ its coercion); committed keeps
  // this page's deliberate max(committed, actual) variant.
  const { budget, actual } = computeCostCodeTotals(projectCodes);
  const committed = projectCodes.reduce((sum, c) => sum + Math.max(n(c.committed_cost), n(c.actual_cost)), 0);
  const contract = n(project.original_contract_value);
  const approvedCo = projectCos.filter((c) => c.status === "Approved").reduce((sum, c) => sum + n(c.co_amount), 0);
  const pendingCo = projectCos.filter((c) => ["Draft", "Submitted", "Under Review"].includes(c.status)).reduce((sum, c) => sum + n(c.co_amount), 0);

  const openRfis = projectRfis.filter((r) => !statusIn(r.status, CLOSED_RFI));
  const overdueRfis = projectRfis.filter((r) => isOverdue(r.due_date || r.date_required, r.status, CLOSED_RFI));
  const criticalRfis = openRfis.filter((r) => ["Critical", "High"].includes(r.priority));
  const lateDeliveries = projectDeliveries.filter((d) => {
    const scheduled = dateValue(d.scheduled_date || d.delivery_date);
    return scheduled && scheduled < new Date() && !String(d.status || "").toLowerCase().includes("delivered");
  });
  const upcomingDeliveries = projectDeliveries.filter((d) => {
    const days = daysUntil(d.scheduled_date || d.delivery_date);
    return days != null && days >= 0 && days <= 14 && !String(d.status || "").toLowerCase().includes("delivered");
  });
  const overdueActions = projectActions.filter((a) => !statusIn(a.status, CLOSED_ACTION) && isOverdue(a.due_date, a.status, CLOSED_ACTION));
  const delayedTasks = projectTasks.filter((t) => String(t.status || "").toLowerCase().includes("delay"));

  const totalTons = projectWps.reduce((sum, w) => sum + n(w.tonnage), 0);
  const completedTons = projectWps.reduce((sum, w) => sum + (String(w.status || "").toLowerCase().includes("complete") ? n(w.tonnage) : 0), 0);
  const avgProgress = projectWps.length
    ? projectWps.reduce((sum, w) => sum + n(w.percent_complete), 0) / projectWps.length
    : 0;

  let score = 100;
  const reasons = [];
  if (overdueRfis.length) { score -= Math.min(28, overdueRfis.length * 9); reasons.push(`${overdueRfis.length} overdue RFI${overdueRfis.length === 1 ? "" : "s"}`); }
  if (criticalRfis.length) { score -= Math.min(16, criticalRfis.length * 5); reasons.push(`${criticalRfis.length} high-priority RFI${criticalRfis.length === 1 ? "" : "s"}`); }
  if (lateDeliveries.length) { score -= Math.min(24, lateDeliveries.length * 8); reasons.push(`${lateDeliveries.length} late deliver${lateDeliveries.length === 1 ? "y" : "ies"}`); }
  if (overdueActions.length) { score -= Math.min(14, overdueActions.length * 4); reasons.push(`${overdueActions.length} overdue action${overdueActions.length === 1 ? "" : "s"}`); }
  if (delayedTasks.length) { score -= Math.min(18, delayedTasks.length * 6); reasons.push(`${delayedTasks.length} delayed task${delayedTasks.length === 1 ? "" : "s"}`); }
  if (budget > 0 && committed > budget) { score -= Math.min(22, Math.ceil(((committed - budget) / budget) * 100)); reasons.push("Cost exposure over budget"); }
  if (budget === 0 && contract > 0) { score -= 8; reasons.push("Budget not fully set up"); }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const health = score >= 76 ? "On Track" : score >= 52 ? "Watch" : "At Risk";
  const targetDays = daysUntil(project.target_completion_date || project.forecast_completion_date);
  const forecastDays = project.forecast_completion_date && project.target_completion_date
    ? Math.round((dateValue(project.forecast_completion_date) - dateValue(project.target_completion_date)) / 86400000)
    : null;

  return {
    ...project,
    contract,
    revisedContract: contract + approvedCo,
    approvedCo,
    pendingCo,
    budget,
    actual,
    committed,
    margin: contract + approvedCo - committed,
    openRfis: openRfis.length,
    overdueRfis: overdueRfis.length,
    criticalRfis: criticalRfis.length,
    lateDeliveries: lateDeliveries.length,
    upcomingDeliveries: upcomingDeliveries.length,
    overdueActions: overdueActions.length,
    delayedTasks: delayedTasks.length,
    totalTons,
    completedTons,
    avgProgress,
    score,
    health,
    reasons,
    targetDays,
    forecastDays,
    projectRfis,
    projectCos,
    projectCodes,
    projectWps,
    projectDeliveries,
    projectActions,
    projectTasks,
  };
}

export default function PortfolioOverview() {
  const navigate = useNavigate();
  const projectId = useProjectId();
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [healthFilter, setHealthFilter] = useState("All");
  const [search, setSearch] = useState("");

  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => entities.Project.listAll(), staleTime: 5 * 60 * 1000 });
  const { data: rfis = [] } = useQuery({ queryKey: ["portfolio-rfis"], queryFn: () => entities.RFI.listAll(), staleTime: 30 * 1000 });
  const { data: cos = [] } = useQuery({ queryKey: ["portfolio-cos"], queryFn: () => entities.ChangeOrder.listAll(), staleTime: 60 * 1000 });
  const { data: codes = [] } = useQuery({ queryKey: ["portfolio-codes"], queryFn: () => entities.CostCode.listAll(), staleTime: 60 * 1000 });
  const { data: wps = [] } = useQuery({ queryKey: ["portfolio-wps"], queryFn: () => entities.WorkPackage.listAll(), staleTime: 30 * 1000 });
  const { data: deliveries = [] } = useQuery({ queryKey: ["portfolio-deliveries"], queryFn: () => entities.Delivery.listAll(), staleTime: 30 * 1000 });
  const { data: actionItems = [] } = useQuery({ queryKey: ["portfolio-action-items"], queryFn: () => entities.ActionItem.listAll(), staleTime: 30 * 1000 });
  const { data: scheduleTasks = [] } = useQuery({ queryKey: ["portfolio-schedule-tasks"], queryFn: () => entities.ScheduleTask.listAll("-start_date"), staleTime: 60 * 1000 });

  useEffect(() => {
    if (selectedProjectId || !projectId || projects.length === 0) return;
    if (projects.some((project) => project.id === projectId)) {
      setSelectedProjectId(projectId);
    }
  }, [projectId, projects, selectedProjectId]);

  const portfolio = useMemo(() => {
    const data = { rfis, cos, codes, wps, deliveries, actionItems, scheduleTasks };
    const rows = projects.map((project) => computeProjectModel(project, data));
    const sorted = [...rows].sort((a, b) => a.score - b.score || b.revisedContract - a.revisedContract);
    const selected = rows.find((p) => p.id === selectedProjectId) || sorted[0] || null;

    const totals = rows.reduce((acc, p) => {
      acc.value += p.revisedContract;
      acc.budget += p.budget;
      acc.committed += p.committed;
      acc.margin += p.margin;
      acc.openRfis += p.openRfis;
      acc.overdueRfis += p.overdueRfis;
      acc.lateDeliveries += p.lateDeliveries;
      acc.overdueActions += p.overdueActions;
      acc.tons += p.totalTons;
      acc.completedTons += p.completedTons;
      return acc;
    }, { value: 0, budget: 0, committed: 0, margin: 0, openRfis: 0, overdueRfis: 0, lateDeliveries: 0, overdueActions: 0, tons: 0, completedTons: 0 });

    const healthData = ["On Track", "Watch", "At Risk"].map((name) => ({
      name,
      value: rows.filter((p) => p.health === name).length,
      color: statusColor(name),
    }));

    const phaseMap = new Map();
    rows.forEach((p) => {
      const phase = p.phase || "Unassigned";
      phaseMap.set(phase, (phaseMap.get(phase) || 0) + 1);
    });

    const riskTrend = Array.from({ length: 8 }, (_, index) => {
      const week = index + 1;
      const riskLoad = rows.reduce((sum, p) => {
        const weight = p.overdueRfis * 2 + p.lateDeliveries * 2 + p.overdueActions + p.delayedTasks * 2;
        return sum + Math.max(0, weight - index);
      }, 0);
      return { week: `W${week}`, risk: riskLoad, production: Math.round((totals.completedTons / Math.max(totals.tons, 1)) * 100) + week * 2 };
    });

    return {
      rows,
      sorted,
      selected,
      totals,
      healthData,
      phaseData: Array.from(phaseMap.entries()).map(([name, value], index) => ({
        name,
        value,
        color: ["#3b82f6", "#f59e0b", "#22c55e", "#a855f7", "#ef4444", "#14b8a6"][index % 6],
      })),
      budgetData: rows.slice(0, 8).map((p) => ({
        name: p.project_number || String(p.name || "").slice(0, 10),
        budget: p.budget,
        committed: p.committed,
        value: p.revisedContract,
      })),
      riskTrend,
      radarData: selected ? [
        { metric: "Cost", value: selected.budget > 0 ? Math.max(0, Math.min(100, 100 - ((selected.committed - selected.budget) / selected.budget) * 100)) : 70 },
        { metric: "RFI", value: Math.max(0, 100 - selected.overdueRfis * 18 - selected.criticalRfis * 8) },
        { metric: "Delivery", value: Math.max(0, 100 - selected.lateDeliveries * 22) },
        { metric: "Actions", value: Math.max(0, 100 - selected.overdueActions * 12) },
        { metric: "Production", value: Math.max(0, Math.min(100, selected.avgProgress || 0)) },
      ] : [],
    };
  }, [projects, rfis, cos, codes, wps, deliveries, actionItems, scheduleTasks, selectedProjectId]);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return portfolio.sorted.filter((p) => {
      const matchesHealth = healthFilter === "All" || p.health === healthFilter;
      const matchesSearch = !q || `${p.name || ""} ${p.project_number || ""}`.toLowerCase().includes(q);
      return matchesHealth && matchesSearch;
    });
  }, [portfolio.sorted, healthFilter, search]);

  const selected = portfolio.selected;

  const selectProject = (id) => setSelectedProjectId(id);
  const openPlanningPage = (page) => {
    if (!page) return;
    const projectQuery = selected?.id ? `?project=${encodeURIComponent(selected.id)}` : "";
    navigate(`${createPageUrl(page)}${projectQuery}`);
  };
  const openSelectedProject = () => {
    if (!selected) return;
    navigate(`${createPageUrl("Dashboard")}?project=${selected.id}`);
  };

  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 24 }}>
      <CommandBar
        eyebrow="Portfolio Command"
        title="Portfolio Overview"
        count={portfolio.rows.length}
        unit=" active projects"
        subtitle="Executive health, cost exposure, schedule pressure, steel progress, and model-based project inspection"
      >
        <Button variant="secondary" icon="building" onClick={() => navigate(createPageUrl("Projects"))}>
          Projects
        </Button>
        <Button variant="secondary" icon="arrow-up-right" onClick={() => navigate(createPageUrl("Reports"))}>
          Reports
        </Button>
      </CommandBar>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <MetricCard icon={DollarSign} label="Portfolio value" value={formatCurrencyShort(portfolio.totals.value)} sub={`${formatCurrencyShort(portfolio.totals.committed)} committed`} color={RISK_COLORS.accent} />
        <MetricCard icon={ShieldCheck} label="Margin outlook" value={formatCurrencyShort(portfolio.totals.margin)} sub={`${formatCurrencyShort(portfolio.totals.budget)} budget`} color={portfolio.totals.margin < 0 ? RISK_COLORS.risk : RISK_COLORS.healthy} />
        <MetricCard icon={AlertTriangle} label="Overdue RFIs" value={portfolio.totals.overdueRfis} sub={`${portfolio.totals.openRfis} open across portfolio`} color={portfolio.totals.overdueRfis ? RISK_COLORS.risk : RISK_COLORS.healthy} />
        <MetricCard icon={Truck} label="Late deliveries" value={portfolio.totals.lateDeliveries} sub={`${portfolio.totals.overdueActions} overdue actions`} color={portfolio.totals.lateDeliveries ? RISK_COLORS.risk : RISK_COLORS.healthy} />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(360px, 0.9fr) minmax(0, 1.1fr)", gap: 16, minWidth: 0 }}>
        <div style={cardStyle}>
          <PanelHeader title="Project Stack Rank" meta="Click a project to drive the model and detail panes" />
          <div style={{ padding: 14, display: "flex", gap: 8, borderBottom: "1px solid var(--border-default)", flexWrap: "wrap" }}>
            <div style={searchWrapStyle}>
              <Search size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search project or job number"
                style={searchInputStyle}
              />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["All", "On Track", "Watch", "At Risk"].map((label) => (
                <Button
                  key={label}
                  onClick={() => setHealthFilter(label)}
                  variant={healthFilter === label ? "primary" : "secondary"}
                  size="sm"
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div style={{ maxHeight: 560, overflow: "auto" }}>
            {filteredProjects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                active={selected?.id === project.id}
                onClick={() => selectProject(project.id)}
              />
            ))}
            {filteredProjects.length === 0 && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
                No projects match the current filter.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateRows: "minmax(240px, 0.9fr) minmax(220px, 0.8fr)", gap: 16, minWidth: 0 }}>
          <div style={cardStyle}>
            <PanelHeader title="Financial Exposure" meta="Budget, committed cost, revised contract" />
            <div style={chartFrameStyle(220)}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
                <BarChart data={portfolio.budgetData} margin={{ top: 10, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={formatCurrencyShort} />
                  <Tooltip {...tooltipStyle} formatter={(value) => formatCurrency(value, 0)} />
                  <Bar dataKey="value" name="Contract" fill="#334155" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="budget" name="Budget" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="committed" name="Committed" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, minWidth: 0 }}>
            <div style={cardStyle}>
              <PanelHeader title="Health Mix" meta="Portfolio status" compact />
              <div style={chartFrameStyle(170)}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={120}>
                  <PieChart>
                    <Pie data={portfolio.healthData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={4}>
                      {portfolio.healthData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={cardStyle}>
              <PanelHeader title="Risk Pulse" meta="8 week pressure" compact />
              <div style={chartFrameStyle(170)}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={120}>
                  <AreaChart data={portfolio.riskTrend} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="riskGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="week" tick={{ fill: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltipStyle} />
                    <Area type="monotone" dataKey="risk" stroke="#ef4444" fill="url(#riskGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PlanningStudio
        portfolio={portfolio}
        selected={selected}
        onNavigatePage={openPlanningPage}
      />

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <ProjectDetailCard project={selected} onOpenProject={openSelectedProject} />
        <div style={cardStyle}>
          <PanelHeader title="Selected Project Risk Shape" meta={selected?.name || "No project"} />
          <div style={chartFrameStyle(230)}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
              <RadarChart data={portfolio.radarData}>
                <PolarGrid stroke="var(--border-default)" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }} />
                <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.28} />
                <Tooltip {...tooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={cardStyle}>
          <PanelHeader title="Phase Mix" meta="Project count by current phase" />
          <div style={{ padding: "0 16px 16px", display: "grid", gap: 10 }}>
            {portfolio.phaseData.map((item) => (
              <div key={item.name}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={miniLabelStyle}>{item.name}</span>
                  <span style={{ ...miniLabelStyle, color: item.color }}>{item.value}</span>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: "var(--bg-surface-high)", overflow: "hidden" }}>
                  <div style={{ width: `${(item.value / Math.max(projects.length, 1)) * 100}%`, height: "100%", background: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div style={{ ...cardStyle, padding: 18, minHeight: 120, display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative" }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, color-mix(in srgb, ${color} 10%, transparent) 0%, transparent 44%, transparent 100%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={miniLabelStyle}>{label}</span>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>{sub}</div>
      </div>
    </div>
  );
}

function PanelHeader({ title, meta, compact }) {
  return (
    <div style={{ padding: compact ? "12px 14px 4px" : "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-primary)" }}>
        {title}
      </div>
      {meta && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "right" }}>{meta}</div>}
    </div>
  );
}

function ProjectRow({ project, active, onClick }) {
  const color = statusColor(project.health);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        border: 0,
        borderBottom: "1px solid var(--border-default)",
        borderLeft: `4px solid ${active ? color : "transparent"}`,
        background: active ? "var(--accent-muted)" : "transparent",
        color: "inherit",
        padding: "12px 14px",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 12,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 10px ${color}` }} />
          <span style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 800, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {project.name || "Untitled project"}
          </span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>
          {project.project_number || "-"} / {project.phase || "No phase"} / {project.totalTons.toFixed(1)}T
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <TinyChip icon={AlertTriangle} label={`${project.overdueRfis} RFIs`} tone={project.overdueRfis ? RISK_COLORS.risk : RISK_COLORS.steel} />
          <TinyChip icon={Truck} label={`${project.lateDeliveries} late`} tone={project.lateDeliveries ? RISK_COLORS.risk : RISK_COLORS.steel} />
          <TinyChip icon={Layers3} label={`${Math.round(project.avgProgress)}%`} tone={RISK_COLORS.accent} />
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 900, lineHeight: 1, color }}>{project.score}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, color, marginTop: 4, textTransform: "uppercase" }}>{project.health}</div>
      </div>
    </button>
  );
}

function TinyChip({ icon: Icon, label, tone }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 22, padding: "0 7px", borderRadius: 5, background: "var(--bg-surface-high)", color: tone, fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800 }}>
      <Icon size={11} /> {label}
    </span>
  );
}

function ProjectDetailCard({ project, onOpenProject }) {
  if (!project) {
    return (
      <div style={{ ...cardStyle, padding: 18 }}>
        <PanelHeader title="Project Detail" meta="No project selected" />
      </div>
    );
  }
  return (
    <div style={cardStyle}>
      <PanelHeader title="Project Detail" meta={project.project_number || "No job number"} />
      <div style={{ padding: "0 16px 16px", display: "grid", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 900, color: "var(--text-primary)" }}>{project.name}</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 5 }}>
            {project.reasons.length ? project.reasons.join(" / ") : "No major risk signals detected."}
          </div>
        </div>
        <DetailGrid items={[
          ["Health", `${project.score} / ${project.health}`],
          ["Contract", formatCurrency(project.revisedContract, 0)],
          ["Committed", formatCurrency(project.committed, 0)],
          ["Margin", formatCurrency(project.margin, 0)],
          ["Target", project.target_completion_date ? formatDate(project.target_completion_date) : "-"],
          ["Forecast slip", project.forecastDays == null ? "-" : `${project.forecastDays > 0 ? "+" : ""}${project.forecastDays}d`],
          ["Steel", `${project.completedTons.toFixed(1)}T / ${project.totalTons.toFixed(1)}T`],
          ["Upcoming deliveries", project.upcomingDeliveries],
        ]} />
        <Button variant="outline" icon="arrow-up-right" onClick={onOpenProject}>
          Open Project Dashboard
        </Button>
      </div>
    </div>
  );
}

function DetailGrid({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {items.map(([label, value]) => (
        <div key={label} style={{ padding: 10, border: "1px solid var(--border-default)", borderRadius: 7, background: "var(--bg-surface-low)" }}>
          <div style={miniLabelStyle}>{label}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

const miniLabelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const searchWrapStyle = {
  flex: "1 1 230px",
  minWidth: 220,
  height: 34,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 10px",
  border: "1px solid var(--border-default)",
  borderRadius: 7,
  background: "var(--bg-surface-low)",
  color: "var(--text-muted)",
};

const searchInputStyle = {
  width: "100%",
  border: 0,
  outline: 0,
  background: "transparent",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
};

