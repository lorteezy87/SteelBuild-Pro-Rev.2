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
 * command_ui flag: when on, renders FieldHubControlCenter instead of the tab
 * shell. Data is fetched here (same entities the sub-pages use) and passed
 * down; the classic tab path is untouched.
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

  const { data: rawPunchlist = [] } = useQuery({
    queryKey: ["punchlist-items", projectId],
    queryFn: () =>
      projectId
        ? entities.PunchlistItem.filter({ project_id: projectId })
        : entities.PunchlistItem.list(),
    enabled: !!commandUi,
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

  // ── Classic tab state ──────────────────────────────────────────────────────
  const param = params.get("field_tab");
  const activeKey = TABS.some((t) => t.key === param) ? param : "today";
  const Active = (TABS.find((t) => t.key === activeKey) || TABS[0]).Component;
  const setTab = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("field_tab", key);
        return next;
      },
      { replace: true },
    );

  // ── command_ui branch ─────────────────────────────────────────────────────
  if (commandUi) {
    return (
      <div className="sb-dashboard-reference-page field-hub-page">
        <FieldHubControlCenter
          projectName={projectName}
          logs={logs}
          inspections={inspections}
          incidents={incidents}
          punchlistItems={punchlistItems}
          search={search}
          onSearch={setSearch}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          // "Log Field Activity" → navigate to the DailyLogs tab in the classic hub
          // or trigger the DailyLogs ?new=1 param. We use the tab navigation so no
          // second modal infra is needed here.
          onLogActivity={
            can("create", "dailyLog")
              ? () =>
                  setParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      next.set("field_tab", "dailylogs");
                      return next;
                    },
                    { replace: false },
                  )
              : null
          }
          // Deep-link handlers: for now navigate to the respective tab + open via
          // ?id= param (same pattern as the RFI page's URL-driven selection).
          onOpenPunchlist={(id) =>
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.set("field_tab", "punchlist");
                next.set("id", id);
                return next;
              },
              { replace: false },
            )
          }
          onOpenInspection={(id) =>
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.set("field_tab", "inspections");
                next.set("id", id);
                return next;
              },
              { replace: false },
            )
          }
          onOpenIncident={(id) =>
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.set("field_tab", "safety");
                next.set("id", id);
                return next;
              },
              { replace: false },
            )
          }
        />
      </div>
    );
  }

  // ── Classic tab shell (untouched) ─────────────────────────────────────────
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
        {TABS.map((tab) => {
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
            <Active />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
