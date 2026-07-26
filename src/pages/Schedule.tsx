import { useRef, useMemo, useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PHASES } from "@/utils/phases";
import { batchProcess } from "@/utils/batchProcess";
import { downloadIcs, scheduleTaskToEvent } from "@/lib/icsExport";
import { getWeatherRiskForProject } from "@/lib/weatherRisk";
import { addDaysIso, applyEffectiveDates, computeEffectiveDates } from "@/services/scheduleCascade";
import { invalidateEntity } from "@/services/cacheRegistry";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { useProjectId } from "@/hooks/useProjectId";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import { useScheduleTasks } from "@/hooks/useScheduleTasks";
import { computePhaseWbs, generateWBS, sanitizeScheduleTaskUpdatePayload } from "./schedule/wbs";
import { PHASE_NAME_MAP, derivePhaseFromHierarchy, deriveMppDependencies, inferTaskType, parseMsProjectXml } from "./schedule/mppImport";
import { reparentTasks } from "@/lib/schedule/reparentTasks";
import { computeBulkParentOptions, filterEditableTasks } from "./schedule/scheduleTaskHelpers";
import { normalizeSchedulePhase } from "./schedule/schedulePageHelpers";
import type { ScheduleTask } from "./schedule/types";
import ScheduleCommandCenter from "./schedule/ScheduleCommandCenter";
import ScheduleBody from "./schedule/ScheduleBody";
import { useScheduleModals } from "./schedule/useScheduleModals";
import { useTaskSelection } from "./schedule/useTaskSelection";
import { buildScheduleResourceAssignPatch } from "./schedule/scheduleAssignmentHelpers";
import { useResetOnProjectChange } from "@/hooks/useResetOnProjectChange";

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

  // useScheduleTasks is still .js and yields DB rows (RowWithAliases<"schedule_tasks">,
  // whose nullable columns are `string | null`). ScheduleTask is the loose view-model
  // the whole schedule layer consumes (optional fields + `[key: string]: any`); every
  // consumer here is already null-safe. Normalize once at the boundary so downstream
  // call sites stay clean. Removable once the hook is typed.
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
    setBulkSaving(true);
    try {
      // Build a running snapshot of tasks so each new WBS is unique
      const snapshot = [...scheduleTasks];
      for (const row of rows) {
        const scoped = withProjectId(row as Record<string, unknown>, projectId);
        const wbs = (scoped.wbs_code as string | undefined) || generateWBS(scoped.phase as string | undefined, snapshot);
        const task = { ...scoped, wbs_code: wbs };
        await entities.ScheduleTask.create(task);
        snapshot.push(task as any); // include in snapshot for next WBS calculation
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

  const handleImportMPP = async (file: File) => {
    if (!projectId) {
      toast.error("Select a project before importing");
      return;
    }
    setImporting(true);

    // Reject binary .mpp files — only XML exports are supported
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.mpp') && !fileName.endsWith('.xml')) {
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
            if (file) handleImportMPP(file);
          }}
        />
      )}
    >
      <ScheduleBody {...bodyProps} bulkParentBackdrop="color-mix(in srgb, var(--bg-base) 60%, transparent)" />
    </ScheduleCommandCenter>
  );
}
