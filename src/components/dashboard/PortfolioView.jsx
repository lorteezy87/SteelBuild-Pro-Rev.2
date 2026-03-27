import React, { useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { differenceInDays } from "date-fns";
import { parseUTCDate } from "../shared/formatters";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatCurrency, isOverdue, daysOverdue } from "../shared/formatters";
import StatusBadge from "../shared/StatusBadge";
import ProgressBar from "../shared/ProgressBar";

const Card = ({ children, style = {} }) => (
  <div style={{
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: 12,
    boxShadow: "var(--shadow-card)",
    overflow: "hidden", ...style,
  }}>{children}</div>
);

const PanelHeader = ({ title, count, countColor, right }) => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 14px", borderBottom: "1px solid var(--border-default)",
    background: "var(--bg-surface-secondary)",
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 3, height: 16, background: "var(--accent)", borderRadius: 2 }} />
      <span style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</span>
      {count != null && (
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          background: countColor === "danger" ? "var(--danger-muted)" : "var(--accent-muted)",
          border: `1px solid ${countColor === "danger" ? "var(--danger-border)" : "var(--accent-border)"}`,
          color: countColor === "danger" ? "var(--danger)" : "var(--accent)", borderRadius: 4, padding: "1px 7px",
        }}>{count}</span>
      )}
    </div>
    {right}
  </div>
);

const KPICard = ({ label, value, sub, color }) => (
  <div style={{
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderTop: `2px solid ${color || "var(--accent)"}`,
    borderRadius: 12,
    boxShadow: "var(--shadow-card)",
    padding: "14px 16px", display: "flex", flexDirection: "column",
  }}>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.16em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 800, color: color || "var(--accent)", lineHeight: 1, marginBottom: 4 }}>{value}</div>
    {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>{sub}</div>}
  </div>
);

const HEALTH_ORDER = { "At Risk": 0, "Watch": 1, "On Track": 2 };

const RISK_COLOR = {
  green: { bg: "var(--success-muted)", text: "var(--status-success)" },
  yellow: { bg: "var(--warning-muted)", text: "var(--status-warning)" },
  red: { bg: "var(--danger-muted)", text: "var(--status-error)" },
};

function riskCell(level) {
  const c = RISK_COLOR[level];
  return (
    <div style={{
      background: c.bg, color: c.text,
      fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
      borderRadius: 4, padding: "3px 6px", textAlign: "center",
    }}>
      {level === "green" ? "OK" : level === "yellow" ? "WATCH" : "RISK"}
    </div>
  );
}

const PhoenixTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "8px 12px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--text-primary)" }}>
      <div style={{ marginBottom: 4, color: "var(--accent)" }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value).replace(/\.\d+/, "")}</div>
      ))}
    </div>
  );
};

