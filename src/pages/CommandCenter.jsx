import React, { useMemo, useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import ItemDetailDrawer from "@/components/commandcenter/ItemDetailDrawer";
import ForwardLookDrawer from "@/components/commandcenter/ForwardLookDrawer";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import CommandCenterControlCenter from "./commandCenter/CommandCenterControlCenter";

/**
 * Command Center canonical cockpit.
 * Queries remain page-owned; CommandCenterControlCenter owns only presentation.
 */

const STALE_TIME = 60_000;
const EMPTY_LIST = Object.freeze([]);

export default function CommandCenter() {
  // Canonical control-center state.
  const [ccSearch, setCcSearch] = useState("");
  const [ccTypeFilter, setCcTypeFilter] = useState("All");

  const [detailItem, setDetailItem] = useState(null);
  const [forwardLookOpen, setForwardLookOpen] = useState(false);

  // ── Data queries ────────────────────────────────────────────────────
  //
  // Query keys deliberately mirror the registry's bare list-all family
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
  const { data: projects = EMPTY_LIST, isLoading: projLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.listAll(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: rfis = EMPTY_LIST, isLoading: rfiLoading } = useQuery({
    queryKey: ["rfis"],
    queryFn: () => entities.RFI.listAll("-submitted_date"),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: submittals = EMPTY_LIST, isLoading: submittalsLoading } = useQuery({
    queryKey: ["submittals"],
    queryFn: () => entities.Submittal.listAll(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: changeOrders = EMPTY_LIST } = useQuery({
    queryKey: ["change-orders"],
    queryFn: () => entities.ChangeOrder.listAll(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: deliveries = EMPTY_LIST } = useQuery({
    queryKey: ["deliveries"],
    queryFn: () => entities.Delivery.listAll(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: workPackages = EMPTY_LIST } = useQuery({
    queryKey: ["work-packages"],
    queryFn: () => entities.WorkPackage.listAll(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  // Schedule tasks from the Gantt — feeds Installation / Fabrication /
  // Detailing rows into the 48h + 10d windows so everything the user
  // sees on the Gantt also shows up here.
  const { data: scheduleTasks = EMPTY_LIST } = useQuery({
    queryKey: ["schedule-tasks"],
    queryFn: () => entities.ScheduleTask.listAll("-start_date"),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const isLoading = projLoading || rfiLoading || submittalsLoading;

  // ── Project map ─────────────────────────────────────────────────────
  const projectMap = useMemo(() => {
    const m = {};
    for (const p of projects) {
      m[p.id] = { project_number: p.project_number, name: p.name, gc_name: p.gc_name };
    }
    return m;
  }, [projects]);

  // ── Render ──────────────────────────────────────────────────────────
  if (isLoading) {
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
          search={ccSearch}
          onSearch={setCcSearch}
          typeFilter={ccTypeFilter}
          onTypeChange={setCcTypeFilter}
          onOpenItem={(item) => setDetailItem(item)}
          onForwardLook={() => setForwardLookOpen(true)}
        />
        <ItemDetailDrawer item={detailItem} onClose={() => setDetailItem(null)} />
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
