import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  X, TrendingUp, Users,
  Activity, DollarSign, Package, Loader2
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar
} from "recharts";
import { format, parseISO } from "date-fns";

// ── Helpers ────────────────────────────────────────────────────────
const fmt$ = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n) || 0);

const fmtShort$ = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return fmt$(v);
};

const fmtDate = (str) => {
  if (!str) return "—";
  try { return format(parseISO(str), "MMM d, yyyy"); } catch { return str; }
};

const HEALTH_CFG = {
  "On Track": { color: "var(--status-success)", bg: "var(--success-muted)", border: "var(--success-border)" },
  "Watch":    { color: "var(--status-warning)", bg: "var(--warning-muted)",  border: "var(--warning-border)" },
  "At Risk":  { color: "var(--status-error)",   bg: "var(--danger-muted)",   border: "var(--danger-border)" },
};

const STATUS_COLOR = {
  "Approved": "var(--status-success)", "Answered": "var(--status-success)", "Closed": "var(--status-success)", "Complete": "var(--status-success)", "Paid": "var(--status-success)",
  "Submitted": "var(--status-warning)", "Under Review": "var(--status-warning)", "Open": "var(--status-warning)", "In Progress": "var(--status-warning)",
  "Rejected": "var(--status-error)", "At Risk": "var(--status-error)", "Critical": "var(--status-error)",
};

function SectionHeader({ title, icon: Icon }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 0", marginBottom: 12,
      borderBottom: "1px solid var(--divider)",
    }}>
      {Icon && <Icon size={12} color="var(--accent-light)" />}
      <span style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {title}
      </span>
    </div>
  );
}

function KPITile({ label, value, sub, color }) {
  return (
    <div style={{
      background: "var(--bg-surface)", border: "none",
      borderRadius: "var(--radius-card)", padding: "12px 14px",
    }}>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600, color: color || "var(--text-primary)", lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const CustomTooltipBudget = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--bg-surface-high)", border: "none", borderRadius: "var(--radius-card)", padding: "8px 12px", fontSize: 11 }}>
      <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, fontFamily: "var(--font-body)", marginBottom: 2 }}>
          {p.name}: {fmtShort$(p.value)}
        </div>
      ))}
    </div>
  );
};

