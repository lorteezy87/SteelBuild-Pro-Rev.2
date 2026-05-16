import React, { Suspense, lazy, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/ProjectContext";
import { useUserPrefs, refetchIntervalFromPref } from "@/hooks/useUserPrefs";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import ProjectDashboard from "./dashboard/ProjectDashboard";

const PortfolioView = lazy(() => import("../components/dashboard/PortfolioView"));

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
  const { auto_refresh_secs } = useUserPrefs();
  const refetchMs = refetchIntervalFromPref(auto_refresh_secs);

  /* ── Portfolio-wide queries (always loaded) ── */
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });
  const liveProjectIds = useMemo(() => new Set(projects.map((p) => p.id).filter(Boolean)), [projects]);
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
    queryFn: () => listForDashboard(base44.entities.RFI),
    refetchInterval: refetchMs,
  });
  const { data: allCOs = [] } = useQuery({
    queryKey: ["cos-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.ChangeOrder),
  });
  const { data: allCodes = [] } = useQuery({
    queryKey: ["codes-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.CostCode),
  });
  const { data: allWPs = [] } = useQuery({
    queryKey: ["work-packages-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.WorkPackage),
    staleTime: 30000,
  });
  const { data: allDeliveries = [] } = useQuery({
    queryKey: ["deliveries-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.Delivery),
    refetchInterval: refetchMs,
  });
  const { data: allActionItems = [] } = useQuery({
    queryKey: ["action-items-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.ActionItem),
    refetchInterval: refetchMs,
  });
  const { data: allExpenses = [] } = useQuery({
    queryKey: ["expenses-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.Expense),
  });
  // Portfolio timeline column needs schedule_tasks for every project.
  // Tiny payload — one row per task, a few date columns — so fetching
  // them globally is cheaper than per-project drilldown round-trips.
  const { data: allScheduleTasks = [] } = useQuery({
    queryKey: ["schedule-tasks-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.ScheduleTask, "-start_date"),
    staleTime: 60 * 1000,
  });
  // Used by the Document Hub submittal pipeline + Drawings count tile.
  const { data: allSubmittals = [] } = useQuery({
    queryKey: ["submittals-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.Submittal),
    staleTime: 30 * 1000,
  });
  const { data: allDrawings = [] } = useQuery({
    queryKey: ["drawings-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.Drawing),
    staleTime: 30 * 1000,
  });
  // Cash-flow figures (total billed / collected / pending payment /
  // retention) on the Financial Controls section come from SOV items.
  const { data: allSovItems = [] } = useQuery({
    queryKey: ["sov-items-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.SOVItem),
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
    queryFn: () => (pid ? base44.entities.BudgetHourItem.filter({ project_id: pid }, "sort_order") : []),
    enabled: !!pid,
    staleTime: 30 * 1000,
  });
  const { data: allDrawingActivity = [] } = useQuery({
    queryKey: ["drawing-activity-recent", projectScope],
    queryFn: () =>
      base44.entities.DrawingActivity
        ? pid
          ? base44.entities.DrawingActivity.filter({ project_id: pid }, "-created_at", 50)
          : base44.entities.DrawingActivity.list("-created_at", 50)
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
    queryFn: () => listForDashboard(base44.entities.DailyLog, "-date"),
    staleTime: 60 * 1000,
  });
  const { data: allPhotos = [] } = useQuery({
    queryKey: ["photos-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.Photo, "-taken_date"),
    staleTime: 60 * 1000,
  });
  const { data: allPunchlist = [] } = useQuery({
    queryKey: ["punchlist-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.PunchlistItem),
    staleTime: 60 * 1000,
  });
  const { data: allInspections = [] } = useQuery({
    queryKey: ["inspections-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.Inspection, "-inspection_date"),
    staleTime: 60 * 1000,
  });
  const { data: allSafetyIncidents = [] } = useQuery({
    queryKey: ["safety-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.SafetyIncident, "-incident_date"),
    staleTime: 60 * 1000,
  });
  const { data: allQualityRecords = [] } = useQuery({
    queryKey: ["qc-records-dashboard", projectScope],
    queryFn: () => listForDashboard(base44.entities.QualityControlRecord, "-test_date"),
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

  if (isLoading) {
    return <LoadingSkeleton variant="page" />;
  }

  if (!pid) {
    return (
      <ErrorBoundary label="Portfolio Dashboard">
        <Suspense fallback={<LoadingSkeleton variant="page" />}>
          <PortfolioView
            projects={projects}
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
    );
  }

  return (
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
  );
}
