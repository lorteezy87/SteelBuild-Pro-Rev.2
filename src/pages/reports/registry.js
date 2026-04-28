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
 *    category: 'Portfolio' | 'Risk' | 'Schedule' | 'Cost',
 *    component: any,
 * }} ReportEntry
 */

/** @type {ReportEntry[]} */
export const REPORTS = [
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

  // ── Schedule ──
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
];

export const REPORTS_BY_SLUG = Object.fromEntries(
  REPORTS.map((r) => [r.slug, r])
);

/** Categories for the hub grouping, in display order. */
export const REPORT_CATEGORIES = ["Portfolio", "Risk", "Schedule", "Cost"];
