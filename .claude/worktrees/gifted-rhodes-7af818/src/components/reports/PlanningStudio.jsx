import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CalendarClock,
  GitBranch,
  Layers3,
  PackageCheck,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  Truck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/design-system";
import { formatCurrencyShort, formatDate } from "@/components/shared/formatters";

const CLOSED_TASK_STATUSES = ["complete", "completed", "closed", "cancelled", "canceled"];
const RISK_RED = "var(--status-error)";
const WARNING = "var(--status-warning)";
const SUCCESS = "var(--status-success)";
const INFO = "var(--status-info)";

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysFromToday(value) {
  const parsed = dateValue(value);
  if (!parsed) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return Math.round((parsed - today) / 86400000);
}

function isTaskOpen(task) {
  const status = String(task?.status || "").toLowerCase();
  return !CLOSED_TASK_STATUSES.some((closed) => status.includes(closed));
}

function taskLabel(task) {
  return task?.task_name || task?.name || task?.title || "Unnamed schedule task";
}

function workPackageLabel(workPackage) {
  return workPackage?.name || workPackage?.package_name || workPackage?.wp_number || "Unnamed work package";
}

function deliveryLabel(delivery) {
  return delivery?.load_number || delivery?.truck_number || delivery?.name || delivery?.destination || "Delivery";
}

function riskColor(value, warningAt, dangerAt) {
  if (value >= dangerAt) return RISK_RED;
  if (value >= warningAt) return WARNING;
  return SUCCESS;
}

function buildInsightList(project) {
  if (!project) return [];
  const insights = [];
  if (project.overdueRfis) insights.push(`${project.overdueRfis} overdue RFI${project.overdueRfis === 1 ? "" : "s"} can block detailing, fabrication release, or field decisions.`);
  if (project.lateDeliveries) insights.push(`${project.lateDeliveries} late deliver${project.lateDeliveries === 1 ? "y" : "ies"} should be checked against erection readiness.`);
  if (project.delayedTasks) insights.push(`${project.delayedTasks} schedule task${project.delayedTasks === 1 ? "" : "s"} already show delay status.`);
  if (project.overdueActions) insights.push(`${project.overdueActions} overdue action item${project.overdueActions === 1 ? "" : "s"} need owner follow-up.`);
  if (project.pendingCo) insights.push(`${formatCurrencyShort(project.pendingCo)} in pending change exposure is not yet reflected as approved contract value.`);
  if (!insights.length) insights.push("No urgent blocker pattern is visible from RFIs, deliveries, actions, cost, and schedule records.");
  return insights;
}

function buildScenario(project, delayDays) {
  if (!project) {
    return {
      pressure: 0,
      forecastSlip: delayDays,
      affectedTasks: [],
      affectedPackages: [],
      affectedDeliveries: [],
    };
  }

  const pressure = project.overdueRfis * 2
    + project.lateDeliveries * 2
    + project.delayedTasks * 2
    + project.overdueActions
    + (project.pendingCo > 0 ? 2 : 0);
  const multiplier = 1 + Math.min(1.25, pressure / 12);
  const forecastSlip = Math.max(delayDays, Math.ceil(delayDays * multiplier));
  const upcomingTasks = [...(project.projectTasks || [])]
    .filter(isTaskOpen)
    .map((task) => ({
      task,
      days: daysFromToday(task.start_date || task.end_date),
      duration: num(task.duration_days || task.duration || task.duration_work_days),
    }))
    .filter((entry) => entry.days == null || entry.days <= 60)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999) || b.duration - a.duration)
    .slice(0, 5)
    .map((entry) => entry.task);

  const atRiskPackages = [...(project.projectWps || [])]
    .filter((wp) => !String(wp.status || "").toLowerCase().includes("complete"))
    .sort((a, b) => num(b.tonnage) - num(a.tonnage))
    .slice(0, 4);

  const upcomingDeliveries = [...(project.projectDeliveries || [])]
    .filter((delivery) => !String(delivery.status || "").toLowerCase().includes("delivered"))
    .map((delivery) => ({ delivery, days: daysFromToday(delivery.scheduled_date || delivery.delivery_date) }))
    .filter((entry) => entry.days == null || entry.days <= 45)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999))
    .slice(0, 4)
    .map((entry) => entry.delivery);

  return {
    pressure,
    forecastSlip,
    affectedTasks: upcomingTasks,
    affectedPackages: atRiskPackages,
    affectedDeliveries: upcomingDeliveries,
  };
}

