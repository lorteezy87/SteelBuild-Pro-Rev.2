import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from '../components/shared/useProjectContext';
import { toast } from "sonner";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import DeleteDialog from "@/components/shared/DeleteDialog";
import ScheduleGantt from "@/components/schedule/ScheduleGantt";
import LookaheadPlanner from "@/components/schedule/LookaheadPlanner";
import ScheduleTaskList from "@/components/schedule/ScheduleTaskList";
import TaskDetailDrawer from "@/components/schedule/TaskDetailDrawer";
import AddTaskModal from "@/components/schedule/AddTaskModal";
import BulkAddTaskModal from "@/components/schedule/BulkAddTaskModal";
import { PHASES, PHASE_ABBREV } from "@/utils/phases";
import { useRef, useMemo } from "react";
import { batchProcess } from "@/utils/batchProcess";
import { CommandBar, KpiTile, Button, Icon } from "@/components/design-system";
import { downloadIcs, scheduleTaskToEvent } from "@/lib/icsExport";
import { exportGanttToPdf } from "@/lib/exportGanttPdf";
import { getWeatherRiskForProject } from "@/lib/weatherRisk";

/**
 * Auto-generate a WBS code for a task based on its phase and the
 * existing tasks in that phase. Format: "FAB-003"
 */
function generateWBS(phase, existingTasks) {
  const abbrev = PHASE_ABBREV[phase] || phase?.slice(0, 3).toUpperCase() || "TSK";
  const samePhase = (existingTasks || []).filter(t => t.phase === phase);
  // Find highest existing index in this phase's WBS codes
  let maxIdx = 0;
  samePhase.forEach(t => {
    if (t.wbs_code) {
      const match = t.wbs_code.match(/(\d+)$/);
      if (match) maxIdx = Math.max(maxIdx, parseInt(match[1], 10));
    }
  });
  const nextIdx = maxIdx + 1;
  return `${abbrev}-${String(nextIdx).padStart(3, "0")}`;
}

