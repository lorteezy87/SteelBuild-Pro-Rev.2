import React, { Suspense, useEffect, useMemo } from "react";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/ProjectContext";
import { useUserPrefs, refetchIntervalFromPref, DASHBOARD_KPI_IDS } from "@/hooks/useUserPrefs";
import { findBlockingRfis } from "@/lib/fabReleaseGate";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import ProjectDashboard from "./dashboard/ProjectDashboard";
import DashboardHeader from "./dashboard/DashboardHeader";

// KPI presentation specs — value is filled per-scope below. Ids match
// DASHBOARD_KPI_IDS so Settings (visible_kpis / kpi_order) drive this strip.
const KPI_SPECS = {
  open_rfis:       { label: "Open RFIs",          color: "var(--accent)" },
  pending_cos:     { label: "Pending COs",        color: "var(--status-warning)" },
  contract_value:  { label: "Contract Value",     color: "var(--accent)" },
  work_packages:   { label: "Work Packages",      color: "#0EA5E9" },
  deliveries:      { label: "Upcoming Deliveries",color: "var(--phase-delivery, #F59E0B)" },
  overdue_items:   { label: "Overdue Items",      color: "var(--status-error)" },
  open_submittals: { label: "Open Submittals",    color: "var(--accent)" },
  expenses:        { label: "Expenses",           color: "var(--status-warning)" },
  rfis_blocking_fab: { label: "RFIs Blocking Fab", color: "var(--status-error)" },
};

const RFI_OPEN_EXCLUDE = ["Closed", "Void", "Cancelled", "Resolved", "Answered"];
const CO_CLOSED = ["Approved", "Approved as Noted", "Rejected", "Void", "Executed"];
const DEL_DONE = ["Delivered", "Complete", "Completed", "Received"];
const SUB_TERMINAL = ["Approved", "Approved as Noted", "Released for Fabrication", "Void"];
const AI_DONE = ["Complete", "Completed", "Done", "Closed"];