function buildActionPlan(project) {
  if (!project) return [];
  const actions = [
    {
      label: "Open Schedule",
      page: "Schedule",
      icon: Route,
      tone: INFO,
      reason: project.delayedTasks ? "Review delay flags and resequence successors." : "Check the next release path before changing dates.",
    },
    {
      label: "Review RFIs",
      page: "RFIs",
      icon: AlertTriangle,
      tone: project.overdueRfis ? RISK_RED : SUCCESS,
      reason: project.overdueRfis ? "Resolve overdue technical decisions before they hit fabrication or field work." : "Confirm there are no hidden design blockers.",
    },
    {
      label: "Work Packages",
      page: "WorkPackages",
      icon: PackageCheck,
      tone: project.avgProgress < 70 ? WARNING : SUCCESS,
      reason: "Validate release, shop status, tonnage, and owner responsibility by package.",
    },
    {
      label: "Deliveries",
      page: "Deliveries",
      icon: Truck,
      tone: project.lateDeliveries ? RISK_RED : INFO,
      reason: project.lateDeliveries ? "Late loads may affect crane windows and erection sequence." : "Confirm near-term loads are aligned with field need dates.",
    },
  ];

  if (project.pendingCo > 0 || project.margin < 0) {
    actions.push({
      label: "Change Orders",
      page: "ChangeOrders",
      icon: ShieldCheck,
      tone: project.margin < 0 ? RISK_RED : WARNING,
      reason: "Review unresolved commercial exposure before approving recovery options.",
    });
  }

  return actions;
}

function buildVisualizations(project, portfolio) {
  const rows = portfolio?.rows || [];
  return [
    {
      key: "schedule",
      title: "Schedule Recovery",
      icon: CalendarClock,
      tone: riskColor(project?.delayedTasks || 0, 1, 3),
      value: `${project?.delayedTasks || 0}`,
      label: "Delayed tasks",
      text: "Gantter-style recovery board for critical path, phase-gate dates, and lookahead pressure.",
    },
    {
      key: "risk",
      title: "Risk Radar",
      icon: Target,
      tone: riskColor((project?.overdueRfis || 0) + (project?.overdueActions || 0), 2, 5),
      value: `${(project?.overdueRfis || 0) + (project?.overdueActions || 0)}`,
      label: "Open blockers",
      text: "Shows design decisions, owner tasks, and late commitments that can cascade into the schedule.",
    },
    {
      key: "production",
      title: "Production Flow",
      icon: Layers3,
      tone: project?.avgProgress >= 75 ? SUCCESS : WARNING,
      value: `${Math.round(project?.avgProgress || 0)}%`,
      label: "WP progress",
      text: "Turns work packages into a release-to-fabrication-to-delivery readiness view.",
    },
    {
      key: "portfolio",
      title: "Executive Pulse",
      icon: Sparkles,
      tone: INFO,
      value: `${rows.filter((row) => row.health === "At Risk").length}`,
      label: "At-risk jobs",
      text: "Portfolio rollup of the jobs Brena would pull into the morning planning brief.",
    },
  ];
}

