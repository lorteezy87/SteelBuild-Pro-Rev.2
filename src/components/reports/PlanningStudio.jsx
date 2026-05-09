import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const NUMBER = new Intl.NumberFormat("en-US");

const VIEWS = [
  {
    id: "executive",
    title: "Executive Pulse",
    eyebrow: "Portfolio command view",
    description: "Leadership summary across schedule drift, cost pressure, and active blockers.",
    actionPage: "Dashboard",
    accent: "var(--accent)",
  },
  {
    id: "schedule",
    title: "Schedule Recovery",
    eyebrow: "Critical path attention",
    description: "Highlights overdue tasks, unscheduled work, and projects most likely to slip next.",
    actionPage: "Schedule",
    accent: "var(--status-warning)",
  },
  {
    id: "risk",
    title: "Risk Radar",
    eyebrow: "Issue escalation map",
    description: "Focuses on overdue RFIs, waiting-on blockers, and leadership-level action items.",
    actionPage: "ProjectControlCenter",
    accent: "var(--status-error)",
  },
  {
    id: "commercial",
    title: "Commercial Watch",
    eyebrow: "Cost and change signal",
    description: "Pairs over-budget codes, pending change orders, and late vendor flow into one surface.",
    actionPage: "Financials",
    accent: "var(--chart-4)",
  },
];

const PROMPTS = [
  { id: "leadership", label: "What needs leadership attention?" },
  { id: "schedule", label: "Where are we slipping on schedule?" },
  { id: "cost", label: "What is putting margin at risk?" },
  { id: "week", label: "What should the PM team do this week?" },
];

function compactCurrency(value) {
  if (!value) return "$0";
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return CURRENCY.format(value);
}

function MetricPill({ label, value, tone = "var(--accent)" }) {
  return (
    <div
      style={{
        minWidth: 120,
        borderRadius: 12,
        border: "1px solid color-mix(in srgb, var(--border-default) 78%, transparent)",
        background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-secondary) 86%, transparent), color-mix(in srgb, var(--bg-surface) 94%, transparent))",
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, lineHeight: 1, fontWeight: 800, color: tone }}>{value}</div>
    </div>
  );
}