export default function Schedule() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [view, setView] = useState("gantt");
  const [expandedTask, setExpandedTask] = useState(null);
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [selectedTask, setSelectedTask] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkResource, setShowBulkResource] = useState(false);
  const [bulkResourceValue, setBulkResourceValue] = useState("");
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

  // Fetch deliveries for Gantt overlay — each delivery with a scheduled_date
  // gets its own row in a "Deliveries" section at the bottom of the Gantt
  const { data: ganttDeliveries = [] } = useQuery({
    queryKey: ["deliveries-gantt", projectId],
    queryFn: () => projectId ? base44.entities.Delivery.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    select: (dels) => dels.filter(d => d.scheduled_date),
  });

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : activeProject || null;
  const hasProject = !!(projectId || activeProject?.id);

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

  /* ── Auto-assign WBS codes to tasks that don't have one ────────── */
  const enrichedTasks = useMemo(() => {
    if (!scheduleTasks.length) return scheduleTasks;
    const phaseCounts = {};
    const result = [];
    // First pass: count existing WBS max per phase
    scheduleTasks.forEach(t => {
      if (t.wbs_code) {
        const match = t.wbs_code.match(/(\d+)$/);
        if (match) {
          const ph = t.phase || "Other";
          phaseCounts[ph] = Math.max(phaseCounts[ph] || 0, parseInt(match[1], 10));
        }
      }
    });
    // Second pass: assign WBS to tasks missing it
    const toBackfill = [];
    scheduleTasks.forEach(t => {
      if (t.wbs_code) {
        result.push(t);
      } else {
        const ph = t.phase || "Other";
        const abbrev = PHASE_ABBREV[ph] || ph.slice(0, 3).toUpperCase();
        phaseCounts[ph] = (phaseCounts[ph] || 0) + 1;
        const wbs = `${abbrev}-${String(phaseCounts[ph]).padStart(3, "0")}`;
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
        qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
        if (failed.length > 0) {
          console.warn(`[Schedule] WBS backfill: ${succeeded.length} ok, ${failed.length} failed`);
        }
      }).catch((err) => {
        console.warn("[Schedule] WBS backfill batch failed:", err?.message);
      });
    }
    return result;
  }, [scheduleTasks, projectId, qc]);

  const updateTaskMut = useMutation({
    mutationFn: (data) => {
      const { id, created_at, updated_at, created_date, updated_date, ...fields } = data;
      return base44.entities.ScheduleTask.update(id, fields);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
      setShowDrawer(false);
      setSelectedTask(null);
      toast.success("Task updated");
    },
    onError: (err) => toast.error("Update failed: " + err.message),
  });

  const createTaskMut = useMutation({
    mutationFn: (data) => {
      const pid = data.project_id || projectId || activeProject?.id;
      if (!pid) throw new Error("Select a project first");
      const wbs = data.wbs_code || generateWBS(data.phase, scheduleTasks);
      return base44.entities.ScheduleTask.create({ ...data, project_id: pid, wbs_code: wbs });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
      setShowAddTask(false);
      toast.success("Task created");
    },
    onError: (err) => toast.error("Create failed: " + err.message),
  });

  const deleteTaskMut = useMutation({
    mutationFn: (id) => base44.entities.ScheduleTask.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
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
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
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
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
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
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
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

  const handleBulkAdd = async (rows) => {
    if (!hasProject) return;
    setBulkSaving(true);
    try {
      const pid = projectId || activeProject?.id;
      // Build a running snapshot of tasks so each new WBS is unique
      const snapshot = [...scheduleTasks];
      for (const row of rows) {
        const wbs = row.wbs_code || generateWBS(row.phase, snapshot);
        const task = { ...row, project_id: pid, wbs_code: wbs };
        await base44.entities.ScheduleTask.create(task);
        snapshot.push(task); // include in snapshot for next WBS calculation
      }
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
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
    if (!projectId && !activeProject?.id) {
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

      const pid = projectId || activeProject?.id;
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

      // Second pass: set dependencies (predecessors) now that all tasks have DB IDs
      const depItems = [];
      allParsed.forEach((t) => {
        if (t.preds && t.preds.length > 0) {
          const dbId = uidToDbId[t.uid];
          const predDbIds = t.preds.map(p => uidToDbId[p.predUid]).filter(Boolean);
          if (dbId && predDbIds.length > 0) {
            depItems.push({ dbId, predDbIds });
          }
        }
      });
      if (depItems.length > 0) {
        await batchProcess(
          depItems,
          ({ dbId, predDbIds }) => base44.entities.ScheduleTask.update(dbId, {
            dependencies: JSON.stringify(predDbIds),
          }),
        );
      }

      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
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
    if (!ids.length || bulkUpdateMut.isPending || bulkDeleteMut.isPending) return;
    bulkUpdateMut.mutate({ ids, status });
  };

  const bulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length || bulkDeleteMut.isPending || bulkUpdateMut.isPending) return;
    setShowBulkDeleteConfirm(true);
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
      <div style={{ flexShrink: 0, padding: "16px 24px 0" }}>
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
            disabled={importing || !hasProject}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? "IMPORTING…" : "IMPORT MPP"}
          </Button>
          <Button
            variant="secondary"
            icon="calendar"
            disabled={!hasProject || scheduleTasks.length === 0}
            onClick={() => {
              const events = scheduleTasks
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
              !hasProject ||
              scheduleTasks.length === 0 ||
              view !== "gantt" ||
              exportingPdf
            }
            onClick={async () => {
              setExportingPdf(true);
              const t = toast.loading("Generating PDF…");
              try {
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
            variant="outline"
            icon="plus"
            disabled={!hasProject}
            onClick={() => setShowBulkAdd(true)}
          >
            BULK ADD
          </Button>
          <Button
            variant="primary"
            icon="plus"
            disabled={!hasProject}
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
      <div style={{ flexShrink: 0, display: "flex", gap: 8, borderBottom: "1px solid var(--divider)", padding: "0 24px", marginTop: 8 }}>
        {[
          { id: "gantt", label: "Gantt Chart" },
          { id: "lookahead", label: "6-Week Lookahead" },
          { id: "list", label: "Task List" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            style={{
              background: "none", border: "none", padding: "12px 16px",
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              color: view === tab.id ? "var(--accent)" : "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer",
              borderBottom: view === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1, transition: "color 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* View Content */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        {view === "gantt" && (
          <ErrorBoundary label="Gantt Chart">
            <ScheduleGantt
              tasks={enrichedTasks}
              submittals={submittals}
              deliveries={ganttDeliveries}
              weatherRisk={weatherRisk}
              expandedTask={expandedTask}
              setExpandedTask={setExpandedTask}
              onTaskClick={(task) => { setSelectedTask(task); setShowDrawer(true); }}
              onSave={async (data) => {
                const { id, ...fields } = data;
                try {
                  await base44.entities.ScheduleTask.update(id, fields);
                  qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
                  toast.success("Task saved");
                } catch (err) {
                  toast.error("Save failed: " + (err?.message || "unknown error"));
                  throw err;
                }
              }}
              phaseFilter={phaseFilter}
            />
          </ErrorBoundary>
        )}

        {view === "lookahead" && (
          <ErrorBoundary label="Lookahead Planner">
            <LookaheadPlanner tasks={enrichedTasks} />
          </ErrorBoundary>
        )}

        {view === "list" && (
          <ErrorBoundary label="Task List">
            <ScheduleTaskList
              tasks={enrichedTasks}
              onEdit={(task) => { setSelectedTask(task); setShowDrawer(true); }}
              onDelete={(task) => setDeleteTarget(task)}
              onSave={async (data) => {
                const { id, ...fields } = data;
                try {
                  await base44.entities.ScheduleTask.update(id, fields);
                  qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
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
            project_id: projectId || activeProject?.id,
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
            left: 0,
            right: 0,
            bottom: 0,
            background: "var(--bg-surface)",
            borderTop: "1px solid var(--divider)",
            padding: "10px 20px",
            display: "flex",
            gap: 10,
            alignItems: "center",
            zIndex: 20,
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>
            {selectedIds.size} SELECTED
          </span>
          <button onClick={() => bulkUpdateStatus("Not Started")} disabled={bulkUpdateMut.isPending || bulkDeleteMut.isPending} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: bulkUpdateMut.isPending || bulkDeleteMut.isPending ? "not-allowed" : "pointer", opacity: bulkUpdateMut.isPending || bulkDeleteMut.isPending ? 0.6 : 1 }}>
            Set Not Started
          </button>
          <button onClick={() => bulkUpdateStatus("In Progress")} disabled={bulkUpdateMut.isPending || bulkDeleteMut.isPending} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--status-warning)", background: "rgba(234,179,8,0.12)", color: "var(--status-warning)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: bulkUpdateMut.isPending || bulkDeleteMut.isPending ? "not-allowed" : "pointer", opacity: bulkUpdateMut.isPending || bulkDeleteMut.isPending ? 0.6 : 1 }}>
            Set In Progress
          </button>
          <button onClick={() => bulkUpdateStatus("Complete")} disabled={bulkUpdateMut.isPending || bulkDeleteMut.isPending} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--status-success)", background: "var(--success-muted)", color: "var(--status-success)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: bulkUpdateMut.isPending || bulkDeleteMut.isPending ? "not-allowed" : "pointer", opacity: bulkUpdateMut.isPending || bulkDeleteMut.isPending ? 0.6 : 1 }}>
            Mark Complete
          </button>
          <button onClick={() => bulkUpdateStatus("Delayed")} disabled={bulkUpdateMut.isPending || bulkDeleteMut.isPending} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--status-error)", background: "var(--danger-muted)", color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: bulkUpdateMut.isPending || bulkDeleteMut.isPending ? "not-allowed" : "pointer", opacity: bulkUpdateMut.isPending || bulkDeleteMut.isPending ? 0.6 : 1 }}>
            Mark Delayed
          </button>
          <button onClick={bulkDelete} disabled={bulkDeleteMut.isPending || bulkUpdateMut.isPending} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--danger-border)", background: "var(--danger-muted)", color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: bulkDeleteMut.isPending || bulkUpdateMut.isPending ? "not-allowed" : "pointer", opacity: bulkDeleteMut.isPending || bulkUpdateMut.isPending ? 0.6 : 1 }}>
            Delete
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
