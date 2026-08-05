import React, { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { useProjectContext } from "../components/shared/ProjectContext";
import { toast } from "sonner";
import { startOfToday } from "@/lib/dateMath";
import { downloadIcs, scheduleTaskToEvent } from "@/lib/icsExport";
import {
  buildDayColumns,
  buildBlockerMaps,
  resolveBlocker,
  groupTasksByCrewAndDay,
  filterVisibleCrews,
  buildFieldPlanIcsFilename,
  commandBarSubtitle,
} from "./fieldPlan/fieldPlanHelpers";
import {
  FieldPlanNoProjectState,
  FieldPlanCommandBar,
  FieldPlanKpis,
  FieldPlanBoard,
  FieldPlanPrintStyle,
} from "./fieldPlan/FieldPlanUi";

/**
 * FieldPlan — short-interval planning board.
 *
 * A field-first, crew-grouped, blocker-aware view of the next 7/14/21
 * days. This is what a PM shows at Monday morning's crew meeting and
 * what a foreman flips open on a phone at the jobsite.
 *
 * Rows = crews. Columns = days. Cells = tasks scheduled for that
 * (crew, day). Each task card carries inline blocker chips (RFI /
 * submittal / delivery) so the foreman sees "can I start this?" at a
 * glance without drilling in.
 *
 * Printable layout (print stylesheet inline below) so the plan can be
 * tacked to the jobsite trailer wall.
 */

export default function FieldPlan() {
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id;
  const [horizonDays, setHorizonDays] = useState(14);
  const [onlyBlocked, setOnlyBlocked] = useState(false);

  // ── Data ───────────────────────────────────────────────────────────
  const {
    data: tasks = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["field-plan-tasks", projectId, horizonDays],
    queryFn: async () => {
      if (!projectId) return [];
      const end = new Date();
      end.setDate(end.getDate() + horizonDays);
      return entities.ScheduleTask.filter({
        project_id: projectId,
        "end_date.gte": startOfToday().toISOString().slice(0, 10),
        "start_date.lte": end.toISOString().slice(0, 10),
      }, "start_date");
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["field-plan-rfis", projectId],
    queryFn: () => projectId ? entities.RFI.filter({ project_id: projectId, status: ["Open", "Submitted", "Under Review"] }) : [],
    enabled: !!projectId,
  });

  const { data: submittals = [] } = useQuery({
    queryKey: ["field-plan-submittals", projectId],
    queryFn: () => projectId ? entities.Submittal.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ["field-plan-deliveries", projectId],
    queryFn: () => projectId ? entities.Delivery.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
  });

  // ── Blocker lookup: resolve task.blockers entries into display chips ─
  const blockerResolvers = useMemo(() => {
    const maps = buildBlockerMaps(rfis, submittals, deliveries);
    return (b) => resolveBlocker(b, maps);
  }, [rfis, submittals, deliveries]);

  // ── Build day columns (today → today + horizonDays-1) ─────────────
  const days = useMemo(() => buildDayColumns(horizonDays), [horizonDays]);

  // ── Group tasks by crew → by day ───────────────────────────────────
  const { crews, cellMap, stats } = useMemo(
    () => groupTasksByCrewAndDay(tasks, days, blockerResolvers),
    [tasks, blockerResolvers, days],
  );

  // ── Export the visible plan to calendar ────────────────────────────
  const exportIcs = useCallback(() => {
    if (!projectId || tasks.length === 0) { toast.info("Nothing to export."); return; }
    const events = tasks
      .map((t) => scheduleTaskToEvent(t, activeProject?.project_number || ""))
      .filter(Boolean);
    downloadIcs({
      filename: buildFieldPlanIcsFilename(activeProject?.project_number, projectId, horizonDays),
      calendarName: `${activeProject?.project_name || "Project"} — ${horizonDays}-day Field Plan`,
      events,
    });
    toast.success(`Exported ${events.length} tasks to calendar`);
  }, [projectId, tasks, activeProject, horizonDays]);

  const printPlan = useCallback(() => { window.print(); }, []);

  // ── Render ─────────────────────────────────────────────────────────
  if (!projectId) return <FieldPlanNoProjectState />;

  const visibleCrews = filterVisibleCrews(crews, days, cellMap, onlyBlocked);

  return (
    <div className="sb-dashboard-reference-page fieldplan-root" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <FieldPlanCommandBar
        projectName={activeProject?.project_name}
        horizonDays={horizonDays}
        onHorizonChange={setHorizonDays}
        stats={stats}
        subtitle={commandBarSubtitle(stats)}
        onlyBlocked={onlyBlocked}
        onToggleBlocked={() => setOnlyBlocked((v) => !v)}
        onExportIcs={exportIcs}
        onPrint={printPlan}
      />

      <FieldPlanKpis stats={stats} crewCount={crews.length} />

      <FieldPlanBoard
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => refetch()}
        tasksLength={tasks.length}
        horizonDays={horizonDays}
        days={days}
        visibleCrews={visibleCrews}
        cellMap={cellMap}
      />

      <FieldPlanPrintStyle />
    </div>
  );
}
