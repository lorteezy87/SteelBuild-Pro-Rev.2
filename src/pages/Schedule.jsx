import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import DeleteDialog from "@/components/shared/DeleteDialog";
import ScheduleGantt from "@/components/schedule/ScheduleGantt";
import ScheduleBrenaBrief from "@/components/schedule/ScheduleBrenaBrief";
import LookaheadPlanner from "@/components/schedule/LookaheadPlanner";
import ScheduleTaskList from "@/components/schedule/ScheduleTaskList";
import TaskDetailDrawer from "@/components/schedule/TaskDetailDrawer";
import AddTaskModal from "@/components/schedule/AddTaskModal";
import BulkAddTaskModal from "@/components/schedule/BulkAddTaskModal";
import BulkDateEditModal from "@/components/schedule/BulkDateEditModal";
import WbsBuilderModal from "@/components/schedule/WbsBuilderModal";
import { PHASES, PHASE_NUMBER } from "@/utils/phases";
import { useRef, useMemo, useState } from "react";
import { batchProcess } from "@/utils/batchProcess";
import { CommandBar, KpiTile, Button } from "@/components/design-system";
import { downloadIcs, scheduleTaskToEvent } from "@/lib/icsExport";
import { getWeatherRiskForProject } from "@/lib/weatherRisk";
import { applyEffectiveDates } from "@/services/scheduleCascade";
import { invalidateEntity } from "@/services/cacheRegistry";
import { useProjectId } from "@/hooks/useProjectId";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

/**
 * Auto-generate a WBS code for a task. Format is now "<phase>.<n>"
 * where <phase> is the numeric phase id (1-7 from PHASE_NUMBER) and
 * <n> is the next available index within that phase.
 *
 * Examples:
 *   Detailing, first task      → "2.1"
 *   Detailing, third task      → "2.3"
 *   Installation, first task   → "6.1"
 *
 * Falls back to "0.<n>" if we don't know the phase — rare enough
 * that we'd rather have something consistent than invent a prefix.
 */
function generateWBS(phase, existingTasks) {
  const phaseNum = PHASE_NUMBER[phase] ?? 0;
  const samePhase = (existingTasks || []).filter(t => t.phase === phase);
  // Match the new X.Y / X.Y.Z format. The final numeric segment is
  // this task's index within the phase — we take the max and add 1.
  // Old DET-003-style codes in the DB are also matched (trailing
  // digits) so the counter doesn't restart when a project hasn't
  // been migrated yet.
  let maxIdx = 0;
  for (const t of samePhase) {
    const code = t.wbs_code;
    if (!code) continue;
    // Prefer new-format pattern "<phase>.<n>" or "<phase>.<n>.<m>"
    const mNew = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(code);
    if (mNew) {
      const idx = parseInt(mNew[2], 10);
      if (Number.isFinite(idx) && idx > maxIdx) maxIdx = idx;
      continue;
    }
    // Legacy "ABC-NNN" — pull the trailing number as a fallback.
    const mLeg = /(\d+)$/.exec(code);
    if (mLeg) {
      const idx = parseInt(mLeg[1], 10);
      if (Number.isFinite(idx) && idx > maxIdx) maxIdx = idx;
    }
  }
  return `${phaseNum}.${maxIdx + 1}`;
}

function sanitizeScheduleTaskUpdatePayload(data) {
  const {
    id,
    created_at: _createdAt,
    updated_at: _updatedAt,
    created_date: _createdDate,
    updated_date: _updatedDate,
    ...rawFields
  } = data || {};
  const fields = {};
  const isSummaryRow = Boolean(data?._hasChildren || data?._isRolledUpSummary);

  Object.entries(rawFields).forEach(([key, value]) => {
    if (key.startsWith("_") || value === undefined) return;
    fields[key] = value;
  });

  if (isSummaryRow) {
    if ("_stored_start_date" in data) fields.start_date = data._stored_start_date || null;
    if ("_stored_end_date" in data) fields.end_date = data._stored_end_date || null;
    if ("_stored_duration" in data) fields.duration = data._stored_duration;
    if ("_stored_percent_complete" in data) fields.percent_complete = data._stored_percent_complete;
  }

  return { id, fields };
}

