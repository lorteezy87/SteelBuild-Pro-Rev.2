import { useMutation } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { batchProcess } from "@/utils/batchProcess";
import { downloadIcs, scheduleTaskToEvent } from "@/lib/icsExport";
import { invalidateEntity } from "@/services/cacheRegistry";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { reparentTasks } from "@/lib/schedule/reparentTasks";
import {
  stripPredecessorLinks,
  describePredecessorCleanup,
} from "@/lib/schedule/predecessorCleanup";
import { deriveActualsPatch, hasActualsPatch } from "@/lib/schedule/actuals";
import { taskDurationDays, finishFromDuration } from "@/lib/schedule/duration";
import { generateWBS, sanitizeScheduleTaskUpdatePayload } from "./wbs";
import { parseMsProjectXml } from "./mppImport";
import { commitImportedScheduleTasks } from "./commitImportedTasks";
import { filterEditableTasks } from "./scheduleTaskHelpers";
import { buildScheduleResourceAssignPatch } from "./scheduleAssignmentHelpers";
import type { ScheduleTask } from "./types";
import { assertScheduleDateRange } from "./scheduleDateValidation";

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
      // Stamp actuals only on a real status TRANSITION, compared against the
      // stored row. Deriving from `data.status` alone would re-stamp on every
      // unrelated save of an already-Complete task.
      const previous = data?.id ? scheduleTasks.find((t) => t.id === data.id) : undefined;
      const merged: Record<string, any> = { ...data };
      if (previous && data?.status && data.status !== previous.status) {
        const actuals = deriveActualsPatch({ task: previous, nextStatus: data.status });
        for (const [key, value] of Object.entries(actuals)) {
          // A date the user typed in the drawer wins, including an explicit
          // null — clearing a wrong actual must not be undone by the stamp.
          if (!(key in merged) || merged[key] === undefined) merged[key] = value;
        }
      }
      // Sanitize AFTER merging so assertScheduleDateRange validates the payload
      // that is actually sent, actuals included.
      const { id, fields } = sanitizeScheduleTaskUpdatePayload(merged as ScheduleTask);
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
      assertScheduleDateRange(scoped as ScheduleTask);
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

  /**
   * Remove predecessor links pointing at tasks that were just deleted.
   *
   * `dependencies` is TEXT-holding-JSON with no foreign key, so Postgres cannot
   * cascade; without this the link survives its predecessor and silently stops
   * constraining the successor (§1.6 — 19% of production links were orphaned).
   *
   * Runs AFTER the delete on purpose. Stripping first would remove real
   * sequencing logic from surviving tasks if the delete then failed; running
   * second means the worst case is the status quo — an orphan we report rather
   * than hide. Scans `scheduleTasks` (the whole project, unfiltered), never the
   * phase-filtered rows.
   */
  const cleanupPredecessorsFor = async (deletedIds: string[]) => {
    const patches = stripPredecessorLinks(scheduleTasks, deletedIds);
    if (patches.length === 0) return { patches, failed: 0 };
    const results = await batchProcess(patches, (patch: any) =>
      entities.ScheduleTask.update(patch.id, { dependencies: patch.dependencies }),
    );
    return { patches, failed: results.failed.length };
  };

  const deleteTaskMut = useMutation({
    mutationFn: async (id: string) => {
      await entities.ScheduleTask.delete(id);
      return cleanupPredecessorsFor([id]);
    },
    onSuccess: (cleanup) => {
      invalidateEntity(qc, "schedule_task", projectId);
      setShowDrawer(false);
      setSelectedTask(null);
      setDeleteTarget(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (selectedTask?.id) next.delete(selectedTask.id);
        return next;
      });
      if (cleanup.failed > 0) {
        // The delete succeeded; only the link cleanup didn't. Saying "Delete
        // failed" would be false, and saying nothing leaves a dangling link the
        // PM has no way to know about.
        toast.warning(
          `Task deleted, but ${cleanup.failed} successor${cleanup.failed === 1 ? "" : "s"} still reference it. Re-open those tasks to clear the link.`,
        );
      } else {
        const cleaned = describePredecessorCleanup(cleanup.patches);
        toast.success(cleaned ? `Task deleted. ${cleaned}.` : "Task deleted");
      }
    },
    onError: (err: unknown) => toast.error(toUserErrorMessage(err, "Delete failed")),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      // Stamp actuals per task, not once for the batch: the patch depends on
      // what each task has already recorded. A task already carrying a finish
      // date keeps it — re-marking a batch Complete must not overwrite the day
      // work actually finished with the day someone tidied up the board.
      const byId = new Map(scheduleTasks.map((t) => [t.id, t]));
      let stamped = 0;

      const results = await batchProcess(ids, (id: any) => {
        const actuals = deriveActualsPatch({ task: byId.get(id), nextStatus: status });
        if (hasActualsPatch(actuals)) stamped += 1;
        return entities.ScheduleTask.update(id, {
          status,
          percent_complete: status === "Complete" ? 100 : status === "Not Started" ? 0 : undefined,
          ...actuals,
        });
      });
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return { ...results, stamped };
    },
    onSuccess: (results, variables) => {
      invalidateEntity(qc, "schedule_task", projectId);
      setSelectedIds(new Set());
      // Name the side effect. Silently writing a date onto a task is exactly the
      // kind of invisible write this batch exists to stop.
      const stampedMsg = results.stamped > 0
        ? ` Recorded actual dates on ${results.stamped}.`
        : "";
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed.${stampedMsg}`);
      } else {
        toast.success(`Updated ${variables.ids.length} tasks.${stampedMsg}`);
      }
    },
    onError: (err: unknown) => toast.error(toUserErrorMessage(err, "Bulk update failed")),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await batchProcess(ids, (id: any) => entities.ScheduleTask.delete(id));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} deletes failed.`);
      }
      // Clean up links only for the rows that actually went away. Using `ids`
      // here would strip links to tasks whose delete failed and are still live.
      const deleted = results.succeeded.map((s: any) => String(s.item));
      const cleanup = await cleanupPredecessorsFor(deleted);
      return { ...results, cleanup };
    },
    onSuccess: (results, ids) => {
      invalidateEntity(qc, "schedule_task", projectId);
      setSelectedIds(new Set());
      if (selectedTask?.id && ids.includes(selectedTask.id)) {
        setSelectedTask(null);
        setShowDrawer(false);
      }
      const cleaned = describePredecessorCleanup(results.cleanup.patches);
      const cleanedMsg = cleaned ? ` ${cleaned}.` : "";
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} deleted, ${results.failed.length} failed.${cleanedMsg}`);
      } else if (results.cleanup.failed > 0) {
        toast.warning(
          `Tasks deleted, but ${results.cleanup.failed} successor${results.cleanup.failed === 1 ? "" : "s"} still reference them. Re-open those tasks to clear the link.`,
        );
      } else {
        toast.success(cleaned ? `Tasks deleted.${cleanedMsg}` : "Tasks deleted");
      }
    },
    onError: (err: unknown) => toast.error(toUserErrorMessage(err, "Bulk delete failed")),
  });

  const bulkResourceMut = useMutation({
    mutationFn: async ({ ids, resource_names }: { ids: string[]; resource_names: string }) => {
      const patch = buildScheduleResourceAssignPatch(resource_names);
      const results = await batchProcess(
        ids,
        (id: any) => entities.ScheduleTask.update(id, patch),
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
      const selected = enrichedTasks.filter((task) => task.id && ids.includes(task.id));
      const editable = filterEditableTasks(selected);
      const skipped = selected.length - editable.length;

      if (editable.length === 0) {
        throw new Error("Summary tasks roll up from child tasks. Select child tasks to bulk edit dates.");
      }

      editable.forEach((task) => assertScheduleDateRange({ ...task, ...fields }));

      const results = await batchProcess(
        editable.map((task) => task.id as string),
        (id: any) => entities.ScheduleTask.update(id, fields),
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
      const selected = enrichedTasks.filter((task) => task.id && ids.includes(task.id));
      const editable = filterEditableTasks(selected);
      const skipped = selected.length - editable.length;

      if (editable.length === 0) {
        throw new Error("Summary tasks roll up from child tasks. Select child tasks to bulk edit durations.");
      }

      const results = await batchProcess(
        editable,
        (task: any) => {
          // Read the DERIVED duration, not the stored column. Bulk Duration used
          // to read `task.duration` — stale on 199 of 338 dated rows — and then
          // rewrite end_date from it, moving a finish date using a number the UI
          // had never shown the user (§2.4).
          const current = taskDurationDays(task) ?? 0;
          let newDur;
          if (mode === "set") newDur = days;
          else if (mode === "add") newDur = current + days;
          else newDur = Math.max(1, current - days);

          const fields: Record<string, any> = { duration: newDur };
          if (task.start_date) {
            // start + (newDur - 1): day 1 is the start date. Using addDaysIso
            // directly here would add a day to every task on every bulk edit.
            const end = finishFromDuration(task.start_date, newDur);
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
      rows.forEach((row) => assertScheduleDateRange(row));
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

      const { created } = await commitImportedScheduleTasks({
        tasks: allParsed,
        projectId,
        qc,
      });
      toast.success(`Imported ${created} tasks from ${file.name}`);
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
    if (!projectId || scheduleTasks.length === 0 || exportingPdf) return;
    setExportingPdf(true);
    const t = toast.loading("Generating PDF…");
    try {
      const { exportGanttToPdf } = await import("@/lib/exportGanttPdf");
      const { pageCount, filename } = await exportGanttToPdf({
        project: selectedProject,
        tasks: tasksWithEffective.length ? tasksWithEffective : scheduleTasks,
      });
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

  void view;

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
