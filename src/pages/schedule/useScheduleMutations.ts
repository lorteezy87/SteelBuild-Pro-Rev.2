import { useMutation } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { PHASES } from "@/utils/phases";
import { batchProcess } from "@/utils/batchProcess";
import { downloadIcs, scheduleTaskToEvent } from "@/lib/icsExport";
import { addDaysIso } from "@/services/scheduleCascade";
import { invalidateEntity } from "@/services/cacheRegistry";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { reparentTasks } from "@/lib/schedule/reparentTasks";
import { generateWBS, sanitizeScheduleTaskUpdatePayload } from "./wbs";
import {
  PHASE_NAME_MAP,
  derivePhaseFromHierarchy,
  deriveMppDependencies,
  inferTaskType,
  parseMsProjectXml,
} from "./mppImport";
import { filterEditableTasks } from "./scheduleTaskHelpers";
import { buildScheduleResourceAssignPatch } from "./scheduleAssignmentHelpers";
import type { ScheduleTask } from "./types";

export interface UseScheduleMutationsParams {
  projectId: string | null | undefined;
  qc: QueryClient;
  scheduleTasks: ScheduleTask[];
  enrichedTasks: ScheduleTask[];
  tasksWithEffective: ScheduleTask[];
  selectedProject: any;
  selectedTask: ScheduleTask | null;
  selectedIds: Set<string>;
  setSelectedTask: Dispatch<SetStateAction<ScheduleTask | null>>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setShowDrawer: Dispatch<SetStateAction<boolean>>;
  setShowAddTask: Dispatch<SetStateAction<boolean>>;
  setShowBulkAdd: Dispatch<SetStateAction<boolean>>;
  setShowBulkResource: Dispatch<SetStateAction<boolean>>;
  setShowBulkDates: Dispatch<SetStateAction<boolean>>;
  setShowBulkDuration: Dispatch<SetStateAction<boolean>>;
  setShowBulkParent: Dispatch<SetStateAction<boolean>>;
  setShowBulkDeleteConfirm: Dispatch<SetStateAction<boolean>>;
  setDeleteTarget: Dispatch<SetStateAction<ScheduleTask | null>>;
  setBulkResourceValue: Dispatch<SetStateAction<string>>;
  setBulkSaving: Dispatch<SetStateAction<boolean>>;
  setImporting: Dispatch<SetStateAction<boolean>>;
  view: string;
  exportingPdf: boolean;
  setExportingPdf: Dispatch<SetStateAction<boolean>>;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
}

