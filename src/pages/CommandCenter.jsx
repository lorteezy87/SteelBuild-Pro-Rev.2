import React, { useEffect, useMemo, useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { useProjectId } from "@/hooks/useProjectId";
import { useProjectContext } from "@/components/shared/ProjectContext";
import ItemDetailDrawer from "@/components/commandcenter/ItemDetailDrawer";
import ForwardLookDrawer from "@/components/commandcenter/ForwardLookDrawer";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import EmptyState from "@/components/design-system/EmptyState";
import CommandBar from "@/components/design-system/CommandBar";
import CommandCenterControlCenter from "./commandCenter/CommandCenterControlCenter";
import { loadCommandSource } from "./commandCenter/commandCenterData";

/**
 * Command Center canonical cockpit.
 * Queries remain page-owned; CommandCenterControlCenter owns only presentation.
 */

const STALE_TIME = 60_000;
const EMPTY_LIST = Object.freeze([]);

export default function CommandCenter() {
  const projectId = useProjectId();
  const { activeProject } = useProjectContext();
  // Canonical control-center state.
  const [ccSearch, setCcSearch] = useState("");
  const [ccTypeFilter, setCcTypeFilter] = useState("All");

  const [detailItem, setDetailItem] = useState(null);
  const [forwardLookOpen, setForwardLookOpen] = useState(false);
  useEffect(() => {
    setDetailItem(null);
    setForwardLookOpen(false);
  }, [projectId]);

  // ── Data queries ────────────────────────────────────────────────────
  //
  // Query keys deliberately mirror the registry's project-scoped family
  // keys (see `src/services/cacheRegistry.js`). Earlier these were
  // `cc-rfis` / `cc-schedule-tasks` / etc. — disjoint from the keys
  // mutations invalidate (`["schedule-tasks", projectId]`,
  // `["rfis", projectId]`, …). Result: edit a task on Schedule.jsx, and
  // Command Center kept showing pre-edit dates until STALE_TIME ran out
  // and a window-focus refetch fired.
  //
  // By aligning to the same family keys the rest of the app uses, any
  // call to `invalidateEntity(qc, "schedule_task", projectId)` (or any
  // matching prefix invalidation) wakes Command Center up immediately —
  // no special wiring needed per-mutation site, no cache-key drift.
  const projects = activeProject?.id === projectId ? [activeProject] : EMPTY_LIST;

  // Preserve invalidation prefixes but never reuse a capped register's cache.
  const rfiQuery = useQuery({
    queryKey: ["rfis", projectId, "command-complete"],
    queryFn: () => loadCommandSource(entities.RFI, projectId, "-submitted_date"),
    enabled: !!projectId,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const submittalQuery = useQuery({
    queryKey: ["submittals", projectId, "command-complete"],
    queryFn: () => loadCommandSource(entities.Submittal, projectId, "-created_at"),
    enabled: !!projectId,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const changeOrderQuery = useQuery({
    queryKey: ["change-orders", projectId, "command-complete"],
    queryFn: () => loadCommandSource(entities.ChangeOrder, projectId, "-created_at"),
    enabled: !!projectId,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const deliveryQuery = useQuery({
    queryKey: ["deliveries", projectId, "command-complete"],
    queryFn: () => loadCommandSource(entities.Delivery, projectId, "-created_at"),
    enabled: !!projectId,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const workPackageQuery = useQuery({
    queryKey: ["work-packages", projectId, "command-complete"],
    queryFn: () => loadCommandSource(entities.WorkPackage, projectId, "-created_at"),
    enabled: !!projectId,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  // Schedule tasks from the Gantt — feeds Installation / Fabrication /
  // Detailing rows into the 48h + 10d windows so everything the user
  // sees on the Gantt also shows up here.
  const scheduleQuery = useQuery({
    queryKey: ["schedule-tasks", projectId, "command-complete"],
    queryFn: () => loadCommandSource(entities.ScheduleTask, projectId, "-start_date"),
    enabled: !!projectId,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const queries = [rfiQuery, submittalQuery, changeOrderQuery, deliveryQuery, workPackageQuery, scheduleQuery];
  const sourceNames = ["RFIs", "Submittals", "Change orders", "Deliveries", "Work packages", "Schedule tasks"];
  const failedSources = queries.flatMap((query, index) => query.isError ? [sourceNames[index]] : []);
  const allSourcesReady = queries.every((query) => query.isSuccess);
  const [rfis, submittals, changeOrders, deliveries, workPackages, scheduleTasks] = queries.map((query) => query.data ?? EMPTY_LIST);

  // ── Project map ─────────────────────────────────────────────────────
  const projectMap = useMemo(() => {
    const m = {};
    for (const p of projects) {
      m[p.id] = { project_number: p.project_number, name: p.name, general_contractor: p.general_contractor };
    }
    return m;
  }, [projects]);

  // ── Render ──────────────────────────────────────────────────────────
  if (!projectId) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
        <CommandBar
          eyebrow="SteelBuild Pro · Command"
          title="Command Center"
          subtitle="Pick a project from the switcher to see its live priorities and risks."
        />
        <EmptyState
          icon="dashboard"
          title="Select a project"
          body="Command Center is scoped to one project so RFIs, submittals, deliveries, work packages, and schedule risks never mix across jobs."
        />
      </div>
    );
  }

  if (failedSources.length > 0) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: 32 }}>
        <CommandBar eyebrow="SteelBuild Pro · Command" title="Command Center" />
        <div role="alert">
          <h2>Project briefing unavailable</h2>
          <p>Complete records could not be verified for: {failedSources.join(", ")}. Reload these sources before assessing priorities.</p>
          <button type="button" className="cmd-btn" onClick={() => queries.forEach((query) => { void query.refetch(); })}>
            Retry project sources
          </button>
        </div>
      </div>
    );
  }

  if (!allSourcesReady || projects.length !== 1) {
    return (
      <div className="sb-dashboard-reference-page">
        <LoadingSkeleton variant="page" />
      </div>
    );
  }

  // ── Canonical Command Center ─────────────────────────────────────────
    const ccSources = {
      rfis,
      submittals,
      changeOrders,
      deliveries,
      workPackages,
      projects,
      scheduleTasks,
    };
    const activeProjectName = projects.length === 1 ? (projects[0].name || projects[0].project_number) : null;
    return (
      <>
        <CommandCenterControlCenter
          sources={ccSources}
          projectName={activeProjectName}
          projectCount={projects.length}
          dataUpdatedAt={Math.min(...queries.map((query) => query.dataUpdatedAt))}
          isRefreshing={queries.some((query) => query.isFetching)}
          search={ccSearch}
          onSearch={setCcSearch}
          typeFilter={ccTypeFilter}
          onTypeChange={setCcTypeFilter}
          onOpenItem={(item) => setDetailItem(item)}
          onForwardLook={() => setForwardLookOpen(true)}
        />
        <ItemDetailDrawer item={detailItem?.projectId === projectId ? detailItem : null} onClose={() => setDetailItem(null)} />
        <ForwardLookDrawer
          open={forwardLookOpen}
          onClose={() => setForwardLookOpen(false)}
          workPackages={workPackages}
          deliveries={deliveries}
          projectMap={projectMap}
        />
      </>
    );
}