export default function PlanningStudio({ portfolio, selected, onNavigatePage }) {
  const [activeView, setActiveView] = useState("schedule");
  const [delayDays, setDelayDays] = useState(7);

  const insights = useMemo(() => buildInsightList(selected), [selected]);
  const scenario = useMemo(() => buildScenario(selected, delayDays), [selected, delayDays]);
  const actions = useMemo(() => buildActionPlan(selected), [selected]);
  const visualizations = useMemo(() => buildVisualizations(selected, portfolio), [selected, portfolio]);
  const activeVisualization = visualizations.find((item) => item.key === activeView) || visualizations[0];

  if (!selected) {
    return (
      <section style={studioStyle}>
        <div style={studioHeaderStyle}>
          <div>
            <div style={eyebrowStyle}>Planning Studio</div>
            <h2 style={titleStyle}>Brena</h2>
          </div>
          <span style={badgeStyle}>No project selected</span>
        </div>
      </section>
    );
  }

  return (
    <section style={studioStyle}>
      <div style={studioHeaderStyle}>
        <div>
          <div style={eyebrowStyle}>GantterAI-style Planning Studio</div>
          <h2 style={titleStyle}>Brena Command Brief</h2>
          <p style={subtitleStyle}>
            Read-only schedule intelligence for {selected.name || "selected project"}. Suggestions explain the source signals and require human action before anything changes.
          </p>
        </div>
        <div style={healthPillStyle(selected.health)}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: statusTone(selected.health), boxShadow: `0 0 14px ${statusTone(selected.health)}` }} />
          {selected.score} / {selected.health}
        </div>
      </div>

      <div style={studioGridStyle}>
        <div style={brenaPanelStyle}>
          <div style={panelTitleRowStyle}>
            <div style={avatarStyle}><Bot size={18} /></div>
            <div>
              <div style={panelTitleStyle}>Brena</div>
              <div style={panelMetaStyle}>Assistant, not autopilot</div>
            </div>
          </div>

          <div style={briefBlockStyle}>
            <div style={miniLabelStyle}>Current Read</div>
            <p style={briefTextStyle}>
              {selected.health === "At Risk"
                ? "This project needs recovery attention before schedule and commercial exposure compound."
                : selected.health === "Watch"
                  ? "This project is not failing, but the next planning cycle should clear blockers and confirm releases."
                  : "This project is generally healthy. Keep monitoring near-term decisions, releases, and delivery commitments."}
            </p>
          </div>

          <div style={{ display: "grid", gap: 9 }}>
            {insights.map((insight) => (
              <div key={insight} style={insightRowStyle}>
                <Zap size={13} color={INFO} />
                <span>{insight}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={galleryStyle}>
          {visualizations.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveView(item.key)}
                style={visualCardStyle(item.tone, active)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <Icon size={18} color={item.tone} />
                  <span style={miniLabelStyle}>{item.label}</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 900, color: item.tone, lineHeight: 1 }}>{item.value}</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{item.title}</div>
                <p style={cardTextStyle}>{item.text}</p>
              </button>
            );
          })}
        </div>

        <div style={scenarioPanelStyle}>
          <div style={panelTitleRowStyle}>
            <GitBranch size={18} color={activeVisualization.tone} />
            <div>
              <div style={panelTitleStyle}>{activeVisualization.title}</div>
              <div style={panelMetaStyle}>Scenario impact model</div>
            </div>
          </div>

          <div style={scenarioHeroStyle(activeVisualization.tone)}>
            <div>
              <div style={miniLabelStyle}>If a release slips</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 38, fontWeight: 900, color: "var(--text-primary)", lineHeight: 1 }}>
                +{scenario.forecastSlip}d
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", marginTop: 7 }}>
                Estimated forecast movement from a {delayDays}-day planning delay.
              </div>
            </div>
            <label style={sliderWrapStyle}>
              <span style={miniLabelStyle}>Delay days</span>
              <input
                type="range"
                min="1"
                max="30"
                value={delayDays}
                onChange={(event) => setDelayDays(Number(event.target.value))}
                style={{ width: "100%", accentColor: "var(--status-info)" }}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 900, color: "var(--text-primary)" }}>{delayDays} days</span>
            </label>
          </div>

          <div style={impactGridStyle}>
            <ImpactList title="Likely schedule touchpoints" empty="No upcoming open tasks found." items={scenario.affectedTasks.map((task) => ({
              id: task.id || taskLabel(task),
              title: taskLabel(task),
              meta: `${task.phase || "No phase"} / ${task.status || "No status"} / ${task.end_date ? formatDate(task.end_date) : "TBD"}`,
            }))} />
            <ImpactList title="Package readiness" empty="No open work packages found." items={scenario.affectedPackages.map((wp) => ({
              id: wp.id || workPackageLabel(wp),
              title: workPackageLabel(wp),
              meta: `${wp.status || "No status"} / ${num(wp.tonnage).toFixed(1)}T / ${Math.round(num(wp.percent_complete))}%`,
            }))} />
            <ImpactList title="Delivery watch" empty="No upcoming deliveries found." items={scenario.affectedDeliveries.map((delivery) => ({
              id: delivery.id || deliveryLabel(delivery),
              title: deliveryLabel(delivery),
              meta: `${delivery.status || "No status"} / ${formatDate(delivery.scheduled_date || delivery.delivery_date)}`,
            }))} />
          </div>
        </div>

        <div style={actionPanelStyle}>
          <div style={panelTitleStyle}>Recommended Human Actions</div>
          <div style={panelMetaStyle}>Brena can suggest. The user decides and records changes.</div>
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => onNavigatePage?.(action.page)}
                  style={actionRowStyle(action.tone)}
                >
                  <Icon size={15} color={action.tone} />
                  <span style={{ minWidth: 0 }}>
                    <span style={actionLabelStyle}>{action.label}</span>
                    <span style={actionReasonStyle}>{action.reason}</span>
                  </span>
                  <ArrowUpRight size={14} color="var(--text-muted)" />
                </button>
              );
            })}
          </div>
          <Button variant="primary" icon="arrow-up-right" onClick={() => onNavigatePage?.("Schedule")}>
            Open Recovery Schedule
          </Button>
        </div>
      </div>
    </section>
  );
}

