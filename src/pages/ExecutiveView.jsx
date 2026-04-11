import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatCurrency, formatBudgetPercent } from "../components/shared/formatters";
import StatusBadge from "../components/shared/StatusBadge";
import KPIStrip from "../components/shared/KPIStrip";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import TrueHealthChart from "../components/dashboard/TrueHealthChart";

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--bg-surface-high)",
    border: "none",
    borderRadius: 2,
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--text-primary)",
  },
  labelStyle: { color: "var(--text-muted)", fontSize: 9 },
};

const AXIS_PROPS = {
  tick: { fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)" },
  axisLine: false,
  tickLine: false,
};

const CARD_STYLE = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  padding: "18px 20px",
};

const CARD_TITLE = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-primary)",
  marginBottom: 16,
};

const healthColors = [
  "var(--status-success)",
  "var(--status-warning)",
  "var(--status-error)",
];

export default function ExecutiveView() {
  const navigate = useNavigate();
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => base44.entities.Project.list(), staleTime: 5 * 60 * 1000 });
  const { data: rfis = [] } = useQuery({ queryKey: ["rfis"], queryFn: () => base44.entities.RFI.list() });
  const { data: cos = [] } = useQuery({ queryKey: ["change-orders-global"], queryFn: () => base44.entities.ChangeOrder.list() });
  const { data: codes = [] } = useQuery({ queryKey: ["cost-codes-global"], queryFn: () => base44.entities.CostCode.list() });
  const { data: wps = [] } = useQuery({ queryKey: ["work-packages-global"], queryFn: () => base44.entities.WorkPackage.list() });
  const { data: tasks = [] } = useQuery({ queryKey: ['schedule-tasks-global'], queryFn: () => base44.entities.ScheduleTask.list() });

  const totalContract = projects.reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0);
  const approvedCOVal = cos.filter((c) => c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  const revisedTotal = totalContract + approvedCOVal;
  const totalBudget = codes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
  const totalSpend = codes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
  const totalBudgetHrs = wps.reduce((s, w) => s + (Number(w.shop_hours_budget) || 0) + (Number(w.field_hours_budget) || 0), 0);
  const totalActualHrs = wps.reduce((s, w) => s + (Number(w.shop_hours_actual) || 0) + (Number(w.field_hours_actual) || 0), 0);

  const kpis = [
    { label: "Portfolio Value", value: formatCurrency(revisedTotal), color: "green" },
    { label: "Total Spend", value: formatCurrency(totalSpend), sub: `of ${formatCurrency(totalBudget)} budget`, color: totalSpend > totalBudget ? "rose" : "blue" },
    { label: "Approved COs", value: formatCurrency(approvedCOVal), sub: `${cos.filter((c) => c.status === "Approved").length} orders`, color: "purple" },
    { label: "Labor Burn", value: formatBudgetPercent(totalBudgetHrs > 0 ? totalActualHrs / totalBudgetHrs * 100 : 0), sub: `${totalActualHrs.toLocaleString()} hrs actual`, color: "amber" },
    { label: "Open RFIs", value: rfis.filter((r) => r.status === "Open" || r.status === "Under Review").length, color: "blue" },
    { label: "At Risk Projects", value: projects.filter((p) => p.health_status === "At Risk").length, color: "rose" },
    {
      label: 'Delayed Tasks',
      value: tasks.filter(t => t.status === 'Delayed').length,
      color: tasks.filter(t => t.status === 'Delayed').length > 0 ? 'rose' : 'green',
    },
    {
      label: 'Complete This Week',
      value: tasks.filter(t => {
        if (t.status !== 'Complete') return false;
        const d = new Date(t.end_date || t.updated_date || '');
        const now = new Date();
        const weekAgo = new Date(now - 7 * 86400000);
        return d >= weekAgo && d <= now;
      }).length,
      color: 'green',
    },
  ];

  // Charts data
  const projectBudgetData = projects.map((p) => {
    const pc = codes.filter((c) => c.project_id === p.id);
    const approvedCO = cos.filter((c) => c.project_id === p.id && c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    return {
      name: p.project_number || p.name?.slice(0, 10),
      budget: pc.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0),
      actual: pc.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0),
      revised: (Number(p.original_contract_value) || 0) + approvedCO,
    };
  });

  const rfiSeverity = [
    { name: "Critical", value: rfis.filter((r) => r.priority === "Critical").length },
    { name: "High",     value: rfis.filter((r) => r.priority === "High").length },
    { name: "Medium",   value: rfis.filter((r) => r.priority === "Medium").length },
    { name: "Low",      value: rfis.filter((r) => r.priority === "Low").length },
  ].filter((d) => d.value > 0);
  const rfiSeverityColors = ["var(--status-error)", "var(--status-warning)", "var(--status-info)", "var(--text-muted)"];

  const laborData = projects.map((p) => {
    const pw = wps.filter((w) => w.project_id === p.id);
    return {
      name: p.project_number || p.name?.slice(0, 8),
      budget: pw.reduce((s, w) => s + (Number(w.shop_hours_budget) || 0) + (Number(w.field_hours_budget) || 0), 0),
      actual: pw.reduce((s, w) => s + (Number(w.shop_hours_actual) || 0) + (Number(w.field_hours_actual) || 0), 0),
    };
  });

  const waterfallData = [{ name: "Original", value: totalContract, fill: "var(--accent)" }];
  cos.filter((c) => c.status === "Approved").forEach((c) => {
    waterfallData.push({ name: c.co_number, value: Number(c.co_amount) || 0, fill: (Number(c.co_amount) || 0) >= 0 ? "var(--status-success)" : "var(--status-error)" });
  });
  waterfallData.push({ name: "Revised", value: revisedTotal, fill: "var(--phase-detailing)" });

  const healthData = [
    { name: "On Track", value: projects.filter((p) => p.health_status === "On Track").length },
    { name: "Watch",    value: projects.filter((p) => p.health_status === "Watch").length },
    { name: "At Risk",  value: projects.filter((p) => p.health_status === "At Risk").length },
  ].filter((d) => d.value > 0);

  // Phase donut
  const phaseData = [
    { name: "Detailing",   value: projects.filter(p => p.phase === "Detailing").length,   color: "var(--phase-detailing)" },
    { name: "Fabrication", value: projects.filter(p => p.phase === "Fabrication").length, color: "var(--phase-fab)" },
    { name: "Delivery",    value: projects.filter(p => p.phase === "Delivery").length,    color: "var(--phase-delivery)" },
    { name: "Erection",    value: projects.filter(p => p.phase === "Erection").length,    color: "var(--phase-erection)" },
    { name: "Closeout",    value: projects.filter(p => p.phase === "Closeout").length,    color: "var(--phase-closeout)" },
  ].filter(d => d.value > 0);

  // RFI aging table
  const rfiAging = projects.map(p => {
    const pRFIs = rfis.filter(r => r.project_id === p.id);
    const open = pRFIs.filter(r => !["Answered", "Closed"].includes(r.status));
    const overdue = open.filter(r => r.date_required && new Date(r.date_required) < new Date());
    const avgDays = open.length > 0
      ? Math.round(open.reduce((s, r) => {
          const start = new Date(r.submitted_date || r.created_date || new Date());
          return s + Math.floor((new Date() - start) / 86400000);
        }, 0) / open.length)
      : 0;
    return { name: p.name, number: p.project_number, open: open.length, overdue: overdue.length, avgDays };
  }).filter(r => r.open > 0).sort((a, b) => b.overdue - a.overdue || b.open - a.open);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Executive Roll-Up
        </h1>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Portfolio analytics &middot; {projects.length} projects
        </p>
      </div>

      <KPIStrip items={kpis} />

      {/* Phase + Health row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Portfolio by Phase donut */}
        <div style={CARD_STYLE}>
          <div style={CARD_TITLE}>Portfolio by Phase</div>
          {phaseData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={phaseData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} dataKey="value" strokeWidth={0}>
                    {phaseData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8, justifyContent: "center" }}>
                {phaseData.map(d => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                      {d.name} ({d.value})
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px 0", fontFamily: "var(--font-mono)", fontSize: 10 }}>No data</p>
          )}
        </div>

        {/* Project Health donut */}
        <div style={CARD_STYLE}>
          <div style={CARD_TITLE}>Project Health</div>
          {healthData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={healthData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} dataKey="value" strokeWidth={0}>
                    {healthData.map((_, i) => <Cell key={i} fill={healthColors[i]} />)}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8, justifyContent: "center" }}>
                {healthData.map((d, i) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: healthColors[i] }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                      {d.name} ({d.value})
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px 0", fontFamily: "var(--font-mono)", fontSize: 10 }}>No data</p>
          )}
        </div>
      </div>

      {/* Budget vs Actual + Labor Hours */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={CARD_STYLE}>
          <div style={CARD_TITLE}>Budget vs Actual by Project</div>
          {projectBudgetData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={projectBudgetData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
                <XAxis dataKey="name" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }} />
                <Bar dataKey="budget" fill="var(--bg-surface-highest)" name="Budget" radius={[2, 2, 0, 0]} />
                <Bar dataKey="actual" fill="var(--accent)" name="Actual" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "48px 0", fontFamily: "var(--font-mono)", fontSize: 10 }}>No data</p>
          )}
        </div>

        <div style={CARD_STYLE}>
          <div style={CARD_TITLE}>Labor Hours: Budget vs Actual</div>
          {laborData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={laborData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
                <XAxis dataKey="name" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }} />
                <Bar dataKey="budget" fill="var(--bg-surface-highest)" name="Budgeted Hrs" radius={[2, 2, 0, 0]} />
                <Bar dataKey="actual" fill="var(--phase-detailing)" name="Actual Hrs" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "48px 0", fontFamily: "var(--font-mono)", fontSize: 10 }}>No data</p>
          )}
        </div>
      </div>

      {/* RFI Severity + CO Waterfall */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
        {/* RFI Severity Donut */}
        <div style={CARD_STYLE}>
          <div style={CARD_TITLE}>RFI Severity Distribution</div>
          {rfiSeverity.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={rfiSeverity} cx="50%" cy="50%" innerRadius={50} outerRadius={72} dataKey="value" strokeWidth={0}>
                    {rfiSeverity.map((_, i) => <Cell key={i} fill={rfiSeverityColors[i]} />)}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8, justifyContent: "center" }}>
                {rfiSeverity.map((d, i) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: rfiSeverityColors[i] }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px 0", fontFamily: "var(--font-mono)", fontSize: 10 }}>No RFIs</p>
          )}
        </div>

        {/* CO Waterfall */}
        <div style={CARD_STYLE}>
          <div style={CARD_TITLE}>Change Order Waterfall (Contract Value)</div>
          {waterfallData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={waterfallData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
                <XAxis dataKey="name" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                  {waterfallData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "48px 0", fontFamily: "var(--font-mono)", fontSize: 10 }}>Add approved change orders to see waterfall</p>
          )}
        </div>
      </div>

      {/* True Health EVM Chart */}
      <TrueHealthChart projects={projects} wps={wps} />

      {/* RFI Aging Table */}
      {rfiAging.length > 0 && (
        <div style={CARD_STYLE}>
          <div style={CARD_TITLE}>RFI Aging by Project</div>
          <div style={{ overflow: "hidden", borderRadius: "var(--radius-card)", border: "1px solid var(--divider)" }}>
            {/* Header */}
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 80px 90px 120px",
              padding: "9px 16px",
              background: "var(--bg-sidebar)",
              borderBottom: "1px solid var(--divider)",
            }}>
              {["Project", "Open", "Overdue", "Avg Days Open"].map(col => (
                <div key={col} style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  {col}
                </div>
              ))}
            </div>
            {/* Rows */}
            {rfiAging.map((row, i) => (
              <div key={row.name} style={{
                display: "grid", gridTemplateColumns: "2fr 80px 90px 120px",
                padding: "10px 16px",
                borderBottom: i < rfiAging.length - 1 ? "1px solid var(--divider)" : "none",
                borderLeft: row.overdue > 0 ? "3px solid var(--status-error)" : "3px solid transparent",
                alignItems: "center",
                background: "transparent",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--hover-bg)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{row.name}</div>
                  {row.number && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{row.number}</div>}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>{row.open}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: row.overdue > 0 ? "var(--status-error)" : "var(--text-muted)" }}>
                  {row.overdue > 0 ? row.overdue : "—"}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: row.avgDays > 14 ? "var(--status-error)" : row.avgDays > 7 ? "var(--status-warning)" : "var(--text-secondary)" }}>
                  {row.avgDays}d
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Project cards */}
      <div style={CARD_STYLE}>
        <div style={CARD_TITLE}>Project Summary — Click to Drill In</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {projects.map((p) => {
            const pc = codes.filter((c) => c.project_id === p.id);
            const budget = pc.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
            const actual = pc.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
            const pctSpend = budget > 0 ? actual / budget * 100 : 0;
            const projRFIs = rfis.filter((r) => r.project_id === p.id && (r.status === "Open" || r.status === "Under Review")).length;
            return (
              <div key={p.id}
                style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: 14, cursor: "pointer", transition: "all 0.15s", background: "var(--bg-surface-low)" }}
                onClick={() => navigate(`${createPageUrl("Dashboard")}?project=${p.id}`)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.background = "var(--hover-bg)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.background = "var(--bg-surface-low)"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{p.name}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{p.project_number}</div>
                  </div>
                  <StatusBadge status={p.health_status} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Spend</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: pctSpend > 100 ? "var(--status-error)" : "var(--text-secondary)" }}>{formatBudgetPercent(pctSpend)}</span>
                  </div>
                  <div style={{ height: 3, background: "var(--bg-surface-highest)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, pctSpend)}%`, background: pctSpend > 100 ? "var(--status-error)" : "var(--accent)", borderRadius: 2 }} />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Phase: <span style={{ color: "var(--text-secondary)", fontWeight: 700 }}>{p.phase}</span></span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                      {formatCurrency(Number(p.original_contract_value) || 0)}
                    </span>
                    {p.target_completion_date && (
                      <span style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 700,
                        color: (() => {
                          const days = Math.ceil((new Date(p.target_completion_date) - new Date()) / 86400000);
                          return days < 0 ? "var(--status-error)" : days < 30 ? "var(--status-warning)" : "var(--text-muted)";
                        })(),
                      }}>
                        {(() => {
                          const days = Math.ceil((new Date(p.target_completion_date) - new Date()) / 86400000);
                          return days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`;
                        })()}
                      </span>
                    )}
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: projRFIs > 0 ? "var(--status-warning)" : "var(--text-muted)" }}>
                    {projRFIs > 0 ? `${projRFIs} RFIs` : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}