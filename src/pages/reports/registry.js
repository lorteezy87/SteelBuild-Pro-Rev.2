/**
 * Reports registry — single source of truth for the live reports.
 *
 * Each entry feeds:
 *   - the hub grid at /Reports
 *   - the nested route table at /Reports/:slug
 *   - the document title / breadcrumb
 *
 * Adding a new report means: drop a new module under `pages/reports/`,
 * import its default component here, and append a row to `REPORTS`.
 * No other plumbing changes required.
 */

import { lazyWithRetry } from "@/lib/lazyRetry";

const Lazy = (loader) => lazyWithRetry(loader);

/** @typedef {{
 *    slug: string,
 *    title: string,
 *    summary: string,
 *    category: 'Portfolio' | 'Risk' | 'Schedule' | 'Cost' | 'Team',
 *    component: any,
 * }} ReportEntry
 */

/** @type {ReportEntry[]} */
export const REPORTS = [
  // ── Portfolio / Projects ───────────────────────────────────────────
  {
    slug: "portfolio-overview",
    title: "Portfolio Overview",
    summary: "Cross-portfolio KPIs, status matrix, and weekly rollup. The flagship dashboard.",
    category: "Portfolio",
    component: Lazy(() => import("./PortfolioOverview.jsx")),
  },
  {
    slug: "portfolio-tracker",
    title: "Portfolio Tracker",
    summary: "All projects in one table: client, phase, health, schedule, value, committed, % complete.",
    category: "Portfolio",
    component: Lazy(() => import("./PortfolioTracker.jsx")),
  },
  {
    slug: "project-status",
    title: "Project Status",
    summary: "Same projects, financial lens: revised value, projected final cost, projected margin.",
    category: "Portfolio",
    component: Lazy(() => import("./ProjectStatus.jsx")),
  },
  {
    slug: "project-details",
    title: "Project Details",
    summary: "Pick a project and drill into every entity: RFIs, COs, WPs, deliveries, expenses, actions.",
    category: "Portfolio",
    component: Lazy(() => import("./ProjectDetails.jsx")),
  },
  {
    slug: "projects",
    title: "Projects",
    summary: "Flat sortable list of every project. Click a row to drill in.",
    category: "Portfolio",
    component: Lazy(() => import("./Projects.jsx")),
  },
  {
    slug: "projects-health",
    title: "Projects Health",
    summary: "Projects bucketed by health_status traffic-light: On Track / Watch / At Risk / On Hold.",
    category: "Portfolio",
    component: Lazy(() => import("./ProjectsHealth.jsx")),
  },
  {
    slug: "rag",
    title: "RAG Status",
    summary: "Executive-style traffic-light grid of every project, banded red / amber / green.",
    category: "Portfolio",
    component: Lazy(() => import("./RAG.jsx")),
  },

  // ── Risk ───────────────────────────────────────────────────────────
  // Four reports backed by the `risks` table (migration 064). All four
  // share the same severity helpers (severity.js) and the RiskFormModal
  // for create/edit so the column meaning stays in lockstep with the
  // DB GENERATED column.
  {
    slug: "risks",
    title: "Risks",
    summary: "Flat sortable list of every risk on the project. Click a row to edit; “New Risk” to add.",
    category: "Risk",
    component: Lazy(() => import("./Risks.jsx")),
  },
  {
    slug: "risks-dashboard",
    title: "Risks Dashboard",
    summary: "KPI strip, severity donut, category bar, and the top 5 open risks at a glance.",
    category: "Risk",
    component: Lazy(() => import("./RisksDashboard.jsx")),
  },
  {
    slug: "risk-status",
    title: "Risk Status",
    summary: "Classic 5×5 probability × impact heat map. Click a cell to drill into the risks it contains.",
    category: "Risk",
    component: Lazy(() => import("./RiskStatus.jsx")),
  },
  {
    slug: "top-risks",
    title: "Top Risks",
    summary: "Top 10 risks by score, rendered as severity-banded cards for the weekly review.",
    category: "Risk",
    component: Lazy(() => import("./TopRisks.jsx")),
  },

  // ── Schedule / Roadmap ────────────────────────────────────────────
  {
    slug: "project-status-gantt",
    title: "Project Status (Gantt)",
    summary: "Timeline view: one bar per project (start → target completion), colored by health.",
    category: "Schedule",
    component: Lazy(() => import("./ProjectStatusGantt.jsx")),
  },
  {
    slug: "upcoming-milestones",
    title: "Upcoming Milestones",
    summary: "Schedule milestones starting in the next 60 days, grouped by project.",
    category: "Schedule",
    component: Lazy(() => import("./UpcomingMilestones.jsx")),
  },
  {
    slug: "tasks-due-this-week",
    title: "Tasks Due This Week",
    summary: "Open schedule tasks ending in the next 7 days, sorted by due date.",
    category: "Schedule",
    component: Lazy(() => import("./TasksDueThisWeek.jsx")),
  },
  {
    slug: "schedule",
    title: "Schedule",
    summary: "Flat sortable table of every schedule task across every project.",
    category: "Schedule",
    component: Lazy(() => import("./ScheduleReport.jsx")),
  },
  {
    slug: "project-milestones",
    title: "Project Milestones",
    summary: "All schedule milestones across the portfolio, grouped by project.",
    category: "Schedule",
    component: Lazy(() => import("./ProjectMilestones.jsx")),
  },
  {
    slug: "tasks",
    title: "Tasks",
    summary: "Every schedule task across the portfolio, with phase / type / status filters.",
    category: "Schedule",
    component: Lazy(() => import("./Tasks.jsx")),
  },
  {
    slug: "tasks-completed",
    title: "Tasks Completed",
    summary: "Schedule tasks marked complete, filtered by recency (30 / 60 / 90 / all-time).",
    category: "Schedule",
    component: Lazy(() => import("./TasksCompleted.jsx")),
  },
  {
    slug: "tasks-status",
    title: "Tasks Status",
    summary: "Status counts across the portfolio + a stacked bar chart of status by phase.",
    category: "Schedule",
    component: Lazy(() => import("./TasksStatus.jsx")),
  },
  {
    slug: "task-board",
    title: "Task Board",
    summary: "Kanban view of every schedule task: Not Started / In Progress / Complete / Delayed.",
    category: "Schedule",
    component: Lazy(() => import("./TaskBoard.jsx")),
  },
  {
    slug: "timeline",
    title: "Timeline",
    summary: "Phase-swimlane timeline of schedule tasks across time. Read-only.",
    category: "Schedule",
    component: Lazy(() => import("./Timeline.jsx")),
  },
  {
    slug: "roadmap",
    title: "Roadmap",
    summary: "Per-project phase swim lanes. Each phase renders as a colored band over its date range.",
    category: "Schedule",
    component: Lazy(() => import("./Roadmap.jsx")),
  },
  {
    slug: "ppm-roadmap",
    title: "PPM Roadmap",
    summary: "Portfolio timeline. Each project = one band on a shared timeline, colored by current phase.",
    category: "Schedule",
    component: Lazy(() => import("./PPMRoadmap.jsx")),
  },

  // ── Cost ──
  {
    slug: "profit",
    title: "Profit",
    summary: "Per project: original, approved COs, revised, projected final, projected margin.",
    category: "Cost",
    component: Lazy(() => import("./Profit.jsx")),
  },
  {
    slug: "revenue-dashboard",
    title: "Revenue Dashboard",
    summary: "Billed, collected, pending, retention. Donut splits by client and contract type.",
    category: "Cost",
    component: Lazy(() => import("./RevenueDashboard.jsx")),
  },
  {
    slug: "revenue",
    title: "Revenue",
    summary: "Billed revenue by month, last 12 months. Line chart + table.",
    category: "Cost",
    component: Lazy(() => import("./Revenue.jsx")),
  },
  {
    slug: "revenue-by-client",
    title: "Revenue by Client",
    summary: "Total billed grouped by client. Bar chart and sortable table.",
    category: "Cost",
    component: Lazy(() => import("./RevenueByClient.jsx")),
  },
  {
    slug: "revenue-by-type",
    title: "Revenue by Type",
    summary: "Total billed grouped by contract_type. Bar chart and sortable table.",
    category: "Cost",
    component: Lazy(() => import("./RevenueByType.jsx")),
  },
  {
    slug: "revenue-forecast",
    title: "Revenue Forecast",
    summary: "Last 12 months historical + 6-month forward forecast off trailing-3-month burn.",
    category: "Cost",
    component: Lazy(() => import("./RevenueForecast.jsx")),
  },
  {
    slug: "unbilled-revenue",
    title: "Unbilled Revenue",
    summary: "Per-project gap: contract value − billed-to-date, plus pending SOV line items.",
    category: "Cost",
    component: Lazy(() => import("./UnbilledRevenue.jsx")),
  },
  {
    slug: "weekly-cost-categories",
    title: "Weekly Cost Categories",
    summary: "Expenses grouped by ISO week × cost code. Stacked bar chart + cross-tab table, last 12 weeks.",
    category: "Cost",
    component: Lazy(() => import("./WeeklyCostCategories.jsx")),
  },

  // ── Team / Workflow ──
  {
    slug: "team-dashboard",
    title: "Team Dashboard",
    summary: "Open work per assignee across schedule tasks, RFIs, and action items.",
    category: "Team",
    component: Lazy(() => import("./TeamDashboard.jsx")),
  },
  {
    slug: "whos-doing-what",
    title: "Who's Doing What",
    summary: "In-progress schedule tasks grouped by assignee. One card per person.",
    category: "Team",
    component: Lazy(() => import("./WhosDoingWhat.jsx")),
  },
  {
    slug: "workload",
    title: "Workload",
    summary: "Open task counts per assignee. Bar chart + sortable table for spotting overload.",
    category: "Team",
    component: Lazy(() => import("./Workload.jsx")),
  },
  {
    slug: "weekly-status-reports",
    title: "Weekly Status Reports",
    summary: "Weekly drawing-activity roll-up grouped by event_type, with week-on-week deltas.",
    category: "Team",
    component: Lazy(() => import("./WeeklyStatusReports.jsx")),
  },
  {
    slug: "upcoming-key-activities",
    title: "Upcoming Key Activities",
    summary: "Schedule tasks starting in the next 14 days, grouped by project. Broader than milestones.",
    category: "Team",
    component: Lazy(() => import("./UpcomingKeyActivities.jsx")),
  },
];

export const REPORTS_BY_SLUG = Object.fromEntries(
  REPORTS.map((r) => [r.slug, r])
);

/** Categories for the hub grouping, in display order. */
export const REPORT_CATEGORIES = ["Portfolio", "Risk", "Schedule", "Cost", "Team"];