function ImpactList({ title, items, empty }) {
  return (
    <div style={impactListStyle}>
      <div style={miniLabelStyle}>{title}</div>
      <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
        {items.length ? items.map((item) => (
          <div key={item.id} style={impactItemStyle}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 800, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>{item.meta}</div>
          </div>
        )) : (
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>{empty}</div>
        )}
      </div>
    </div>
  );
}

function statusTone(health) {
  if (health === "At Risk") return RISK_RED;
  if (health === "Watch") return WARNING;
  return SUCCESS;
}

function healthPillStyle(health) {
  const tone = statusTone(health);
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    height: 34,
    padding: "0 12px",
    borderRadius: 999,
    border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)`,
    background: `color-mix(in srgb, ${tone} 13%, var(--bg-surface-high))`,
    color: tone,
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
}

function visualCardStyle(tone, active) {
  return {
    minHeight: 164,
    border: `1px solid ${active ? tone : "var(--border-default)"}`,
    borderRadius: 16,
    background: active
      ? `linear-gradient(145deg, color-mix(in srgb, ${tone} 18%, var(--bg-surface-high)) 0%, var(--bg-surface-low) 100%)`
      : "linear-gradient(180deg, var(--bg-surface-high), var(--bg-surface-low))",
    boxShadow: active ? `0 0 0 1px color-mix(in srgb, ${tone} 25%, transparent), 0 18px 38px rgba(0,0,0,0.35)` : "inset 0 1px 0 rgba(255,255,255,0.04)",
    color: "inherit",
    padding: 14,
    textAlign: "left",
    display: "grid",
    gap: 10,
    cursor: "pointer",
  };
}

const studioStyle = {
  border: "1px solid color-mix(in srgb, var(--border-default) 82%, white 18%)",
  borderRadius: 24,
  padding: 18,
  background: "linear-gradient(135deg, rgba(3, 8, 18, 0.96) 0%, rgba(7, 17, 31, 0.94) 48%, rgba(2, 8, 16, 0.98) 100%)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 60px rgba(0,0,0,0.42)",
  overflow: "hidden",
  position: "relative",
};

const studioHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 18,
  marginBottom: 16,
};

const studioGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 0.85fr) minmax(360px, 1.25fr)",
  gap: 16,
};

const brenaPanelStyle = {
  border: "1px solid var(--border-default)",
  borderRadius: 18,
  background: "rgba(7, 13, 24, 0.88)",
  padding: 16,
  display: "grid",
  gap: 14,
};

const galleryStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const scenarioPanelStyle = {
  gridColumn: "1 / -1",
  border: "1px solid var(--border-default)",
  borderRadius: 18,
  background: "linear-gradient(180deg, rgba(13, 22, 36, 0.92), rgba(5, 10, 19, 0.96))",
  padding: 16,
  display: "grid",
  gap: 14,
};

const actionPanelStyle = {
  gridColumn: "1 / -1",
  border: "1px solid var(--border-default)",
  borderRadius: 18,
  background: "rgba(5, 10, 19, 0.94)",
  padding: 16,
  display: "grid",
  gap: 12,
};

const panelTitleRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const avatarStyle = {
  width: 38,
  height: 38,
  borderRadius: 13,
  display: "grid",
  placeItems: "center",
  color: "white",
  background: "linear-gradient(135deg, var(--status-info), #0369a1)",
  boxShadow: "0 0 22px color-mix(in srgb, var(--status-info) 45%, transparent)",
};

const eyebrowStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--status-info)",
};

const titleStyle = {
  margin: "5px 0 0",
  fontFamily: "var(--font-display)",
  fontSize: 30,
  lineHeight: 1,
  color: "var(--text-primary)",
};

const subtitleStyle = {
  margin: "8px 0 0",
  maxWidth: 760,
  fontFamily: "var(--font-body)",
  fontSize: 13,
  lineHeight: 1.5,
  color: "var(--text-secondary)",
};

const panelTitleStyle = {
  fontFamily: "var(--font-display)",
  fontSize: 16,
  fontWeight: 900,
  color: "var(--text-primary)",
};

const panelMetaStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const briefBlockStyle = {
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.035)",
  padding: 12,
};

const briefTextStyle = {
  margin: "8px 0 0",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  lineHeight: 1.55,
  color: "var(--text-primary)",
};

const insightRowStyle = {
  display: "grid",
  gridTemplateColumns: "16px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  lineHeight: 1.45,
  color: "var(--text-secondary)",
};

const cardTextStyle = {
  margin: 0,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  lineHeight: 1.45,
  color: "var(--text-secondary)",
};

function scenarioHeroStyle(tone) {
  return {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(200px, 0.55fr)",
    gap: 16,
    alignItems: "center",
    border: `1px solid color-mix(in srgb, ${tone} 32%, var(--border-default))`,
    borderRadius: 16,
    padding: 16,
    background: `linear-gradient(135deg, color-mix(in srgb, ${tone} 14%, rgba(255,255,255,0.035)) 0%, rgba(255,255,255,0.025) 100%)`,
  };
}

const sliderWrapStyle = {
  display: "grid",
  gap: 8,
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  padding: 12,
  background: "rgba(0,0,0,0.22)",
};

const impactGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const impactListStyle = {
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  padding: 12,
  minHeight: 150,
};

const impactItemStyle = {
  borderTop: "1px solid var(--border-default)",
  paddingTop: 8,
};

const actionRowStyle = (tone) => ({
  width: "100%",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: `linear-gradient(90deg, color-mix(in srgb, ${tone} 10%, transparent), rgba(255,255,255,0.025))`,
  color: "inherit",
  padding: 12,
  display: "grid",
  gridTemplateColumns: "18px minmax(0, 1fr) 16px",
  gap: 10,
  alignItems: "center",
  textAlign: "left",
  cursor: "pointer",
});

const actionLabelStyle = {
  display: "block",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  fontWeight: 900,
  color: "var(--text-primary)",
};

const actionReasonStyle = {
  display: "block",
  fontFamily: "var(--font-body)",
  fontSize: 11,
  color: "var(--text-muted)",
  marginTop: 3,
  lineHeight: 1.35,
};

const miniLabelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const badgeStyle = {
  height: 30,
  padding: "0 10px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface-high)",
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.10em",
};
