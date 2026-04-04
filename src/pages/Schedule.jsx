import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from '../components/shared/useProjectContext';
import { toast } from "sonner";
import DeleteDialog from "@/components/shared/DeleteDialog";
import ScheduleGantt from "@/components/schedule/ScheduleGantt";
import LookaheadPlanner from "@/components/schedule/LookaheadPlanner";
import ScheduleTaskList from "@/components/schedule/ScheduleTaskList";
import TaskDetailDrawer from "@/components/schedule/TaskDetailDrawer";
import AddTaskModal from "@/components/schedule/AddTaskModal";
import CalendarView from "@/components/schedule/CalendarView";
import { PHASES, PHASE_ORDER, derivePhase, sortByPhase } from "@/utils/phases";
import { useRef } from "react";
import BulkEditTasksModal from "@/components/schedule/BulkEditTasksModal";
import { sortTasksHierarchically } from "@/components/schedule/scheduleUtils";

const STATUS_OPTIONS = ["Not Started", "In Progress", "Complete", "Delayed", "On Hold"];
const PRIORITY_OPTIONS = ["Critical", "High", "Normal", "Low"];
const TASK_TYPE_OPTIONS = ["Fabrication", "Delivery", "Install", "Submittal", "RFI", "Milestone", "Task"];

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const [, base64 = ""] = result.split(",");
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

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
  const [addTaskMode, setAddTaskMode] = useState("single");
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [importing, setImporting] = useState(false);
  const [createdTaskFocusId, setCreatedTaskFocusId] = useState(null);
  const fileInputRef = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const qc = useQueryClient();
  const normalizedProjectRef = useRef(null);

  const { data: scheduleTasks = [], isLoading: scheduleTasksLoading, isError: scheduleTasksError, error: scheduleTasksErrorDetails } = useQuery({
    queryKey: ["schedule-tasks", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.ScheduleTask.filter({ project_id: projectId })
        : [],
    enabled: !!projectId,
    initialData: [],
  });

  const { data: projects = [], isLoading: projectsLoading, isError: projectsError, error: projectsErrorDetails } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : activeProject || null;
  const currentProjectLabel = selectedProject?.name || activeProject?.name || "Current Project";
  const hasProject = !!(projectId || activeProject?.id);
  const loadingSchedule = scheduleTasksLoading || projectsLoading;
  const hasScheduleError = scheduleTasksError || projectsError;
  const scheduleErrorMessage =
    scheduleTasksErrorDetails?.message ||
    projectsErrorDetails?.message ||
    "Schedule data could not be loaded.";

  useEffect(() => {
    setSelectedIds(new Set());
    setShowBulkEdit(false);
    setShowBulkDeleteDialog(false);
    setCreatedTaskFocusId(null);
  }, [projectId]);

  const visibleTasks =
    phaseFilter === "all"
      ? scheduleTasks
      : scheduleTasks.filter((task) => derivePhase(task) === phaseFilter);

  useEffect(() => {
    const visibleTaskIds = new Set(visibleTasks.map((task) => task.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => visibleTaskIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleTasks]);

  const normalizePredecessorTokens = (value = "") =>
    String(value)
      .split(/[\n,;]+/)
      .map((token) => token.trim().toUpperCase())
      .filter(Boolean);

  const formatPredecessorWbs = (predecessorIds, tasks = []) => {
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    const labels = String(predecessorIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => taskMap.get(id)?.wbs_code)
      .filter(Boolean);

    return labels.join(", ");
  };

  const resolvePredecessorIds = (predecessorWbs, tasks = [], currentTaskId = null) => {
    const wbsMap = new Map(
      tasks
        .filter((task) => task.id !== currentTaskId && task.wbs_code)
        .map((task) => [String(task.wbs_code).trim().toUpperCase(), task.id])
    );

    return normalizePredecessorTokens(predecessorWbs)
      .map((token) => wbsMap.get(token))
      .filter(Boolean)
      .join(",");
  };

  const applyTaskPatchRules = (patch = {}) => {
    const nextPatch = { ...patch };

    if (nextPatch.status === "Complete" && (nextPatch.percent_complete === undefined || nextPatch.percent_complete === null)) {
      nextPatch.percent_complete = 100;
    }

    if (nextPatch.status === "Not Started" && (nextPatch.percent_complete === undefined || nextPatch.percent_complete === null)) {
      nextPatch.percent_complete = 0;
    }

    if (Object.prototype.hasOwnProperty.call(nextPatch, "predecessor_wbs")) {
      nextPatch.predecessor_ids = resolvePredecessorIds(nextPatch.predecessor_wbs, scheduleTasks, nextPatch.id || null);
      delete nextPatch.predecessor_wbs;
    }

    return nextPatch;
  };

  const getPhaseWbsBase = (phase) => {
    const resolvedPhase = phase || PHASES[0];
    const index = PHASE_ORDER[resolvedPhase] ?? 0;
    return index + 1;
  };

  const buildWbsCode = (phase, sequence) => {
    const base = getPhaseWbsBase(phase);
    return `${base}.${sequence}`;
  };

  const getNextSortOrder = (tasks = []) => {
    const orders = tasks
      .map((task) => Number(task.sort_order))
      .filter((value) => Number.isFinite(value));

    if (!orders.length) return 100;
    return Math.max(...orders) + 100;
  };

  const buildExpectedWbsMap = (tasks = []) => {
    const expected = new Map();
    const orderedTasks = sortTasksHierarchically(tasks);
    const childCounters = new Map();

    orderedTasks.forEach((task) => {
      const phase = derivePhase(task);
      const parentId = task.parent_task_id;

      if (parentId && expected.has(parentId)) {
        const current = (childCounters.get(parentId) || 0) + 1;
        childCounters.set(parentId, current);
        expected.set(task.id, `${expected.get(parentId)}${current}`);
        return;
      }

      const phaseRoots = (childCounters.get(`phase:${phase}`) || 0) + 1;
      childCounters.set(`phase:${phase}`, phaseRoots);
      expected.set(task.id, buildWbsCode(phase, phaseRoots));
    });

    return expected;
  };

  const patchRequiresWbsRebalance = (patch = {}) =>
    ["phase", "start_date", "end_date", "parent_task_id"].some((key) =>
      Object.prototype.hasOwnProperty.call(patch, key)
    );

  const rebalanceWbsCodes = async (pid) => {
    if (!pid) return;

    const latestTasks = await base44.entities.ScheduleTask.filter({ project_id: pid });
    const expectedWbsMap = buildExpectedWbsMap(latestTasks);
    const updates = [];

    latestTasks.forEach((task) => {
      const nextWbs = expectedWbsMap.get(task.id);
      if (task.wbs_code !== nextWbs) {
        updates.push(base44.entities.ScheduleTask.update(task.id, { wbs_code: nextWbs }));
      }
    });

    if (updates.length) {
      await Promise.all(updates);
    }
  };

  useEffect(() => {
    if (!projectId || !scheduleTasks.length) return;

    const expectedWbsMap = buildExpectedWbsMap(scheduleTasks);
    const hasMismatch = scheduleTasks.some((task) => task.wbs_code !== expectedWbsMap.get(task.id));

    if (!hasMismatch || normalizedProjectRef.current === projectId) return;

    normalizedProjectRef.current = projectId;
    rebalanceWbsCodes(projectId)
      .then(() => qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] }))
      .catch(() => {
        normalizedProjectRef.current = null;
        toast.error("Failed to normalize WBS codes");
      });
  }, [projectId, scheduleTasks, qc]);

  const updateTaskMut = useMutation({
    mutationFn: async (data) => {
      const pid = data.project_id || projectId || activeProject?.id;
      const patch = applyTaskPatchRules(data);
      const updatedTask = await base44.entities.ScheduleTask.update(data.id, patch);
      if (patchRequiresWbsRebalance(patch)) {
        await rebalanceWbsCodes(pid);
      }
      return updatedTask;
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
    mutationFn: async (data) => {
      const pid = data.project_id || projectId || activeProject?.id;
      if (!pid) throw new Error("Select a project first");
      const createdTask = await base44.entities.ScheduleTask.create({
        ...applyTaskPatchRules(data),
        project_id: pid,
        sort_order: Number.isFinite(Number(data.sort_order))
          ? Number(data.sort_order)
          : getNextSortOrder(scheduleTasks),
      });
      await rebalanceWbsCodes(pid);
      return createdTask;
    },
    onSuccess: async (createdTask) => {
      await qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
      setShowAddTask(false);
      setPhaseFilter("all");
      setView("list");
      setCreatedTaskFocusId(createdTask.id);
      toast.success("Task created");
    },
    onError: (err) => toast.error("Create failed: " + err.message),
  });

  const bulkCreateTaskMut = useMutation({
    mutationFn: async (bulkPayload) => createBulkTasks(bulkPayload),
    onSuccess: async (count) => {
      await qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
      setShowAddTask(false);
      setPhaseFilter("all");
      setView("list");
      toast.success(`Created ${count} ${count === 1 ? "task" : "tasks"}`);
    },
    onError: (err) => toast.error("Bulk create failed: " + err.message),
  });

  useEffect(() => {
    if (!createdTaskFocusId || !scheduleTasks.length) return;
    const createdTask = scheduleTasks.find((task) => task.id === createdTaskFocusId);
    if (!createdTask) return;

    setSelectedTask(createdTask);
    setShowDrawer(true);
    setSelectedIds(new Set([createdTask.id]));
    setCreatedTaskFocusId(null);
  }, [createdTaskFocusId, scheduleTasks]);

  const deleteTaskMut = useMutation({
    mutationFn: async (id) => {
      const pid = projectId || activeProject?.id;
      await base44.entities.ScheduleTask.delete(id);
      await rebalanceWbsCodes(pid);
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
      setShowDrawer(false);
      setSelectedTask(null);
      setDeleteTarget(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (id) next.delete(id);
        return next;
      });
      toast.success("Task deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, patch }) => {
      const pid = projectId || activeProject?.id;
      const results = await Promise.all(
        ids.map((id) =>
          base44.entities.ScheduleTask.update(id, patch)
        )
      );
      if (patchRequiresWbsRebalance(patch)) {
        await rebalanceWbsCodes(pid);
      }
      return results;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
      setSelectedIds(new Set());
      setShowBulkEdit(false);
      toast.success(variables.label || `Updated ${variables.ids.length} tasks`);
    },
    onError: () => toast.error("Bulk update failed"),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => {
      const pid = projectId || activeProject?.id;
      await Promise.all(ids.map((id) => base44.entities.ScheduleTask.delete(id)));
      await rebalanceWbsCodes(pid);
      return ids;
    },
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
      setSelectedIds(new Set());
      setShowBulkDeleteDialog(false);
      if (selectedTask?.id && ids.includes(selectedTask.id)) {
        setSelectedTask(null);
        setShowDrawer(false);
      }
      toast.success("Tasks deleted");
    },
    onError: () => toast.error("Bulk delete failed"),
  });

  const parseMsProjectXml = (xml) => {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const taskNodes = Array.from(doc.getElementsByTagName("Task"));
    const tasks = [];
    taskNodes.forEach((node) => {
      const uid = node.getElementsByTagName("UID")[0]?.textContent;
      if (!uid || uid === "0") return; // skip root project summary
      const isSummary = node.getElementsByTagName("Summary")[0]?.textContent === "1";
      const name = node.getElementsByTagName("Name")[0]?.textContent || "Task";
      const start = node.getElementsByTagName("Start")[0]?.textContent?.slice(0, 10) || "";
      const finish = node.getElementsByTagName("Finish")[0]?.textContent?.slice(0, 10) || "";
      const pct = Number(node.getElementsByTagName("PercentComplete")[0]?.textContent) || 0;
      const preds = Array.from(node.getElementsByTagName("PredecessorLink")).map((p) =>
        p.getElementsByTagName("PredecessorUID")[0]?.textContent
      ).filter(Boolean);
      tasks.push({ uid, name, start, finish, pct, preds, isSummary });
    });
    return tasks;
  };

  const importParsedTasks = async (tasks, sourceName) => {
    const pid = projectId || activeProject?.id;
    if (!pid) throw new Error("Select a project before importing");

    const importableTasks = tasks.filter((task) => !task.isSummary);
    if (!importableTasks.length) {
      throw new Error("No importable tasks were found in the selected file.");
    }

    const createdBySourceId = new Map();

    for (const task of importableTasks) {
      const created = await base44.entities.ScheduleTask.create({
        project_id: pid,
        task_name: task.name || "Task",
        task_type: "Task",
        phase: derivePhase({ task_name: task.name }),
        start_date: task.start || new Date().toISOString().split("T")[0],
        end_date: task.finish || task.start || new Date().toISOString().split("T")[0],
        status: task.pct >= 100 ? "Complete" : task.pct > 0 ? "In Progress" : "Not Started",
        percent_complete: Number(task.pct) || 0,
        priority: "Normal",
        notes: `Imported from ${sourceName}`,
      });
      createdBySourceId.set(String(task.uid), created.id);
    }

    const predecessorUpdates = importableTasks
      .map((task) => {
        const createdId = createdBySourceId.get(String(task.uid));
        if (!createdId || !task.preds?.length) return null;

        const predecessorIds = task.preds
          .map((pred) => createdBySourceId.get(String(pred)))
          .filter(Boolean)
          .join(",");

        if (!predecessorIds) return null;
        return base44.entities.ScheduleTask.update(createdId, { predecessor_ids: predecessorIds });
      })
      .filter(Boolean);

    if (predecessorUpdates.length) {
      await Promise.all(predecessorUpdates);
    }

    await rebalanceWbsCodes(pid);
    return importableTasks.length;
  };

  const parseBulkTaskDrafts = (bulkPayload) => {
    const lines = String(bulkPayload.bulk_text || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/\t/g, "  "))
      .filter((line) => line.trim());

    return lines.map((line) => {
      const leadingSpaces = line.match(/^\s*/)?.[0].length || 0;
      const indentLevel = Math.floor(leadingSpaces / 2);
      const content = line.trim();
      const [task_name, phase, start_date, end_date, status, priority, predecessor_wbs] = content
        .split("|")
        .map((part) => part.trim());

      return {
        indentLevel,
        task_name,
        phase: phase || bulkPayload.phase,
        start_date: start_date || bulkPayload.start_date,
        end_date: end_date || bulkPayload.end_date,
        status: status || bulkPayload.status,
        priority: priority || bulkPayload.priority,
        predecessor_wbs: predecessor_wbs || "",
        task_type: bulkPayload.task_type || "Task",
      };
    }).filter((draft) => draft.task_name);
  };

  const createBulkTasks = async (bulkPayload) => {
    const pid = projectId || activeProject?.id;
    if (!pid) throw new Error("Select a project first");

    const drafts = parseBulkTaskDrafts(bulkPayload);
    if (!drafts.length) {
      throw new Error("Enter at least one task line to bulk add.");
    }

    const createdIdByLevel = new Map();
    let nextSortOrder = getNextSortOrder(scheduleTasks);

    for (const draft of drafts) {
      const parentTaskId = draft.indentLevel > 0 ? createdIdByLevel.get(draft.indentLevel - 1) || null : null;
      const createdTask = await base44.entities.ScheduleTask.create({
        ...applyTaskPatchRules({
          task_name: draft.task_name,
          phase: draft.phase,
          start_date: draft.start_date,
          end_date: draft.end_date,
          status: draft.status,
          priority: draft.priority,
          predecessor_wbs: draft.predecessor_wbs,
          task_type: draft.task_type,
          parent_task_id: parentTaskId,
          percent_complete: 0,
          sort_order: nextSortOrder,
        }),
        project_id: pid,
      });

      nextSortOrder += 100;

      createdIdByLevel.set(draft.indentLevel, createdTask.id);
      Array.from(createdIdByLevel.keys())
        .filter((key) => key > draft.indentLevel)
        .forEach((key) => createdIdByLevel.delete(key));
    }

    await rebalanceWbsCodes(pid);
    return drafts.length;
  };

  const handleImportMPP = async (file) => {
    if (!projectId && !activeProject?.id) {
      toast.error("Select a project before importing");
      return;
    }
    setImporting(true);
    try {
      const ext = String(file.name || "").split(".").pop()?.toLowerCase();
      if (ext === "mpp") {
        const response = await base44.functions.invoke("importScheduleMpp", {
          project_id: projectId || activeProject?.id,
          file_name: file.name,
          file_base64: await fileToBase64(file),
        });
        await rebalanceWbsCodes(projectId || activeProject?.id);
        qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
        toast.success(`Imported ${response.imported_count || 0} tasks from ${file.name}`);
        return;
      }

      const text = await file.text();
      const tasks = parseMsProjectXml(text);
      const importedCount = await importParsedTasks(tasks, file.name);
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
      toast.success(`Imported ${importedCount} tasks from ${file.name}`);
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

  const toggleSelectAll = (ids, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const applyBulkUpdate = (patch, label) => {
    const ids = Array.from(selectedIds);
    if (!ids.length || bulkUpdateMut.isPending || bulkDeleteMut.isPending) return;
    bulkUpdateMut.mutate({
      ids,
      patch: applyTaskPatchRules(patch),
      label,
    });
  };

  const bulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length || bulkDeleteMut.isPending || bulkUpdateMut.isPending) return;
    bulkDeleteMut.mutate(ids);
  };

  const bulkBusy = bulkUpdateMut.isPending || bulkDeleteMut.isPending;

  if (!hasProject) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Select a project to view schedule
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          The scheduling workspace is project-specific.
        </div>
      </div>
    );
  }

  if (loadingSchedule) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Loading schedule
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          Pulling tasks, WBS, and predecessor relationships.
        </div>
      </div>
    );
  }

  if (hasScheduleError) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--status-error)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Schedule Failed To Load
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          {scheduleErrorMessage}
        </div>
      </div>
    );
  }

  if (!selectedProject) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--status-warning)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Project Data Missing
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          The selected project record could not be resolved for Schedule.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Schedule
            </h1>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {currentProjectLabel} &middot; {scheduleTasks.length} Tasks
            </p>
          </div>
          <button
            onClick={() => {
              setAddTaskMode("single");
              setShowAddTask(true);
            }}
            disabled={!hasProject}
            style={{
              background: "var(--accent)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "7px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: hasProject ? "pointer" : "not-allowed",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              opacity: hasProject ? 1 : 0.45,
            }}
          >
            Create Task
          </button>
          <button
            onClick={() => {
              setAddTaskMode("bulk");
              setShowAddTask(true);
            }}
            disabled={!hasProject}
            style={{
              marginLeft: 8,
              background: "var(--bg-surface)",
              color: "var(--accent)",
              border: "1px solid var(--accent-border)",
              borderRadius: "var(--radius-btn)",
              padding: "7px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: hasProject ? "pointer" : "not-allowed",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              opacity: hasProject ? 1 : 0.45,
            }}
          >
            Bulk Add
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing || !hasProject}
            style={{
              marginLeft: 8,
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--accent-border)",
              borderRadius: "var(--radius-btn)",
              padding: "7px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: importing || !hasProject ? "not-allowed" : "pointer",
              opacity: importing || !hasProject ? 0.5 : 1,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {importing ? "Importing..." : "Import MPP"}
          </button>
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
        </div>
      </div>

      {/* Phase Filter */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Phase:</span>
        {["all", ...PHASES].map((p) => (
          <button
            key={p}
            onClick={() => setPhaseFilter(p)}
            style={{
              background: phaseFilter === p ? "var(--accent-muted)" : "transparent",
              border: `1px solid ${phaseFilter === p ? "var(--accent-border)" : "var(--border-default)"}`,
              borderRadius: 4,
              padding: "4px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: phaseFilter === p ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              transition: "all 0.1s",
            }}
          >
            {p === "all" ? "All" : p}
          </button>
        ))}
      </div>

      {/* View Tabs */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--divider)" }}>
        {[
          { id: "gantt", label: "Gantt Chart" },
          { id: "calendar", label: "Calendar" },
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
      {view === "gantt" && (
        <ScheduleGantt
          tasks={scheduleTasks}
          expandedTask={expandedTask}
          setExpandedTask={setExpandedTask}
          onTaskClick={(task) => { setSelectedTask(task); setShowDrawer(true); }}
          phaseFilter={phaseFilter}
          onInlineUpdate={(taskId, patch) => updateTaskMut.mutate({ id: taskId, ...patch })}
          formatPredecessorWbs={(value) => formatPredecessorWbs(value, scheduleTasks)}
        />
      )}

      {view === "calendar" && (
        <CalendarView
          tasks={visibleTasks}
          onSelectTask={(task) => { setSelectedTask(task); setShowDrawer(true); }}
          onAddTask={() => setShowAddTask(true)}
          onSelectDate={() => {}}
        />
      )}

      {view === "lookahead" && <LookaheadPlanner tasks={visibleTasks} />}

      {view === "list" && (
        <ScheduleTaskList
          tasks={visibleTasks}
          onEdit={(task) => { setSelectedTask(task); setShowDrawer(true); }}
          onDelete={(task) => setDeleteTarget(task)}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      )}

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        open={showDrawer}
        onClose={() => { setShowDrawer(false); setSelectedTask(null); }}
        onUpdate={(data) => updateTaskMut.mutate(data)}
        onDelete={(id) => deleteTaskMut.mutate(id)}
        onCreateSubtask={(task) => {
          setSelectedTask(task);
          setAddTaskMode("single");
          setShowAddTask(true);
        }}
        allTasks={scheduleTasks}
        formatPredecessorWbs={(value) => formatPredecessorWbs(value, scheduleTasks)}
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
        onBulkSubmit={(payload) => bulkCreateTaskMut.mutate(payload)}
        projectName={selectedProject?.name || ""}
        prefilledDate={new Date().toISOString().split("T")[0]}
        allTasks={scheduleTasks}
        initialMode={addTaskMode}
        initialParentTaskId={selectedTask?.id || ""}
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
        open={showBulkDeleteDialog}
        onClose={() => setShowBulkDeleteDialog(false)}
        onConfirm={bulkDelete}
        title="Delete selected tasks?"
        description={`This will remove ${selectedIds.size} selected ${selectedIds.size === 1 ? "task" : "tasks"}.`}
      />

      <BulkEditTasksModal
        open={showBulkEdit}
        onClose={() => setShowBulkEdit(false)}
        onApply={(patch) => applyBulkUpdate(patch, `Updated ${selectedIds.size} selected ${selectedIds.size === 1 ? "task" : "tasks"}`)}
        count={selectedIds.size}
        isSubmitting={bulkUpdateMut.isPending}
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
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Quick status:
          </span>
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              onClick={() => applyBulkUpdate({ status }, `${status} applied to ${selectedIds.size} ${selectedIds.size === 1 ? "task" : "tasks"}`)}
              disabled={bulkBusy}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-default)",
                background: status === "Complete" ? "var(--success-muted)" : status === "Delayed" ? "var(--danger-muted)" : status === "In Progress" ? "rgba(234,179,8,0.12)" : "var(--bg-surface)",
                color: status === "Complete" ? "var(--status-success)" : status === "Delayed" ? "var(--status-error)" : status === "In Progress" ? "var(--status-warning)" : "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                cursor: bulkBusy ? "not-allowed" : "pointer",
                opacity: bulkBusy ? 0.6 : 1,
              }}
            >
              {status}
            </button>
          ))}
          <select
            value=""
            onChange={(e) => {
              const value = e.target.value;
              if (!value) return;
              applyBulkUpdate({ phase: value }, `${value} phase applied to ${selectedIds.size} ${selectedIds.size === 1 ? "task" : "tasks"}`);
              e.target.value = "";
            }}
            disabled={bulkBusy}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: bulkBusy ? "not-allowed" : "pointer",
              opacity: bulkBusy ? 0.6 : 1,
            }}
          >
            <option value="">Set Phase</option>
            {PHASES.map((phase) => (
              <option key={phase} value={phase}>
                {phase}
              </option>
            ))}
          </select>
          <select
            value=""
            onChange={(e) => {
              const value = e.target.value;
              if (!value) return;
              applyBulkUpdate({ priority: value }, `${value} priority applied to ${selectedIds.size} ${selectedIds.size === 1 ? "task" : "tasks"}`);
              e.target.value = "";
            }}
            disabled={bulkBusy}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: bulkBusy ? "not-allowed" : "pointer",
              opacity: bulkBusy ? 0.6 : 1,
            }}
          >
            <option value="">Set Priority</option>
            {PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
          <select
            value=""
            onChange={(e) => {
              const value = e.target.value;
              if (!value) return;
              applyBulkUpdate({ task_type: value }, `${value} task type applied to ${selectedIds.size} ${selectedIds.size === 1 ? "task" : "tasks"}`);
              e.target.value = "";
            }}
            disabled={bulkBusy}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: bulkBusy ? "not-allowed" : "pointer",
              opacity: bulkBusy ? 0.6 : 1,
            }}
          >
            <option value="">Set Task Type</option>
            {TASK_TYPE_OPTIONS.map((taskType) => (
              <option key={taskType} value={taskType}>
                {taskType}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowBulkEdit(true)}
            disabled={bulkBusy}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--accent-border)",
              background: "var(--accent-muted)",
              color: "var(--accent)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: bulkBusy ? "not-allowed" : "pointer",
              opacity: bulkBusy ? 0.6 : 1,
            }}
          >
            Bulk Edit
          </button>
          <button onClick={() => setShowBulkDeleteDialog(true)} disabled={bulkDeleteMut.isPending || bulkUpdateMut.isPending} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--danger-border)", background: "var(--danger-muted)", color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: bulkDeleteMut.isPending || bulkUpdateMut.isPending ? "not-allowed" : "pointer", opacity: bulkDeleteMut.isPending || bulkUpdateMut.isPending ? 0.6 : 1 }}>
            Delete
          </button>
          <button onClick={() => setSelectedIds(new Set())} style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--divider)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