export default function PortfolioView({ projects, allRFIs, allCOs, allCodes, allWPs, allDeliveries, allActionItems }) {
  const navigate = useNavigate();

  const projectMetrics = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    return projects.map(p => {
      const pRFIs = allRFIs.filter(r => r.project_id === p.id);
      const pCOs = allCOs.filter(c => c.project_id === p.id);
      const pCodes = allCodes.filter(c => c.project_id === p.id);
      const pWPs = allWPs.filter(w => w.project_id === p.id);
      const pDeliveries = allDeliveries.filter(d => d.project_id === p.id);
      const budget = pCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
      const actual = pCodes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
      const openRFIs = pRFIs.filter(r => r.status === "Open" || r.status === "Under Review").length;
      const overdueRFIs = pRFIs.filter(r => isOverdue(r.due_date, r.status, ["Answered", "Closed"])).length;
      const avgProgress = pWPs.length > 0
        ? Math.round(pWPs.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / pWPs.length) : 0;
      const pendingCOs = pCOs.filter(c => ["Submitted", "Under Review"].includes(c.status));
      const pendingCOValue = pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
      const lateDeliveries = pDeliveries.filter(d => d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered").length;
      const tonnage = Math.round(pWPs.reduce((s, w) => s + (Number(w.tonnage) || 0), 0));
      const stalledWPs = pWPs.filter(w => w.status === "On Hold").length;
      return { ...p, budget, actual, openRFIs, overdueRFIs, avgProgress, pendingCOs, pendingCOValue, lateDeliveries, tonnage, stalledWPs };
    }).sort((a, b) => (HEALTH_ORDER[a.health_status] ?? 3) - (HEALTH_ORDER[b.health_status] ?? 3));
  }, [projects, allRFIs, allCOs, allCodes, allWPs, allDeliveries]);

  const portfolioKPIs = useMemo(() => {
    const portfolioValue = projects.reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0)
      + allCOs.filter(c => c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const totalBudget = allCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
    const totalSpend = allCodes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
    const overdueRFIs = allRFIs.filter(r => isOverdue(r.due_date, r.status, ["Answered", "Closed"])).length;
    const atRisk = projects.filter(p => p.health_status === "At Risk").length;
    const activeWPs = allWPs.filter(w => w.status === "In Progress").length;
    return { portfolioValue, totalBudget, totalSpend, overdueRFIs, atRisk, activeWPs };
  }, [projects, allRFIs, allCOs, allCodes, allWPs]);

  const budgetChartData = useMemo(() =>
    projectMetrics.slice(0, 8).map(p => ({
      name: p.project_number || p.name?.slice(0, 8),
      Budget: p.budget,
      Actual: p.actual,
      overBudget: p.actual > p.budget,
    })), [projectMetrics]);

  const urgentItems = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const overdueRFIs = allRFIs.filter(r => isOverdue(r.due_date, r.status, ["Answered", "Closed"]));
    const overdueAI = allActionItems.filter(a => a.status !== "Complete" && a.due_date && new Date(a.due_date) < today);
    const overdueDeliveries = allDeliveries.filter(d => d.status !== "Delivered" && d.scheduled_date && new Date(d.scheduled_date) < today);
    const pendingCOs = allCOs.filter(c => c.status === "Submitted" || c.status === "Under Review");
    return [
      ...overdueRFIs.map(r => ({ type: "RFI", id: r.rfi_number || "—", title: r.title, project: r.project_name, days: Math.max(0, daysOverdue(r.due_date)), severity: r.priority === "Critical" ? "critical" : "high", nav: "RFIs" })),
      ...overdueAI.map(a => ({ type: "AI", id: "—", title: a.title || "Action Item", project: a.project_name, days: Math.max(0, Math.floor((today - new Date(a.due_date)) / 86400000)), severity: "high", nav: "ActionItems" })),
      ...overdueDeliveries.map(d => ({ type: "DEL", id: d.delivery_id || "—", title: d.description || d.vendor || "Delivery", project: d.project_name, days: Math.max(0, Math.floor((today - new Date(d.scheduled_date)) / 86400000)), severity: "warning", nav: "Deliveries" })),
      ...pendingCOs.map(c => ({ type: "CO", id: c.co_number || "—", title: c.title, project: c.project_name, days: 0, severity: "warning", nav: "ChangeOrders" })),
    ].sort((a, b) => {
      const ord = { critical: 0, high: 1, warning: 2 };
      return (ord[a.severity] ?? 3) - (ord[b.severity] ?? 3);
    });
  }, [allRFIs, allActionItems, allDeliveries, allCOs]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(12,1fr)", gap: 12 }}>
      {/* ── Row 1: Portfolio KPIs ── */}
      <div style={{ gridColumn: "span 2" }}>
        <KPICard label="Portfolio Value" value={formatCurrency(portfolioKPIs.portfolioValue).replace(/\.\d+/,"")} color="var(--accent)" />
      </div>
      <div style={{ gridColumn: "span 2" }}>
        <KPICard label="Total Budget" value={formatCurrency(portfolioKPIs.totalBudget).replace(/\.\d+/,"")} color="var(--status-warning)" />
      </div>
      <div style={{ gridColumn: "span 2" }}>
        <KPICard label="Total Spend" value={formatCurrency(portfolioKPIs.totalSpend).replace(/\.\d+/,"")}
          sub={portfolioKPIs.totalBudget > 0 ? `${Math.round(portfolioKPIs.totalSpend/portfolioKPIs.totalBudget*100)}% of budget` : ""}
          color={portfolioKPIs.totalSpend > portfolioKPIs.totalBudget ? "var(--status-error)" : "var(--status-success)"} />
      </div>
      <div style={{ gridColumn: "span 2" }}>
        <KPICard label="Overdue RFIs" value={portfolioKPIs.overdueRFIs}
          color={portfolioKPIs.overdueRFIs > 0 ? "var(--status-error)" : "var(--status-success)"} />
      </div>
      <div style={{ gridColumn: "span 2" }}>
        <KPICard label="At Risk Projects" value={portfolioKPIs.atRisk}
          color={portfolioKPIs.atRisk > 0 ? "var(--status-error)" : "var(--status-success)"}
          sub={`of ${projects.length} total`} />
      </div>
      <div style={{ gridColumn: "span 2" }}>
        <KPICard label="Active Work Pkgs" value={portfolioKPIs.activeWPs} color="var(--chart-4)" />
      </div>

      {/* ── Row 2: Project Health Table ── */}
      <Card style={{ gridColumn: "span 12" }}>
        <PanelHeader title="Project Health Overview" count={projectMetrics.length}
          right={<button onClick={() => navigate(createPageUrl("Projects"))} style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--accent)", background:"none", border:"none", cursor:"pointer", letterSpacing:"0.1em", fontWeight:600 }}>MANAGE PROJECTS →</button>} />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg-surface-secondary)", borderBottom: "1px solid var(--border-default)" }}>
                {["#", "Project", "Phase", "Health", "Budget vs Actual", "Open RFIs", "Overdue RFIs", "WP Progress", "Pending COs", "Late Deliveries", "Tonnage"].map(h => (
                  <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projectMetrics.map((p, i) => {
                const budgetPct = p.budget > 0 ? Math.min(120, Math.round(p.actual / p.budget * 100)) : 0;
                const isOverBudget = p.actual > p.budget && p.budget > 0;
                return (
                  <tr key={p.id} style={{
                    borderBottom: "1px solid var(--border-default)",
                    background: i % 2 === 0 ? "transparent" : "var(--hover-bg)",
                    cursor: "pointer", transition: "background 0.15s",
                    borderLeft: p.health_status === "At Risk" ? "3px solid var(--status-error)" : p.health_status === "Watch" ? "3px solid var(--status-warning)" : "3px solid transparent",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--hover-bg)"}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "var(--hover-bg)"}
                  onClick={() => navigate(createPageUrl("Dashboard"))}>
                    <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>{p.project_number}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", fontWeight: 500, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</td>
                    <td style={{ padding: "8px 10px" }}><StatusBadge status={p.phase} /></td>
                    <td style={{ padding: "8px 10px" }}><StatusBadge status={p.health_status} /></td>
                    <td style={{ padding: "8px 10px", minWidth: 130 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1, height: 6, background: "var(--border-default)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(100, budgetPct)}%`, background: isOverBudget ? "var(--status-error)" : "var(--accent)", borderRadius: 3, transition: "width 0.3s" }} />
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isOverBudget ? "var(--status-error)" : "var(--text-muted)", whiteSpace: "nowrap" }}>{budgetPct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: p.openRFIs > 0 ? "var(--status-warning)" : "var(--text-muted)", fontWeight: p.openRFIs > 0 ? 700 : 400, textAlign: "center" }}>{p.openRFIs}</td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      {p.overdueRFIs > 0
                        ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--status-error)", background: "var(--danger-muted)", borderRadius: 4, padding: "2px 7px" }}>{p.overdueRFIs}</span>
                        : <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: "8px 10px", minWidth: 110 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1, height: 6, background: "var(--border-default)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${p.avgProgress}%`, background: "var(--chart-4)", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{p.avgProgress}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: p.pendingCOs.length > 0 ? "var(--status-warning)" : "var(--text-muted)" }}>
                      {p.pendingCOs.length > 0 ? `${p.pendingCOs.length} (${formatCurrency(p.pendingCOValue).replace(/\.\d+/, "")})` : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      {p.lateDeliveries > 0
                        ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--status-error)" }}>{p.lateDeliveries}</span>
                        : <span style={{ color: "var(--status-success)", fontFamily: "var(--font-mono)", fontSize: 11 }}>✓</span>}
                    </td>
                    <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{p.tonnage > 0 ? `${p.tonnage.toLocaleString()}T` : "—"}</td>
                  </tr>
                );
              })}
              {projectMetrics.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>NO PROJECTS FOUND</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Row 3: Budget Chart + Risk Heatmap ── */}
      <Card style={{ gridColumn: "span 6" }}>
        <PanelHeader title="Budget vs Actual by Project" />
        <div style={{ padding: "12px 14px" }}>
          {budgetChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={budgetChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--text-muted)" }} />
                <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--text-muted)" }} tickFormatter={v => formatCurrency(v).replace(/\.\d+/, "").replace("$","$")} width={60} />
                <Tooltip content={<PhoenixTooltip />} />
                <Bar dataKey="Budget" fill="var(--status-warning)" opacity={0.6} radius={[3,3,0,0]} />
                <Bar dataKey="Actual" radius={[3,3,0,0]}>
                  {budgetChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.overBudget ? "var(--status-error)" : "var(--accent)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>NO BUDGET DATA</div>
          )}
        </div>
      </Card>

      <Card style={{ gridColumn: "span 6" }}>
        <PanelHeader title="Risk Heatmap" />
        <div style={{ padding: "12px 14px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "transparent", border: "none" }}>
            <thead>
              <tr>
                <th style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", padding: "4px 8px", textAlign: "left" }}>Project</th>
                {["Overdue RFIs", "Budget", "Late Del.", "Stalled WPs"].map(h => (
                  <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.10em", padding: "4px 8px", textAlign: "center", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projectMetrics.slice(0, 8).map((p) => {
                const rfiLevel = p.overdueRFIs === 0 ? "green" : p.overdueRFIs <= 2 ? "yellow" : "red";
                const budgetPct = p.budget > 0 ? p.actual / p.budget * 100 : 0;
                const budgetLevel = budgetPct <= 100 ? "green" : budgetPct <= 110 ? "yellow" : "red";
                const delLevel = p.lateDeliveries === 0 ? "green" : p.lateDeliveries === 1 ? "yellow" : "red";
                const stalledLevel = p.stalledWPs === 0 ? "green" : p.stalledWPs === 1 ? "yellow" : "red";
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--border-default)" }}>
                    <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-primary)", whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                      <span style={{ color: "var(--accent)", marginRight: 4 }}>{p.project_number}</span>
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>{riskCell(rfiLevel)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>{riskCell(budgetLevel)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>{riskCell(delLevel)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>{riskCell(stalledLevel)}</td>
                  </tr>
                );
              })}
              {projectMetrics.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>NO DATA</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Row 3b: Overdue RFI Alert Widget ── */}
      {(() => {
        const overdueRFIs = allRFIs
          .filter(r => {
            if (r.status === "Answered" || r.status === "Closed") return false;
            const d = r.date_required ? parseUTCDate(r.date_required) : null;
            return d && d < new Date();
          })
          .sort((a, b) => parseUTCDate(a.date_required) - parseUTCDate(b.date_required))
          .slice(0, 5);
        if (overdueRFIs.length === 0) return null;
        return (
          <Card style={{ gridColumn: "span 12" }}>
            <PanelHeader
              title="⚠ Overdue RFIs"
              count={overdueRFIs.length}
              countColor="danger"
              right={
                <Link to="/RFIHub" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", textDecoration: "none", fontWeight: 600, letterSpacing: "0.1em" }}>
                  VIEW ALL →
                </Link>
              }
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8, padding: 12 }}>
              {overdueRFIs.map(r => {
                const daysOver = differenceInDays(new Date(), parseUTCDate(r.date_required));
                return (
                  <Link key={r.id} to="/RFIHub" style={{ textDecoration: "none" }}>
                    <div style={{ borderLeft: "3px solid var(--status-error)", background: "var(--danger-muted)", borderRadius: "0 6px 6px 0", padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,180,171,0.12)"}
                      onMouseLeave={e => e.currentTarget.style.background = "var(--danger-muted)"}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--accent)", marginBottom: 1 }}>{r.rfi_number || "—"}</div>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                        {r.project_name && <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{r.project_name}</div>}
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-error)", flexShrink: 0 }}>{daysOver}D</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        );
      })()}

      {/* ── Row 4: Urgent Items ── */}
      <Card style={{ gridColumn: "span 12" }}>
        <PanelHeader title="⚑ Urgent Items — All Projects" count={urgentItems.length} countColor="danger" />
        {urgentItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>NO URGENT ITEMS ACROSS PORTFOLIO</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8, padding: 12 }}>
            {urgentItems.slice(0, 12).map((item, i) => {
              const isCrit = item.severity === "critical";
              const borderColor = isCrit ? "var(--status-error)" : item.severity === "warning" ? "var(--status-warning)" : "var(--status-error)";
              return (
                <div key={i} onClick={() => navigate(createPageUrl(item.nav))}
                  style={{
                    borderLeft: `3px solid ${borderColor}`,
                    background: isCrit ? "var(--danger-muted)" : "var(--hover-bg)",
                    borderRadius: "0 8px 8px 0", padding: "8px 10px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    cursor: "pointer", gap: 8,
                  }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: borderColor, letterSpacing: "0.10em", fontWeight: 600 }}>{item.type} · {item.id}</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{item.project}</div>
                  </div>
                  {item.days > 0 && (
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700, background: "var(--danger-muted)", border: "1px solid var(--danger-border)", color: "var(--status-error)", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>{item.days}d</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}