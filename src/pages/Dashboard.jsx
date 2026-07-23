import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/ProjectContext";
import { useUserPrefs, refetchIntervalFromPref } from "@/hooks/useUserPrefs";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
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
  const pid = activeProject?.id;
  const [portfolioSearch, setPortfolioSearch] = useState("");
  const [portfolioHealthFilter, setPortfolioHealthFilter] = useState("All");
  const projectScope = pid || "portfolio";
  // The canonical control-center surfaces are unconditional.
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

  const scopePortfolioRows = useCallback(
    (rows) => pid ? rows : rows.filter((row) => row?.project_id && liveProjectIds.has(row.project_id)),
    [pid, liveProjectIds],
  );

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
    enabled: true,
  });
  const { data: allExpenses = [] } = useQuery({
    queryKey: ["expenses-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.Expense),
    enabled: !!pid,
  });
  // Portfolio timeline column needs schedule_tasks for every non-singleton
  // project portfolio view. Tiny payload —
  // one row per task, a few date columns — so global fetch is cheaper than
  // per-project drilldown round-trips.
  const { data: allScheduleTasks = [] } = useQuery({
    queryKey: ["schedule-tasks-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.ScheduleTask, "-start_date"),
    staleTime: 60 * 1000,
    enabled: true,
  });
  // Used by the Document Hub submittal pipeline + Drawings count tile.
  const { data: allSubmittals = [] } = useQuery({
    queryKey: ["submittals-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.Submittal),
    staleTime: 30 * 1000,
    enabled: !!pid,
  });
  const { data: allDrawings = [] } = useQuery({
    queryKey: ["drawings-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.Drawing),
    staleTime: 30 * 1000,
    enabled: !!pid,
  });
  // Cash-flow figures (total billed / collected / pending payment /
  // retention) on the Financial Controls section come from SOV items.
  const { data: allSovItems = [] } = useQuery({
    queryKey: ["sov-items-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.SOVItem),
    staleTime: 60 * 1000,
    enabled: !!pid,
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
    enabled: !!pid,
  });
  // ── Field activity rollup (added with the Field overhaul) ──
  // Each field surface (Daily Logs / Photos / Punchlist / Inspections /
  // Safety / QC) feeds the project dashboard plus its corresponding module.
  // Pull per-project only to avoid portfolio-mode overhead.
  const { data: allDailyLogs = [] } = useQuery({
    queryKey: ["daily-logs-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.DailyLog, "-date"),
    staleTime: 60 * 1000,
    enabled: !!pid,
  });
  const { data: allPhotos = [] } = useQuery({
    queryKey: ["photos-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.Photo, "-taken_date"),
    staleTime: 60 * 1000,
    enabled: !!pid,
  });
  const { data: allPunchlist = [] } = useQuery({
    queryKey: ["punchlist-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.PunchlistItem),
    staleTime: 60 * 1000,
    enabled: !!pid,
  });
  const { data: allInspections = [] } = useQuery({
    queryKey: ["inspections-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.Inspection, "-inspection_date"),
    staleTime: 60 * 1000,
    enabled: !!pid,
  });
  const { data: allSafetyIncidents = [] } = useQuery({
    queryKey: ["safety-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.SafetyIncident, "-incident_date"),
    staleTime: 60 * 1000,
    enabled: !!pid,
  });
  const { data: allQualityRecords = [] } = useQuery({
    queryKey: ["qc-records-dashboard", projectScope],
    queryFn: () => listForDashboard(entities.QualityControlRecord, "-test_date"),
    staleTime: 60 * 1000,
    enabled: !!pid,
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

  const portfolioRelated = useMemo(
    () => ({
      changeOrders: scopePortfolioRows(allCOs),
      workPackages: scopePortfolioRows(allWPs),
      costCodes: scopePortfolioRows(allCodes),
      rfis: scopePortfolioRows(allRFIs),
      deliveries: scopePortfolioRows(allDeliveries),
      actionItems: scopePortfolioRows(allActionItems),
      scheduleTasks: scopePortfolioRows(allScheduleTasks),
    }),
    [
      allCOs, allWPs, allCodes, allRFIs, allDeliveries,
      allActionItems, allScheduleTasks, scopePortfolioRows,
    ],
  );

  const onOpenProjectFromPortfolioCommand = useCallback((project) => {
    if (!project?.id) return;
    const match = projects.find((p) => p.id === project.id);
    setActiveProject(match ? match : project);
  }, [projects, setActiveProject]);

  if (isLoading) {
    return (
      <div className="sb-dashboard-reference-page">
        <LoadingSkeleton variant="page" />
      </div>
    );
  }

  // ── Canonical single-project Dashboard Control Center ─────────────────────
  if (pid) {
    const onNavigateDash = (target, opts = {}) => {
      const paths = {
        rfis: "/RFIs", submittals: "/Submittals", "work-packages": "/WorkPackages",
        deliveries: "/Deliveries", "change-orders": "/ChangeOrders",
        "field-reports": "/DailyLogs", schedule: "/Schedule",
        "fab-release": "/FabRelease", "budget-hours": "/BudgetHours",
        procurement: "/Procurement", field: "/Field", "daily-logs": "/DailyLogs",
        photos: "/Photos", punchlist: "/Punchlist", inspections: "/Inspections",
        safety: "/Safety", "quality-control": "/QualityControl",
        "piece-register": "/PieceRegister",
      };
      const path = paths[target];
      if (!path) return;
      const params = [];
      if (opts.create) params.push("new=1");
      if (opts.stage) params.push(`stage=${encodeURIComponent(opts.stage)}`);
      if (opts.status) params.push(`status=${encodeURIComponent(opts.status)}`);
      navigate(params.length ? `${path}?${params.join("&")}` : path);
    };
    return (
      <ErrorBoundary label="Dashboard Control Center">
        <Suspense fallback={<LoadingSkeleton variant="page" />}>
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
            onNavigate={onNavigateDash}
          />
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
