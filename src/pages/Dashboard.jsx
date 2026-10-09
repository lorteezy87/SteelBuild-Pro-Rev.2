import { todayLocalISO } from "@/lib/dateMath";
import { resolveDashboardNavigation } from "./dashboardCC/dashboardNavigation";
import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/ProjectContext";
import { useAuth } from "@/lib/AuthContext";
import { useOrg } from "@/components/shared/OrgContext";
import { projectsInWorkspace, readProjectRows } from "@/lib/portfolioScope";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { useUserPrefs, refetchIntervalFromPref } from "@/hooks/useUserPrefs";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import GettingStartedChecklist from "@/components/dashboard/GettingStartedChecklist";
// Canonical control-center loading uses the same query set for all project views.
const DashboardControlCenter = lazyWithRetry(() => import("./dashboardCC/DashboardControlCenter"));
const PortfolioControlCenter = lazyWithRetry(() => import("./portfolio/PortfolioControlCenter"));

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
          Create a project to start tracking drawings, submittals, RFIs, fabrication, and field progress. Start from a template or import a starter spreadsheet - it takes about a minute.
        </p>
        <button type="button" className="sbd-btn sbd-btn-primary" onClick={onStart} style={{ minHeight: 44, padding: "0 22px", fontSize: 14, justifyContent: "center" }}>
          Set up your first project
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { activeProject, setActiveProject } = useProjectContext();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const pid = activeProject?.id;
  const [portfolioSearch, setPortfolioSearch] = useState("");
  const [portfolioHealthFilter, setPortfolioHealthFilter] = useState("All");
  const projectScope = pid || "portfolio";

  // Honour the Settings → Dashboard → "Auto-Refresh Live Data" pref
  // on the most-volatile queries. The pref is saved per-user as
  // auto_refresh_secs (0/30/60/300/900); 0 disables. We keep the
  // existing staleTime so when the pref is off, react-query still
  // dedupes during the short window after a mutation.
  const { auto_refresh_secs } = useUserPrefs();
  const refetchMs = refetchIntervalFromPref(auto_refresh_secs);

  /* ── Portfolio-wide queries (always loaded) ── */
  const projectsQ = useQuery({
    queryKey: ["projects", "dashboard-all", orgId],
    queryFn: () => entities.Project.filterAll({ org_id: orgId }),
    staleTime: 5 * 60 * 1000,
    enabled: !!orgId,
  });
  const { isLoading: projectsLoading, isSuccess: projectsSuccess } = projectsQ;
  const projects = useMemo(
    () => projectsInWorkspace(projectsQ.data ?? [], orgId),
    [projectsQ.data, orgId],
  );
  // Portfolio rollups must exclude on-hold projects (and their child entity
  // contributions); on-hold projects are visible only on the /Projects page.
  // `liveProjectIds` is the active (non-on-hold) id set used by every
  // portfolio aggregation downstream (scopePortfolioRows + PortfolioControlCenter).
  const portfolioProjects = useMemo(() => projects.filter((p) => !p.on_hold), [projects]);
  const liveProjectIds = useMemo(() => new Set(portfolioProjects.map((p) => p.id).filter(Boolean)), [portfolioProjects]);
  const activeProjectIsLive = !pid || liveProjectIds.has(pid);
  const queryProjectIds = useMemo(
    () => pid ? (liveProjectIds.has(pid) ? [pid] : []) : [...liveProjectIds].sort(),
    [pid, liveProjectIds],
  );
  const canReadRows = !!orgId && projectsSuccess && activeProjectIsLive;
  const listForDashboard = (entity, sortBy) => readProjectRows(entity, queryProjectIds, sortBy);

  useEffect(() => {
    if (pid && projectsSuccess && !activeProjectIsLive) {
      setActiveProject(null);
    }
  }, [activeProjectIsLive, pid, projectsSuccess, setActiveProject]);

  const scopePortfolioRows = useCallback(
    (rows) => pid ? rows : rows.filter((row) => row?.project_id && liveProjectIds.has(row.project_id)),
    [pid, liveProjectIds],
  );

  const allRFIsQ = useQuery({
    queryKey: ["rfis-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.RFI),
    refetchInterval: refetchMs,
    enabled: canReadRows,
  });
  const { data: allRFIs = [], isSuccess: rfisSuccess } = allRFIsQ;
  const allCOsQ = useQuery({
    queryKey: ["cos-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.ChangeOrder),
    enabled: canReadRows,
  });
  const { data: allCOs = [] } = allCOsQ;
  const allCodesQ = useQuery({
    queryKey: ["codes-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.CostCode),
    enabled: canReadRows,
  });
  const { data: allCodes = [] } = allCodesQ;
  const allWPsQ = useQuery({
    queryKey: ["work-packages-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.WorkPackage),
    staleTime: 30000,
    enabled: canReadRows,
  });
  const { data: allWPs = [] } = allWPsQ;
  const allDeliveriesQ = useQuery({
    queryKey: ["deliveries-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.Delivery),
    refetchInterval: refetchMs,
    enabled: canReadRows,
  });
  const { data: allDeliveries = [] } = allDeliveriesQ;
  const allActionItemsQ = useQuery({
    queryKey: ["action-items-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.ActionItem),
    refetchInterval: refetchMs,
    enabled: canReadRows,
  });
  const { data: allActionItems = [] } = allActionItemsQ;
  // Loaded in both modes: the project CC uses expenses for spend, and the
  // portfolio CC's resolveProjectSpend falls back to expenses so its totals
  // match PortfolioHub (which always passes expenses).
  const allExpensesQ = useQuery({
    queryKey: ["expenses-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.Expense),
    enabled: canReadRows,
  });
  const { data: allExpenses = [] } = allExpensesQ;
  // Portfolio timeline column needs schedule_tasks for every non-singleton
  // project portfolio view. Tiny payload —
  // one row per task, a few date columns — fetched in bounded project batches.
  const allScheduleTasksQ = useQuery({
    queryKey: ["schedule-tasks-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.ScheduleTask, "-start_date"),
    staleTime: 60 * 1000,
    enabled: canReadRows,
  });
  const { data: allScheduleTasks = [], isSuccess: scheduleTasksSuccess } = allScheduleTasksQ;
  // Used by the Document Hub submittal pipeline + Drawings count tile.
  const allSubmittalsQ = useQuery({
    queryKey: ["submittals-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.Submittal),
    staleTime: 30 * 1000,
    enabled: canReadRows && !!pid,
  });
  const { data: allSubmittals = [] } = allSubmittalsQ;
  const allDrawingsQ = useQuery({
    queryKey: ["drawings-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.Drawing),
    staleTime: 30 * 1000,
    enabled: canReadRows && !!pid,
  });
  const { data: allDrawings = [] } = allDrawingsQ;
  const hasRecordedFabReleaseQ = useQuery({
    queryKey: ["fab-release-evidence", pid, orgId],
    queryFn: async () => {
      if (!pid) return false;
      const { count, error } = await supabase
        .from("fab_release_log")
        .select("id", { count: "exact", head: true })
        .eq("project_id", pid);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: canReadRows && !!pid,
  });
  const {
    data: hasRecordedFabRelease = false,
    isSuccess: fabReleaseEvidenceLoaded,
  } = hasRecordedFabReleaseQ;
  // Cash-flow figures (total billed / collected / pending payment /
  // retention) on the Financial Controls section come from SOV items.
  const allSovItemsQ = useQuery({
    queryKey: ["sov-items-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.SOVItem),
    staleTime: 60 * 1000,
    enabled: canReadRows && !!pid,
  });
  const { data: allSovItems = [] } = allSovItemsQ;
  // Recent Activity feed pulls from drawing_activity (the only
  // activity surface that's actually populated — the generic
  // `activities` table is empty everywhere). Pull the latest 50
  // events for the verified active project.
  const allDrawingActivityQ = useQuery({
    queryKey: ["drawing-activity-recent", projectScope, orgId, queryProjectIds],
    queryFn: () =>
      entities.DrawingActivity && pid && canReadRows
        ? entities.DrawingActivity.filter({ project_id: pid }, "-created_at", 50)
        : Promise.resolve([]),
    staleTime: 30 * 1000,
    refetchInterval: refetchMs,
    enabled: canReadRows && !!pid,
  });
  const { data: allDrawingActivity = [] } = allDrawingActivityQ;
  // ── Field activity rollup (added with the Field overhaul) ──
  // The field surfaces the control center actually reads (Punchlist /
  // Inspections / Safety / QC) feed the project dashboard. Daily logs and
  // photos are not consumed by DashboardControlCenter, so they are not fetched.
  // Pull per-project only to avoid portfolio-mode overhead.
  const allPunchlistQ = useQuery({
    queryKey: ["punchlist-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.PunchlistItem),
    staleTime: 60 * 1000,
    enabled: canReadRows && !!pid,
  });
  const { data: allPunchlist = [] } = allPunchlistQ;
  const allInspectionsQ = useQuery({
    queryKey: ["inspections-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.Inspection, "-inspection_date"),
    staleTime: 60 * 1000,
    enabled: canReadRows && !!pid,
  });
  const { data: allInspections = [] } = allInspectionsQ;
  const allSafetyIncidentsQ = useQuery({
    queryKey: ["safety-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.SafetyIncident, "-incident_date"),
    staleTime: 60 * 1000,
    enabled: canReadRows && !!pid,
  });
  const { data: allSafetyIncidents = [] } = allSafetyIncidentsQ;
  const allQualityRecordsQ = useQuery({
    queryKey: ["qc-records-dashboard", projectScope, orgId, queryProjectIds],
    queryFn: () => listForDashboard(entities.QualityControlRecord, "-test_date"),
    staleTime: 60 * 1000,
    enabled: canReadRows && !!pid,
  });
  const { data: allQualityRecords = [] } = allQualityRecordsQ;

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
  const punchlistItems   = useMemo(() => (pid ? allPunchlist.filter((r) => r.project_id === pid)        : []), [allPunchlist, pid]);
  const inspections      = useMemo(() => (pid ? allInspections.filter((r) => r.project_id === pid)      : []), [allInspections, pid]);
  const safetyIncidents  = useMemo(() => (pid ? allSafetyIncidents.filter((r) => r.project_id === pid)  : []), [allSafetyIncidents, pid]);
  const qualityRecords   = useMemo(() => (pid ? allQualityRecords.filter((r) => r.project_id === pid)   : []), [allQualityRecords, pid]);

  const portfolioQueries = [allRFIsQ, allCOsQ, allCodesQ, allWPsQ, allDeliveriesQ, allActionItemsQ, allExpensesQ, allScheduleTasksQ];
  const projectQueries = [allSubmittalsQ, allDrawingsQ, hasRecordedFabReleaseQ, allSovItemsQ, allDrawingActivityQ, allPunchlistQ, allInspectionsQ, allSafetyIncidentsQ, allQualityRecordsQ];
  const allQueries = [projectsQ, ...portfolioQueries, ...(pid ? projectQueries : [])];
  const failedQuery = allQueries.find((query) => query.isError);
  const isLoading = allQueries.some((query) => query.isPending);

  const portfolioRelated = useMemo(
    () => ({
      changeOrders: scopePortfolioRows(allCOs),
      workPackages: scopePortfolioRows(allWPs),
      costCodes: scopePortfolioRows(allCodes),
      rfis: scopePortfolioRows(allRFIs),
      deliveries: scopePortfolioRows(allDeliveries),
      actionItems: scopePortfolioRows(allActionItems),
      scheduleTasks: scopePortfolioRows(allScheduleTasks),
      expenses: scopePortfolioRows(allExpenses),
      rfiEvidenceLoaded: rfisSuccess,
      scheduleEvidenceLoaded: scheduleTasksSuccess,
    }),
    [
      allCOs, allWPs, allCodes, allRFIs, allDeliveries, allExpenses,
      allActionItems, allScheduleTasks, scopePortfolioRows, rfisSuccess, scheduleTasksSuccess,
    ],
  );

  const onOpenProjectFromPortfolioCommand = useCallback((project) => {
    if (!project?.id) return;
    const match = projects.find((p) => p.id === project.id);
    setActiveProject(match ? match : project);
  }, [projects, setActiveProject]);

  if (!orgId) return <div role="status" style={{ padding: 24 }}>Choose a workspace to load the dashboard.</div>;

  if (failedQuery) {
    return (
      <div role="alert" className="sb-dashboard-reference-page" style={{ padding: 24 }}>
        <p>Couldn’t load dashboard data</p>
        <p>{toUserErrorMessage(failedQuery.error, "Try again.")}</p>
        <button type="button" className="sbd-btn sbd-btn-primary" onClick={() => failedQuery.refetch()}>Retry</button>
      </div>
    );
  }

  if (isLoading || (pid && !activeProjectIsLive)) {
    return (
      <div className="sb-dashboard-reference-page">
        <LoadingSkeleton variant="page" />
      </div>
    );
  }

  // ── Canonical single-project Dashboard Control Center ─────────────────────
  if (pid) {
    const hasReleasedSubmittal = submittals.some(
      (submittal) => submittal.status === "Released for Fabrication",
    );
    const signals = {
      hasDrawings: drawings.length > 0,
      hasSubmittal: submittals.length > 0,
      hasRfi: rfis.length > 0,
      rfiSkipped: false,
      hasFabRelease: hasRecordedFabRelease || hasReleasedSubmittal,
    };

    const onNavigateDash = (target, opts = {}) => {
      const destination = resolveDashboardNavigation(target, opts);
      if (destination) navigate(destination);
    };
    return (
      <ErrorBoundary label="Dashboard Control Center">
        <Suspense fallback={<LoadingSkeleton variant="page" />}>
          <>
            {(fabReleaseEvidenceLoaded || hasReleasedSubmittal) && (
              <GettingStartedChecklist
                signals={signals}
                userMetadata={user}
              />
            )}
            <DashboardControlCenter
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
              punchlistItems={punchlistItems}
              inspections={inspections}
              safetyIncidents={safetyIncidents}
              qualityRecords={qualityRecords}
              todayIso={todayLocalISO()}
              rfiEvidenceLoaded={rfisSuccess}
              scheduleEvidenceLoaded={scheduleTasksSuccess}
              onNavigate={onNavigateDash}
            />
          </>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (!pid) {
    if (!projectsLoading && projects.length === 0) {
      return <FirstProjectWelcome onStart={() => navigate("/Onboarding")} />;
    }
    return (
      <ErrorBoundary label="Portfolio Control Center">
        <Suspense fallback={<LoadingSkeleton variant="page" />}>
          <PortfolioControlCenter
            projects={portfolioProjects}
            related={portfolioRelated}
            search={portfolioSearch}
            onSearch={setPortfolioSearch}
            healthFilter={portfolioHealthFilter}
            onHealthFilter={setPortfolioHealthFilter}
            onOpenProject={onOpenProjectFromPortfolioCommand}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

}