export function useScheduleMutations({
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
}: UseScheduleMutationsParams) {
  const updateTaskMut = useMutation({
    mutationFn: (data: ScheduleTask) => {
      const { id, fields } = sanitizeScheduleTaskUpdatePayload(data);
      if (!id) throw new Error("Cannot update a task without an id");
      return entities.ScheduleTask.update(id, fields);
    },
    onSuccess: () => {
      invalidateEntity(qc, "schedule_task", projectId);
      setShowDrawer(false);
      setSelectedTask(null);
      toast.success("Task updated");
    },
    onError: (err: unknown) => toast.error(`Update failed: ${toUserErrorMessage(err)}`),
  });

  const reparentMut = useMutation({
    mutationFn: (vars: { ids: string[]; newParentId: string | null; dropIndex?: number | null }) =>
      reparentTasks(vars.ids, vars.newParentId, {
        tasks: enrichedTasks,
        dropIndex: vars.dropIndex ?? null,
        projectId: projectId || undefined,
        projectName: selectedProject?.name || undefined,
      }),
    onSuccess: (_r, vars) => {
      invalidateEntity(qc, "schedule_task", projectId);
      setSelectedIds(new Set());
      toast.success(vars.ids.length > 1 ? `Reparented ${vars.ids.length} tasks` : "Task moved");
    },
    onError: (err: unknown) => {
      invalidateEntity(qc, "schedule_task", projectId);
      toast.error(toUserErrorMessage(err, "Reparent failed"));
    },
  });

  const createTaskMut = useMutation({
    mutationFn: (data: ScheduleTask) => {
      const scoped = withProjectId(data as Record<string, unknown>, projectId);
      const wbs = (scoped.wbs_code as string | undefined) || generateWBS(scoped.phase as string | undefined, scheduleTasks);
      return entities.ScheduleTask.create({ ...scoped, wbs_code: wbs } as any);
    },
    onSuccess: () => {
      invalidateEntity(qc, "schedule_task", projectId);
      setShowAddTask(false);
      toast.success("Task created");
    },
    onError: (err: unknown) => toast.error(`Create failed: ${toUserErrorMessage(err)}`),
  });

  const deleteTaskMut = useMutation({
    mutationFn: (id: string) => entities.ScheduleTask.delete(id),
    onSuccess: () => {
      invalidateEntity(qc, "schedule_task", projectId);
      setShowDrawer(false);
      setSelectedTask(null);
      setDeleteTarget(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (selectedTask?.id) next.delete(selectedTask.id);
        return next;
      });
      toast.success("Task deleted");
    },
    onError: (err: unknown) => toast.error(toUserErrorMessage(err, "Delete failed")),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const results = await batchProcess(
        ids,
        (id) => entities.ScheduleTask.update(id, {
          status,
          percent_complete: status === "Complete" ? 100 : status === "Not Started" ? 0 : undefined,
        }),
      );
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: (results, variables) => {
      invalidateEntity(qc, "schedule_task", projectId);
      setSelectedIds(new Set());
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed`);
      } else {
        toast.success(`Updated ${variables.ids.length} tasks`);
      }
    },
    onError: (err: unknown) => toast.error(toUserErrorMessage(err, "Bulk update failed")),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await batchProcess(ids, (id) => entities.ScheduleTask.delete(id));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} deletes failed.`);
      }
      return results;
    },
    onSuccess: (results, ids) => {
      invalidateEntity(qc, "schedule_task", projectId);
      setSelectedIds(new Set());
      if (selectedTask?.id && ids.includes(selectedTask.id)) {
        setSelectedTask(null);
        setShowDrawer(false);
      }
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} deleted, ${results.failed.length} failed`);
      } else {
        toast.success("Tasks deleted");
      }
    },
    onError: (err: unknown) => toast.error(toUserErrorMessage(err, "Bulk delete failed")),
  });

  const bulkResourceMut = useMutation({
    mutationFn: async ({ ids, resource_names }: { ids: string[]; resource_names: string }) => {
      const patch = buildScheduleResourceAssignPatch(resource_names);
      const results = await batchProcess(
        ids,
        (id) => entities.ScheduleTask.update(id, patch),
      );
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: (results) => {
      invalidateEntity(qc, "schedule_task", projectId);
      setSelectedIds(new Set());
      setShowBulkResource(false);
      setBulkResourceValue("");
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} assigned, ${results.failed.length} failed`);
      } else {
        toast.success(`Resources assigned to ${results.succeeded.length} tasks`);
      }
    },
    onError: (err: unknown) => toast.error(toUserErrorMessage(err, "Bulk resource assignment failed")),
  });

  const bulkDateMut = useMutation({
    mutationFn: async ({ ids, fields }: { ids: string[]; fields: Record<string, any> }) => {
      const selected = tasksWithEffective.filter((task) => ids.includes(task.id));
      const editable = filterEditableTasks(selected);
      const skipped = selected.length - editable.length;

      if (editable.length === 0) {
        throw new Error("Summary tasks roll up from child tasks. Select child tasks to bulk edit dates.");
      }

      const results = await batchProcess(
        editable.map((task) => task.id),
        (id) => entities.ScheduleTask.update(id, fields),
      );

      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} date updates failed.`);
      }

      return { ...results, skipped };
    },
    onSuccess: (results) => {
      invalidateEntity(qc, "schedule_task", projectId);
      setSelectedIds(new Set());
      setShowBulkDates(false);

      const skippedMsg = results.skipped > 0
        ? ` ${results.skipped} summary row${results.skipped === 1 ? "" : "s"} skipped.`
        : "";
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} date update${results.succeeded.length === 1 ? "" : "s"} applied, ${results.failed.length} failed.${skippedMsg}`);
      } else {
        toast.success(`${results.succeeded.length} task date${results.succeeded.length === 1 ? "" : "s"} updated.${skippedMsg}`);
      }
    },
    onError: (err: unknown) => toast.error(toUserErrorMessage(err, "Bulk date update failed")),
  });

  const bulkDurationMut = useMutation({
    mutationFn: async ({ ids, mode, days }: { ids: string[]; mode: string; days: number }) => {
      const selected = tasksWithEffective.filter((task) => ids.includes(task.id));
      const editable = filterEditableTasks(selected);
      const skipped = selected.length - editable.length;

      if (editable.length === 0) {
        throw new Error("Summary tasks roll up from child tasks. Select child tasks to bulk edit durations.");
      }

      const results = await batchProcess(
        editable,
        (task) => {
          const current = parseInt(task.duration, 10) || 0;
          let newDur;
          if (mode === "set") newDur = days;
          else if (mode === "add") newDur = current + days;
          else newDur = Math.max(0, current - days);

          const fields: Record<string, any> = { duration: newDur };
          if (task.start_date) {
            // UTC-safe: adding days via new Date(str+"T00:00:00") (local) then
            // .toISOString() (UTC) shifts end_date by a day under a non-zero UTC
            // offset. addDaysIso does the arithmetic in UTC — timezone-independent.
            const end = addDaysIso(task.start_date, newDur);
            if (end) fields.end_date = end;
          }
          return entities.ScheduleTask.update(task.id, fields);
        },
      );

      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} duration updates failed.`);
      }
      return { ...results, skipped };
    },
    onSuccess: (results) => {
      invalidateEntity(qc, "schedule_task", projectId);
      setSelectedIds(new Set());
      setShowBulkDuration(false);

      const skippedMsg = results.skipped > 0
        ? ` ${results.skipped} summary row${results.skipped === 1 ? "" : "s"} skipped.`
        : "";
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} duration${results.succeeded.length === 1 ? "" : "s"} updated, ${results.failed.length} failed.${skippedMsg}`);
      } else {
        toast.success(`${results.succeeded.length} task duration${results.succeeded.length === 1 ? "" : "s"} updated.${skippedMsg}`);
      }
    },
    onError: (err: unknown) => toast.error(toUserErrorMessage(err, "Bulk duration update failed")),
  });

  const handleBulkAdd = async (rows: any[]) => {
    if (!projectId) return;
    setBulkSaving(true);
    try {
      const pid = projectId;
      // Build a running snapshot of tasks so each new WBS is unique
      const snapshot = [...scheduleTasks];
      for (const row of rows) {
        const scoped = withProjectId(row as Record<string, unknown>, projectId);
        const wbs = (scoped.wbs_code as string | undefined) || generateWBS(scoped.phase as string | undefined, snapshot);
        const task = { ...scoped, wbs_code: wbs };
        await entities.ScheduleTask.create(task);
        snapshot.push(task as ScheduleTask);
      }
      invalidateEntity(qc, "schedule_task", projectId);
      setShowBulkAdd(false);
      toast.success(`Created ${rows.length} task${rows.length !== 1 ? "s" : ""}`);
    } catch (err: unknown) {
      toast.error(`Bulk add failed: ${toUserErrorMessage(err)}`);
    } finally {
      setBulkSaving(false);
    }
  };

  const handleImportMpp = async (file: File) => {
    if (!projectId) {
      toast.error("Select a project before importing");
      return;
    }
    setImporting(true);

    // Reject binary .mpp files — only XML exports are supported
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".mpp") && !fileName.endsWith(".xml")) {
      toast.error("Binary .mpp files are not supported directly. Please export from MS Project as XML first (File → Save As → XML).");
      setImporting(false);
      return;
    }

    try {
      const text = await file.text();
      const allParsed = parseMsProjectXml(text);
      if (!allParsed.length) {
        throw new Error("Couldn't read tasks from the file. Please export the MPP as XML (File → Save As → XML) and retry.");
      }

      const pid = projectId;
      // UID → created task ID mapping (for linking predecessors + parent)
      const uidToDbId: Record<string, string> = {};
      // UID → parent UID mapping (based on outline levels)
      const uidToParentUid: Record<string, string> = {};
      const summaryStack: Array<{ uid: string; outlineLevel: number }> = []; // stack of { uid, outlineLevel }

      // First pass: determine parent relationships from outline levels
      allParsed.forEach((t) => {
        while (summaryStack.length > 0 && summaryStack[summaryStack.length - 1].outlineLevel >= t.outlineLevel) {
          summaryStack.pop();
        }
        if (summaryStack.length > 0) {
          uidToParentUid[t.uid] = summaryStack[summaryStack.length - 1].uid;
        }
        if (t.isSummary) {
          summaryStack.push({ uid: t.uid, outlineLevel: t.outlineLevel });
        }
      });

      // Create ALL tasks (including summaries) in order — sequential to preserve parent refs
      for (const t of allParsed) {
        const phaseName = derivePhaseFromHierarchy(t, allParsed);
        const phase = PHASE_NAME_MAP[phaseName?.toUpperCase() ?? ""] || phaseName || "Fabrication";

        const parentUid = uidToParentUid[t.uid];
        const parentDbId = parentUid ? uidToDbId[parentUid] : null;

        const record = await entities.ScheduleTask.create(withProjectId({
          task_name: t.name,
          task_type: inferTaskType(t.name, t.isSummary, t.milestone),
          phase: PHASES.includes(phase) ? phase : "Fabrication",
          // Unknown imported dates stay null (rendered as TBD) — never invent today.
          start_date: t.start ?? null,
          end_date: t.finish ?? t.start ?? null,
          status: t.pct >= 100 ? "Complete" : t.pct > 0 ? "In Progress" : "Not Started",
          percent_complete: t.pct,
          priority: "Normal",
          milestone: t.milestone,
          wbs_code: t.outlineNumber || null,
          outline_level: t.outlineLevel,
          duration: t.durationDays,
          resource_names: t.resources.length > 0 ? t.resources.join(", ") : null,
          parent_task_id: parentDbId,
          notes: t.notes || null,
          is_summary: t.isSummary || false,
          // Dependencies will be set in a second pass after all tasks exist
        }, pid) as any);
        uidToDbId[t.uid] = record.id;
      }

      // Second pass: set dependencies (predecessors) now that all tasks have DB IDs.
      // MS Project encodes link type as Type (0=FF, 1=FS, 2=SF, 3=SS) and
      // LinkLag as tenths of minutes (positive = lag, negative = lead).
      // We now persist the full link object — { id, type, lag_days } —
      // so the cascade picks up the right semantics on first render
      // instead of assuming FS+1 for everything imported.
      const depItems = deriveMppDependencies(allParsed, uidToDbId);
      if (depItems.length > 0) {
        await batchProcess(
          depItems,
          ({ dbId, predLinks }) => entities.ScheduleTask.update(dbId, {
            dependencies: JSON.stringify(predLinks),
          }),
        );
      }

      invalidateEntity(qc, "schedule_task", projectId);
      toast.success(`Imported ${Object.keys(uidToDbId).length} tasks from ${file.name}`);
    } catch (e: unknown) {
      toast.error(toUserErrorMessage(e, "Import failed"));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleExportIcs = () => {
    if (!projectId || scheduleTasks.length === 0) return;
    // Use the effective-date overlay so calendar entries match where the
    // Gantt actually places each task. Stored dates would put cascaded tasks
    // on the wrong week.
    const events = tasksWithEffective
      .map((t) => scheduleTaskToEvent(t, selectedProject?.project_number || ""))
      .filter(Boolean);
    if (events.length === 0) {
      toast.info("No tasks with dates to export.");
      return;
    }
    downloadIcs({
      filename: `schedule-${selectedProject?.project_number || "project"}.ics`,
      calendarName: `${selectedProject?.name || "Project"} — Schedule`,
      events,
    });
    toast.success(`Exported ${events.length} tasks to calendar`);
  };

  const handleExportPdf = async () => {
    if (!projectId || scheduleTasks.length === 0 || view !== "gantt" || exportingPdf) return;
    setExportingPdf(true);
    const t = toast.loading("Generating PDF…");
    try {
      const { exportGanttToPdf } = await import("@/lib/exportGanttPdf");
      const { pageCount, filename } = await exportGanttToPdf({
        project: selectedProject,
      } as any);
      toast.success(
        `Exported ${filename}${pageCount > 1 ? ` (${pageCount} pages)` : ""}`,
        { id: t },
      );
    } catch (err: unknown) {
      console.error("[Schedule] PDF export failed:", err);
      toast.error(`PDF export failed: ${toUserErrorMessage(err, "unknown error")}`, { id: t });
    } finally {
      setExportingPdf(false);
    }
  };

  const bulkUpdateStatus = (status: string) => {
    const ids = Array.from(selectedIds);
    if (!ids.length || bulkUpdateMut.isPending || bulkDeleteMut.isPending || bulkDateMut.isPending) return;
    bulkUpdateMut.mutate({ ids, status });
  };

  const bulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length || bulkDeleteMut.isPending || bulkUpdateMut.isPending || bulkDateMut.isPending) return;
    setShowBulkDeleteConfirm(true);
  };

  const bulkUpdateDates = (fields: Record<string, any>) => {
    const ids = Array.from(selectedIds);
    if (!ids.length || bulkDateMut.isPending || bulkDeleteMut.isPending || bulkUpdateMut.isPending) return;
    bulkDateMut.mutate({ ids, fields });
  };

  const bulkUpdateDuration = ({ mode, days }: { mode: string; days: number }) => {
    const ids = Array.from(selectedIds);
    if (!ids.length || bulkDurationMut.isPending || bulkDeleteMut.isPending || bulkUpdateMut.isPending) return;
    bulkDurationMut.mutate({ ids, mode, days });
  };

  const bulkSetParent = (newParentId: string | null) => {
    const ids = Array.from(selectedIds);
    if (!ids.length || reparentMut.isPending) return;
    void reparentMut.mutateAsync({ ids, newParentId }).then(
      () => setShowBulkParent(false),
      () => {
        /* toast via onError; keep picker open for retry */
      },
    );
  };

  const confirmBulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length || bulkDeleteMut.isPending) return;
    void bulkDeleteMut.mutateAsync(ids).then(
      () => setShowBulkDeleteConfirm(false),
      () => {
        /* toast via onError; keep confirm open for retry */
      },
    );
  };

  return {
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
  };
}