function AssistantSection({ title, items, tone }) {
  if (!items?.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: tone || "var(--text-muted)",
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item) => (
          <div
            key={item}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: "color-mix(in srgb, var(--bg-surface-secondary) 88%, transparent)",
              border: "1px solid color-mix(in srgb, var(--border-default) 72%, transparent)",
              color: "var(--text-secondary)",
              fontSize: 13,
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildInsightPack({
  focusedProjectName,
  openRFIs,
  overdueRFIs,
  criticalRFIs,
  pendingCOs,
  pendingCOValue,
  overBudgetCodes,
  lateDeliveries,
  overdueActions,
  overdueTasks,
  unscheduledTasks,
  atRiskProjects,
}) {
  const projectLabel = focusedProjectName || "the portfolio";
  const highestRiskProject = atRiskProjects[0]?.name || "your at-risk jobs";

  return {
    leadership: {
      title: `SteelBuild Copilot briefing for ${projectLabel}`,
      summary:
        overdueTasks > 0 || overdueRFIs > 0 || lateDeliveries > 0
          ? `${projectLabel} has multiple live execution signals that can compound if they are not owned this week.`
          : `${projectLabel} is relatively stable right now, with the biggest opportunity coming from proactive cleanup before small issues stack up.`,
      priorities: [
        `${NUMBER.format(overdueTasks)} schedule tasks are overdue${unscheduledTasks ? ` and ${NUMBER.format(unscheduledTasks)} more still have TBD dates` : ""}.`,
        `${NUMBER.format(overdueRFIs)} RFIs are overdue and ${NUMBER.format(criticalRFIs)} are marked critical.`,
        `${NUMBER.format(lateDeliveries)} deliveries and ${NUMBER.format(overdueActions)} action items need direct owner follow-up.`,
      ],
      watchouts: [
        `${highestRiskProject} is a good candidate for an executive unblock review.`,
        pendingCOs > 0
          ? `${NUMBER.format(pendingCOs)} pending change orders worth ${compactCurrency(pendingCOValue)} could affect cash flow timing.`
          : "Change-order flow is quiet enough that schedule recovery should stay the main focus.",
      ],
      actions: [
        "Run a 15-minute recovery huddle on overdue schedule tasks and assign one owner per blocker.",
        "Escalate any overdue RFI tied to field, detailing, or fabrication release dates.",
        "Use the Risk Radar view to confirm nothing high-severity is waiting without an accountable person.",
      ],
      tone: "var(--accent)",
    },
    schedule: {
      title: "Schedule recovery view",
      summary:
        overdueTasks > 0
          ? `The schedule is telling us where coordination is leaking: overdue tasks plus TBD work are the main drag right now.`
          : `There is no broad overdue-task surge right now, so the focus should be preventing TBD work from becoming hidden delay.`,
      priorities: [
        `${NUMBER.format(overdueTasks)} overdue tasks should be triaged first by phase and by owner.`,
        `${NUMBER.format(unscheduledTasks)} tasks are still unscheduled/TBD, which weakens forecast reliability.`,
        `${NUMBER.format(lateDeliveries)} late deliveries can quietly re-create critical path pressure even when task status looks healthy.`,
      ],
      watchouts: [
        "If drawing, procurement, and field handoff tasks keep appearing as TBD, schedule confidence will drop before the dashboard shows it.",
        "Recovery work should prioritize tasks tied to upcoming dependencies rather than only the oldest late items.",
      ],
      actions: [
        "Open Schedule and sort the task list by overdue then by phase.",
        "Convert the highest-risk TBD tasks into dated commitments or explicit waiting-on records.",
        "Cross-check late deliveries against near-term installation and closeout tasks.",
      ],
      tone: "var(--status-warning)",
    },
    cost: {
      title: "Commercial risk view",
      summary:
        pendingCOs > 0 || overBudgetCodes > 0
          ? `Commercial pressure is present, and the combination of pending COs with over-budget codes is where margin can erode quietly.`
          : `Commercial signals are relatively calm, which gives room to tighten forecasting before pressure grows.`,
      priorities: [
        `${NUMBER.format(overBudgetCodes)} cost codes are currently over budget.`,
        `${NUMBER.format(pendingCOs)} change orders are still pending approval, totaling ${compactCurrency(pendingCOValue)}.`,
        `${NUMBER.format(openRFIs)} open RFIs may contain hidden scope or pricing consequences if they stay unresolved.`,
      ],
      watchouts: [
        "Pending scope decisions that are not tied to budget exposure tend to age badly.",
        "Repeated schedule drift usually shows up in cost before it shows up in revenue.",
      ],
      actions: [
        "Review over-budget codes beside the pending CO register, not as separate reports.",
        "Flag RFIs with commercial impact for PM and estimating follow-up.",
        "Use Financials to spot whether cost growth is isolated or phase-wide.",
      ],
      tone: "var(--chart-4)",
    },
    week: {
      title: "This-week operating plan",
      summary: `If we want a Brena-style assistant behavior, the useful version is not generic chat. It is a weekly operating brief that converts current data into concrete next moves.`,
      priorities: [
        `Clear ${NUMBER.format(overdueRFIs)} overdue RFIs and ${NUMBER.format(overdueActions)} overdue action items from the queue.`,
        `Decide owner and date strategy for ${NUMBER.format(unscheduledTasks)} TBD schedule tasks.`,
        `Review ${NUMBER.format(lateDeliveries)} late deliveries against the next 14 days of schedule demand.`,
      ],
      watchouts: [
        "Unscheduled work is often the earliest sign of future misses, especially when the schedule still looks visually calm.",
        "Action items without due dates or owners will undercut every other dashboard you build.",
      ],
      actions: [
        "Use Project Control Center to assign ownership on waiting-on blockers.",
        "Use Schedule Recovery to convert vague work into dated commitments.",
        "Close the loop in Dashboard or Financials so executive reporting reflects the same decisions.",
      ],
      tone: "var(--status-success)",
    },
  };
}

export default function PlanningStudio({
  projects = [],
  tasks = [],
  rfis = [],
  cos = [],
  deliveries = [],
  actionItems = [],
  codes = [],
  activeProject = null,
}) {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState("executive");
  const [activePrompt, setActivePrompt] = useState("leadership");

  const focusedProjectId = activeProject?.id || null;

  const model = useMemo(() => {
    const scopedProjects = focusedProjectId ? projects.filter((project) => project.id === focusedProjectId) : projects;
    const scopedTasks = focusedProjectId ? tasks.filter((task) => task.project_id === focusedProjectId) : tasks;
    const scopedRFIs = focusedProjectId ? rfis.filter((item) => item.project_id === focusedProjectId) : rfis;
    const scopedCOs = focusedProjectId ? cos.filter((item) => item.project_id === focusedProjectId) : cos;
    const scopedDeliveries = focusedProjectId ? deliveries.filter((item) => item.project_id === focusedProjectId) : deliveries;
    const scopedActions = focusedProjectId ? actionItems.filter((item) => item.project_id === focusedProjectId) : actionItems;
    const scopedCodes = focusedProjectId ? codes.filter((item) => item.project_id === focusedProjectId) : codes;
    const now = new Date();

    const overdueTasks = scopedTasks.filter(
      (task) => task.end_date && new Date(task.end_date) < now && !["Complete", "Cancelled"].includes(task.status)
    );
    const unscheduledTasks = scopedTasks.filter((task) => !task.start_date || !task.end_date);
    const openRFIs = scopedRFIs.filter((item) => !["Answered", "Closed"].includes(item.status));
    const overdueRFIs = openRFIs.filter((item) => item.due_date && new Date(item.due_date) < now);
    const criticalRFIs = openRFIs.filter((item) => item.priority === "Critical");
    const pendingCOs = scopedCOs.filter((item) => ["Submitted", "Under Review"].includes(item.status));
    const pendingCOValue = pendingCOs.reduce((sum, item) => sum + (Number(item.co_amount) || 0), 0);
    const lateDeliveries = scopedDeliveries.filter(
      (item) => item.scheduled_date && new Date(item.scheduled_date) < now && item.status !== "Delivered"
    );
    const overdueActions = scopedActions.filter(
      (item) => item.due_date && new Date(item.due_date) < now && !["Complete", "Cancelled"].includes(item.status)
    );
    const overBudgetCodes = scopedCodes.filter((item) => {
      const budget = Number(item.budget_amount) || 0;
      const actual = Number(item.actual_cost) || 0;
      return budget > 0 && actual > budget;
    });
    const atRiskProjects = scopedProjects
      .filter((project) => project.health_status === "At Risk" || project.health_status === "Watch")
      .sort((a, b) => {
        const rank = { "At Risk": 0, Watch: 1, "On Track": 2 };
        return (rank[a.health_status] ?? 3) - (rank[b.health_status] ?? 3);
      });

    return {
      focusedProjectName: activeProject?.name || null,
      scopedProjects,
      overdueTasks,
      unscheduledTasks,
      openRFIs,
      overdueRFIs,
      criticalRFIs,
      pendingCOs,
      pendingCOValue,
      lateDeliveries,
      overdueActions,
      overBudgetCodes,
      atRiskProjects,
    };
  }, [activeProject?.id, activeProject?.name, actionItems, codes, cos, deliveries, focusedProjectId, projects, rfis, tasks]);

  const insights = useMemo(() => buildInsightPack(model), [model]);
  const currentInsight = insights[activePrompt];
  const activeTemplate = VIEWS.find((view) => view.id === activeView) || VIEWS[0];

  const previewMetrics = {
    executive: [
      { label: "At-Risk Projects", value: NUMBER.format(model.atRiskProjects.length), tone: "var(--accent)" },
      { label: "Overdue Tasks", value: NUMBER.format(model.overdueTasks.length), tone: "var(--status-warning)" },
      { label: "Pending CO Value", value: compactCurrency(model.pendingCOValue), tone: "var(--chart-4)" },
      { label: "Late Deliveries", value: NUMBER.format(model.lateDeliveries.length), tone: "var(--status-error)" },
    ],
    schedule: [
      { label: "Overdue Tasks", value: NUMBER.format(model.overdueTasks.length), tone: "var(--status-warning)" },
      { label: "TBD Tasks", value: NUMBER.format(model.unscheduledTasks.length), tone: "var(--accent)" },
      { label: "Overdue RFIs", value: NUMBER.format(model.overdueRFIs.length), tone: "var(--status-error)" },
      { label: "Late Deliveries", value: NUMBER.format(model.lateDeliveries.length), tone: "var(--status-error)" },
    ],
    risk: [
      { label: "Critical RFIs", value: NUMBER.format(model.criticalRFIs.length), tone: "var(--status-error)" },
      { label: "Overdue Actions", value: NUMBER.format(model.overdueActions.length), tone: "var(--status-warning)" },
      { label: "Watch Projects", value: NUMBER.format(model.atRiskProjects.length), tone: "var(--accent)" },
      { label: "Open RFIs", value: NUMBER.format(model.openRFIs.length), tone: "var(--chart-4)" },
    ],
    commercial: [
      { label: "Pending COs", value: NUMBER.format(model.pendingCOs.length), tone: "var(--chart-4)" },
      { label: "CO Value", value: compactCurrency(model.pendingCOValue), tone: "var(--chart-4)" },
      { label: "Over Budget Codes", value: NUMBER.format(model.overBudgetCodes.length), tone: "var(--status-error)" },
      { label: "Open RFIs", value: NUMBER.format(model.openRFIs.length), tone: "var(--status-warning)" },
    ],
  };

  const previewNotes = {
    executive: [
      `${NUMBER.format(model.atRiskProjects.length)} projects are flagged watch or at risk.`,
      `${NUMBER.format(model.overdueTasks.length)} tasks already need recovery action.`,
      `${NUMBER.format(model.pendingCOs.length)} pending COs should stay in the same executive conversation as cost and schedule drift.`,
    ],
    schedule: [
      `${NUMBER.format(model.unscheduledTasks.length)} tasks are still TBD and should be dated or explicitly blocked.`,
      `${NUMBER.format(model.lateDeliveries.length)} deliveries could re-create path pressure downstream.`,
      "Use this as the weekly recovery board before the look-ahead meeting.",
    ],
    risk: [
      `${NUMBER.format(model.overdueRFIs.length)} overdue RFIs are already affecting coordination speed.`,
      `${NUMBER.format(model.overdueActions.length)} action items have missed their due dates.`,
      "This is the best handoff view for PM, detailing, and field leadership alignment.",
    ],
    commercial: [
      `${NUMBER.format(model.overBudgetCodes.length)} cost codes are currently burning above budget.`,
      `${compactCurrency(model.pendingCOValue)} is still waiting inside the change-order pipeline.`,
      "Use this to keep schedule discussions tied to actual commercial consequence.",
    ],
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card
        className="overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 24%, transparent), transparent 38%), radial-gradient(circle at bottom right, color-mix(in srgb, var(--chart-4) 18%, transparent), transparent 34%), linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-secondary) 92%, transparent), var(--bg-surface))",
        }}
      >
        <CardContent style={{ padding: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)", gap: 0 }}>
            <div style={{ padding: "24px 24px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--accent)",
                  }}
                >
                  Planning Studio
                </div>
                <div style={{ fontSize: 30, lineHeight: 1.05, fontWeight: 800, color: "var(--text-primary)" }}>
                  Visualization gallery plus a Brena-style planning copilot for SteelBuild.
                </div>
                <div style={{ maxWidth: 720, fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                  This turns your existing dashboards, schedule signals, RFIs, deliveries, and commercial data into one operating surface.
                  {activeProject?.name
                    ? ` Right now it is focused on ${activeProject.name}.`
                    : " Right now it is looking across the full portfolio."}
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <MetricPill label="Overdue Tasks" value={NUMBER.format(model.overdueTasks.length)} tone="var(--status-warning)" />
                <MetricPill label="Open RFIs" value={NUMBER.format(model.openRFIs.length)} tone="var(--status-error)" />
                <MetricPill label="Pending CO Value" value={compactCurrency(model.pendingCOValue)} tone="var(--chart-4)" />
                <MetricPill label="Late Deliveries" value={NUMBER.format(model.lateDeliveries.length)} tone="var(--accent)" />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <Button variant="secondary" onClick={() => navigate(createPageUrl(activeTemplate.actionPage))}>
                  Open {activeTemplate.title}
                </Button>
                <Button variant="outline" onClick={() => navigate(createPageUrl("Schedule"))}>
                  Recovery in Schedule
                </Button>
                <Button variant="outline" onClick={() => navigate(createPageUrl("ProjectControlCenter"))}>
                  Open PCC
                </Button>
              </div>
            </div>

            <div
              style={{
                borderLeft: "1px solid color-mix(in srgb, var(--border-default) 72%, transparent)",
                padding: "24px 24px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                background: "color-mix(in srgb, var(--bg-surface-secondary) 55%, transparent)",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: currentInsight.tone,
                    marginBottom: 8,
                  }}
                >
                  SteelBuild Copilot
                </div>
                <div style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 800, color: "var(--text-primary)", marginBottom: 8 }}>
                  {currentInsight.title}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)" }}>{currentInsight.summary}</div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PROMPTS.map((prompt) => (
                  <button
                    key={prompt.id}
                    type="button"
                    onClick={() => setActivePrompt(prompt.id)}
                    style={{
                      borderRadius: 999,
                      border:
                        activePrompt === prompt.id
                          ? "1px solid var(--accent-border)"
                          : "1px solid color-mix(in srgb, var(--border-default) 72%, transparent)",
                      background:
                        activePrompt === prompt.id
                          ? "color-mix(in srgb, var(--accent-muted) 90%, transparent)"
                          : "color-mix(in srgb, var(--bg-surface) 94%, transparent)",
                      color: activePrompt === prompt.id ? "var(--accent)" : "var(--text-secondary)",
                      padding: "8px 12px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.05em",
                      cursor: "pointer",
                    }}
                  >
                    {prompt.label}
                  </button>
                ))}
              </div>

              <AssistantSection title="Priority Signals" items={currentInsight.priorities} tone={currentInsight.tone} />
              <AssistantSection title="Watchouts" items={currentInsight.watchouts} />
              <AssistantSection title="Recommended Actions" items={currentInsight.actions} tone="var(--status-success)" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)", gap: 18 }}>
        <Card>
          <CardContent style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    marginBottom: 6,
                  }}
                >
                  Visualization Gallery
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)" }}>Choose the operating view you want to lead from.</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 260 }}>
                This is the SteelBuild version of Gantter’s dashboard-picker idea, but tuned to schedule, fabrication, logistics, and commercial control.
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              {VIEWS.map((view) => {
                const selected = view.id === activeView;
                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setActiveView(view.id)}
                    style={{
                      textAlign: "left",
                      borderRadius: 14,
                      border: selected ? `1px solid ${view.accent}` : "1px solid var(--border-default)",
                      background:
                        selected
                          ? `linear-gradient(180deg, color-mix(in srgb, ${view.accent} 14%, var(--bg-surface-secondary)), var(--bg-surface))`
                          : "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-secondary) 88%, transparent), var(--bg-surface))",
                      padding: 16,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      minHeight: 176,
                    }}
                  >
                    <div
                      style={{
                        height: 72,
                        borderRadius: 10,
                        border: "1px solid color-mix(in srgb, var(--border-default) 76%, transparent)",
                        background: `radial-gradient(circle at 20% 20%, color-mix(in srgb, ${view.accent} 24%, transparent), transparent 34%), linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-secondary) 86%, transparent), color-mix(in srgb, var(--bg-surface) 96%, transparent))`,
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        padding: 10,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ height: 8, width: "46%", borderRadius: 999, background: "color-mix(in srgb, var(--text-muted) 24%, transparent)" }} />
                        <div style={{ flex: 1, borderRadius: 8, background: "color-mix(in srgb, var(--bg-surface) 78%, transparent)", border: "1px solid color-mix(in srgb, var(--border-default) 60%, transparent)" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 8 }}>
                        <div style={{ borderRadius: 8, background: "color-mix(in srgb, var(--bg-surface) 78%, transparent)", border: "1px solid color-mix(in srgb, var(--border-default) 60%, transparent)" }} />
                        <div style={{ borderRadius: 8, background: `color-mix(in srgb, ${view.accent} 18%, var(--bg-surface))`, border: "1px solid color-mix(in srgb, var(--border-default) 60%, transparent)" }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: view.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
                        {view.eyebrow}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", marginBottom: 6 }}>{view.title}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)" }}>{view.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: activeTemplate.accent,
                  marginBottom: 6,
                }}
              >
                {activeTemplate.eyebrow}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", marginBottom: 6 }}>{activeTemplate.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)" }}>{activeTemplate.description}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {previewMetrics[activeTemplate.id].map((metric) => (
                <MetricPill key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {previewNotes[activeTemplate.id].map((note) => (
                <div
                  key={note}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "color-mix(in srgb, var(--bg-surface-secondary) 90%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--border-default) 72%, transparent)",
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    lineHeight: 1.55,
                  }}
                >
                  {note}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button variant="secondary" onClick={() => navigate(createPageUrl(activeTemplate.actionPage))}>
                Open this workflow
              </Button>
              <Button variant="outline" onClick={() => setActivePrompt(activeTemplate.id === "commercial" ? "cost" : activeTemplate.id === "schedule" ? "schedule" : "leadership")}>
                Ask copilot about this
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
