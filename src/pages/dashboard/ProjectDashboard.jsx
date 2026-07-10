/**
 * ProjectDashboard - single-project dashboard overview.
 *
 * The first screen is a light, construction-photo-backed overview that matches
 * the supplied Dashboard reference: compact health cards, photo module tiles,
 * alert/deadline rails, recent activity, and team activity. The older
 * operational sections are retained as an opt-in detail layer for future routes,
 * but the Dashboard page defaults to the new themed surface only.
 */

import React, { useMemo } from "react";
import {
  ArrowRight,
  CalendarDays,
  DollarSign,
  FileText,
  HelpCircle,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { getPageIcon } from "@/config/pageIcons";
import { photoFor } from "@/config/launcherConfig";
import ScheduleTimelineSection from "./sections/ScheduleTimelineSection";
import FieldActivitySection from "./sections/FieldActivitySection";
import FinancialControlsSection from "./sections/FinancialControlsSection";
import DocumentHubSection from "./sections/DocumentHubSection";
import TeamWorkflowSection from "./sections/TeamWorkflowSection";
import {
  budgetCommitted,
  cashCollected,
  committedSpend,
  costVariance,
  daysRemaining,
  openRFICount,
  overdueRFICount,
  pendingCOTotal,
  pendingPayment,
  recentActivityFeed,
  revisedContractValue,
  retentionHeld,
  submittalPipelineRollupFromSubmittals,
  timelineElapsedPct,
  totalBilled,
  wpProgressPct,
} from "./projectMetrics";

const CLOSED_RFI_STATUSES = new Set(["Answered", "Closed"]);
const CLOSED_CO_STATUSES = new Set(["Approved", "Approved as Noted", "Rejected", "Void", "Executed"]);
const CLOSED_TASK_STATUSES = new Set(["Complete", "Completed", "Done", "Closed"]);
const CLOSED_DELIVERY_STATUSES = new Set(["Delivered", "Complete", "Completed", "Received", "Cancelled"]);
const CLOSED_SUBMITTAL_STATUSES = new Set(["Approved", "Approved as Noted", "Released for Fabrication", "Void"]);

export default function ProjectDashboard({
  project,
  rfis = [],
  cos = [],
  codes = [],
  wps = [],
  deliveries = [],
  actionItems = [],
  expenses = [],
  submittals = [],
  drawings = [],
  sovItems = [],
  scheduleTasks = [],
  drawingActivity = [],
  budgetHourItems = [],
  dailyLogs = [],
  photos = [],
  punchlistItems = [],
  inspections = [],
  safetyIncidents = [],
  qualityRecords = [],
  onNavigate,
  showDetail = false,
}) {
  const dashboardModel = useMemo(
    () =>
      buildDashboardModel({
        project,
        rfis,
        cos,
        codes,
        wps,
        deliveries,
        actionItems,
        expenses,
        submittals,
        drawings,
        sovItems,
        scheduleTasks,
        drawingActivity,
        dailyLogs,
        punchlistItems,
        inspections,
        safetyIncidents,
        qualityRecords,
      }),
    [
      project,
      rfis,
      cos,
      codes,
      wps,
      deliveries,
      actionItems,
      expenses,
      submittals,
      drawings,
      sovItems,
      scheduleTasks,
      drawingActivity,
      dailyLogs,
      punchlistItems,
      inspections,
      safetyIncidents,
      qualityRecords,
    ],
  );

  return (
    <div className="sb-dashboard-theme">
      <DashboardOverview model={dashboardModel} onNavigate={onNavigate} />

      {showDetail && (
      <section className="sb-dashboard-detail" aria-label="Detailed dashboard controls">
        <div className="sb-dashboard-detail__header">
          <div>
            <p className="sb-dashboard-eyebrow">Detailed controls</p>
            <h2>Operational drilldown</h2>
          </div>
          <p>Schedule, cost, document, field, and team panels remain available below the new overview.</p>
        </div>

        <div className="sb-dashboard-detail__stack">
          <div className="sb-dashboard-detail__single">
            <ErrorBoundary label="Schedule & Timeline">
              <ScheduleTimelineSection
                project={project}
                wps={wps}
                scheduleTasks={scheduleTasks}
                deliveries={deliveries}
                rfis={rfis}
                actionItems={actionItems}
                onNavigate={onNavigate}
              />
            </ErrorBoundary>
          </div>

          <div className="sb-dashboard-detail__grid">
            <ErrorBoundary label="Financial Controls">
              <FinancialControlsSection
                project={project}
                cos={cos}
                codes={codes}
                expenses={expenses}
                wps={wps}
                sovItems={sovItems}
                budgetHourItems={budgetHourItems}
                onNavigate={onNavigate}
              />
            </ErrorBoundary>
            <ErrorBoundary label="Document Hub">
              <DocumentHubSection
                rfis={rfis}
                submittals={submittals}
                drawings={drawings}
                drawingActivity={drawingActivity}
                onNavigate={onNavigate}
              />
            </ErrorBoundary>
          </div>

          <div className="sb-dashboard-detail__grid">
            <ErrorBoundary label="Field Activity">
              <FieldActivitySection
                dailyLogs={dailyLogs}
                photos={photos}
                punchlistItems={punchlistItems}
                inspections={inspections}
                safetyIncidents={safetyIncidents}
                qualityRecords={qualityRecords}
                onNavigate={onNavigate}
              />
            </ErrorBoundary>
            <ErrorBoundary label="Team & Workflow">
              <TeamWorkflowSection
                project={project}
                actionItems={actionItems}
                scheduleTasks={scheduleTasks}
                onNavigate={onNavigate}
              />
            </ErrorBoundary>
          </div>
        </div>
      </section>
      )}
    </div>
  );
}

function DashboardOverview({ model, onNavigate }) {
  return (
    <section className="sb-dashboard-overview" aria-label="Project dashboard overview">
      <header className="sb-dashboard-hero">
        <div className="sb-dashboard-hero__copy">
          <p className="sb-dashboard-eyebrow">Dashboard</p>
          <h1>{model.projectName}</h1>
          <p>
            Project overview and quick access to SteelBuild modules.
          </p>
        </div>
      </header>

      <div className="sb-kpi-grid" aria-label="Project health metrics">
        <HealthCard health={model.health} />
        {model.kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      <div className="sb-dashboard-main-grid">
        <section className="sb-module-panel" aria-label="SteelBuild modules">
          <PanelHeader title="SteelBuild Modules" />
          <div className="sb-module-grid">
            {model.modules.map((module) => (
              <ModuleCard key={module.page} module={module} onNavigate={onNavigate} />
            ))}
          </div>
        </section>

        <aside className="sb-dashboard-rail" aria-label="Project alerts and summary">
          <ProjectListPanel
            title="Critical Alerts"
            action="View all"
            items={model.alerts}
            renderItem={(item) => <AlertRow item={item} />}
          />
          <ProjectListPanel
            title="Upcoming Deadlines"
            action="View all"
            items={model.deadlines}
            renderItem={(item) => <DeadlineRow item={item} />}
          />
        </aside>

        <aside className="sb-dashboard-rail" aria-label="Project summary and team">
          <SummaryPanel summary={model.summary} />
          <ProjectListPanel
            title="Team Activity"
            action="View all"
            items={model.teamActivity}
            renderItem={(item) => <TeamActivityRow item={item} />}
          />
        </aside>

        <section className="sb-activity-panel" aria-label="Recent activity">
          <PanelHeader title="Recent Activity" />
          <RecentActivityTable rows={model.recentActivity} />
        </section>
      </div>
    </section>
  );
}

function HealthCard({ health }) {
  return (
    <article className="sb-card sb-health-card">
      <div className="sb-card__title">Project Health</div>
      <div className="sb-health-card__body">
        <div
          className="sb-health-ring"
          style={{ "--health-score": `${health.score}%` }}
          aria-label={`Project health ${health.score}%`}
        >
          <strong>{health.score}</strong>
          <span>{health.label}</span>
        </div>
        <div className="sb-health-bars">
          {health.bars.map((bar) => (
            <div className="sb-health-bars__row" key={bar.label}>
              <span>{bar.label}</span>
              <div className="sb-health-bars__track">
                <span style={{ width: `${bar.value}%` }} />
              </div>
              <strong>{bar.value}%</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function KpiCard({ label, value, sublabel, trend, tone = "neutral", icon: Icon }) {
  return (
    <article className={`sb-card sb-kpi-card sb-kpi-card--${tone}`}>
      <div className="sb-kpi-card__icon">
        <Icon size={30} strokeWidth={1.7} aria-hidden="true" />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{sublabel}</span>
        {trend ? <em>{trend}</em> : null}
      </div>
    </article>
  );
}

function ModuleCard({ module, onNavigate }) {
  const Icon = getPageIcon(module.page);
  return (
    <button
      type="button"
      className="sb-module-card"
      onClick={() => onNavigate?.(module.target)}
      aria-label={`Open ${module.title}`}
    >
      <img src={module.photo} alt="" loading="lazy" decoding="async" />
      <span className="sb-module-card__scrim" aria-hidden="true" />
      <span className="sb-module-card__icon">
        <Icon size={44} strokeWidth={1.55} aria-hidden="true" />
      </span>
      <span className="sb-module-card__copy">
        <strong>{module.title}</strong>
        <span>{module.subtitle}</span>
        <em className={module.tone === "good" ? "is-good" : ""}>{module.metric}</em>
      </span>
    </button>
  );
}

function PanelHeader({ title, action }) {
  return (
    <div className="sb-panel-header">
      <h2>{title}</h2>
      {action ? <button type="button">{action}</button> : null}
    </div>
  );
}

function ProjectListPanel({ title, action, items, renderItem }) {
  return (
    <section className="sb-card sb-list-panel">
      <PanelHeader title={title} action={action} />
      <div className="sb-list-panel__body">
        {items.length ? (
          items.map((item) => <React.Fragment key={item.id}>{renderItem(item)}</React.Fragment>)
        ) : (
          <div className="sb-empty-row">No current items.</div>
        )}
      </div>
    </section>
  );
}

function AlertRow({ item }) {
  return (
    <div className="sb-alert-row">
      <span className={`sb-alert-row__count sb-alert-row__count--${item.priority}`}>{item.count}</span>
      <span>{item.label}</span>
      <strong>{item.priorityLabel}</strong>
    </div>
  );
}

function DeadlineRow({ item }) {
  return (
    <div className="sb-deadline-row">
      <span>{item.dateLabel}</span>
      <p>{item.label}</p>
      <strong className={`sb-pill sb-pill--${item.tone}`}>{item.relativeLabel}</strong>
    </div>
  );
}

function SummaryPanel({ summary }) {
  return (
    <section className="sb-card sb-summary-panel">
      <PanelHeader title="Project Summary" />
      <div className="sb-summary-panel__rows">
        {summary.rows.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
      <button type="button" className="sb-summary-panel__link">
        View Full Summary <ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </section>
  );
}

function TeamActivityRow({ item }) {
  return (
    <div className="sb-team-row">
      <span className="sb-team-row__avatar" aria-hidden="true">{item.initials}</span>
      <p>
        <strong>{item.name}</strong>
        <span>{item.action}</span>
      </p>
      <em>{item.when}</em>
    </div>
  );
}

function RecentActivityTable({ rows }) {
  return (
    <div className="sb-activity-table-wrap">
      <table className="sb-activity-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Description</th>
            <th>Status</th>
            <th>Related To</th>
            <th>Updated By</th>
            <th>Updated</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id}>
                <td>{row.code}</td>
                <td>{row.type}</td>
                <td>{row.description}</td>
                <td><span className={`sb-status sb-status--${row.statusTone}`}>{row.status}</span></td>
                <td>{row.relatedTo}</td>
                <td>{row.updatedBy}</td>
                <td>{row.updated}</td>
                <td><MoreHorizontal size={16} strokeWidth={1.8} aria-hidden="true" /></td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="sb-activity-table__empty">No recent activity yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function buildDashboardModel(input) {
  const {
    project,
    rfis,
    cos,
    codes,
    wps,
    deliveries,
    actionItems,
    expenses,
    submittals,
    drawings,
    sovItems,
    scheduleTasks,
    drawingActivity,
    dailyLogs,
    punchlistItems,
    inspections,
    safetyIncidents,
    qualityRecords,
  } = input;

  const openRfis = openRFICount(rfis);
  const overdueRfis = overdueRFICount(rfis);
  const pendingSubmittals = submittals.filter((s) => !s?.is_deleted && !CLOSED_SUBMITTAL_STATUSES.has(s.status)).length;
  const activeCos = cos.filter((c) => !c?.is_deleted && !CLOSED_CO_STATUSES.has(c.status)).length;
  const pendingCoDollars = pendingCOTotal(cos);
  const schedulePct = wpProgressPct(wps);
  const elapsedPct = timelineElapsedPct(project);
  const scheduleHealth = clamp(Math.round(100 - Math.max(0, elapsedPct - schedulePct)), 0, 100);
  const budget = budgetCommitted(codes);
  const committed = committedSpend(codes, expenses);
  const costDelta = costVariance(codes, expenses);
  const costPct = budget > 0 ? (costDelta / budget) * 100 : 0;
  const budgetHealth = budget > 0 ? clamp(Math.round(100 + Math.min(0, costPct)), 0, 100) : 78;
  const openPunchlist = punchlistItems.filter((p) => !CLOSED_TASK_STATUSES.has(p.status)).length;
  const openInspections = inspections.filter((i) => !CLOSED_TASK_STATUSES.has(i.status)).length;
  const qualityHealth = clamp(100 - Math.min(40, openPunchlist + openInspections), 60, 100);
  const safetyHealth = clamp(100 - Math.min(45, safetyIncidents.length * 8), 55, 100);
  const healthScore = Math.round((budgetHealth + scheduleHealth + qualityHealth + safetyHealth) / 4);
  const contractValue = revisedContractValue(project, cos);
  const remainingDays = daysRemaining(project);
  const billed = totalBilled(sovItems);
  const collected = cashCollected(sovItems);
  const pendingPay = pendingPayment(sovItems);
  const retention = retentionHeld(sovItems);
  const drawingCount = drawings.filter((d) => !d?.is_deleted).length;
  const fieldIssues = openPunchlist + safetyIncidents.length + qualityRecords.length;
  const recentActivity = buildRecentActivity({ rfis, cos, submittals, drawings, drawingActivity });

  return {
    projectName: project?.name || project?.project_name || "Project Dashboard",
    health: {
      score: healthScore,
      label: healthScore >= 85 ? "Good" : healthScore >= 70 ? "Watch" : "At Risk",
      bars: [
        { label: "Budget", value: budgetHealth },
        { label: "Schedule", value: scheduleHealth },
        { label: "Quality", value: qualityHealth },
        { label: "Safety", value: safetyHealth },
      ],
    },
    kpis: [
      {
        label: "Open RFIs",
        value: openRfis,
        sublabel: overdueRfis ? `${overdueRfis} overdue` : "On response plan",
        trend: overdueRfis ? `${overdueRfis} need review` : null,
        tone: overdueRfis ? "danger" : "neutral",
        icon: HelpCircle,
      },
      {
        label: "Pending Submittals",
        value: pendingSubmittals,
        sublabel: `${submittalPipelineRollupFromSubmittals(submittals).total} active workflow rows`,
        trend: pendingSubmittals ? `${pendingSubmittals} open` : null,
        tone: pendingSubmittals ? "warning" : "neutral",
        icon: FileText,
      },
      {
        label: "Active Change Orders",
        value: activeCos,
        sublabel: pendingCoDollars ? `${formatMoney(pendingCoDollars)} pending` : "No pending value",
        trend: activeCos ? `${activeCos} active` : null,
        tone: activeCos ? "warning" : "neutral",
        icon: RefreshCw,
      },
      {
        label: "Schedule Health",
        value: `${scheduleHealth}%`,
        sublabel: scheduleHealth >= 85 ? "On Track" : scheduleHealth >= 70 ? "Watch" : "At Risk",
        tone: scheduleHealth >= 85 ? "good" : scheduleHealth >= 70 ? "warning" : "danger",
        icon: CalendarDays,
      },
      {
        label: "Cost Health",
        value: budget > 0 ? formatSignedPercent(costPct) : "TBD",
        sublabel: budget > 0 ? (costPct >= 0 ? "Under Budget" : "Over Budget") : "Budget needed",
        tone: costPct >= 0 ? "good" : "danger",
        icon: DollarSign,
      },
    ],
    modules: [
      moduleModel("RFIs", "RFIs", "Questions & Responses", `${openRfis} Open`, "rfis"),
      moduleModel("DrawingSubmittalHub", "Detailing", "Drawings & Models", `${drawingCount} Drawings`, "submittals"),
      moduleModel("ScheduleHub", "Schedule", "Project Timeline", `${schedulePct}% Complete`, "schedule", schedulePct >= 80 ? "good" : undefined),
      moduleModel("FieldHub", "Field Hub", "Daily Field Management", `${fieldIssues} Issues`, "field"),
      moduleModel("CostHub", "Budget Control", "Costs & Commitments", budget > 0 ? `${formatSignedPercent(costPct)} ${costPct >= 0 ? "Under Budget" : "Over Budget"}` : "Budget TBD", "budget-hours", costPct >= 0 ? "good" : undefined),
      moduleModel("ChangeOrders", "Change Orders", "Scope & Contract Changes", `${activeCos} Active`, "change-orders"),
      moduleModel("Documents", "Documents", "Project Documents", `${drawingCount + submittals.length} Files`, "submittals"),
      moduleModel("ReportsHub", "Reports", "Analytics & Insights", `${recentActivity.length} Updates`, "schedule"),
    ],
    alerts: buildAlerts({
      overdueRfis,
      pendingSubmittals,
      activeCos,
      actionItems,
      deliveries,
      drawings,
      fieldIssues,
    }),
    deadlines: buildDeadlines({ rfis, submittals, deliveries, scheduleTasks, actionItems }),
    summary: {
      rows: [
        { label: "Project Value", value: formatMoney(contractValue) },
        { label: "Target Completion", value: formatDate(project?.target_completion_date || project?.forecast_completion_date) },
        { label: "% Complete", value: `${schedulePct}%` },
        { label: "Days Remaining", value: remainingDays == null ? "TBD" : remainingDays },
        { label: "Billed / Collected", value: `${formatMoney(billed)} / ${formatMoney(collected)}` },
        { label: "Open Pay + Retainage", value: `${formatMoney(pendingPay.total + retention)}` },
      ],
    },
    teamActivity: buildTeamActivity({ actionItems, scheduleTasks, drawingActivity, dailyLogs }),
    recentActivity,
    committed,
  };
}

function moduleModel(page, title, subtitle, metric, target, tone) {
  return {
    page,
    title,
    subtitle,
    metric,
    target,
    tone,
    photo: photoFor(page) || "/photos/desktop/Dashboard.webp",
  };
}

function buildAlerts({ overdueRfis, pendingSubmittals, activeCos, actionItems, deliveries, drawings, fieldIssues }) {
  const overdueActions = actionItems.filter((a) => isPast(a.due_date) && !CLOSED_TASK_STATUSES.has(a.status)).length;
  const lateDeliveries = deliveries.filter((d) => isPast(d.scheduled_date || d.required_date) && !CLOSED_DELIVERY_STATUSES.has(d.status)).length;
  const staleDrawings = drawings.filter((d) => d?.is_deleted !== true && ["Rejected", "Revise and Resubmit"].includes(d.status || d.stage || d.set_approval_status)).length;
  return [
    alertItem("drawings", staleDrawings, "Drawings Need Attention", "high"),
    alertItem("rfis", overdueRfis, "RFIs Overdue", "high"),
    alertItem("submittals", pendingSubmittals, "Submittals Open", pendingSubmittals > 5 ? "medium" : "low"),
    alertItem("field", fieldIssues + overdueActions, "Field Issues Require Attention", "medium"),
    alertItem("delivery", lateDeliveries + activeCos, "Milestones or COs at Risk", lateDeliveries ? "medium" : "low"),
  ].filter((item) => item.count > 0).slice(0, 5);
}

function alertItem(id, count, label, priority) {
  return {
    id,
    count,
    label,
    priority,
    priorityLabel: priority === "high" ? "High Priority" : priority === "medium" ? "Medium Priority" : "Low Priority",
  };
}

function buildDeadlines({ rfis, submittals, deliveries, scheduleTasks, actionItems }) {
  const rows = [];
  for (const r of rfis) {
    if (CLOSED_RFI_STATUSES.has(r.status)) continue;
    pushDeadline(rows, r.date_required || r.due_date, r.rfi_number || "RFI Response", r.title || "RFI response");
  }
  for (const s of submittals) {
    if (CLOSED_SUBMITTAL_STATUSES.has(s.status)) continue;
    pushDeadline(rows, s.due_date || s.required_date, s.submittal_number || "Submittal", s.title || s.name || "Submittal review");
  }
  for (const d of deliveries) {
    if (CLOSED_DELIVERY_STATUSES.has(d.status)) continue;
    pushDeadline(rows, d.scheduled_date || d.required_date, d.delivery_id || d.po_number || "Delivery", d.delivery_title || d.description || "Delivery window");
  }
  for (const t of scheduleTasks) {
    if (CLOSED_TASK_STATUSES.has(t.status)) continue;
    pushDeadline(rows, t.end_date || t.start_date, t.task_code || "Schedule", t.task_name || "Schedule task");
  }
  for (const a of actionItems) {
    if (CLOSED_TASK_STATUSES.has(a.status)) continue;
    pushDeadline(rows, a.due_date, "Action", a.title || "Action item");
  }
  return rows
    .filter((row) => row.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)
    .map((row, index) => ({
      id: `${row.kind}-${row.date}-${index}`,
      label: row.label,
      dateLabel: formatShortDate(row.date),
      relativeLabel: relativeDueLabel(row.date),
      tone: dueTone(row.date),
    }));
}

function pushDeadline(rows, date, kind, label) {
  const iso = normalizeDate(date);
  if (!iso) return;
  rows.push({ date: iso, kind, label: `${kind} - ${label}` });
}

function buildRecentActivity({ rfis, cos, submittals, drawings, drawingActivity }) {
  const drawingRows = recentActivityFeed(drawingActivity, 4).map((entry, index) => ({
    id: `drawing-${entry.id || index}`,
    code: `DRW-${index + 1}`,
    type: "Drawing",
    description: entry.summary,
    status: labelFromKind(entry.kind),
    statusTone: toneFromKind(entry.kind),
    relatedTo: "Drawing Register",
    updatedBy: "Project Team",
    updated: formatRelative(entry.when),
    sortDate: entry.when,
  }));
  const rfiRows = rfis.slice(0, 3).map((r, index) => ({
    id: `rfi-${r.id || index}`,
    code: r.rfi_number || `RFI-${index + 1}`,
    type: "RFI",
    description: r.title || r.subject || "RFI update",
    status: r.status || "Open",
    statusTone: statusTone(r.status),
    relatedTo: r.location || r.discipline || "Coordination",
    updatedBy: r.assigned_to || r.ball_in_court || "Project Team",
    updated: formatRelative(r.updated_at || r.created_at || r.submitted_date),
    sortDate: r.updated_at || r.created_at || r.submitted_date,
  }));
  const submittalRows = submittals.slice(0, 3).map((s, index) => ({
    id: `sub-${s.id || index}`,
    code: s.submittal_number || `SUB-${index + 1}`,
    type: "Submittal",
    description: s.title || s.name || "Submittal package",
    status: s.status || "In Review",
    statusTone: statusTone(s.status),
    relatedTo: s.discipline || "Detailing",
    updatedBy: s.ball_in_court || "Project Team",
    updated: formatRelative(s.updated_at || s.created_at || s.submitted_date),
    sortDate: s.updated_at || s.created_at || s.submitted_date,
  }));
  const coRows = cos.slice(0, 2).map((c, index) => ({
    id: `co-${c.id || index}`,
    code: c.co_number || c.change_order_number || `CO-${index + 1}`,
    type: "Change Order",
    description: c.title || c.description || "Change order update",
    status: c.status || "Under Review",
    statusTone: statusTone(c.status),
    relatedTo: c.cost_code || "Contract",
    updatedBy: c.updated_by || "Project Team",
    updated: formatRelative(c.updated_at || c.created_at),
    sortDate: c.updated_at || c.created_at,
  }));
  const drawingFallbackRows = drawings.slice(0, 2).map((d, index) => ({
    id: `drw-${d.id || index}`,
    code: d.drawing_number || `DRW-${index + 1}`,
    type: "Drawing",
    description: d.title || d.drawing_title || d.drawing_set_name || "Drawing update",
    status: d.status || d.stage || "Active",
    statusTone: statusTone(d.status || d.stage),
    relatedTo: d.drawing_set_name || "Drawing Set",
    updatedBy: "Project Team",
    updated: formatRelative(d.updated_at || d.created_at),
    sortDate: d.updated_at || d.created_at,
  }));

  return [...drawingRows, ...rfiRows, ...submittalRows, ...coRows, ...drawingFallbackRows]
    .sort((a, b) => String(b.sortDate || "").localeCompare(String(a.sortDate || "")))
    .slice(0, 6);
}

function buildTeamActivity({ actionItems, scheduleTasks, drawingActivity, dailyLogs }) {
  const rows = [];
  for (const item of actionItems.slice(0, 5)) {
    const name = item.assigned_to || item.owner || "Project Team";
    rows.push({
      id: `action-${item.id}`,
      name,
      initials: initials(name),
      action: item.title || "Updated action item",
      when: formatRelative(item.updated_at || item.created_at || item.due_date),
      sortDate: item.updated_at || item.created_at || item.due_date,
    });
  }
  for (const task of scheduleTasks.slice(0, 4)) {
    const name = task.assigned_to || "Schedule Team";
    rows.push({
      id: `task-${task.id}`,
      name,
      initials: initials(name),
      action: task.task_name || "Updated schedule task",
      when: formatRelative(task.updated_at || task.start_date || task.end_date),
      sortDate: task.updated_at || task.start_date || task.end_date,
    });
  }
  for (const log of dailyLogs.slice(0, 3)) {
    const name = log.superintendent || log.created_by || "Field Team";
    rows.push({
      id: `log-${log.id}`,
      name,
      initials: initials(name),
      action: log.summary || "Filed daily report",
      when: formatRelative(log.updated_at || log.date || log.created_at),
      sortDate: log.updated_at || log.date || log.created_at,
    });
  }
  const drawingFeed = recentActivityFeed(drawingActivity, 2);
  for (const entry of drawingFeed) {
    rows.push({
      id: `drawing-activity-${entry.id}`,
      name: "Document Control",
      initials: "DC",
      action: entry.summary,
      when: formatRelative(entry.when),
      sortDate: entry.when,
    });
  }
  return rows
    .sort((a, b) => String(b.sortDate || "").localeCompare(String(a.sortDate || "")))
    .slice(0, 5);
}

function labelFromKind(kind) {
  if (kind === "approval_changed") return "Approved";
  if (kind === "revision_changed") return "Revision";
  if (kind === "stage_changed") return "In Progress";
  if (kind === "created") return "Open";
  return "Updated";
}

function toneFromKind(kind) {
  if (kind === "approval_changed") return "approved";
  if (kind === "revision_changed") return "waiting";
  if (kind === "stage_changed") return "progress";
  return "neutral";
}

function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("approved") || s.includes("released") || s.includes("complete") || s.includes("closed")) return "approved";
  if (s.includes("wait") || s.includes("review") || s.includes("pending")) return "waiting";
  if (s.includes("open") || s.includes("overdue") || s.includes("reject")) return "open";
  if (s.includes("progress") || s.includes("submitted")) return "progress";
  return "neutral";
}

function formatMoney(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function formatSignedPercent(value) {
  const n = Number(value) || 0;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function formatDate(value) {
  const iso = normalizeDate(value);
  if (!iso) return "TBD";
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatShortDate(value) {
  const iso = normalizeDate(value);
  if (!iso) return "TBD";
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function relativeDueLabel(value) {
  const iso = normalizeDate(value);
  if (!iso) return "TBD";
  const diff = daysFromToday(iso);
  if (diff < 0) return `${Math.abs(diff)}d late`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `In ${diff} days`;
}

function dueTone(value) {
  const diff = daysFromToday(value);
  if (diff < 0) return "danger";
  if (diff <= 3) return "warn";
  return "info";
}

function formatRelative(value) {
  const iso = value ? new Date(value) : null;
  if (!iso || Number.isNaN(iso.getTime())) return "TBD";
  const diffMs = Date.now() - iso.getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatShortDate(value);
}

function normalizeDate(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : raw;
}

function daysFromToday(value) {
  const iso = normalizeDate(value);
  if (!iso) return 9999;
  const today = new Date();
  const start = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const date = new Date(`${iso}T00:00:00Z`);
  return Math.round((date - start) / 86400000);
}

function isPast(value) {
  const iso = normalizeDate(value);
  return !!iso && daysFromToday(iso) < 0;
}

function initials(name) {
  const parts = String(name || "Project Team").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "PT";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
