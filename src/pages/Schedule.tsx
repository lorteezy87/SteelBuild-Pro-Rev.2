import { useRef, useMemo, useState, useEffect } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { PHASES } from "@/utils/phases";
import { batchProcess } from "@/utils/batchProcess";
import { getWeatherRiskForProject } from "@/lib/weatherRisk";
import { applyEffectiveDates, computeEffectiveDates } from "@/services/scheduleCascade";
import { applySteelOpsSchedule } from "@/lib/schedule/applySteelOpsSchedule";
import { invalidateEntity } from "@/services/cacheRegistry";
import { useProjectId } from "@/hooks/useProjectId";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
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
import { useResetOnProjectChange } from "@/hooks/useResetOnProjectChange";
import { buildBrief, scheduleHealthFromBrief } from "@/components/schedule/rivetBriefEngine";

export default function Schedule() {
  const [searchParams] = useSearchParams();
  const projectId = useProjectId();
  const [view, setView] = useState("gantt");
  const [expandedTask, setExpandedTask] = useState<any>(null);
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

  useResetOnProjectChange(projectId, () => {
    setShowDrawer(false);
    setShowAddTask(false);
    setShowBulkAdd(false);
    setShowWbsBuilder(false);
    setShowBulkResource(false);
    setShowBulkDates(false);
    setShowBulkDuration(false);
    setShowBulkParent(false);
    setShowBulkDeleteConfirm(false);
    setSelectedTask(null);
    setDeleteTarget(null);
    setSelectedIds(new Set());
    setExpandedTask(null);
  });

  const { scheduleTasks: scheduleTasksRaw, isLoading: scheduleTasksLoading } = useScheduleTasks(projectId);
  const scheduleTasks = scheduleTasksRaw as unknown as ScheduleTask[];
  useAutoOpenEdit(scheduleTasks, (task) => {
    setSelectedTask(task);
    setShowDrawer(true);
  }, { enabled: !scheduleTasksLoading, param: "recordId" });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: submittals = [] } = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => projectId ? entities.Document.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    select: (docs: any[]) => docs.filter((d) => d.is_submittal && d.linked_wp_id),
  });

  const selectedProject: any = projects.find((p) => p.id === projectId) || null;

  const { data: weatherRisk = null } = useQuery({
    queryKey: ["weather-risk", projectId, selectedProject?.address],
    queryFn: () => selectedProject ? getWeatherRiskForProject(selectedProject) : null,
    enabled: !!selectedProject?.address,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const { tasks: enrichedTasks, toBackfill: wbsBackfill } = useMemo(() => {
    if (!scheduleTasks.length) return { tasks: scheduleTasks, toBackfill: [] as Array<{ id: string; wbs: string }> };
    return computePhaseWbs(scheduleTasks);
  }, [scheduleTasks]);

  const attemptedWbsRef = useRef(new Set<string>());
  useEffect(() => {
    const todo = wbsBackfill.filter(({ id }) => !attemptedWbsRef.current.has(id));
    if (todo.length === 0) return;
    todo.forEach(({ id }) => attemptedWbsRef.current.add(id));
    batchProcess(
      todo,
      ({ id, wbs }) => entities.ScheduleTask.update(id, { wbs_code: wbs }),
    ).then(({ succeeded, failed }) => {
      if (succeeded.length > 0) invalidateEntity(qc, "schedule_task", projectId);
      if (failed.length > 0) {
        console.warn(`[Schedule] WBS backfill: ${succeeded.length} ok, ${failed.length} failed`);
      }
    }).catch((err) => {
      console.warn("[Schedule] WBS backfill batch failed:", err?.message);
    });
  }, [wbsBackfill, qc, projectId]);

  const effectiveDatesMap = useMemo(
    () => computeEffectiveDates(enrichedTasks),
    [enrichedTasks]
  );

  const tasksWithEffective = useMemo(
    () => applyEffectiveDates(enrichedTasks, effectiveDatesMap),
    [enrichedTasks, effectiveDatesMap]
  );

  const tasksWithSteelOps = useMemo(
    () => applySteelOpsSchedule(tasksWithEffective as any).tasks as ScheduleTask[],
    [tasksWithEffective],
  );

  const scheduleBrief = useMemo(() => buildBrief(enrichedTasks), [enrichedTasks]);

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
    tasksWithEffective: tasksWithSteelOps,
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

  const bulkParentOptions = useMemo(
    () => computeBulkParentOptions(enrichedTasks, selectedIds),
    [selectedIds, enrichedTasks],
  );

  const phaseCounts = useMemo(() => {
    const m: Record<string, number> = { all: scheduleTasks.length };
    PHASES.forEach((p) => {
      m[p] = scheduleTasks.filter((t) => t.phase === p).length;
    });
    return m;
  }, [scheduleTasks]);

  const bodyProps = {
    phaseCounts,
    scheduleBrief,
    tasksWithEffective: tasksWithSteelOps,
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
      tasks={tasksWithSteelOps as any}
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
      projectHealth={scheduleHealthFromBrief(scheduleBrief)}
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
