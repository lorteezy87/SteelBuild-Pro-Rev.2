import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatCurrency, isOverdue, daysOverdue } from "../shared/formatters";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import StatusBadge from "../shared/StatusBadge";
import ProgressBar from "../shared/ProgressBar";

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

const KPIBlock = ({ label, value, color, bordered }) => (
  <div
    style={{
      padding: "12px 24px",
      borderRight: bordered ? "1px solid var(--divider)" : "none",
      display: "flex",
      flexDirection: "column",
      gap: 4,
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

const CommandPill = ({ label, value, tone = "accent" }) => {
  const tones = {
    accent: {
      color: "var(--accent)",
      border: "var(--accent-border)",
      bg: "var(--accent-muted)",
    },
    danger: {
      color: "var(--status-error)",
      border: "var(--danger-border)",
      bg: "var(--danger-muted)",
    },
    success: {
      color: "var(--status-success)",
      border: "var(--success-border)",
      bg: "var(--success-muted)",
    },
    warning: {
      color: "var(--status-warning)",
      border: "var(--warning-border)",
      bg: "var(--warning-muted)",
    },
  };
  const style = tones[tone] || tones.accent;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 132,
        padding: "10px 12px",
        borderRadius: "var(--radius-card)",
        border: `1px solid ${style.border}`,
        background: style.bg,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 800,
          lineHeight: 1,
          color: style.color,
        }}
      >
        {value}
      </div>
    </div>
  );
};

