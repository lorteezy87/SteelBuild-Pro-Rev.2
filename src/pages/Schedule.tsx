import { useRef, useMemo, useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { PHASES } from "@/utils/phases";
import { batchProcess } from "@/utils/batchProcess";
import { getWeatherRiskForProject } from "@/lib/weatherRisk";
import { applyEffectiveDates, computeEffectiveDates } from "@/services/scheduleCascade";
import { invalidateEntity } from "@/services/cacheRegistry";
import { useProjectId } from "@/hooks/useProjectId";
import { useScheduleTasks } from "@/hooks/useScheduleTasks";
import { computePhaseWbs } from "./schedule/wbs";
import { computeBulkParentOptions } from "./schedule/scheduleTaskHelpers";
import { normalizeSchedulePhase } from "./schedule/schedulePageHelpers";
import type { ScheduleTask } from "./schedule/types";
import ScheduleCommandCenter from "./schedule/ScheduleCommandCenter";
import ScheduleBody from "./schedule/ScheduleBody";
import { useScheduleModals } from "./schedule/useScheduleModals";
import { useTaskSelection } from "./schedule/useTaskSelection";
import { useScheduleMutations } from "./schedule/useScheduleMutations";

export default function Schedule() {
  const [searchParams] = useSearchParams();
  const projectId = useProjectId();
  const [view, setView] = useState("gantt");
  const [expandedTask, setExpandedTask] = useState<any>(null);
  // Seed the phase filter from the URL if a caller (e.g. the Portfolio
  // mini-Gantt) deep-linked with ?phase=Detailing. If the incoming
  // value doesn't match a known phase we silently fall back to "all"
  // so a typo'd URL doesn't leave the page empty.
  const initialPhase = normalizeSchedulePhase(searchParams.get("phase"));
  const [phaseFilter, setPhaseFilter] = useState(initialPhase);
  const [selectedTask, setSelectedTask] = useState<ScheduleTask | null>(null);
  const [ganttFocus, setGanttFocus] = useState<any>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleTask | null>(null);
  const [bulkResourceValue, setBulkResourceValue] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  // Consolidated modal/drawer open flags + bulk-selection state (see hooks).
  // The whole `modals` / `selection` objects are threaded into ScheduleBody;
  // here we destructure only the setters/values the mutations, handlers, and
  // header reference directly.
  const modals = useScheduleModals();
  const {
    setShowDrawer,
    setShowAddTask,
    setShowBulkAdd,
    setShowWbsBuilder,
    setShowBulkResource,
    setShowBulkDates,
    setShowBulkDuration,
    setShowBulkParent,
    setShowBulkDeleteConfirm,
  } = modals;
  const selection = useTaskSelection();
  const { selectedIds, setSelectedIds } = selection;
  const qc = useQueryClient();

  // useScheduleTasks is still .js and yields DB rows (RowWithAliases<"schedule_tasks">,
  // whose nullable columns are `string | null`). ScheduleTask is the loose view-model
  // the whole schedule layer consumes (optional fields + `[key: string]: any`); every
  // consumer here is already null-safe. Normalize once at the boundary so downstream
  // call sites stay clean. Removable once the hook is typed.
  const { scheduleTasks: scheduleTasksRaw } = useScheduleTasks(projectId);
  const scheduleTasks = scheduleTasksRaw as unknown as ScheduleTask[];

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch submittals linked to this project for Gantt overlay
  const { data: submittals = [] } = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => projectId ? entities.Document.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    select: (docs: any[]) => docs.filter((d) => d.is_submittal && d.linked_wp_id),
  });

  // Deliveries no longer auto-populate the Gantt — the Delivery-phase
  // schedule tasks and the physical deliveries table were producing
  // duplicate rows for the same shipment. Users manually enter a
  // Delivery-phase task on the Gantt when they want one; the physical
  // deliveries live in the Deliveries page and feed the 30-Day Rail,
  // Command Center, etc. (Detailing still auto-populates at the
  // drawing-set level — set_name is the parent task, individual sheets
  // stay as rows in the drawings table and are hidden from the Gantt.
  // See src/lib/autoScheduleDetailing.js for that path.)

  const selectedProject: any = projects.find((p) => p.id === projectId) || null;

  // Weather risk for the project's address. Open-Meteo is free + keyless
  // so no credit spend; the lib caches geocoding + forecast so repeated
  // Gantt renders don't spam the API. Returns null when the project has
  // no address or the API is unreachable — the Gantt treats that as
  // "unknown, no warnings" rather than an error.
  const { data: weatherRisk = null } = useQuery({
    queryKey: ["weather-risk", projectId, selectedProject?.address],
    queryFn: () => selectedProject ? getWeatherRiskForProject(selectedProject) : null,
    enabled: !!selectedProject?.address,
    staleTime: 30 * 60 * 1000, // 30 min — matches the lib's in-memory cache
    retry: false,
  });

  /* ── Auto-assign WBS codes to tasks that don't have one ──────────
     New format: "<phase>.<n>" (phase is PHASE_NUMBER 1-7, n is the
     sequence within the phase). Handles migration from the legacy
     "ABC-NNN" format transparently — any code we can parse a trailing
     number out of counts toward the per-phase max so new codes pick
     up from there without colliding. */
  const enrichedTasks = useMemo(() => {
    if (!scheduleTasks.length) return scheduleTasks;
    const { tasks: result, toBackfill } = computePhaseWbs(scheduleTasks);
    // Background-persist generated WBS codes to DB
    if (toBackfill.length > 0) {
      batchProcess(
        toBackfill,
        ({ id, wbs }) => entities.ScheduleTask.update(id, { wbs_code: wbs }).catch(() => {}),
      ).then(({ succeeded, failed }) => {
        invalidateEntity(qc, "schedule_task", projectId);
        if (failed.length > 0) {
          console.warn(`[Schedule] WBS backfill: ${succeeded.length} ok, ${failed.length} failed`);
        }
      }).catch((err) => {
        console.warn("[Schedule] WBS backfill batch failed:", err?.message);
      });
    }
    return result;
  }, [scheduleTasks, projectId, qc]);

  // ── Effective-date overlay ─────────────────────────────────────────────
  // Single source of truth: the shared cascade utility runs once over the
  // enriched task list and produces a parallel array where start_date /
  // end_date are the *effective* values (after FS/SS/FF/SF + lag links
  // have been followed). The original stored values are preserved on
  // `_stored_start_date` / `_stored_end_date` for any consumer that needs
  // them. ScheduleGantt keeps the raw `enrichedTasks` because its bar
  // renderer + arrow renderer needs both stored AND effective values to
  // draw the "*" shifted indicator and connect arrows correctly; every
  // other consumer (Task List, Lookahead, ICS export) only ever needs to
  // know "where is this task effectively scheduled?", so feeding them the
  // overlaid array is simpler and removes the prior bug where those views
  // showed dates that didn't match the Gantt bars.
  const effectiveDatesMap = useMemo(
    () => computeEffectiveDates(enrichedTasks),
    [enrichedTasks]
  );

  const tasksWithEffective = useMemo(
    () => applyEffectiveDates(enrichedTasks, effectiveDatesMap),
    [enrichedTasks, effectiveDatesMap]
  );

  const {
    updateTaskMut,
    reparentMut,
    createTaskMut,
    deleteTaskMut,
    bulkUpdateMut,
    bulkDeleteMut,
    bulkResourceMut,
    bulkDateMut,
    bulkDurationMut,
    handleBulkAdd,
    handleImportMpp,
    handleExportIcs,
    handleExportPdf,
    bulkUpdateStatus,
    bulkDelete,
    bulkUpdateDates,
    bulkUpdateDuration,
    bulkSetParent,
    confirmBulkDelete,
  } = useScheduleMutations({
    projectId,
    qc,
    scheduleTasks,
    enrichedTasks,
    tasksWithEffective,
    selectedProject,
    selectedTask,
    selectedIds,
    setSelectedTask,
    setSelectedIds,
    setShowDrawer,
    setShowAddTask,
    setShowBulkAdd,
    setShowBulkResource,
    setShowBulkDates,
    setShowBulkDuration,
    setShowBulkParent,
    setShowBulkDeleteConfirm,
    setDeleteTarget,
    setBulkResourceValue,
    setBulkSaving,
    setImporting,
    view,
    exportingPdf,
    setExportingPdf,
    fileInputRef,
  });

  // Legal parent options for the bulk "Set Parent" picker — intersection of
  // valid reparent targets across every selected task, minus the selected tasks
  // themselves. A parent must be valid for ALL selected children.
  const bulkParentOptions = useMemo(
    () => computeBulkParentOptions(enrichedTasks, selectedIds),
    [selectedIds, enrichedTasks],
  );

  // Phase counts for KPI row
  const phaseCounts = useMemo(() => {
    const m: Record<string, number> = { all: scheduleTasks.length };
    PHASES.forEach((p) => {
      m[p] = scheduleTasks.filter((t) => t.phase === p).length;
    });
    return m;
  }, [scheduleTasks]);

  // Shared props for the canonical operational body. Schedule.tsx remains the
  // logic boundary while ScheduleBody owns the Gantt, lookahead, and task-list
  // workflows without duplicating repository or mutation logic.
  const bodyProps = {
    phaseCounts,
    tasksWithEffective,
    enrichedTasks,
    scheduleTasksRaw,
    submittals,
    weatherRisk,
    effectiveDatesMap,
    selectedProject,
    projectId,
    qc,
    bulkParentOptions,
    view,
    setView,
    phaseFilter,
    setPhaseFilter,
    setGanttFocus,
    ganttFocus,
    expandedTask,
    setExpandedTask,
    selectedTask,
    setSelectedTask,
    deleteTarget,
    setDeleteTarget,
    modals,
    selection,
    bulkResourceValue,
    setBulkResourceValue,
    bulkSaving,
    updateTaskMut,
    reparentMut,
    createTaskMut,
    deleteTaskMut,
    bulkUpdateMut,
    bulkDeleteMut,
    bulkResourceMut,
    bulkDateMut,
    bulkDurationMut,
    handleBulkAdd,
    bulkUpdateStatus,
    bulkDelete,
    bulkUpdateDates,
    bulkUpdateDuration,
    bulkSetParent,
    confirmBulkDelete,
  };

  return (
    <ScheduleCommandCenter
      projectName={selectedProject?.name || ""}
      tasks={tasksWithEffective as any}
      onAddTask={() => setShowAddTask(true)}
      onBulkAdd={() => setShowBulkAdd(true)}
      onWbsBuilder={() => setShowWbsBuilder(true)}
      onImportMpp={() => fileInputRef.current?.click()}
      importing={importing}
      onExportIcs={handleExportIcs}
      onExportPdf={handleExportPdf}
      exportingPdf={exportingPdf}
      projectAvailable={Boolean(projectId)}
      hasTasks={scheduleTasks.length > 0}
      view={view}
      onOpenTask={(task) => {
        setSelectedTask(task as ScheduleTask);
        setShowDrawer(true);
      }}
      projectHealth={selectedProject?.health_status ?? null}
      pctComplete={undefined}
      fileInput={(
        <input
          ref={fileInputRef}
          type="file"
          accept=".mpp,.xml"
          style={{ display: "none" }}
          aria-label="Import Microsoft Project XML"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleImportMpp(file);
          }}
        />
      )}
    >
      <ScheduleBody {...bodyProps} bulkParentBackdrop="color-mix(in srgb, var(--bg-base) 60%, transparent)" />
    </ScheduleCommandCenter>
  );
}