export default function Schedule() {
  const [searchParams] = useSearchParams();
  const projectId = useProjectId();
  const [view, setView] = useState("gantt");
  const [expandedTask, setExpandedTask] = useState(null);
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
  const [selectedTask, setSelectedTask] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [showWbsBuilder, setShowWbsBuilder] = useState(false);
  const [ganttFocus, setGanttFocus] = useState(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkResource, setShowBulkResource] = useState(false);
  const [bulkResourceValue, setBulkResourceValue] = useState("");
  const [showBulkDates, setShowBulkDates] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const qc = useQueryClient();

  const { data: scheduleTasks = [] } = useQuery({
    queryKey: ["schedule-tasks", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.ScheduleTask.filter({ project_id: projectId }, "start_date")
        : [],
    enabled: !!projectId,
  });

  useRealtimeInvalidation("schedule_tasks", projectId, [["schedule-tasks", projectId]]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch submittals linked to this project for Gantt overlay
  const { data: submittals = [] } = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => projectId ? base44.entities.Document.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    select: (docs) => docs.filter(d => d.is_submittal && d.linked_wp_id),
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

  const selectedProject = projects.find((p) => p.id === projectId) || null;

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
    const phaseCounts = {};
    const result = [];
    // First pass: find the highest n seen per phase, accepting both
    // new-format (2.3 / 2.3.1) and legacy-format (DET-003) codes.
    scheduleTasks.forEach(t => {
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
    const toBackfill = [];
    scheduleTasks.forEach(t => {
      if (t.wbs_code) {
        result.push(t);
      } else {
        const ph = t.phase || "Other";
        const phaseNum = PHASE_NUMBER[ph] ?? 0;
        phaseCounts[ph] = (phaseCounts[ph] || 0) + 1;
        const wbs = `${phaseNum}.${phaseCounts[ph]}`;
        result.push({ ...t, wbs_code: wbs });
        toBackfill.push({ id: t.id, wbs });
      }
    });
    // Background-persist generated WBS codes to DB
    if (toBackfill.length > 0) {
      batchProcess(
        toBackfill,
        ({ id, wbs }) => base44.entities.ScheduleTask.update(id, { wbs_code: wbs }).catch(() => {}),
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
  const tasksWithEffective = useMemo(
    () => applyEffectiveDates(enrichedTasks),
    [enrichedTasks]
  );

  const updateTaskMut = useMutation({
    mutationFn: (data) => {
      const { id, fields } = sanitizeScheduleTaskUpdatePayload(data);
      return base44.entities.ScheduleTask.update(id, fields);
    },
    onSuccess: () => {
      invalidateEntity(qc, "schedule_task", projectId);
      setShowDrawer(false);
      setSelectedTask(null);
      toast.success("Task updated");
    },
    onError: (err) => toast.error("Update failed: " + err.message),
  });

  const createTaskMut = useMutation({
    mutationFn: (data) => {
      const pid = data.project_id || projectId;
      if (!pid) throw new Error("Select a project first");
      const wbs = data.wbs_code || generateWBS(data.phase, scheduleTasks);
      return base44.entities.ScheduleTask.create({ ...data, project_id: pid, wbs_code: wbs });
    },
    onSuccess: () => {
      invalidateEntity(qc, "schedule_task", projectId);
      setShowAddTask(false);
      toast.success("Task created");
    },
    onError: (err) => toast.error("Create failed: " + err.message),
  });

  const deleteTaskMut = useMutation({
    mutationFn: (id) => base44.entities.ScheduleTask.delete(id),
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
    mutationFn: async ({ ids, status }) => {
      const results = await batchProcess(
        ids,
        (id) => base44.entities.ScheduleTask.update(id, {
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
    mutationFn: async (ids) => {
      const results = await batchProcess(ids, (id) => base44.entities.ScheduleTask.delete(id));
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
    mutationFn: async ({ ids, resource_names }) => {
      const results = await batchProcess(
        ids,
        (id) => base44.entities.ScheduleTask.update(id, { resource_names, assigned_to: resource_names }),
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
    mutationFn: async ({ ids, fields }) => {
      const selected = tasksWithEffective.filter((task) => ids.includes(task.id));
      const editable = selected.filter((task) => !task._hasChildren && !task._isRolledUpSummary && !task.is_summary);
      const skipped = selected.length - editable.length;

      if (editable.length === 0) {
        throw new Error("Summary tasks roll up from child tasks. Select child tasks to bulk edit dates.");
      }

      const results = await batchProcess(
        editable.map((task) => task.id),
        (id) => base44.entities.ScheduleTask.update(id, fields),
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
    onError: (err) => toast.error(err?.message || "Bulk date update failed"),
  });

  const handleBulkAdd = async (rows) => {
    if (!projectId) return;
    setBulkSaving(true);
    try {
      const pid = projectId;
      // Build a running snapshot of tasks so each new WBS is unique
      const snapshot = [...scheduleTasks];
      for (const row of rows) {
        const wbs = row.wbs_code || generateWBS(row.phase, snapshot);
        const task = { ...row, project_id: pid, wbs_code: wbs };
        await base44.entities.ScheduleTask.create(task);
        snapshot.push(task); // include in snapshot for next WBS calculation
      }
      invalidateEntity(qc, "schedule_task", projectId);
      setShowBulkAdd(false);
      toast.success(`Created ${rows.length} task${rows.length !== 1 ? "s" : ""}`);
    } catch (err) {
      toast.error("Bulk add failed: " + err.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const parseMsProjectXml = (xml) => {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const taskNodes = Array.from(doc.getElementsByTagName("Task"));

    // Build resource map: UID → name
    const resourceMap = {};
    Array.from(doc.getElementsByTagName("Resource")).forEach((r) => {
      const rUid = r.getElementsByTagName("UID")[0]?.textContent;
      const rName = r.getElementsByTagName("Name")[0]?.textContent;
      if (rUid && rName) resourceMap[rUid] = rName;
    });

    // Build assignment map: TaskUID → [resource names]
    const assignmentMap = {};
    Array.from(doc.getElementsByTagName("Assignment")).forEach((a) => {
      const tUid = a.getElementsByTagName("TaskUID")[0]?.textContent;
      const rUid = a.getElementsByTagName("ResourceUID")[0]?.textContent;
      if (tUid && rUid && resourceMap[rUid]) {
        if (!assignmentMap[tUid]) assignmentMap[tUid] = [];
        assignmentMap[tUid].push(resourceMap[rUid]);
      }
    });

    const tasks = [];
    taskNodes.forEach((node) => {
      const uid = node.getElementsByTagName("UID")[0]?.textContent;
      if (!uid || uid === "0") return; // skip root project summary
      const isSummary = node.getElementsByTagName("Summary")[0]?.textContent === "1";
      const outlineLevel = Number(node.getElementsByTagName("OutlineLevel")[0]?.textContent) || 0;
      const outlineNumber = node.getElementsByTagName("OutlineNumber")[0]?.textContent || "";
      const name = node.getElementsByTagName("Name")[0]?.textContent || "Task";
      const start = node.getElementsByTagName("Start")[0]?.textContent?.slice(0, 10) || null;
      const finish = node.getElementsByTagName("Finish")[0]?.textContent?.slice(0, 10) || null;
      const pct = Number(node.getElementsByTagName("PercentComplete")[0]?.textContent) || 0;
      const milestone = node.getElementsByTagName("Milestone")[0]?.textContent === "1";
      const durationStr = node.getElementsByTagName("Duration")[0]?.textContent || "";
      // MS Project duration is like "PT48H0M0S" — extract hours and convert to days
      const durationMatch = durationStr.match(/PT(\d+)H/);
      const durationDays = durationMatch ? Math.round(Number(durationMatch[1]) / 8) : null;
      const notes = node.getElementsByTagName("Notes")[0]?.textContent || "";
      const preds = Array.from(node.getElementsByTagName("PredecessorLink")).map((p) => {
        const predUid = p.getElementsByTagName("PredecessorUID")[0]?.textContent;
        const linkType = p.getElementsByTagName("Type")[0]?.textContent; // 0=FF, 1=FS, 2=SF, 3=SS
        const lagDuration = p.getElementsByTagName("LinkLag")[0]?.textContent; // in tenths of minutes
        return { predUid, linkType: linkType || "1", lagDuration: lagDuration || "0" };
      }).filter(p => p.predUid);
      const resources = assignmentMap[uid] || [];
      tasks.push({ uid, name, start, finish, pct, preds, isSummary, outlineLevel, outlineNumber, milestone, durationDays, resources, notes });
    });
    return tasks;
  };

  /**
   * Derive phase from the WBS hierarchy.
   * If the task's parent summary task name matches a known phase, use it.
   * Otherwise fall back to the PHASES heuristic.
   */
  const derivePhaseFromHierarchy = (task, allParsed) => {
    // Walk up the outline levels to find the topmost summary (outline level 1)
    const ol = task.outlineLevel;
    if (ol <= 1) return task.name; // This IS a phase-level summary
    // Find the preceding summary at outline level 1
    const taskIdx = allParsed.indexOf(task);
    for (let i = taskIdx - 1; i >= 0; i--) {
      if (allParsed[i].isSummary && allParsed[i].outlineLevel === 1) {
        return allParsed[i].name;
      }
    }
    return null;
  };

  const PHASE_NAME_MAP = {
    "DETAILING": "Detailing",
    "FABRICATION": "Fabrication",
    "DELIVERY": "Delivery",
    "EQUIPMENT": "Procurement",
    "INSTALLATION": "Installation",
    "INSTALLATION/ERECTION": "Installation",
    "ERECTION": "Installation",
    "CLOSEOUT": "Closeout",
    "PRE-CONSTRUCTION": "Pre-Construction",
    "PROCUREMENT": "Procurement",
  };

  const inferTaskType = (name, isSummary, isMilestone) => {
    if (isMilestone) return "Milestone";
    if (isSummary) return "Task";
    const n = (name || "").toLowerCase();
    if (/\b(fab|fabricat|weld|cut|fit-up|shop)\b/.test(n)) return "Fabrication";
    if (/\b(deliver|ship|truck|freight|haul)\b/.test(n)) return "Delivery";
    if (/\b(erect|install|field|crane|bolt|set|rig)\b/.test(n)) return "Install";
    if (/\b(submit|drawing|detail|review|approval)\b/.test(n)) return "Submittal";
    if (/\b(rfi|request for)\b/.test(n)) return "RFI";
    return "Task";
  };

  const handleImportMPP = async (file) => {
    if (!projectId) {
      toast.error("Select a project before importing");
      return;
    }
    setImporting(true);

    // Reject binary .mpp files — only XML exports are supported
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.mpp') && !fileName.endsWith('.xml')) {
      toast.error("Binary .mpp files are not supported directly. Please export from MS Project as XML first (File \u2192 Save As \u2192 XML).");
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
      const uidToDbId = {};
      // UID → parent UID mapping (based on outline levels)
      const uidToParentUid = {};
      const summaryStack = []; // stack of { uid, outlineLevel }

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
        const phase = PHASE_NAME_MAP[phaseName?.toUpperCase()] || phaseName || "Fabrication";

        const parentUid = uidToParentUid[t.uid];
        const parentDbId = parentUid ? uidToDbId[parentUid] : null;

        const record = await base44.entities.ScheduleTask.create({
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
      const MS_LINK_TYPE = { "0": "FF", "1": "FS", "2": "SF", "3": "SS" };
      const TENTHS_PER_DAY = 10 * 60 * 8; // tenths of minutes in an 8h workday
      const depItems = [];
      allParsed.forEach((t) => {
        if (t.preds && t.preds.length > 0) {
          const dbId = uidToDbId[t.uid];
          const predLinks = t.preds
            .map((p) => {
              const id = uidToDbId[p.predUid];
              if (!id) return null;
              const type = MS_LINK_TYPE[p.linkType] || "FS";
              // Convert tenths-of-minutes to whole days; round so a
              // typical 1-day lag (4800 tenths) lands on lag_days=1.
              const lagTenths = Number(p.lagDuration) || 0;
              const lag_days = Math.round(lagTenths / TENTHS_PER_DAY);
              return { id, type, lag_days };
            })
            .filter(Boolean);
          if (dbId && predLinks.length > 0) {
            depItems.push({ dbId, predLinks });
          }
        }
      });
      if (depItems.length > 0) {
        await batchProcess(
          depItems,
          ({ dbId, predLinks }) => base44.entities.ScheduleTask.update(dbId, {
            dependencies: JSON.stringify(predLinks),
          }),
        );
      }

      invalidateEntity(qc, "schedule_task", projectId);
      toast.success(`Imported ${Object.keys(uidToDbId).length} tasks from ${file.name}`);
    } catch (e) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const bulkUpdateStatus = (status) => {
    const ids = Array.from(selectedIds);
    if (!ids.length || bulkUpdateMut.isPending || bulkDeleteMut.isPending || bulkDateMut.isPending) return;
    bulkUpdateMut.mutate({ ids, status });
  };

  const bulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length || bulkDeleteMut.isPending || bulkUpdateMut.isPending || bulkDateMut.isPending) return;
    setShowBulkDeleteConfirm(true);
  };

  const bulkUpdateDates = (fields) => {
    const ids = Array.from(selectedIds);
    if (!ids.length || bulkDateMut.isPending || bulkDeleteMut.isPending || bulkUpdateMut.isPending) return;
    bulkDateMut.mutate({ ids, fields });
  };

  const confirmBulkDelete = () => {
    const ids = Array.from(selectedIds);
    bulkDeleteMut.mutate(ids);
    setShowBulkDeleteConfirm(false);
  };

  // Phase counts for KPI row
  const phaseCounts = useMemo(() => {
    const m = { all: scheduleTasks.length };
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
                });
                toast.success(
                  `Exported ${filename}${pageCount > 1 ? ` (${pageCount} pages)` : ""}`,
                  { id: t }
                );
              } catch (err) {
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
          <Button
            variant="secondary"
            icon="sparkles"
            disabled={!projectId}
            onClick={() => setShowWbsBuilder(true)}
            title="Generate a WBS from a short scope-of-work description — tasks are filed under the project's existing phases."
          >
            WBS BUILDER
          </Button>
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
            display: "grid",
            gridTemplateColumns: `repeat(${PHASES.length + 1}, 1fr)`,
            gap: 8,
          }}
        >
          <KpiTile
            compact
            label="ALL PHASES"
            value={phaseCounts.all}
            color="var(--text-secondary)"
            active={phaseFilter === "all"}
            onClick={() => setPhaseFilter("all")}
          />
          {PHASES.map((p) => (
            <KpiTile
              key={p}
              compact
              label={p.toUpperCase()}
              value={phaseCounts[p] || 0}
              color="var(--accent)"
              active={phaseFilter === p}
              onClick={() => setPhaseFilter(p)}
            />
          ))}
        </div>
      </div>

      {/* View Tabs */}
      <div style={{ flexShrink: 0, display: "flex", gap: 8, borderBottom: "1px solid var(--divider)", padding: "0 24px 12px", marginTop: 8 }}>
        <div style={{ display: "inline-flex", gap: 6, padding: 6, borderRadius: 18, background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-low) 76%, #000 24%) 0%, color-mix(in srgb, var(--bg-surface) 96%, #000 4%) 100%)", border: "1px solid var(--border-default)", boxShadow: "0 10px 28px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
          {[
            { id: "gantt", label: "Gantt Chart" },
            { id: "lookahead", label: "6-Week Lookahead" },
            { id: "list", label: "Task List" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              style={{
                background: view === tab.id ? "linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, transparent) 0%, color-mix(in srgb, var(--accent) 8%, transparent) 100%)" : "transparent",
                border: view === tab.id ? "1px solid var(--accent-border)" : "1px solid transparent", padding: "10px 16px",
                borderRadius: 12,
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                color: view === tab.id ? "var(--accent)" : "var(--text-muted)",
                textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer",
                boxShadow: view === tab.id ? "0 10px 24px color-mix(in srgb, var(--accent) 12%, transparent), inset 0 1px 0 rgba(255,255,255,0.05)" : "none",
                transition: "color 0.15s, background 0.15s, border-color 0.15s, box-shadow 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <ScheduleBrenaBrief
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
                  await base44.entities.ScheduleTask.update(id, fields);
                  invalidateEntity(qc, "schedule_task", projectId);
                  toast.success("Task saved");
                } catch (err) {
                  toast.error("Save failed: " + (err?.message || "unknown error"));
                  throw err;
                }
              }}
              phaseFilter={phaseFilter}
              externalFocus={ganttFocus}
            />
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
                  await base44.entities.ScheduleTask.update(id, fields);
                  invalidateEntity(qc, "schedule_task", projectId);
                  toast.success("Task saved");
                } catch (err) {
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
        onDelete={(id) => deleteTaskMut.mutate(id)}
        allTasks={enrichedTasks}
      />

      {/* Add Task Modal */}
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

      <BulkAddTaskModal
        open={showBulkAdd}
        onClose={() => setShowBulkAdd(false)}
        onSubmit={handleBulkAdd}
        projectName={selectedProject?.name || ""}
        isSaving={bulkSaving}
        existingTasks={enrichedTasks}
      />

      <BulkDateEditModal
        open={showBulkDates}
        count={selectedIds.size}
        isSaving={bulkDateMut.isPending}
        onClose={() => setShowBulkDates(false)}
        onSubmit={bulkUpdateDates}
      />

      <WbsBuilderModal
        open={showWbsBuilder}
        projectId={projectId}
        onClose={() => setShowWbsBuilder(false)}
      />

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
        <div
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 20,
            background: "var(--bg-surface-high)",
            border: "1px solid var(--accent-border)",
            borderRadius: 18,
            padding: "12px 16px",
            display: "flex",
            gap: 10,
            alignItems: "center",
            boxShadow: "0 18px 40px rgba(0,0,0,0.45), 0 0 24px color-mix(in srgb, var(--accent) 14%, transparent), inset 0 1px 0 rgba(255,255,255,0.06)",
            backdropFilter: "blur(24px) saturate(150%)",
            WebkitBackdropFilter: "blur(24px) saturate(150%)",
            zIndex: 20,
          }}
        >
          <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>
            {selectedIds.size} SELECTED
          </span>
          <button onClick={() => bulkUpdateStatus("Not Started")} disabled={bulkUpdateMut.isPending || bulkDeleteMut.isPending || bulkDateMut.isPending} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: bulkUpdateMut.isPending || bulkDeleteMut.isPending || bulkDateMut.isPending ? "not-allowed" : "pointer", opacity: bulkUpdateMut.isPending || bulkDeleteMut.isPending || bulkDateMut.isPending ? 0.6 : 1 }}>
            Set Not Started
          </button>
          <button onClick={() => bulkUpdateStatus("In Progress")} disabled={bulkUpdateMut.isPending || bulkDeleteMut.isPending || bulkDateMut.isPending} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--status-warning)", background: "rgba(234,179,8,0.12)", color: "var(--status-warning)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: bulkUpdateMut.isPending || bulkDeleteMut.isPending || bulkDateMut.isPending ? "not-allowed" : "pointer", opacity: bulkUpdateMut.isPending || bulkDeleteMut.isPending || bulkDateMut.isPending ? 0.6 : 1 }}>
            Set In Progress
          </button>
          <button onClick={() => bulkUpdateStatus("Complete")} disabled={bulkUpdateMut.isPending || bulkDeleteMut.isPending || bulkDateMut.isPending} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--status-success)", background: "var(--success-muted)", color: "var(--status-success)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: bulkUpdateMut.isPending || bulkDeleteMut.isPending || bulkDateMut.isPending ? "not-allowed" : "pointer", opacity: bulkUpdateMut.isPending || bulkDeleteMut.isPending || bulkDateMut.isPending ? 0.6 : 1 }}>
            Mark Complete
          </button>
          <button onClick={() => bulkUpdateStatus("Delayed")} disabled={bulkUpdateMut.isPending || bulkDeleteMut.isPending || bulkDateMut.isPending} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--status-error)", background: "var(--danger-muted)", color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: bulkUpdateMut.isPending || bulkDeleteMut.isPending || bulkDateMut.isPending ? "not-allowed" : "pointer", opacity: bulkUpdateMut.isPending || bulkDeleteMut.isPending || bulkDateMut.isPending ? 0.6 : 1 }}>
            Mark Delayed
          </button>
          <button onClick={bulkDelete} disabled={bulkDeleteMut.isPending || bulkUpdateMut.isPending || bulkDateMut.isPending} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--danger-border)", background: "var(--danger-muted)", color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: bulkDeleteMut.isPending || bulkUpdateMut.isPending || bulkDateMut.isPending ? "not-allowed" : "pointer", opacity: bulkDeleteMut.isPending || bulkUpdateMut.isPending || bulkDateMut.isPending ? 0.6 : 1 }}>
            Delete
          </button>
          <button onClick={() => setShowBulkDates(true)} disabled={bulkDateMut.isPending || bulkUpdateMut.isPending || bulkDeleteMut.isPending} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--accent)", background: "rgba(86,176,255,0.12)", color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: bulkDateMut.isPending || bulkUpdateMut.isPending || bulkDeleteMut.isPending ? "not-allowed" : "pointer", opacity: bulkDateMut.isPending || bulkUpdateMut.isPending || bulkDeleteMut.isPending ? 0.6 : 1 }}>
            Edit Dates
          </button>

          <div style={{ width: 1, height: 20, background: "var(--divider)", margin: "0 4px" }} />

          {!showBulkResource ? (
            <button
              onClick={() => setShowBulkResource(true)}
              disabled={bulkResourceMut.isPending}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--accent)",
                background: "rgba(173,198,255,0.10)",
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                cursor: bulkResourceMut.isPending ? "not-allowed" : "pointer",
                opacity: bulkResourceMut.isPending ? 0.6 : 1,
              }}
            >
              Assign Resources
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                autoFocus
                type="text"
                placeholder="Resource name(s)…"
                value={bulkResourceValue}
                onChange={(e) => setBulkResourceValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && bulkResourceValue.trim()) {
                    bulkResourceMut.mutate({ ids: Array.from(selectedIds), resource_names: bulkResourceValue.trim() });
                  } else if (e.key === "Escape") {
                    setShowBulkResource(false);
                    setBulkResourceValue("");
                  }
                }}
                style={{
                  padding: "5px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--accent)",
                  background: "var(--bg-surface-low)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  width: 160,
                  outline: "none",
                }}
              />
              <button
                onClick={() => {
                  if (bulkResourceValue.trim()) {
                    bulkResourceMut.mutate({ ids: Array.from(selectedIds), resource_names: bulkResourceValue.trim() });
                  }
                }}
                disabled={!bulkResourceValue.trim() || bulkResourceMut.isPending}
                style={{
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--status-success)",
                  background: "var(--success-muted)",
                  color: "var(--status-success)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: !bulkResourceValue.trim() || bulkResourceMut.isPending ? "not-allowed" : "pointer",
                  opacity: !bulkResourceValue.trim() || bulkResourceMut.isPending ? 0.5 : 1,
                }}
              >
                {bulkResourceMut.isPending ? "Applying…" : "Apply"}
              </button>
              <button
                onClick={() => { setShowBulkResource(false); setBulkResourceValue(""); }}
                style={{
                  padding: "5px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--divider)",
                  background: "var(--bg-surface)",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          )}

          <button onClick={() => setSelectedIds(new Set())} style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--divider)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
