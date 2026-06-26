import { Suspense, useRef, useMemo, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ScheduleRivetBriefRaw from "@/components/schedule/ScheduleRivetBrief";
import LookaheadPlanner from "@/components/schedule/LookaheadPlanner";
import ScheduleTaskList from "@/components/schedule/ScheduleTaskList";
import TaskDetailDrawerRaw from "@/components/schedule/TaskDetailDrawer";
import { PHASES, PHASE_NUMBER } from "@/utils/phases";
import { batchProcess } from "@/utils/batchProcess";
import { CommandBar as CommandBarRaw, KpiTile as KpiTileRaw, Button as ButtonRaw } from "@/components/design-system";
import { downloadIcs, scheduleTaskToEvent } from "@/lib/icsExport";
import { getWeatherRiskForProject } from "@/lib/weatherRisk";
import { applyEffectiveDates, computeEffectiveDates } from "@/services/scheduleCascade";
import { invalidateEntity } from "@/services/cacheRegistry";
import { useProjectId } from "@/hooks/useProjectId";
import { useScheduleTasks } from "@/hooks/useScheduleTasks";
import { generateWBS, sanitizeScheduleTaskUpdatePayload } from "./schedule/wbs";
import { PHASE_NAME_MAP, derivePhaseFromHierarchy, inferTaskType, parseMsProjectXml } from "./schedule/mppImport";
import { reparentTasks } from "@/lib/schedule/reparentTasks";
import { validReparentTargets } from "@/lib/schedule/hierarchy";
import BulkActionToolbar from "./schedule/BulkActionToolbar";
import type { ScheduleTask } from "./schedule/types";

// The design-system primitives are still .jsx; these casts are removable
// once the shared layer is typed.
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;
const CommandBar = CommandBarRaw as unknown as ComponentType<AnyProps>;
const KpiTile = KpiTileRaw as unknown as ComponentType<AnyProps>;
const Button = ButtonRaw as unknown as ComponentType<AnyProps>;
// These two schedule children are still .jsx and default their list props to
// `[]`, which TS infers as `never[]` — too narrow to accept ScheduleTask[].
// Wrap them at the import boundary like the primitives above; removable once
// the components are typed.
const ScheduleRivetBrief = ScheduleRivetBriefRaw as unknown as ComponentType<AnyProps>;
const TaskDetailDrawer = TaskDetailDrawerRaw as unknown as ComponentType<AnyProps>;
// Code-split the heaviest, view-/modal-gated schedule screens out of the
// Schedule route chunk. ScheduleGantt is by far the largest child (only renders
// on the Gantt tab) and the add/bulk/WBS modals only matter once opened, so
// deferring their fetch keeps the initial Schedule payload lean. Each is gated
// in JSX (view tab / open flag) so the chunk fetches lazily on first use, and a
// Suspense boundary at each render site shows a skeleton while it streams in.
// Casts at the boundary remain removable once these .jsx components are typed.
const ScheduleGantt = lazyWithRetry(
  () => import("@/components/schedule/ScheduleGantt"),
) as unknown as ComponentType<AnyProps>;
const AddTaskModal = lazyWithRetry(
  () => import("@/components/schedule/AddTaskModal"),
) as unknown as ComponentType<AnyProps>;
const BulkAddTaskModal = lazyWithRetry(
  () => import("@/components/schedule/BulkAddTaskModal"),
) as unknown as ComponentType<AnyProps>;
const BulkDateEditModal = lazyWithRetry(
  () => import("@/components/schedule/BulkDateEditModal"),
) as unknown as ComponentType<AnyProps>;
const BulkDurationEditModal = lazyWithRetry(
  () => import("@/components/schedule/BulkDurationEditModal"),
) as unknown as ComponentType<AnyProps>;
const WbsBuilderModal = lazyWithRetry(
  () => import("@/components/schedule/WbsBuilderModal"),
) as unknown as ComponentType<AnyProps>;

export default function Schedule() {
  const [searchParams] = useSearchParams();
  const projectId = useProjectId();
  const [view, setView] = useState("gantt");
  const [expandedTask, setExpandedTask] = useState<any>(null);
  // Seed the phase filter from the URL if a caller (e.g. the Portfolio
  // mini-Gantt) deep-linked with ?phase=Detailing. If the incoming
  // value doesn't match a known phase we silently fall back to "all"
  // so a typo'd URL doesn't leave the page empty.
  const initialPhase = (() => {
    const q = searchParams.get("phase");
    if (!q) return "all";
    return PHASES.includes(q) ? q : "all";
  })();
  const [phaseFilter, setPhaseFilter] = useState(initialPhase);
  const [selectedTask, setSelectedTask] = useState<ScheduleTask | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [showWbsBuilder, setShowWbsBuilder] = useState(false);
  const [ganttFocus, setGanttFocus] = useState<any>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleTask | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkResource, setShowBulkResource] = useState(false);
  const [bulkResourceValue, setBulkResourceValue] = useState("");
  const [showBulkDates, setShowBulkDates] = useState(false);
  const [showBulkDuration, setShowBulkDuration] = useState(false);
  const [showBulkParent, setShowBulkParent] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
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
    const phaseCounts: Record<string, number> = {};
    const result: ScheduleTask[] = [];
    // First pass: find the highest n seen per phase, accepting both
    // new-format (2.3 / 2.3.1) and legacy-format (DET-003) codes.
    scheduleTasks.forEach((t) => {
      if (!t.wbs_code) return;
      const ph = t.phase || "Other";
      let idx = 0;
      const mNew = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(t.wbs_code);
      if (mNew) idx = parseInt(mNew[2], 10);
      else {
        const mLeg = /(\d+)$/.exec(t.wbs_code);
        if (mLeg) idx = parseInt(mLeg[1], 10);
      }
      if (Number.isFinite(idx)) {
        phaseCounts[ph] = Math.max(phaseCounts[ph] || 0, idx);
      }
    });
    // Second pass: assign WBS to tasks missing it
    const toBackfill: Array<{ id: string; wbs: string }> = [];
    scheduleTasks.forEach((t) => {
      if (t.wbs_code) {
        result.push(t);
      } else {
        const ph = t.phase || "Other";
        const phaseNum = PHASE_NUMBER[ph] ?? 0;
        phaseCounts[ph] = (phaseCounts[ph] || 0) + 1;
        const wbs = `${phaseNum}.${phaseCounts[ph]}`;
        result.push({ ...t, wbs_code: wbs });
        // Only persisted rows (those with a DB id) can be backfilled; a row
        // without an id can't be UPDATE-targeted anyway, so skipping it is
        // behavior-preserving.
        if (t.id) toBackfill.push({ id: t.id, wbs });
      }
    });
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
    onError: (err: any) => toast.error("Update failed: " + err.message),
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
    onError: (err: any) => { invalidateEntity(qc, "schedule_task", projectId); toast.error(err?.message || "Reparent failed"); },
  });

  const createTaskMut = useMutation({
    mutationFn: (data: ScheduleTask) => {
      const pid = data.project_id || projectId;
      if (!pid) throw new Error("Select a project first");
      const wbs = data.wbs_code || generateWBS(data.phase, scheduleTasks);
      return entities.ScheduleTask.create({ ...data, project_id: pid, wbs_code: wbs } as any);
    },
    onSuccess: () => {
      invalidateEntity(qc, "schedule_task", projectId);
      setShowAddTask(false);
      toast.success("Task created");
    },
    onError: (err: any) => toast.error("Create failed: " + err.message),
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
    onError: () => toast.error("Delete failed"),
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
    onError: () => toast.error("Bulk update failed"),
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
    onError: () => toast.error("Bulk delete failed"),
  });

  const bulkResourceMut = useMutation({
    mutationFn: async ({ ids, resource_names }: { ids: string[]; resource_names: string }) => {
      const results = await batchProcess(
        ids,
        (id) => entities.ScheduleTask.update(id, { resource_names, assigned_to: resource_names }),
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
    onError: () => toast.error("Bulk resource assignment failed"),
  });

  const bulkDateMut = useMutation({
    mutationFn: async ({ ids, fields }: { ids: string[]; fields: Record<string, any> }) => {
      const selected = tasksWithEffective.filter((task) => ids.includes(task.id));
      const editable = selected.filter((task) => !task._hasChildren && !task._isRolledUpSummary && !task.is_summary);
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
    onError: (err: any) => toast.error(err?.message || "Bulk date update failed"),
  });

  const bulkDurationMut = useMutation({
    mutationFn: async ({ ids, mode, days }: { ids: string[]; mode: string; days: number }) => {
      const selected = tasksWithEffective.filter((task) => ids.includes(task.id));
      const editable = selected.filter((task) => !task._hasChildren && !task._isRolledUpSummary && !task.is_summary);
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
            const d = new Date(task.start_date + "T00:00:00");
            if (!isNaN(d.getTime())) {
              d.setDate(d.getDate() + newDur);
              fields.end_date = d.toISOString().split("T")[0];
            }
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
    onError: (err: any) => toast.error(err?.message || "Bulk duration update failed"),
  });

  const handleBulkAdd = async (rows: any[]) => {
    if (!projectId) return;
    setBulkSaving(true);
    try {
      const pid = projectId;
      // Build a running snapshot of tasks so each new WBS is unique
      const snapshot = [...scheduleTasks];
      for (const row of rows) {
        const wbs = row.wbs_code || generateWBS(row.phase, snapshot);
        const task = { ...row, project_id: pid, wbs_code: wbs };
        await entities.ScheduleTask.create(task);
        snapshot.push(task); // include in snapshot for next WBS calculation
      }
      invalidateEntity(qc, "schedule_task", projectId);
      setShowBulkAdd(false);
      toast.success(`Created ${rows.length} task${rows.length !== 1 ? "s" : ""}`);
    } catch (err: any) {
      toast.error("Bulk add failed: " + err.message);
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

        const record = await entities.ScheduleTask.create({
          project_id: pid,
          task_name: t.name,
          task_type: inferTaskType(t.name, t.isSummary, t.milestone),
          phase: PHASES.includes(phase) ? phase : "Fabrication",
          start_date: t.start ?? new Date().toISOString().split("T")[0],
          end_date: t.finish ?? t.start ?? new Date().toISOString().split("T")[0],
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
        });
        uidToDbId[t.uid] = record.id;
      }

      // Second pass: set dependencies (predecessors) now that all tasks have DB IDs.
      // MS Project encodes link type as Type (0=FF, 1=FS, 2=SF, 3=SS) and
      // LinkLag as tenths of minutes (positive = lag, negative = lead).
      // We now persist the full link object — { id, type, lag_days } —
      // so the cascade picks up the right semantics on first render
      // instead of assuming FS+1 for everything imported.
      const MS_LINK_TYPE: Record<string, string> = { "0": "FF", "1": "FS", "2": "SF", "3": "SS" };
      const TENTHS_PER_DAY = 10 * 60 * 8; // tenths of minutes in an 8h workday
      const depItems: Array<{ dbId: string; predLinks: Array<{ id: string; type: string; lag_days: number }> }> = [];
      allParsed.forEach((t) => {
        if (t.preds && t.preds.length > 0) {
          const dbId = uidToDbId[t.uid];
          const predLinks = t.preds
            .map((p) => {
              // predUid may be null/undefined; an absent/empty key misses the
              // map and is discarded by the !id guard below — same as before.
              const id = uidToDbId[p.predUid ?? ""];
              if (!id) return null;
              const type = MS_LINK_TYPE[p.linkType] || "FS";
              // Convert tenths-of-minutes to whole days; round so a
              // typical 1-day lag (4800 tenths) lands on lag_days=1.
              const lagTenths = Number(p.lagDuration) || 0;
              const lag_days = Math.round(lagTenths / TENTHS_PER_DAY);
              return { id, type, lag_days };
            })
            .filter(Boolean) as Array<{ id: string; type: string; lag_days: number }>;
          if (dbId && predLinks.length > 0) {
            depItems.push({ dbId, predLinks });
          }
        }
      });
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
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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
    if (!ids.length) return;
    reparentMut.mutate({ ids, newParentId });
    setShowBulkParent(false);
  };

  const confirmBulkDelete = () => {
    const ids = Array.from(selectedIds);
    bulkDeleteMut.mutate(ids);
    setShowBulkDeleteConfirm(false);
  };

  // Legal parent options for the bulk "Set Parent" picker — intersection of
  // valid reparent targets across every selected task, minus the selected tasks
  // themselves. A parent must be valid for ALL selected children.
  const bulkParentOptions = useMemo(() => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return [];
    let allowed: Set<string> | null = null;
    for (const childId of ids) {
      const v = validReparentTargets(enrichedTasks, childId);
      allowed = allowed ? new Set([...allowed].filter((x) => v.has(x))) : v;
    }
    const allowedSet = allowed || new Set<string>();
    ids.forEach((id) => allowedSet.delete(id));
    return enrichedTasks.filter((t: any) => allowedSet.has(t.id));
  }, [selectedIds, enrichedTasks]);

  // Phase counts for KPI row
  const phaseCounts = useMemo(() => {
    const m: Record<string, number> = { all: scheduleTasks.length };
    PHASES.forEach((p) => {
      m[p] = scheduleTasks.filter((t) => t.phase === p).length;
    });
    return m;
  }, [scheduleTasks]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* CommandBar */}
      <div
        style={{
          flexShrink: 0,
          padding: "16px 24px 0",
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "linear-gradient(180deg, var(--bg-page) 0%, color-mix(in srgb, var(--bg-page) 92%, transparent) 100%)",
          backdropFilter: "blur(18px)",
        }}
      >
        <CommandBar
          eyebrow={`PROJECT MANAGEMENT · ${(selectedProject?.name || "ALL PROJECTS").toUpperCase()}`}
          title="Schedule"
          count={scheduleTasks.length}
          unit=" TASKS"
          subtitle="Project lifecycle · Pre-Construction → Closeout"
        >
          {/* Import / Export group */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", paddingRight: 10, borderRight: "1px solid var(--divider)", marginRight: 4 }}>
            <Button
              variant="secondary"
              icon="upload"
              disabled={importing || !projectId}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? "IMPORTING…" : "IMPORT MPP"}
            </Button>
            <Button
              variant="secondary"
              icon="calendar"
              disabled={!projectId || scheduleTasks.length === 0}
              onClick={() => {
                // Use the effective-date overlay so calendar entries match
                // where the Gantt actually places each task — exporting
                // stored dates would put events on the wrong week for any
                // task pulled forward by a predecessor cascade.
                const events = tasksWithEffective
                  .map((t) => scheduleTaskToEvent(t, selectedProject?.project_number || ""))
                  .filter(Boolean);
                if (events.length === 0) { toast.info("No tasks with dates to export."); return; }
                downloadIcs({
                  filename: `schedule-${selectedProject?.project_number || "project"}.ics`,
                  calendarName: `${selectedProject?.name || "Project"} — Schedule`,
                  events,
                });
                toast.success(`Exported ${events.length} tasks to calendar`);
              }}
              title="Download .ics for Outlook / Teams / Google Calendar"
            >
              EXPORT .ICS
            </Button>
            <Button
              variant="secondary"
              icon="download"
              disabled={
                !projectId ||
                scheduleTasks.length === 0 ||
                view !== "gantt" ||
                exportingPdf
              }
              onClick={async () => {
                setExportingPdf(true);
                const t = toast.loading("Generating PDF…");
                try {
                  const { exportGanttToPdf } = await import("@/lib/exportGanttPdf");
                  const { pageCount, filename } = await exportGanttToPdf({
                    project: selectedProject,
                  } as any);
                  toast.success(
                    `Exported ${filename}${pageCount > 1 ? ` (${pageCount} pages)` : ""}`,
                    { id: t }
                  );
                } catch (err: any) {
                  console.error("[Schedule] PDF export failed:", err);
                  toast.error(`PDF export failed: ${err?.message || "unknown error"}`, { id: t });
                } finally {
                  setExportingPdf(false);
                }
              }}
              title={
                view !== "gantt"
                  ? "Switch to the Gantt view to export"
                  : "Export the Gantt chart as a PDF for distribution"
              }
            >
              {exportingPdf ? "EXPORTING…" : "EXPORT PDF"}
            </Button>
          </div>
          {/* AI tool */}
          <Button
            variant="secondary"
            icon="sparkles"
            disabled={!projectId}
            onClick={() => setShowWbsBuilder(true)}
            title="Generate a WBS from a short scope-of-work description — tasks are filed under the project's existing phases."
          >
            WBS BUILDER
          </Button>
          {/* Primary actions */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Button
              variant="outline"
              icon="plus"
              disabled={!projectId}
              onClick={() => setShowBulkAdd(true)}
            >
              BULK ADD
            </Button>
            <Button
              variant="primary"
              icon="plus"
              disabled={!projectId}
              onClick={() => setShowAddTask(true)}
            >
              ADD TASK
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mpp,.xml"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportMPP(f);
            }}
          />
        </CommandBar>
      </div>

      {/* Phase Filter — click-to-filter KPI tiles (one per lifecycle phase) */}
      <div style={{ flexShrink: 0, padding: "0 24px 14px" }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 4,
            scrollbarWidth: "thin",
            scrollbarColor: "var(--border-default) transparent",
          }}
        >
          <div style={{ minWidth: 100, flexShrink: 0 }}>
            <KpiTile
              compact
              label="ALL PHASES"
              value={phaseCounts.all}
              color="var(--text-secondary)"
              active={phaseFilter === "all"}
              onClick={() => setPhaseFilter("all")}
            />
          </div>
          {PHASES.map((p) => (
            <div key={p} style={{ minWidth: 100, flexShrink: 0 }}>
              <KpiTile
                compact
                label={p.toUpperCase()}
                value={phaseCounts[p] || 0}
                color="var(--accent)"
                active={phaseFilter === p}
                onClick={() => setPhaseFilter(p)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* View Tabs */}
      <div style={{ flexShrink: 0, display: "flex", gap: 0, padding: "0 24px", marginTop: 4 }}>
        {[
          { id: "gantt", label: "Gantt Chart" },
          { id: "lookahead", label: "6-Week Lookahead" },
          { id: "list", label: "Task List" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: view === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
              padding: "10px 20px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              color: view === tab.id ? "var(--accent)" : "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ height: 1, background: "var(--divider)", margin: "0 24px 8px" }} />

      <ScheduleRivetBrief
        tasks={tasksWithEffective}
        project={selectedProject}
        phaseFilter={phaseFilter}
        onSetPhaseFilter={setPhaseFilter}
        onSetView={setView}
        onSetGanttFocus={(request) => {
          const focusRequest = typeof request === "string" ? { filter: request } : (request || {});
          setView("gantt");
          setGanttFocus({ ...focusRequest, requestedAt: Date.now() });
        }}
      />

      {/* View Content */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        {view === "gantt" && (
          <ErrorBoundary label="Gantt Chart">
            <Suspense fallback={<LoadingSkeleton variant="page" />}>
              <ScheduleGantt
                tasks={enrichedTasks}
                submittals={submittals}
                weatherRisk={weatherRisk}
                expandedTask={expandedTask}
                setExpandedTask={setExpandedTask}
                onTaskClick={(task) => { setSelectedTask(task); setShowDrawer(true); }}
                onSave={async (data) => {
                  const { id, fields } = sanitizeScheduleTaskUpdatePayload(data);
                  try {
                    if (!id) throw new Error("Cannot update a task without an id");
                    await entities.ScheduleTask.update(id, fields);
                    invalidateEntity(qc, "schedule_task", projectId);
                    toast.success("Task saved");
                  } catch (err: any) {
                    toast.error("Save failed: " + (err?.message || "unknown error"));
                    throw err;
                  }
                }}
                onReparent={(p: { ids: string[]; newParentId: string | null; dropIndex?: number | null }) =>
                  reparentMut.mutate(p)
                }
                phaseFilter={phaseFilter}
                externalFocus={ganttFocus}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {view === "lookahead" && (
          <ErrorBoundary label="Lookahead Planner">
            {/* Lookahead's week-bucket date predicates run against the
                effective dates so cascaded tasks land in the correct
                week — previously a Detailing task whose predecessor
                slipped two weeks would still appear in the original
                week's bucket. */}
            <LookaheadPlanner tasks={tasksWithEffective} />
          </ErrorBoundary>
        )}

        {view === "list" && (
          <ErrorBoundary label="Task List">
            <ScheduleTaskList
              tasks={tasksWithEffective}
              onEdit={(task) => {
                // The Task List receives the effective-date overlay so its
                // rows show the cascaded dates. The TaskDetailDrawer must
                // edit STORED dates — opening it with overlaid dates would
                // let the user "save" effective dates as new stored values
                // and silently destroy their original entry. Look the row
                // up in the unmodified enrichedTasks list before opening.
                const original = enrichedTasks.find((t) => t.id === task.id) || task;
                setSelectedTask(original);
                setShowDrawer(true);
              }}
              onDelete={(task) => setDeleteTarget(task)}
              onSave={async (data) => {
                const { id, fields } = sanitizeScheduleTaskUpdatePayload(data);
                try {
                  if (!id) throw new Error("Cannot update a task without an id");
                  await entities.ScheduleTask.update(id, fields);
                  invalidateEntity(qc, "schedule_task", projectId);
                  toast.success("Task saved");
                } catch (err: any) {
                  toast.error("Save failed: " + (err?.message || "unknown error"));
                  throw err;
                }
              }}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          </ErrorBoundary>
        )}
      </div>

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        open={showDrawer}
        onClose={() => { setShowDrawer(false); setSelectedTask(null); }}
        onUpdate={(data) => updateTaskMut.mutate(data)}
        onReparent={(childId: string, newParentId: string | null) => reparentMut.mutate({ ids: [childId], newParentId })}
        onDelete={(id) => deleteTaskMut.mutate(id)}
        allTasks={enrichedTasks}
        effectiveDates={effectiveDatesMap}
      />

      {/* Add/bulk/WBS modals are lazy-loaded; gate the mount on the open flag so
          the chunk only fetches on first open. Each renders null when closed,
          so this is behavior-preserving. A null Suspense fallback avoids a
          flash before the (already-overlay) modal paints. */}
      {showAddTask && (
        <Suspense fallback={null}>
          <AddTaskModal
            open={showAddTask}
            onClose={() => setShowAddTask(false)}
            onSubmit={(data) =>
              createTaskMut.mutate({
                ...data,
                project_id: projectId,
                percent_complete: 0,
              })
            }
            isSaving={createTaskMut.isPending}
            projectName={selectedProject?.name || ""}
            prefilledDate={new Date().toISOString().split("T")[0]}
            existingTasks={enrichedTasks}
          />
        </Suspense>
      )}

      {showBulkAdd && (
        <Suspense fallback={null}>
          <BulkAddTaskModal
            open={showBulkAdd}
            onClose={() => setShowBulkAdd(false)}
            onSubmit={handleBulkAdd}
            projectName={selectedProject?.name || ""}
            isSaving={bulkSaving}
            existingTasks={enrichedTasks}
          />
        </Suspense>
      )}

      {showBulkDates && (
        <Suspense fallback={null}>
          <BulkDateEditModal
            open={showBulkDates}
            count={selectedIds.size}
            isSaving={bulkDateMut.isPending}
            onClose={() => setShowBulkDates(false)}
            onSubmit={bulkUpdateDates}
          />
        </Suspense>
      )}

      {showBulkDuration && (
        <Suspense fallback={null}>
          <BulkDurationEditModal
            open={showBulkDuration}
            count={selectedIds.size}
            isSaving={bulkDurationMut.isPending}
            onClose={() => setShowBulkDuration(false)}
            onSubmit={bulkUpdateDuration}
          />
        </Suspense>
      )}

      {showBulkParent && (
        <div onClick={() => setShowBulkParent(false)} style={{ position: "fixed", inset: 0, background: "rgba(1,4,10,0.6)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg-surface-high)", border: "1px solid var(--accent-border)", borderRadius: 14, padding: 20, width: 420 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", marginBottom: 12 }}>
              SET PARENT FOR {selectedIds.size} TASK{selectedIds.size !== 1 ? "S" : ""}
            </div>
            <select
              className="sbd-select"
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                bulkSetParent(v === "__root__" ? null : v);
              }}
              style={{ width: "100%" }}
            >
              <option value="" disabled>— Select a parent… —</option>
              <option value="__root__">Top level (no parent)</option>
              {bulkParentOptions.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.wbs_code ? `${t.wbs_code} — ` : ""}{t.task_name}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 14, textAlign: "right" }}>
              <button className="sbd-btn sbd-btn-ghost" onClick={() => setShowBulkParent(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showWbsBuilder && (
        <Suspense fallback={null}>
          <WbsBuilderModal
            open={showWbsBuilder}
            projectId={projectId}
            onClose={() => setShowWbsBuilder(false)}
          />
        </Suspense>
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTaskMut.isPending && deleteTarget?.id) {
            deleteTaskMut.mutate(deleteTarget.id);
          }
        }}
        title="Delete task?"
        description={deleteTarget ? `This will remove "${deleteTarget.task_name}".` : ""}
      />

      <DeleteDialog
        open={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={confirmBulkDelete}
        title={`Delete ${selectedIds.size} task${selectedIds.size !== 1 ? "s" : ""}?`}
        description={`This will permanently remove ${selectedIds.size} selected task${selectedIds.size !== 1 ? "s" : ""}. This cannot be undone.`}
      />

      {selectedIds.size > 0 && (
        <BulkActionToolbar
          selectedCount={selectedIds.size}
          updatePending={bulkUpdateMut.isPending}
          deletePending={bulkDeleteMut.isPending}
          datePending={bulkDateMut.isPending}
          durationPending={bulkDurationMut.isPending}
          resourcePending={bulkResourceMut.isPending}
          showResourceInput={showBulkResource}
          resourceValue={bulkResourceValue}
          onStatus={bulkUpdateStatus}
          onDelete={bulkDelete}
          onEditDates={() => setShowBulkDates(true)}
          onEditDurations={() => setShowBulkDuration(true)}
          parentPending={reparentMut.isPending}
          onSetParent={() => setShowBulkParent(true)}
          onShowResourceInput={() => setShowBulkResource(true)}
          onResourceValueChange={setBulkResourceValue}
          onApplyResource={() => bulkResourceMut.mutate({ ids: Array.from(selectedIds), resource_names: bulkResourceValue.trim() })}
          onCancelResource={() => { setShowBulkResource(false); setBulkResourceValue(""); }}
          onClear={() => setSelectedIds(new Set())}
        />
      )}
    </div>
  );
}
