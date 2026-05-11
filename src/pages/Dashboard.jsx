import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/ProjectContext";
import { useUserPrefs, refetchIntervalFromPref } from "@/hooks/useUserPrefs";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import PortfolioView from "../components/dashboard/PortfolioView";
import ProjectDashboard from "./dashboard/ProjectDashboard";

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
  const { data: allRFIs = [], isLoading: rfisLoading } = useQuery({
    queryKey: ["rfis"],
    queryFn: () => base44.entities.RFI.list(),
    refetchInterval: refetchMs,
  });
  const { data: allCOs = [] } = useQuery({
    queryKey: ["cos-all"],
    queryFn: () => base44.entities.ChangeOrder.list(),
  });
  const { data: allCodes = [] } = useQuery({
    queryKey: ["codes-all"],
    queryFn: () => base44.entities.CostCode.list(),
  });
  const { data: allWPs = [] } = useQuery({
    queryKey: ["work-packages"],
    queryFn: () => base44.entities.WorkPackage.list(),
    staleTime: 30000,
  });
  const { data: allDeliveries = [] } = useQuery({
    queryKey: ["deliveries-all"],
    queryFn: () => base44.entities.Delivery.list(),
    refetchInterval: refetchMs,
  });
  const { data: allActionItems = [] } = useQuery({
    queryKey: ["action-items-all"],
    queryFn: () => base44.entities.ActionItem.list(),
    refetchInterval: refetchMs,
  });
  const { data: allExpenses = [] } = useQuery({
    queryKey: ["expenses-all"],
    queryFn: () => base44.entities.Expense.list(),
  });
  // Portfolio timeline column needs schedule_tasks for every project.
  // Tiny payload — one row per task, a few date columns — so fetching
  // them globally is cheaper than per-project drilldown round-trips.
  const { data: allScheduleTasks = [] } = useQuery({
    queryKey: ["schedule-tasks-all"],
    queryFn: () => base44.entities.ScheduleTask.list("-start_date"),
    staleTime: 60 * 1000,
  });
  // Used by the Document Hub submittal pipeline + Drawings count tile.
  const { data: allSubmittals = [] } = useQuery({
    queryKey: ["submittals-all"],
    queryFn: () => base44.entities.Submittal.list(),
    staleTime: 30 * 1000,
  });
  const { data: allDrawings = [] } = useQuery({
    queryKey: ["drawings-all"],
    queryFn: () => base44.entities.Drawing.list(),
    staleTime: 30 * 1000,
  });
  // Cash-flow figures (total billed / collected / pending payment /
  // retention) on the Financial Controls section come from SOV items.
  const { data: allSovItems = [] } = useQuery({
    queryKey: ["sov-items-all"],
    queryFn: () => base44.entities.SOVItem.list(),
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
    queryKey: ["drawing-activity-recent"],
    queryFn: () =>
      base44.entities.DrawingActivity
        ? base44.entities.DrawingActivity.list("-created_at", 50)
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
    queryKey: ["daily-logs-all"],
    queryFn: () => base44.entities.DailyLog.list("-date"),
    staleTime: 60 * 1000,
  });
  const { data: allPhotos = [] } = useQuery({
    queryKey: ["photos-all"],
    queryFn: () => base44.entities.Photo.list("-taken_date"),
    staleTime: 60 * 1000,
  });
  const { data: allPunchlist = [] } = useQuery({
    queryKey: ["punchlist-all"],
    queryFn: () => base44.entities.PunchlistItem.list(),
    staleTime: 60 * 1000,
  });
  const { data: allInspections = [] } = useQuery({
    queryKey: ["inspections-all"],
    queryFn: () => base44.entities.Inspection.list("-inspection_date"),
    staleTime: 60 * 1000,
  });
  const { data: allSafetyIncidents = [] } = useQuery({
    queryKey: ["safety-all"],
    queryFn: () => base44.entities.SafetyIncident.list("-incident_date"),
    staleTime: 60 * 1000,
  });
  const { data: allQualityRecords = [] } = useQuery({
    queryKey: ["qc-records-all"],
    queryFn: () => base44.entities.QualityControlRecord.list("-test_date"),
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
        <PortfolioView
          projects={projects}
          allRFIs={allRFIs}
          allCOs={allCOs}
          allCodes={allCodes}
          allWPs={allWPs}
          allDeliveries={allDeliveries}
          allActionItems={allActionItems}
          allExpenses={allExpenses}
          allScheduleTasks={allScheduleTasks}
        />
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