function fmtMoney(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

const PortfolioView = lazyWithRetry(() => import("../components/dashboard/PortfolioView"));

/**
 * Dashboard — portfolio-or-single-project orchestrator.
 *
 * Routes the user to one of two views based on whether a project is
 * currently "active" (selected in the project switcher):
 *   - no project  → `<PortfolioView>` (all projects summary)
 *   - project set → `<ProjectDashboard>` (the new industrial-OS
 *                    single-project dashboard)
 *
 * `ProjectDashboard` replaced the legacy `DrilldownView` component as
 * part of the Claude Design redesign rollout. The old component still
 * lives at `src/components/dashboard/DrilldownView.jsx` for reference
 * but is no longer rendered.
 */
/**
 * Shown on the dashboard for a brand-new / empty workspace (0 projects) — a
 * clear path into the first-run wizard rather than an empty portfolio.
 */
function FirstProjectWelcome({ onStart }) {
  return (
    <div className="sb-dashboard-reference-page" style={{ display: "grid", placeItems: "center", minHeight: "62vh" }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--accent)", fontWeight: 800, marginBottom: 14 }}>
          Welcome to SteelBuild Pro
        </div>
        <h1 style={{ fontFamily: "'Space Grotesk', var(--font-display)", fontSize: 26, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Set up your first project
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
          Create a project to start tracking drawings, submittals, RFIs, fabrication, and field progress. Start from a template or import a starter spreadsheet — it takes about a minute.
        </p>
        <button type="button" className="sbd-btn sbd-btn-primary" onClick={onStart} style={{ minHeight: 44, padding: "0 22px", fontSize: 14, justifyContent: "center" }}>
          Set up your first project →
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { activeProject, setActiveProject } = useProjectContext();
  const pid = activeProject?.id;
  const projectScope = pid || "portfolio";
  const listForDashboard = (entity, sortBy) =>
    pid ? entity.filter({ project_id: pid }, sortBy) : entity.list(sortBy);

  // Honour the Settings → Dashboard → "Auto-Refresh Live Data" pref
  // on the most-volatile queries. The pref is saved per-user as
  // auto_refresh_secs (0/30/60/300/900); 0 disables. We keep the
  // existing staleTime so when the pref is off, react-query still
  // dedupes during the short window after a mutation.
  const prefs = useUserPrefs();
  const { auto_refresh_secs } = prefs;
  const refetchMs = refetchIntervalFromPref(auto_refresh_secs);

  /* ── Portfolio-wide queries (always loaded) ── */
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });
  // Portfolio rollups must exclude on-hold projects (and their child entity
  // contributions); on-hold projects are visible only on the /Projects page.
  // `liveProjectIds` is the active (non-on-hold) id set used by every
  // portfolio aggregation downstream (scopePortfolioRows + PortfolioView).
  const portfolioProjects = useMemo(() => projects.filter((p) => !p.on_hold), [projects]);
  const liveProjectIds = useMemo(() => new Set(portfolioProjects.map((p) => p.id).filter(Boolean)), [portfolioProjects]);
  const activeProjectIsLive = !pid || projectsLoading || liveProjectIds.has(pid);

  useEffect(() => {
    if (pid && !projectsLoading && !activeProjectIsLive) {
      setActiveProject(null);
    }
  }, [activeProjectIsLive, pid, projectsLoading, setActiveProject]);

  const scopePortfolioRows = (rows) =>
    pid ? rows : rows.filter((row) => row?.project_id && liveProjectIds.has(row.project_id));

  const { data: allRFIs = [], isLoading: rfisLoading } = useQuery({
    queryKey: ["rfis-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.RFI),
    refetchInterval: refetchMs,
  });
  const { data: allCOs = [] } = useQuery({
    queryKey: ["cos-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.ChangeOrder),
  });
  const { data: allCodes = [] } = useQuery({
    queryKey: ["codes-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.CostCode),
  });
  const { data: allWPs = [] } = useQuery({
    queryKey: ["work-packages-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.WorkPackage),
    staleTime: 30000,
  });
  const { data: allDeliveries = [] } = useQuery({
    queryKey: ["deliveries-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.Delivery),
    refetchInterval: refetchMs,
  });
  const { data: allActionItems = [] } = useQuery({
    queryKey: ["action-items-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.ActionItem),
    refetchInterval: refetchMs,
  });
  const { data: allExpenses = [] } = useQuery({
    queryKey: ["expenses-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.Expense),
  });
  // Portfolio timeline column needs schedule_tasks for every project.
  // Tiny payload — one row per task, a few date columns — so fetching
  // them globally is cheaper than per-project drilldown round-trips.
  const { data: allScheduleTasks = [] } = useQuery({
    queryKey: ["schedule-tasks-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.ScheduleTask, "-start_date"),
    staleTime: 60 * 1000,
  });
  // Used by the Document Hub submittal pipeline + Drawings count tile.
  const { data: allSubmittals = [] } = useQuery({
    queryKey: ["submittals-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.Submittal),
    staleTime: 30 * 1000,
  });
  const { data: allDrawings = [] } = useQuery({
    queryKey: ["drawings-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.Drawing),
    staleTime: 30 * 1000,
  });
  // Cash-flow figures (total billed / collected / pending payment /
  // retention) on the Financial Controls section come from SOV items.
  const { data: allSovItems = [] } = useQuery({
    queryKey: ["sov-items-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.SOVItem),
    staleTime: 60 * 1000,
  });
  // Recent Activity feed pulls from drawing_activity (the only
  // activity surface that's actually populated — the generic
  // `activities` table is empty everywhere). Pull the latest 50
  // events globally and project-scope them in the section.
  // Budget-hour rows live per-project; fetch only when a project is active
  // so portfolio mode doesn't pay for a query that has no consumer.
  const { data: budgetHourItems = [] } = useQuery({
    queryKey: ["budget-hour-items", pid],
    queryFn: () => (pid ? entities.BudgetHourItem.filter({ project_id: pid }, "sort_order") : []),
    enabled: !!pid,
    staleTime: 30 * 1000,
  });
  const { data: allDrawingActivity = [] } = useQuery({
    queryKey: ["drawing-activity-recent", projectScope],
    queryFn: () =>
      entities.DrawingActivity
        ? pid
          ? entities.DrawingActivity.filter({ project_id: pid }, "-created_at", 50)
          : entities.DrawingActivity.list("-created_at", 50)
        : Promise.resolve([]),
    staleTime: 30 * 1000,
    refetchInterval: refetchMs,
  });
  // ── Field activity rollup (added with the Field overhaul) ──
  // Each field surface (Daily Logs / Photos / Punchlist / Inspections /
  // Safety / QC) feeds the new <FieldActivitySection> on the project
  // dashboard AND the /Field hub. Pull globally and slice per-project
  // so we don't duplicate fetches across the two consumers.
  const { data: allDailyLogs = [] } = useQuery({
    queryKey: ["daily-logs-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.DailyLog, "-date"),
    staleTime: 60 * 1000,
  });
  const { data: allPhotos = [] } = useQuery({
    queryKey: ["photos-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.Photo, "-taken_date"),
    staleTime: 60 * 1000,
  });
  const { data: allPunchlist = [] } = useQuery({
    queryKey: ["punchlist-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.PunchlistItem),
    staleTime: 60 * 1000,
  });
  const { data: allInspections = [] } = useQuery({
    queryKey: ["inspections-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.Inspection, "-inspection_date"),
    staleTime: 60 * 1000,
  });
  const { data: allSafetyIncidents = [] } = useQuery({
    queryKey: ["safety-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.SafetyIncident, "-incident_date"),
    staleTime: 60 * 1000,
  });
  const { data: allQualityRecords = [] } = useQuery({
    queryKey: ["qc-records-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.QualityControlRecord, "-test_date"),
    staleTime: 60 * 1000,
  });

  /* ── Project-scoped slices (derived from global data to avoid dupe queries) ── */
  const rfis       = useMemo(() => (pid ? allRFIs.filter((r)       => r.project_id === pid) : []), [allRFIs, pid]);
  const cos        = useMemo(() => (pid ? allCOs.filter((c)        => c.project_id === pid) : []), [allCOs, pid]);
  const codes      = useMemo(() => (pid ? allCodes.filter((c)      => c.project_id === pid) : []), [allCodes, pid]);
  const wps        = useMemo(() => (pid ? allWPs.filter((w)        => w.project_id === pid) : []), [allWPs, pid]);
  const deliveries = useMemo(() => (pid ? allDeliveries.filter((d) => d.project_id === pid) : []), [allDeliveries, pid]);
  const expenses   = useMemo(() => (pid ? allExpenses.filter((e)   => e.project_id === pid) : []), [allExpenses, pid]);
  const actionItems = useMemo(
    () => (pid ? allActionItems.filter((a) => a.project_id === pid) : []),
    [allActionItems, pid]
  );
  const submittals    = useMemo(() => (pid ? allSubmittals.filter((s) => s.project_id === pid) : []), [allSubmittals, pid]);
  const drawings      = useMemo(() => (pid ? allDrawings.filter((d) => d.project_id === pid && !d.is_deleted) : []), [allDrawings, pid]);
  const sovItems      = useMemo(() => (pid ? allSovItems.filter((s) => s.project_id === pid) : []), [allSovItems, pid]);
  const scheduleTasks = useMemo(
    () => (pid ? allScheduleTasks.filter((t) => t.project_id === pid) : []),
    [allScheduleTasks, pid],
  );
  const drawingActivity = useMemo(
    () => (pid ? allDrawingActivity.filter((a) => a.project_id === pid) : []),
    [allDrawingActivity, pid],
  );
  const dailyLogs        = useMemo(() => (pid ? allDailyLogs.filter((r) => r.project_id === pid)        : []), [allDailyLogs, pid]);
  const photosForProject = useMemo(() => (pid ? allPhotos.filter((r) => r.project_id === pid)           : []), [allPhotos, pid]);
  const punchlistItems   = useMemo(() => (pid ? allPunchlist.filter((r) => r.project_id === pid)        : []), [allPunchlist, pid]);
  const inspections      = useMemo(() => (pid ? allInspections.filter((r) => r.project_id === pid)      : []), [allInspections, pid]);
  const safetyIncidents  = useMemo(() => (pid ? allSafetyIncidents.filter((r) => r.project_id === pid)  : []), [allSafetyIncidents, pid]);
  const qualityRecords   = useMemo(() => (pid ? allQualityRecords.filter((r) => r.project_id === pid)   : []), [allQualityRecords, pid]);

  const isLoading = projectsLoading || rfisLoading;

  // ── Settings → Dashboard header (welcome banner + configurable KPI strip) ──
  // Real metrics computed from the data already loaded above, scoped to the
  // active project or the portfolio. visible_kpis / kpi_order / show_welcome /
  // dashboard_density all come from Settings → Dashboard.
  const kpiList = useMemo(() => {
    const scoped = (all) => all.filter((r) => r?.project_id && liveProjectIds.has(r.project_id));
    const rfiArr = pid ? rfis : scoped(allRFIs);
    const coArr  = pid ? cos : scoped(allCOs);
    const wpArr  = pid ? wps : scoped(allWPs);
    const delArr = pid ? deliveries : scoped(allDeliveries);
    const aiArr  = pid ? actionItems : scoped(allActionItems);
    const subArr = pid ? submittals : scoped(allSubmittals);
    const expArr = pid ? expenses : scoped(allExpenses);
    const contractVal = pid
      ? Number(activeProject?.original_contract_value) || 0
      : portfolioProjects.reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const values = {
      open_rfis:       rfiArr.filter((r) => !RFI_OPEN_EXCLUDE.includes(r.status)).length,
      pending_cos:     coArr.filter((c) => !CO_CLOSED.includes(c.status)).length,
      contract_value:  fmtMoney(contractVal),
      work_packages:   wpArr.length,
      deliveries:      delArr.filter((d) => !DEL_DONE.includes(d.status)).length,
      overdue_items:   aiArr.filter((a) => a.due_date && new Date(a.due_date) < today && !AI_DONE.includes(a.status)).length,
      open_submittals: subArr.filter((s) => !SUB_TERMINAL.includes(s.status)).length,
      expenses:        fmtMoney(expArr.reduce((s, e) => s + (Number(e.amount) || 0), 0)),
      // Open RFIs linked to sheets that would block a Fab Release export (same
      // engine as the gate on ExportFabReleaseModal).
      rfis_blocking_fab: findBlockingRfis({ drawings: pid ? drawings : scoped(allDrawings), rfis: rfiArr }).length,
    };

    const order = (prefs.kpi_order && prefs.kpi_order.length ? prefs.kpi_order : DASHBOARD_KPI_IDS);
    const orderedIds = [...order, ...DASHBOARD_KPI_IDS.filter((id) => !order.includes(id))];
    const visible = new Set(prefs.visible_kpis && prefs.visible_kpis.length ? prefs.visible_kpis : DASHBOARD_KPI_IDS);
    return orderedIds
      .filter((id) => visible.has(id) && KPI_SPECS[id])
      .map((id) => ({ id, label: KPI_SPECS[id].label, color: KPI_SPECS[id].color, value: values[id] }));
  }, [pid, rfis, cos, wps, deliveries, actionItems, submittals, expenses, activeProject,
      allRFIs, allCOs, allWPs, allDeliveries, allActionItems, allSubmittals, allExpenses,
      drawings, allDrawings,
      portfolioProjects, liveProjectIds, prefs.kpi_order, prefs.visible_kpis]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const overdueCount = kpiList.find((k) => k.id === "overdue_items")?.value || 0;
  const openRfiCount = kpiList.find((k) => k.id === "open_rfis")?.value || 0;
  const scopeCount = pid ? 1 : portfolioProjects.length;
  const summary = `${overdueCount} overdue · ${openRfiCount} open RFIs · ${scopeCount} ${pid ? "project" : `project${scopeCount !== 1 ? "s" : ""}`}`;

  const dashboardHeader = (
    <DashboardHeader
      showWelcome={prefs.show_welcome}
      greeting={greeting}
      dateLabel={dateLabel}
      summary={summary}
      kpis={kpiList}
      density={prefs.dashboard_density}
      variant="dashboard"
    />
  );
  // Density also drives the gap between the header and the dashboard body.
  const bodyGap = prefs.dashboard_density === "compact" ? 10 : prefs.dashboard_density === "comfortable" ? 18 : 14;
  const showHeader = prefs.show_welcome || kpiList.length > 0;

  if (isLoading) {
    return (
      <div className="sb-dashboard-reference-page">
        <LoadingSkeleton variant="page" />
      </div>
    );
  }

  if (!pid) {
    // Brand-new / empty workspace → guide into the first-run wizard instead of an
    // empty portfolio. (Creating a workspace already routes to the wizard; this
    // catches a return visit before setup is finished.) Guard on a settled,
    // non-loading empty result so an existing user mid-load is never shown this.
    if (!projectsLoading && projects.length === 0) {
      return <FirstProjectWelcome onStart={() => navigate("/Onboarding")} />;
    }
    return (
      <div className="sb-dashboard-reference-page sb-dashboard-theme" data-dashboard-density={prefs.dashboard_density} style={{ display: "flex", flexDirection: "column", gap: bodyGap }}>
        {showHeader && dashboardHeader}
        <ErrorBoundary label="Portfolio Dashboard">
          <Suspense fallback={<LoadingSkeleton variant="page" />}>
            <PortfolioView
              projects={portfolioProjects}
              allRFIs={scopePortfolioRows(allRFIs)}
              allCOs={scopePortfolioRows(allCOs)}
              allCodes={scopePortfolioRows(allCodes)}
              allWPs={scopePortfolioRows(allWPs)}
              allDeliveries={scopePortfolioRows(allDeliveries)}
              allActionItems={scopePortfolioRows(allActionItems)}
              allExpenses={scopePortfolioRows(allExpenses)}
              allScheduleTasks={scopePortfolioRows(allScheduleTasks)}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div className="sb-dashboard-reference-page sb-dashboard-theme" data-dashboard-density={prefs.dashboard_density} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <ErrorBoundary label="Project Dashboard">
        <ProjectDashboard
        project={activeProject}
        rfis={rfis}
        cos={cos}
        codes={codes}
        wps={wps}
        deliveries={deliveries}
        actionItems={actionItems}
        expenses={expenses}
        submittals={submittals}
        drawings={drawings}
        sovItems={sovItems}
        scheduleTasks={scheduleTasks}
        drawingActivity={drawingActivity}
        budgetHourItems={budgetHourItems}
        dailyLogs={dailyLogs}
        photos={photosForProject}
        punchlistItems={punchlistItems}
        inspections={inspections}
        safetyIncidents={safetyIncidents}
        qualityRecords={qualityRecords}
        onClearProject={() => setActiveProject(null)}
        onNavigate={(target, opts = {}) => {
          // The 4-section dashboard fires onNavigate for every clickable
          // surface (pipeline cells, RFI rows, quick-action buttons,
          // etc.). The 2nd arg can carry `{ create: true }` so the
          // destination page auto-opens its create modal via the
          // useAutoOpenCreate hook (?new=1 on the URL).
          const paths = {
            rfis:            "/RFIs",
            submittals:      "/Submittals",
            "work-packages": "/WorkPackages",
            deliveries:      "/Deliveries",
            "change-orders": "/ChangeOrders",
            "field-reports": "/DailyLogs",
            schedule:        "/Schedule",
            "fab-release":   "/FabRelease",
            "budget-hours":  "/BudgetHours",
            procurement:     "/Procurement",
            // Field overhaul (FieldActivitySection + Field hub deep links)
            field:           "/Field",
            "daily-logs":    "/DailyLogs",
            photos:          "/Photos",
            punchlist:       "/Punchlist",
            inspections:     "/Inspections",
            safety:          "/Safety",
            "quality-control": "/QualityControl",
          };
          const path = paths[target];
          if (!path) return;
          // `opts.stage` lets the WP pipeline cells deep-link into
          // FabRelease pre-filtered by stage (e.g. ?stage=in_fabrication).
          // `opts.status` does the same for the Procurement chevron strip.
          // `opts.create` auto-opens the create modal via useAutoOpenCreate.
          const params = [];
          if (opts.create) params.push("new=1");
          if (opts.stage) params.push(`stage=${encodeURIComponent(opts.stage)}`);
          if (opts.status) params.push(`status=${encodeURIComponent(opts.status)}`);
          if (opts.view) params.push(`view=${encodeURIComponent(opts.view)}`);
          navigate(params.length ? `${path}?${params.join("&")}` : path);
        }}
      />
      </ErrorBoundary>
    </div>
  );
}