// ── Main Modal ─────────────────────────────────────────────────────
export default function ProjectDrilldownModal({ project, onClose }) {
  const pid = project?.id;

  const { data: wps = [], isLoading: wpsLoading } = useQuery({
    queryKey: ["modal-wps", pid],
    queryFn: () => base44.entities.WorkPackage.filter({ project_id: pid }),
    initialData: [],
    enabled: !!pid,
  });

  const { data: cos = [], isLoading: cosLoading } = useQuery({
    queryKey: ["modal-cos", pid],
    queryFn: () => base44.entities.ChangeOrder.filter({ project_id: pid }),
    initialData: [],
    enabled: !!pid,
  });

  const { data: rfis = [], isLoading: rfisLoading } = useQuery({
    queryKey: ["modal-rfis", pid],
    queryFn: () => base44.entities.RFI.filter({ project_id: pid }),
    initialData: [],
    enabled: !!pid,
  });

  const { data: codes = [], isLoading: codesLoading } = useQuery({
    queryKey: ["modal-codes", pid],
    queryFn: () => base44.entities.CostCode.filter({ project_id: pid }),
    initialData: [],
    enabled: !!pid,
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["modal-logs", pid],
    queryFn: () => base44.entities.DailyLog.filter({ project_id: pid }, "-date", 20),
    initialData: [],
    enabled: !!pid,
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ["modal-deliveries", pid],
    queryFn: () => base44.entities.Delivery.filter({ project_id: pid }, "-scheduled_date", 10),
    initialData: [],
    enabled: !!pid,
  });

  const isLoading = wpsLoading || cosLoading || rfisLoading || codesLoading || logsLoading;

  // ── Budget trend data ──────────────────────────────────────────────
  const budgetTrendData = useMemo(() => {
    if (!project) return null;
    const sortedCOs = [...cos]
      .filter(c => c.approved_date || c.submitted_date)
      .sort((a, b) => new Date(a.approved_date || a.submitted_date).getTime() - new Date(b.approved_date || b.submitted_date).getTime());

    let runningContract = Number(project.original_contract_value) || 0;
    const points = [{ month: "Original", contract: runningContract, actual: 0 }];

    sortedCOs.forEach((co) => {
      if (co.status === "Approved") {
        runningContract += Number(co.co_amount) || 0;
      }
      const dateStr = co.approved_date || co.submitted_date;
      try {
        const label = format(parseISO(dateStr), "MMM yy");
        const lastPoint = points[points.length - 1];
        if (lastPoint.month === label) {
          lastPoint.contract = runningContract;
        } else {
          points.push({ month: label, contract: runningContract, actual: 0 });
        }
      } catch {}
    });

    // Overlay actual cost by phase (cost codes)
    const totalActual = codes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
    if (points.length > 1) points[points.length - 1].actual = totalActual;

    return points.length > 1 ? points : null;
  }, [cos, codes, project]);

  // ── Cost breakdown by phase ────────────────────────────────────────
  const costByPhase = useMemo(() => {
    const phaseMap = {};
    codes.forEach(c => {
      const ph = c.phase || "Other";
      if (!phaseMap[ph]) phaseMap[ph] = { budget: 0, actual: 0 };
      phaseMap[ph].budget += Number(c.budget_amount) || 0;
      phaseMap[ph].actual += Number(c.actual_cost) || 0;
    });
    return Object.entries(phaseMap).map(([phase, vals]) => ({ phase, ...vals }));
  }, [codes]);

  if (!project) return null;

  // ── KPIs ───────────────────────────────────────────────────────────
  const totalBudget = codes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
  const totalActual = codes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
  const approvedCOTotal = cos.filter(c => c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  const revisedContract = (Number(project.original_contract_value) || 0) + approvedCOTotal;
  const openRFIs = rfis.filter(r => !["Answered", "Closed"].includes(r.status)).length;
  const criticalRFIs = rfis.filter(r => r.priority === "Critical" && !["Answered", "Closed"].includes(r.status)).length;
  const wpsComplete = wps.filter(w => w.status === "Complete").length;
  const avgComplete = wps.length > 0
    ? (wps.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / wps.length).toFixed(0)
    : 0;

  // EVM
  const ev = wps.reduce((s, wp) => {
    const bac = (Number(wp.budgeted_labor_value) || 0) + (Number(wp.budgeted_material_value) || 0);
    return s + bac * ((Number(wp.percent_complete) || 0) / 100);
  }, 0);
  const ac = wps.reduce((s, wp) =>
    s + (Number(wp.actual_labor_cost_to_date) || 0) + (Number(wp.actual_material_cost_to_date) || 0), 0);
  const cpi = ac > 0 ? ev / ac : null;

  const health = HEALTH_CFG[project.health_status] || { color: "var(--text-muted)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" };

  // ── Team assignments from WPs ──────────────────────────────────────
  const teamMap = {};
  wps.forEach(wp => {
    if (!wp.crew) return;
    if (!teamMap[wp.crew]) teamMap[wp.crew] = { name: wp.crew, packages: 0, complete: 0, totalPct: 0 };
    teamMap[wp.crew].packages++;
    if (wp.status === "Complete") teamMap[wp.crew].complete++;
    teamMap[wp.crew].totalPct += Number(wp.percent_complete) || 0;
  });
  const team = Object.values(teamMap).sort((a, b) => b.packages - a.packages);

  // ── Recent activity from daily logs ───────────────────────────────
  const recentActivity = [...logs]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 940, maxHeight: "92vh",
        background: "var(--bg-surface)",
        border: "none",
        borderTop: "2px solid var(--accent)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>

        {/* Header */}
        <div style={{
          padding: "18px 24px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          flexShrink: 0,
          background: "var(--bg-sidebar)",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{
                background: health.bg, border: `1px solid ${health.border}`,
                borderRadius: 6, padding: "3px 10px",
                fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                color: health.color, letterSpacing: "0.10em",
              }}>
                {project.health_status || "UNKNOWN"}
              </div>
              {project.phase && (
                <div style={{
                  background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
                  borderRadius: 6, padding: "3px 10px",
                  fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)", letterSpacing: "0.08em",
                }}>
                  {project.phase}
                </div>
              )}
            </div>
            <h2 style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "0.02em" }}>
              {project.name}
            </h2>
            <div style={{ display: "flex", gap: 16, marginTop: 5 }}>
              {project.project_number && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                  # {project.project_number}
                </span>
              )}
              {project.client && (
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)" }}>
                  {project.client}
                </span>
              )}
              {project.project_manager && (
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)" }}>
                  PM: {project.project_manager}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: "var(--radius-btn)",
            background: "var(--bg-surface-high)", border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0,
          }}>
            <X size={14} color="var(--text-muted)" />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1, background: "var(--bg-page)" }}>
          {isLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "60px 0" }}>
              <Loader2 size={18} color="var(--accent)" style={{ animation: "spin 0.9s linear infinite" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.10em" }}>
                LOADING PROJECT DATA…
              </span>
            </div>
          ) : (
            <>
              {/* KPI row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
                <KPITile label="Revised Contract" value={fmtShort$(revisedContract)} sub={`${fmt$(approvedCOTotal)} in COs`} color="var(--accent)" />
                <KPITile label="Actual Cost" value={fmtShort$(totalActual)}
                  sub={totalBudget > 0 ? `${((totalActual / totalBudget) * 100).toFixed(1)}% of budget` : "No budget set"}
                  color={totalBudget > 0 && totalActual > totalBudget ? "var(--status-error)" : "var(--status-success)"} />
                <KPITile label="CPI" value={cpi != null ? cpi.toFixed(2) : "—"}
                  sub={cpi == null ? "No EVM data" : cpi >= 1 ? "On / Under budget" : cpi >= 0.9 ? "Slight overrun" : "Significant overrun"}
                  color={cpi == null ? "var(--text-muted)" : cpi >= 1 ? "var(--status-success)" : cpi >= 0.9 ? "var(--status-warning)" : "var(--status-error)"} />
                <KPITile label="Work Packages" value={`${wpsComplete}/${wps.length}`}
                  sub={`${avgComplete}% avg complete`} color="#A78BFA" />
              </div>

              {/* Budget Trend + Cost by Phase */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>

                {/* Budget History */}
                <div style={{ background: "var(--bg-surface)", border: "none", borderRadius: "var(--radius-card)", padding: "16px 18px" }}>
                  <SectionHeader title="Budget History Trend" icon={TrendingUp} />
                  {budgetTrendData && budgetTrendData.length > 1 ? (
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={budgetTrendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="contractGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--success)" stopOpacity={0.20} />
                            <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="month" tick={{ fill: "var(--text-muted)", fontSize: 8, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => fmtShort$(v)} tick={{ fill: "var(--text-muted)", fontSize: 8, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} width={48} />
                        <Tooltip content={<CustomTooltipBudget />} />
                        <Area type="monotone" dataKey="contract" name="Revised Contract" stroke="var(--accent)" strokeWidth={2} fill="url(#contractGrad)" dot={false} />
                        <Area type="monotone" dataKey="actual" name="Actual Cost" stroke="var(--success)" strokeWidth={2} fill="url(#actualGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)", letterSpacing: "0.08em" }}>
                        NO CHANGE ORDER HISTORY
                      </span>
                    </div>
                  )}
                </div>

                {/* Cost by Phase */}
                <div style={{ background: "var(--bg-surface)", border: "none", borderRadius: "var(--radius-card)", padding: "16px 18px" }}>
                  <SectionHeader title="Cost Breakdown by Phase" icon={DollarSign} />
                  {costByPhase.length > 0 ? (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={costByPhase} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="phase" tick={{ fill: "var(--text-muted)", fontSize: 7, fontFamily: "'IBM Plex Mono'" }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => fmtShort$(v)} tick={{ fill: "var(--text-muted)", fontSize: 8, fontFamily: "'IBM Plex Mono'" }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip content={<CustomTooltipBudget />} />
                        <Bar dataKey="budget" name="Budget" fill="var(--accent)" radius={[3,3,0,0]} opacity={0.6} />
                        <Bar dataKey="actual" name="Actual" fill="var(--success)" radius={[3,3,0,0]} opacity={0.8} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)", letterSpacing: "0.08em" }}>
                        NO COST CODE DATA
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Team + Activity */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                {/* Team Assignments */}
                <div style={{ background: "var(--bg-surface)", border: "none", borderRadius: "var(--radius-card)", padding: "16px 18px" }}>
                  <SectionHeader title="Team Assignments" icon={Users} />
                  {team.length === 0 ? (
                    <div style={{ padding: "24px 0", textAlign: "center" }}>
                      <Users size={28} color="var(--text-disabled)" style={{ margin: "0 auto 8px" }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)", letterSpacing: "0.08em" }}>
                        NO CREW DATA ON WORK PACKAGES
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {team.map((member) => {
                        const avgPct = member.packages > 0 ? Math.round(member.totalPct / member.packages) : 0;
                        return (
                          <div key={member.name} style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "8px 10px", background: "var(--bg-surface-low)",
                            border: "none", borderRadius: "var(--radius-card)",
                          }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: "50%",
                              background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)",
                              flexShrink: 0,
                            }}>
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {member.name}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                <div style={{ flex: 1, height: 3, background: "var(--border-strong)", borderRadius: 2 }}>
                                  <div style={{ width: `${avgPct}%`, height: "100%", background: avgPct >= 80 ? "var(--success)" : avgPct >= 50 ? "var(--warning)" : "var(--accent)", borderRadius: 2 }} />
                                </div>
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", flexShrink: 0 }}>
                                  {avgPct}%
                                </span>
                              </div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "#A78BFA" }}>
                                {member.packages}
                              </div>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                                PKGS
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Open RFIs / Change Orders summary */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
                    <div style={{
                      padding: "8px 10px",
                        background: criticalRFIs > 0 ? "var(--danger-muted)" : "var(--bg-surface-low)",
                        border: "none",
                        borderRadius: "var(--radius-card)",
                    }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 4 }}>OPEN RFIs</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: openRFIs > 0 ? "var(--warning)" : "var(--success)" }}>
                        {openRFIs}
                      </div>
                      {criticalRFIs > 0 && (
                        <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--danger)", marginTop: 2 }}>
                          {criticalRFIs} critical
                        </div>
                      )}
                    </div>
                    <div style={{
                      padding: "8px 10px", background: "var(--bg-surface-low)",
                      border: "none", borderRadius: "var(--radius-card)",
                    }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 4 }}>CHANGE ORDERS</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>
                        {cos.length}
                      </div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                        {cos.filter(c => c.status === "Approved").length} approved
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Activity Log */}
                <div style={{ background: "var(--bg-surface)", border: "none", borderRadius: "var(--radius-card)", padding: "16px 18px" }}>
                  <SectionHeader title="Recent Activity Log" icon={Activity} />
                  {recentActivity.length === 0 ? (
                    <div style={{ padding: "24px 0", textAlign: "center" }}>
                      <Activity size={28} color="var(--text-disabled)" style={{ margin: "0 auto 8px" }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)", letterSpacing: "0.08em" }}>
                        NO DAILY LOGS FOUND
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      {recentActivity.map((log, idx) => (
                        <div key={log.id || idx} style={{
                          display: "flex", gap: 10,
                          padding: "8px 0",
                          borderBottom: idx < recentActivity.length - 1 ? "1px solid var(--border)" : "none",
                        }}>
                          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                            <div style={{
                              width: 7, height: 7, borderRadius: "50%",
                              background: log.safety_incidents > 0 ? "var(--danger)" : "var(--accent)",
                              marginTop: 4,
                            }} />
                            {idx < recentActivity.length - 1 && (
                              <div style={{ width: 1, flex: 1, background: "var(--border)", minHeight: 8 }} />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)", letterSpacing: "0.06em" }}>
                                {fmtDate(log.date)}
                              </span>
                              {log.superintendent && (
                                <span style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "var(--text-muted)" }}>
                                  {log.superintendent}
                                </span>
                              )}
                            </div>
                            {log.activities && (
                              <div style={{
                                fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)",
                                overflow: "hidden", textOverflow: "ellipsis",
                                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                              }}>
                                {log.activities}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
                              {log.headcount > 0 && (
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                                  {log.headcount} workers
                                </span>
                              )}
                              {log.hours_worked > 0 && (
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                                  {log.hours_worked}h
                                </span>
                              )}
                              {log.delay_hours > 0 && (
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--warning)" }}>
                                  ⚠ {log.delay_hours}h delay
                                </span>
                              )}
                              {log.safety_incidents > 0 && (
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--danger)" }}>
                                  ✗ {log.safety_incidents} incident{log.safety_incidents > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upcoming deliveries */}
                  {deliveries.filter(d => !["Delivered"].includes(d.status)).length > 0 && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 8 }}>
                        UPCOMING DELIVERIES
                      </div>
                      {deliveries.filter(d => !["Delivered"].includes(d.status)).slice(0, 3).map((d, idx) => (
                        <div key={d.id || idx} style={{
                          display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
                        }}>
                          <Package size={10} color="var(--accent)" style={{ flexShrink: 0 }} />
                          <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {d.vendor}
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)", flexShrink: 0 }}>
                            {fmtDate(d.scheduled_date)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}