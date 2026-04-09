import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatCurrency, formatDate, isOverdue } from "../components/shared/formatters";
import StatusBadge from "../components/shared/StatusBadge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from "recharts";

const M = {
  card: "var(--bg-surface)", border: "var(--border-default)", text: "var(--text-primary)",
  muted: "var(--text-muted)", mono: "var(--font-mono)",
  body: "var(--font-body)", display: "var(--font-body)"
};

const PHASE_COLORS = { Detailing: "var(--accent)", Fabrication: "var(--status-warning)", Erection: "var(--status-success)", Closeout: "var(--chart-4)" };
const HEALTH_COLORS = { "On Track": "var(--status-success)", "Watch": "var(--status-warning)", "At Risk": "var(--status-error)" };
const PIE_COLORS = ["var(--status-success)", "var(--status-warning)", "var(--status-error)", "var(--chart-4)", "var(--accent)"];

function KPICard({ label, value, sub, color, urgent }) {
  const c = color || "var(--accent)";
  return (
    <div style={{
      background: urgent ? "var(--danger-muted)" : M.card,
      border: `1px solid ${urgent ? "var(--danger-border)" : M.border}`,
      borderTop: `2px solid ${c}`,
      borderRadius: 12,
      padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 4
    }}>
      <div style={{ fontFamily: M.mono, fontSize: 7, letterSpacing: "0.14em", color: M.muted, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: M.display, fontSize: 28, fontWeight: 800, color: c, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: M.mono, fontSize: 9, color: M.muted }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ title, sub }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: M.display, fontSize: 13, fontWeight: 700, color: M.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
      {sub && <div style={{ fontFamily: M.mono, fontSize: 8, color: M.muted, letterSpacing: "0.10em", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function PortfolioOverview() {
  const navigate = useNavigate();

  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => base44.entities.Project.list(), initialData: [] });
  const { data: allRFIs = [] } = useQuery({ queryKey: ["rfis"], queryFn: () => base44.entities.RFI.list(), initialData: [] });
  const { data: allCOs = [] } = useQuery({ queryKey: ["all-cos-portfolio"], queryFn: () => base44.entities.ChangeOrder.list(), initialData: [] });
  const { data: allWPs = [] } = useQuery({ queryKey: ["all-wps-portfolio"], queryFn: () => base44.entities.WorkPackage.list(), initialData: [] });
  const { data: allCodes = [] } = useQuery({ queryKey: ["all-codes-portfolio"], queryFn: () => base44.entities.CostCode.list(), initialData: [] });
  const { data: allLogs = [] } = useQuery({ queryKey: ["all-logs-portfolio"], queryFn: () => base44.entities.DailyLog.list(), initialData: [] });
  const { data: allDeliveries = [] } = useQuery({ queryKey: ["all-deliveries-portfolio"], queryFn: () => base44.entities.Delivery.list(), initialData: [] });
  const { data: allActionItems = [] } = useQuery({ queryKey: ["all-action-items-portfolio"], queryFn: () => base44.entities.ActionItem.list(), initialData: [] });

  const stats = useMemo(() => {
    const today = new Date();

    const totalContractValue = projects.reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0);
    const approvedCOsValue = allCOs.filter(c => c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const revisedTotal = totalContractValue + approvedCOsValue;

    const openRFIs = allRFIs.filter(r => !["Answered", "Closed"].includes(r.status));
    const overdueRFIs = allRFIs.filter(r => isOverdue(r.due_date, r.status, ["Answered", "Closed"]));
    const criticalRFIs = allRFIs.filter(r => r.priority === "Critical" && !["Answered", "Closed"].includes(r.status));

    const pendingCOs = allCOs.filter(c => ["Submitted", "Under Review"].includes(c.status));
    const pendingCOValue = pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);

    const totalBudget = allCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
    const totalActual = allCodes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
    const overBudgetCodes = allCodes.filter(c => {
      const b = Number(c.budget_amount) || 0;
      const a = Number(c.actual_cost) || 0;
      return b > 0 && a > b;
    });

    const safetyIncidents = allLogs.reduce((s, l) => s + (Number(l.safety_incidents) || 0), 0);

    const lateDeliveries = allDeliveries.filter(d =>
      d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered"
    );
    const upcomingDeliveries = allDeliveries.filter(d => {
      if (!d.scheduled_date || d.status === "Delivered") return false;
      const dt = new Date(d.scheduled_date);
      const next7 = new Date(today.getTime() + 7 * 86400000);
      return dt >= today && dt <= next7;
    });

    const overdueActions = allActionItems.filter(a =>
      !["Complete", "Cancelled"].includes(a.status) && a.due_date && new Date(a.due_date) < today
    );

    const wpComplete = allWPs.filter(w => w.status === "Complete").length;
    const wpInProgress = allWPs.filter(w => w.status === "In Progress").length;
    const totalTonnage = allWPs.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);

    // By-project health breakdown
    const byProject = projects.map(p => {
      const pRFIs = allRFIs.filter(r => r.project_id === p.id);
      const pCOs = allCOs.filter(c => c.project_id === p.id);
      const pCodes = allCodes.filter(c => c.project_id === p.id);
      const pBudget = pCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
      const pActual = pCodes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
      const pApproved = pCOs.filter(c => c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
      const pOpen = pRFIs.filter(r => !["Answered", "Closed"].includes(r.status)).length;
      const pOverdue = pRFIs.filter(r => isOverdue(r.due_date, r.status, ["Answered", "Closed"])).length;
      const scheduleDiff = p.forecast_completion_date && p.target_completion_date
        ? Math.round((new Date(p.forecast_completion_date) - new Date(p.target_completion_date)) / 86400000)
        : null;
      return { ...p, pBudget, pActual, pOpen, pOverdue, scheduleDiff, pApproved };
    });

    // Phase distribution
    const phaseCount = {};
    projects.forEach(p => { phaseCount[p.phase || "Unknown"] = (phaseCount[p.phase || "Unknown"] || 0) + 1; });

    // Health distribution
    const healthCount = {};
    projects.forEach(p => { healthCount[p.health_status || "Unknown"] = (healthCount[p.health_status || "Unknown"] || 0) + 1; });

    // Budget by project (for chart)
    const budgetChart = byProject.slice(0, 8).map(p => ({
      name: (p.name || "").slice(0, 12) + (p.name?.length > 12 ? "…" : ""),
      budget: p.pBudget,
      actual: p.pActual,
    }));

    // RFI age buckets
    const rfiAgeBuckets = { "0-7d": 0, "8-14d": 0, "15-30d": 0, "30+d": 0 };
    openRFIs.forEach(r => {
      if (!r.submitted_date) return;
      const age = Math.floor((today - new Date(r.submitted_date)) / 86400000);
      if (age <= 7) rfiAgeBuckets["0-7d"]++;
      else if (age <= 14) rfiAgeBuckets["8-14d"]++;
      else if (age <= 30) rfiAgeBuckets["15-30d"]++;
      else rfiAgeBuckets["30+d"]++;
    });

    return {
      totalContractValue, revisedTotal, approvedCOsValue,
      openRFIs: openRFIs.length, overdueRFIs: overdueRFIs.length, criticalRFIs: criticalRFIs.length,
      pendingCOs: pendingCOs.length, pendingCOValue,
      totalBudget, totalActual, overBudgetCodes: overBudgetCodes.length,
      safetyIncidents, lateDeliveries: lateDeliveries.length,
      upcomingDeliveries: upcomingDeliveries.length,
      overdueActions: overdueActions.length,
      wpComplete, wpInProgress, totalTonnage,
      byProject, phaseChartData: Object.entries(phaseCount).map(([name, value]) => ({ name, value })),
      healthChartData: Object.entries(healthCount).map(([name, value]) => ({ name, value })),
      budgetChart,
      rfiAgeData: Object.entries(rfiAgeBuckets).map(([name, value]) => ({ name, value })),
      lateDeliveryItems: allDeliveries.filter(d => d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered").slice(0, 5),
      overdueRFIItems: allRFIs.filter(r => isOverdue(r.due_date, r.status, ["Answered", "Closed"])).slice(0, 5),
      criticalActionItems: allActionItems.filter(a => a.priority === "Critical" && !["Complete", "Cancelled"].includes(a.status)).slice(0, 5),
    };
  }, [projects, allRFIs, allCOs, allWPs, allCodes, allLogs, allDeliveries, allActionItems]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontFamily: M.display, fontSize: 24, fontWeight: 800, color: M.text, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>Portfolio Overview</h1>
          <p style={{ fontFamily: M.mono, fontSize: 9, color: M.muted, marginTop: 4, letterSpacing: "0.12em" }}>CROSS-PROJECT PERFORMANCE — ALL {projects.length} ACTIVE PROJECTS · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { label: "On Track", color: HEALTH_COLORS["On Track"], count: stats.healthChartData.find(h => h.name === "On Track")?.value || 0 },
              { label: "Watch", color: HEALTH_COLORS["Watch"], count: stats.healthChartData.find(h => h.name === "Watch")?.value || 0 },
              { label: "At Risk", color: HEALTH_COLORS["At Risk"], count: stats.healthChartData.find(h => h.name === "At Risk")?.value || 0 },
            ].map(({ label, color, count }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 4, background: `${color}15`, border: `1px solid ${color}30`, borderRadius: 8, padding: "4px 10px" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                <span style={{ fontFamily: M.mono, fontSize: 8, color, letterSpacing: "0.08em" }}>{count} {label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <KPICard label="Portfolio Value" value={`$${(stats.revisedTotal / 1000000).toFixed(1)}M`} color="var(--accent)" sub={`${projects.length} projects`} />
        <KPICard label="Open RFIs" value={stats.openRFIs} color={stats.overdueRFIs > 0 ? "var(--status-error)" : "var(--status-warning)"} sub={`${stats.overdueRFIs} overdue`} urgent={stats.overdueRFIs > 0} />
        <KPICard label="Critical RFIs" value={stats.criticalRFIs} color={stats.criticalRFIs > 0 ? "var(--status-error)" : "var(--status-success)"} sub="Awaiting response" urgent={stats.criticalRFIs > 0} />
        <KPICard label="Pending COs" value={stats.pendingCOs} color="var(--status-warning)" sub={formatCurrency(stats.pendingCOValue)} />
        <KPICard label="Over Budget" value={stats.overBudgetCodes} color={stats.overBudgetCodes > 0 ? "var(--status-error)" : "var(--status-success)"} sub="Cost codes" urgent={stats.overBudgetCodes > 0} />
        <KPICard label="Late Deliveries" value={stats.lateDeliveries} color={stats.lateDeliveries > 0 ? "var(--status-error)" : "var(--status-success)"} sub={`${stats.upcomingDeliveries} upcoming`} urgent={stats.lateDeliveries > 0} />
        <KPICard label="Overdue Actions" value={stats.overdueActions} color={stats.overdueActions > 0 ? "var(--status-error)" : "var(--status-success)"} sub="Action items" urgent={stats.overdueActions > 0} />
        <KPICard label="Safety Incidents" value={stats.safetyIncidents} color={stats.safetyIncidents > 0 ? "var(--status-error)" : "var(--status-success)"} sub="All projects" urgent={stats.safetyIncidents > 0} />
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14 }}>
        {/* Budget vs Actual by Project */}
        <div style={{ background: M.card, border: `1px solid ${M.border}`, borderRadius: 12, padding: "16px 20px" }}>
          <SectionTitle title="Budget vs Actual by Project" sub="COST CODE TOTALS PER PROJECT" />
          {stats.budgetChart.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: M.muted, fontFamily: M.mono, fontSize: 10 }}>No cost data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.budgetChart} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                <XAxis dataKey="name" tick={{ fill: M.muted, fontFamily: M.mono, fontSize: 8 }} axisLine={false} />
                <YAxis tick={{ fill: M.muted, fontFamily: M.mono, fontSize: 8 }} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--accent-border)", borderRadius: 8, fontFamily: M.mono, fontSize: 10, color: M.text }} formatter={v => formatCurrency(v)} />
                <Bar dataKey="budget" name="Budget" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="actual" name="Actual" fill="var(--status-warning)" radius={[3, 3, 0, 0]} />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontFamily: M.mono, fontSize: 9 }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Phase Distribution */}
        <div style={{ background: M.card, border: `1px solid ${M.border}`, borderRadius: 12, padding: "16px 20px" }}>
          <SectionTitle title="Projects by Phase" />
          {stats.phaseChartData.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: M.muted, fontFamily: M.mono, fontSize: 10 }}>No data</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={stats.phaseChartData} cx="50%" cy="50%" outerRadius={52} dataKey="value" nameKey="name">
                    {stats.phaseChartData.map((entry, i) => <Cell key={i} fill={PHASE_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--bg-surface-low)", border: "1px solid var(--accent-border)", borderRadius: 8, fontFamily: M.mono, fontSize: 10, color: M.text }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
                {stats.phaseChartData.map((entry, i) => (
                  <div key={entry.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: PHASE_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span style={{ fontFamily: M.mono, fontSize: 9, color: M.muted }}>{entry.name}</span>
                    </div>
                    <span style={{ fontFamily: M.display, fontSize: 14, fontWeight: 700, color: PHASE_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length] }}>{entry.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* RFI Age */}
        <div style={{ background: M.card, border: `1px solid ${M.border}`, borderRadius: 12, padding: "16px 20px" }}>
          <SectionTitle title="Open RFI Age" sub="DAYS SINCE SUBMITTED" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {stats.rfiAgeData.map(({ name, value }) => {
              const color = name === "30+d" ? "var(--status-error)" : name === "15-30d" ? "var(--status-error)" : name === "8-14d" ? "var(--status-warning)" : "var(--status-success)";
              const maxVal = Math.max(...stats.rfiAgeData.map(d => d.value), 1);
              return (
                <div key={name}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: M.mono, fontSize: 9, color: M.muted }}>{name}</span>
                    <span style={{ fontFamily: M.display, fontSize: 14, fontWeight: 700, color }}>{value}</span>
                  </div>
                  <div style={{ height: 5, background: "var(--border-default)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${(value / maxVal) * 100}%`, height: "100%", borderRadius: 3, background: color, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Project Status Table */}
      <div style={{ background: M.card, border: `1px solid ${M.border}`, borderRadius: 12, padding: "16px 20px" }}>
        <SectionTitle title="Project Status Matrix" sub="ALL PROJECTS — CLICK ROW TO VIEW JOB STATUS REPORT" />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                {["Project", "Phase", "Health", "Contract Value", "Budget", "Actual", "Var", "Open RFIs", "Overdue", "Schedule", "Pending COs"].map(h => (
                  <th key={h} style={{ fontFamily: M.mono, fontSize: 7, color: M.muted, letterSpacing: "0.10em", textTransform: "uppercase", padding: "6px 10px", textAlign: h === "Project" || h === "Phase" || h === "Health" ? "left" : "right", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.byProject.map(p => {
                const pPendingCOs = allCOs.filter(c => c.project_id === p.id && ["Submitted", "Under Review"].includes(c.status));
                const variance = p.pActual - p.pBudget;
                return (
                  <tr
                    key={p.id}
                    onClick={() => navigate(createPageUrl("JobStatusReport"))}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--hover-bg)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "9px 10px", minWidth: 160 }}>
                      <div style={{ fontFamily: M.body, fontSize: 12, color: M.text, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontFamily: M.mono, fontSize: 9, color: M.muted }}>#{p.project_number}</div>
                    </td>
                    <td style={{ padding: "9px 10px" }}>
                      <span style={{ fontFamily: M.mono, fontSize: 8, color: PHASE_COLORS[p.phase] || M.muted, background: `${PHASE_COLORS[p.phase] || "#666"}20`, borderRadius: 4, padding: "2px 6px", border: `1px solid ${PHASE_COLORS[p.phase] || "#666"}30` }}>{p.phase || "—"}</span>
                    </td>
                    <td style={{ padding: "9px 10px" }}><StatusBadge status={p.health_status} /></td>
                    <td style={{ fontFamily: M.mono, fontSize: 10, color: M.text, padding: "9px 10px", textAlign: "right" }}>{formatCurrency(p.original_contract_value)}</td>
                    <td style={{ fontFamily: M.mono, fontSize: 10, color: M.text, padding: "9px 10px", textAlign: "right" }}>{formatCurrency(p.pBudget)}</td>
                    <td style={{ fontFamily: M.mono, fontSize: 10, color: M.text, padding: "9px 10px", textAlign: "right" }}>{formatCurrency(p.pActual)}</td>
                    <td style={{ fontFamily: M.mono, fontSize: 10, color: variance > 0 ? "var(--status-error)" : variance < 0 ? "var(--status-success)" : M.muted, padding: "9px 10px", textAlign: "right", fontWeight: variance !== 0 ? 700 : 400 }}>
                      {variance === 0 ? "—" : `${variance > 0 ? "+" : ""}${formatCurrency(variance)}`}
                    </td>
                    <td style={{ fontFamily: M.mono, fontSize: 11, color: p.pOpen > 0 ? "var(--status-warning)" : M.muted, padding: "9px 10px", textAlign: "right", fontWeight: p.pOpen > 0 ? 700 : 400 }}>{p.pOpen}</td>
                    <td style={{ fontFamily: M.mono, fontSize: 11, color: p.pOverdue > 0 ? "var(--status-error)" : M.muted, padding: "9px 10px", textAlign: "right", fontWeight: p.pOverdue > 0 ? 700 : 400 }}>{p.pOverdue}</td>
                    <td style={{ fontFamily: M.mono, fontSize: 10, padding: "9px 10px", textAlign: "right", color: p.scheduleDiff == null ? M.muted : p.scheduleDiff > 0 ? "var(--status-error)" : "var(--status-success)", fontWeight: 700 }}>
                      {p.scheduleDiff == null ? "—" : p.scheduleDiff === 0 ? "On Time" : `${p.scheduleDiff > 0 ? "+" : ""}${p.scheduleDiff}d`}
                    </td>
                    <td style={{ fontFamily: M.mono, fontSize: 11, color: pPendingCOs.length > 0 ? "var(--status-warning)" : M.muted, padding: "9px 10px", textAlign: "right", fontWeight: pPendingCOs.length > 0 ? 700 : 400 }}>{pPendingCOs.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Flags Row: Late Deliveries / Overdue RFIs / Critical Action Items */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {/* Late Deliveries */}
        <div style={{ background: M.card, border: `1px solid ${stats.lateDeliveryItems.length > 0 ? "rgba(255,61,61,0.25)" : M.border}`, borderRadius: 12, padding: "16px 20px" }}>
          <SectionTitle title={`Late Deliveries (${stats.lateDeliveries})`} sub="PAST SCHEDULED DATE · NOT DELIVERED" />
          {stats.lateDeliveryItems.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontFamily: M.mono, fontSize: 10, color: "var(--status-success)" }}>✓ No late deliveries</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stats.lateDeliveryItems.map(d => {
                const daysLate = Math.floor((new Date() - new Date(d.scheduled_date)) / 86400000);
                const proj = projects.find(p => p.id === d.project_id);
                return (
                  <div key={d.id} style={{ padding: "8px 10px", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 8 }}>
                    <div style={{ fontFamily: M.body, fontSize: 11, color: M.text, fontWeight: 600 }}>{d.delivery_title || d.vendor || "Delivery"}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontFamily: M.mono, fontSize: 8, color: M.muted }}>{proj?.name || "—"}</span>
                      <span style={{ fontFamily: M.mono, fontSize: 8, color: "var(--status-error)", fontWeight: 700 }}>{daysLate}d late</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Overdue RFIs */}
        <div style={{ background: M.card, border: `1px solid ${stats.overdueRFIItems.length > 0 ? "rgba(255,179,0,0.25)" : M.border}`, borderRadius: 12, padding: "16px 20px" }}>
          <SectionTitle title={`Overdue RFIs (${stats.overdueRFIs})`} sub="PAST DUE DATE · NOT CLOSED" />
          {stats.overdueRFIItems.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontFamily: M.mono, fontSize: 10, color: "var(--status-success)" }}>✓ No overdue RFIs</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stats.overdueRFIItems.map(r => {
                const daysOverdue = Math.floor((new Date() - new Date(r.due_date)) / 86400000);
                const proj = projects.find(p => p.id === r.project_id);
                return (
                  <div key={r.id} style={{ padding: "8px 10px", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderRadius: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: M.mono, fontSize: 9, color: "var(--status-warning)" }}>RFI-{r.rfi_number}</span>
                      <span style={{ fontFamily: M.mono, fontSize: 8, color: "var(--status-error)", fontWeight: 700 }}>{daysOverdue}d overdue</span>
                    </div>
                    <div style={{ fontFamily: M.body, fontSize: 11, color: M.text, marginTop: 2 }}>{r.title}</div>
                    <div style={{ fontFamily: M.mono, fontSize: 8, color: M.muted, marginTop: 2 }}>{proj?.name || "—"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Critical Action Items */}
        <div style={{ background: M.card, border: `1px solid ${stats.criticalActionItems.length > 0 ? "var(--accent-border)" : M.border}`, borderRadius: 12, padding: "16px 20px" }}>
          <SectionTitle title="Critical Action Items" sub="OPEN · CRITICAL PRIORITY" />
          {stats.criticalActionItems.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontFamily: M.mono, fontSize: 10, color: "var(--status-success)" }}>✓ No critical action items</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stats.criticalActionItems.map(a => {
                const proj = projects.find(p => p.id === a.project_id);
                const overdue = a.due_date && new Date(a.due_date) < new Date();
                return (
                  <div key={a.id} style={{ padding: "8px 10px", background: "var(--info-muted)", border: "1px solid var(--info-border)", borderRadius: 8 }}>
                    <div style={{ fontFamily: M.body, fontSize: 11, color: M.text, fontWeight: 600 }}>{a.title}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontFamily: M.mono, fontSize: 8, color: M.muted }}>{a.assigned_to || proj?.name || "—"}</span>
                      {a.due_date && <span style={{ fontFamily: M.mono, fontSize: 8, color: overdue ? "var(--status-error)" : M.muted }}>{formatDate(a.due_date)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