export default function PortfolioView({
  projects,
  allRFIs,
  allCOs,
  allCodes,
  allWPs,
  allDeliveries,
  allActionItems,
  allExpenses = [],
}) {
  const navigate = useNavigate();
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

  const portfolioKPIs = useMemo(() => {
    const portfolioValue =
      projects.reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0) +
      allCOs.filter((c) => c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const totalBudget = allCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
    const totalSpend = allExpenses.filter((e) => e.payment_status === "Paid").reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const overdueRFIs = allRFIs.filter((r) => isOverdue(r.due_date, r.status, ["Answered", "Closed"])).length;
    const atRisk = projects.filter((p) => p.health_status === "At Risk").length;
    const activeWPs = allWPs.filter((w) => w.status === "In Progress").length;
    return { portfolioValue, totalBudget, totalSpend, overdueRFIs, atRisk, activeWPs };
  }, [projects, allRFIs, allCOs, allCodes, allWPs, allExpenses]);

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
    return { scheduled, inTransit, late, lateList };
  }, [allDeliveries]);

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
    allWPs.forEach((w) => {
      const ton = Number(w.tonnage) || 0;
      const pct = Number(w.percent_complete) || 0;
      if (w.status === "Complete") {
        stages.forEach((s) => (values[s] += ton));
        return;
      }
      if (pct >= 75) values.finish += ton;
      if (pct >= 25 || w.status === "In Progress") values.in_fab += ton;
      if (w.released_date) values.released += ton;
      if (w.vif_confirmed && w.load_list_complete) values.material_on_hand += ton;
      values.drawings_approved += ton;
    });
    for (let i = 1; i < stages.length; i++) {
      values[stages[i]] += values[stages[i - 1]];
    }
    return values;
  }, [allWPs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 92px)" }}>
      {/* Brand Header */}
      <div
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, transparent) 0%, var(--bg-sidebar) 48%, var(--bg-surface-high) 100%)",
          borderBottom: "1px solid var(--divider)",
          padding: "22px 24px 20px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 320, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
            <rect x="4" y="4" width="28" height="5" rx="1" fill="var(--accent)" />
            <rect x="15" y="9" width="6" height="18" rx="0" fill="var(--accent)" />
            <rect x="4" y="27" width="28" height="5" rx="1" fill="var(--accent)" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Portfolio Command Surface
            </span>
            <span
              style={{
                fontFamily: "Space Grotesk, var(--font-display)",
                fontWeight: 800,
                fontSize: 28,
                letterSpacing: "-0.03em",
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
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--text-secondary)",
              maxWidth: 760,
            }}
          >
            Track portfolio health, urgent coordination pressure, cost exposure, fabrication movement, and delivery risk from one operating view.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <CommandPill
              label="Active Projects"
              value={projects.filter((p) => p.status === "Active" || !p.status).length}
              tone="accent"
            />
            <CommandPill label="At Risk" value={portfolioKPIs.atRisk} tone={portfolioKPIs.atRisk ? "danger" : "success"} />
            <CommandPill label="Overdue RFIs" value={portfolioKPIs.overdueRFIs} tone={portfolioKPIs.overdueRFIs ? "danger" : "success"} />
            <CommandPill label="Urgent Queue" value={urgentItems.length} tone={urgentItems.length ? "warning" : "success"} />
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

      {/* Status Bar */}
      <div
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--divider)",
          display: "flex",
          flexShrink: 0,
        }}
      >
        {/* Portfolio Value — featured (wider) */}
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
        {/* Overdue RFIs — glows red when non-zero */}
        <div style={{
          padding: "12px 24px",
          borderRight: "1px solid var(--divider)",
          borderTop: portfolioKPIs.overdueRFIs > 0 ? "3px solid var(--status-error)" : "3px solid transparent",
          background: portfolioKPIs.overdueRFIs > 0 ? "var(--danger-muted)" : "transparent",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.14em", textTransform: "uppercase", color: portfolioKPIs.overdueRFIs > 0 ? "var(--status-error)" : "var(--text-muted)" }}>Overdue RFIs</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, lineHeight: 1, color: portfolioKPIs.overdueRFIs > 0 ? "var(--status-error)" : "var(--status-success)" }}>{portfolioKPIs.overdueRFIs}</span>
        </div>
        {/* At Risk — glows red when non-zero */}
        <div style={{
          padding: "12px 24px",
          borderRight: "1px solid var(--divider)",
          borderTop: portfolioKPIs.atRisk > 0 ? "3px solid var(--status-error)" : "3px solid transparent",
          background: portfolioKPIs.atRisk > 0 ? "var(--danger-muted)" : "transparent",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.14em", textTransform: "uppercase", color: portfolioKPIs.atRisk > 0 ? "var(--status-error)" : "var(--text-muted)" }}>At Risk</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, lineHeight: 1, color: portfolioKPIs.atRisk > 0 ? "var(--status-error)" : "var(--status-success)" }}>{portfolioKPIs.atRisk}</span>
        </div>
        <KPIBlock label="Active Work Pkgs" value={portfolioKPIs.activeWPs} color="var(--accent)" />
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

      <div
        style={{
          padding: "20px 24px",
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 16,
          flex: 1,
          overflowY: "auto",
          background: "var(--bg-page)",
        }}
      >
        {/* Project Health Table */}
        <ErrorBoundary label="Project Health Overview">
        <Card style={{ gridColumn: "span 12" }}>
          <HeaderBar
            title="Project Health Overview"
            count={projectMetrics.length}
            right={
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
            }
          />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-sidebar)" }}>
                  {["#", "Project", "Phase", "Health", "Budget", "Actual", "Variance", "Open RFIs", "Overdue RFIs", "WP Progress", "Pending COs", "Tonnage"].map((h, idx) => (
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
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projectMetrics.map((p, i) => {
                  const variance = p.hasBudgetData ? p.budget - p.actual : null;
                  const isOverBudget = variance !== null && variance < 0;
                  const rowBg = p.health_status === "At Risk" ? "rgba(255,61,61,0.04)" : p.health_status === "Watch" ? "rgba(245,158,11,0.03)" : "transparent";
                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/ProjectDashboard?project=${p.id}`)}
                      style={{
                        borderBottom: "1px solid var(--divider)",
                        background: rowBg,
                        height: ROW_HEIGHT,
                        cursor: "pointer",
                        transition: "background 0.12s",
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
                        <StatusBadge status={p.health_status} />
                      </td>
                      {/* Budget */}
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: p.hasBudgetData ? "var(--text-primary)" : "var(--text-muted)", fontStyle: p.hasBudgetData ? "normal" : "italic" }}>
                        {p.hasBudgetData ? formatCurrency(p.budget).replace(/\.\d+/, "") : "Pending"}
                      </td>
                      {/* Actual */}
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: p.hasActualData ? "var(--text-primary)" : "var(--text-muted)", fontStyle: p.hasActualData ? "normal" : "italic" }}>
                        {p.hasActualData ? formatCurrency(p.actual).replace(/\.\d+/, "") : "Pending"}
                      </td>
                      {/* Variance = Budget - Actual (positive = under budget) */}
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: variance === null ? "var(--text-muted)" : isOverBudget ? "var(--status-error)" : "var(--status-success)" }}>
                        {variance === null ? "—" : (isOverBudget ? "−" : "+") + formatCurrency(Math.abs(variance)).replace(/\.\d+/, "")}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontSize: 10 }}>{p.openRFIs}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", color: p.overdueRFIs > 0 ? "var(--status-error)" : "var(--text-muted)", fontSize: 10, fontWeight: p.overdueRFIs > 0 ? 700 : 400 }}>{p.overdueRFIs}</td>
                      <td style={{ padding: "6px 8px", minWidth: 130 }}>
                        <ProgressBar value={p.avgProgress || 0} />
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: p.pendingCOs.length > 0 ? "var(--status-warning)" : "var(--text-muted)" }}>
                        {p.pendingCOs.length > 0 ? `${p.pendingCOs.length} · ${formatCurrency(p.pendingCOValue).replace(/\.\d+/, "")}` : "—"}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>{p.tonnage > 0 ? `${p.tonnage}T` : "—"}</td>
                    </tr>
                  );
                })}
                {projectMetrics.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ textAlign: "center", padding: 28, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexDirection: "column" }}>
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
          <div style={{ padding: "12px 16px", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={budgetChartData}>
                <XAxis dataKey="name" tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                <Tooltip content={<PhoenixTooltip />} />
                <Bar dataKey="Budget" name="Budget" fill="var(--bg-surface-highest)" />
                <Bar dataKey="Actual" name="Actual">
                  {budgetChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.overBudget ? "var(--status-error)" : "var(--accent)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div
              style={{
                marginTop: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: "var(--text-muted)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
              }}
            >
              Amounts shown in USD · Red bars indicate over-budget
            </div>
          </div>
        </Card>
        </ErrorBoundary>

        <ErrorBoundary label="Risk Matrix">
        <Card style={{ gridColumn: "span 4" }}>
          <HeaderBar title="Risk Matrix" />
          <div style={{ padding: "12px 14px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 7,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      padding: "4px 8px",
                      textAlign: "left",
                    }}
                  >
                    Project
                  </th>
                  {["RFIs", "Cost", "Procurement", "Production"].map((h) => (
                    <th
                      key={h}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 7,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.10em",
                        padding: "4px 8px",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projectMetrics.slice(0, 8).map((p) => {
                  const rfiLevel = p.overdueRFIs === 0 ? "green" : p.overdueRFIs <= 2 ? "yellow" : "red";
                  const budgetPct = p.budget > 0 ? ((Number(p.actual) || 0) / p.budget) * 100 : 0;
                  const budgetLevel = budgetPct <= 100 ? "green" : budgetPct <= 110 ? "yellow" : "red";
                  const delLevel = p.lateDeliveries === 0 ? "green" : p.lateDeliveries === 1 ? "yellow" : "red";
                  const stalledLevel = p.stalledWPs === 0 ? "green" : p.stalledWPs === 1 ? "yellow" : "red";
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--border-default)" }}>
                      <td
                        style={{
                          padding: "6px 8px",
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          color: "var(--text-primary)",
                          whiteSpace: "nowrap",
                          maxWidth: 140,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
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
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>NO DATA</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div style={{ marginTop: 10, display: "flex", gap: 12, fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
              <span>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--status-success)", display: "inline-block", marginRight: 6 }} />
                On Track
              </span>
              <span>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--status-warning)", display: "inline-block", marginRight: 6 }} />
                Watch
              </span>
              <span>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--status-error)", display: "inline-block", marginRight: 6 }} />
                At Risk
              </span>
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
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>No late deliveries</div>
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
        <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>NO URGENT ITEMS ACROSS PORTFOLIO</div>
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
</div>
);
}
