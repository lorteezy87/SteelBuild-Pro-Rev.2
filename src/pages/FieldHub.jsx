/**
 * FieldHub — consolidates the field/quality surfaces under one nav entry
 * (module-consolidation Phase 2). The Field overview already rolls up
 * Inspections / Safety / Punchlist / Quality Control KPIs; this shell adds the
 * full registers as tabs alongside it so they stop occupying separate sidebar
 * slots (and Safety/QC, deprioritized in Phase 1, stay reachable here rather
 * than URL-only).
 *
 * Thin tab shell (the DrawingSubmittalHub / ResourceHub pattern): each tab
 * lazy-loads the existing page unchanged; all remain independently routable.
 * `?field_tab=` drives the active tab.
 *
 * command_ui flag: adds a leading "Command Center" tab rendering
 * FieldHubControlCenter. Its data is fetched here (same entities the sub-pages
 * use) and passed down. The tab shell is shared by both skins — an earlier
 * version returned the Control Center *instead of* the shell, which made
 * `?field_tab=`/`?id=` inert (so hub rows opened nothing) and hid every
 * register tab from command_ui users.
 */
import { Suspense, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { entities } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { useProjectId } from "@/hooks/useProjectId";
import { usePermissions } from "@/services/permissions";
import { useFlag } from "@/hooks/useFeatureFlag";
import FieldHubControlCenter from "./fieldHub/FieldHubControlCenter";

const FieldTodayPage = lazyWithRetry(() => import("@/pages/FieldToday"));
const FieldOverview = lazyWithRetry(() => import("@/pages/Field"));
const DailyLogsPage = lazyWithRetry(() => import("@/pages/DailyLogs"));
const PhotosPage = lazyWithRetry(() => import("@/pages/Photos"));
const LEMsPage = lazyWithRetry(() => import("@/pages/LEMs"));
const InspectionsPage = lazyWithRetry(() => import("@/pages/Inspections"));
const SafetyPage = lazyWithRetry(() => import("@/pages/Safety"));
const PunchlistPage = lazyWithRetry(() => import("@/pages/Punchlist"));
const QualityControlPage = lazyWithRetry(() => import("@/pages/QualityControl"));

const TABS = [
  { key: "today", label: "Today", Component: FieldTodayPage },
  { key: "overview", label: "Overview", Component: FieldOverview },
  { key: "dailylogs", label: "Daily Logs", Component: DailyLogsPage },
  { key: "photos", label: "Photos", Component: PhotosPage },
  { key: "lems", label: "LEMs", Component: LEMsPage },
  { key: "inspections", label: "Inspections", Component: InspectionsPage },
  { key: "punchlist", label: "Punchlist", Component: PunchlistPage },
  { key: "quality", label: "Quality Control", Component: QualityControlPage },
  { key: "safety", label: "Safety", Component: SafetyPage },
];

export default function FieldHub() {
  const [params, setParams] = useSearchParams();
  const commandUi = useFlag("command_ui");
  const projectId = useProjectId();
  const { can } = usePermissions();

  // ── command_ui data layer ──────────────────────────────────────────────────
  // All four entity fetches mirror what the sub-pages already do.
  // We only pay the network cost when command_ui is on.
  const { data: rawLogs = [] } = useQuery({
    queryKey: ["daily-logs", projectId],
    queryFn: () =>
      projectId
        ? entities.DailyLog.filter({ project_id: projectId })
        : entities.DailyLog.list("-date"),
    enabled: !!commandUi,
  });

  const { data: rawInspections = [] } = useQuery({
    queryKey: ["inspections", projectId],
    queryFn: () =>
      projectId
        ? entities.Inspection.filter({ project_id: projectId })
        : entities.Inspection.list("-inspection_date"),
    enabled: !!commandUi,
  });

  const { data: rawIncidents = [] } = useQuery({
    queryKey: ["safety-incidents", projectId],
    queryFn: () =>
      projectId
        ? entities.SafetyIncident.filter({ project_id: projectId })
        : entities.SafetyIncident.list("-incident_date"),
    enabled: !!commandUi,
  });

  // Key must match the cacheRegistry `punchlist` primary (["punchlist", pid]).
  // It was ["punchlist-items", pid], which no invalidation ever touched, so
  // the hub feed went stale the moment anyone edited an item in the register.
  const { data: rawPunchlist = [] } = useQuery({
    queryKey: ["punchlist", projectId],
    queryFn: () =>
      projectId
        ? entities.PunchlistItem.filter({ project_id: projectId })
        : entities.PunchlistItem.list(),
    enabled: !!commandUi,
  });

  // Daily logs reference schedule tasks (daily_logs.schedule_task_ids), and
  // schedule_tasks is the only field-adjacent table with a real `phase`
  // column — so it's how a log gets a phase we can actually stand behind.
  const { data: scheduleTasks = [] } = useQuery({
    queryKey: ["schedule-tasks", projectId],
    queryFn: () =>
      projectId ? entities.ScheduleTask.filter({ project_id: projectId }) : [],
    enabled: !!commandUi && !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
    enabled: !!commandUi,
  });

  // Soft-delete filter — mirrors the pattern used in DailyLogs / Inspections / Safety.
  const logs = useMemo(() => rawLogs.filter((r) => !r.is_deleted), [rawLogs]);
  const inspections = useMemo(() => rawInspections.filter((r) => !r.is_deleted), [rawInspections]);
  const incidents = useMemo(() => rawIncidents.filter((r) => !r.is_deleted), [rawIncidents]);
  const punchlistItems = useMemo(() => rawPunchlist.filter((r) => !r.is_deleted), [rawPunchlist]);

  const projectName = useMemo(
    () => projects.find((p) => p.id === projectId)?.name || "All Projects",
    [projects, projectId],
  );

  // ── command_ui filter state ────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [phaseFilter, setPhaseFilter] = useState("All");

  // ── Tab state ──────────────────────────────────────────────────────────────
  // command_ui prepends a "Command Center" tab (the Control Center) and lands
  // there by default; the registers stay reachable, which is what makes the
  // row-click deep-links below actually land somewhere.
  const visibleTabs = useMemo(
    () => (commandUi ? [{ key: "hub", label: "Command Center", Component: null }, ...TABS] : TABS),
    [commandUi],
  );
  const defaultKey = commandUi ? "hub" : "today";
  const param = params.get("field_tab");
  const activeKey = visibleTabs.some((t) => t.key === param) ? param : defaultKey;
  const Active = TABS.find((t) => t.key === activeKey)?.Component ?? null;
  const setTab = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("field_tab", key);
        // Switching tabs by hand must not carry a record id along, or the
        // destination register would open an unrelated record's editor.
        next.delete("id");
        return next;
      },
      { replace: true },
    );

  /**
   * Deep-link a hub row to its register: switch tabs and hand the record id to
   * the destination page, which opens it via useAutoOpenEdit(`?id=`).
   */
  const openRecord = (tabKey) => (id) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("field_tab", tabKey);
        next.set("id", id);
        return next;
      },
      { replace: false },
    );

  const controlCenter = (
    <FieldHubControlCenter
      projectName={projectName}
      logs={logs}
      inspections={inspections}
      incidents={incidents}
      punchlistItems={punchlistItems}
      scheduleTasks={scheduleTasks}
      search={search}
      onSearch={setSearch}
      typeFilter={typeFilter}
      onTypeFilterChange={setTypeFilter}
      phaseFilter={phaseFilter}
      onPhaseFilterChange={setPhaseFilter}
      onLogActivity={
        can("create", "dailyLog")
          ? () =>
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("field_tab", "dailylogs");
                  next.set("new", "1");
                  return next;
                },
                { replace: false },
              )
          : null
      }
      onOpenPunchlist={openRecord("punchlist")}
      onOpenInspection={openRecord("inspections")}
      onOpenIncident={openRecord("safety")}
      onOpenDailyLog={openRecord("dailylogs")}
    />
  );

  return (
    <div
      className="sb-dashboard-reference-page"
      style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      <div
        role="tablist"
        aria-label="Field"
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: "10px 24px 0",
          flexWrap: "wrap",
        }}
      >
        {visibleTabs.map((tab) => {
          const isActive = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(tab.key)}
              style={{
                minHeight: 34,
                padding: "7px 14px",
                borderRadius: 9,
                border: `1px solid ${isActive ? "var(--accent)" : "var(--border-default)"}`,
                background: isActive
                  ? "color-mix(in srgb, var(--accent) 14%, var(--bg-surface-high))"
                  : "var(--bg-surface-low)",
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ minHeight: 0, position: "relative" }}>
        <ErrorBoundary label="Field">
          <Suspense fallback={<LoadingSkeleton variant="page" />}>
            {activeKey === "hub" ? controlCenter : Active ? <Active /> : null}
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
