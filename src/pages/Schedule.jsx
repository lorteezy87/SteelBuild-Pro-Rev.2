import React, { useState } from "react";
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
import BulkAddTaskModal from "@/components/schedule/BulkAddTaskModal";
import { PHASES } from "@/utils/phases";
import { useRef } from "react";

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
  const qc = useQueryClient();

  const { data: scheduleTasks = [] } = useQuery({
    queryKey: ["schedule-tasks", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.ScheduleTask.filter({ project_id: projectId })
        : [],
    enabled: !!projectId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : activeProject || null;
  const hasProject = !!(projectId || activeProject?.id);

  const updateTaskMut = useMutation({
    mutationFn: (data) => base44.entities.ScheduleTask.update(data.id, data),
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
      return base44.entities.ScheduleTask.create({ ...data, project_id: pid });
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
    mutationFn: async ({ ids, status }) =>
      Promise.all(
        ids.map((id) =>
          base44.entities.ScheduleTask.update(id, {
            status,
            percent_complete: status === "Complete" ? 100 : status === "Not Started" ? 0 : undefined,
          })
        )
      ),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
      setSelectedIds(new Set());
      toast.success(`Updated ${variables.ids.length} tasks`);
    },
    onError: () => toast.error("Bulk update failed"),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => Promise.all(ids.map((id) => base44.entities.ScheduleTask.delete(id))),
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
      setSelectedIds(new Set());
      if (selectedTask?.id && ids.includes(selectedTask.id)) {
        setSelectedTask(null);
        setShowDrawer(false);
      }
      toast.success("Tasks deleted");
    },
    onError: () => toast.error("Bulk delete failed"),
  });

  const handleBulkAdd = async (rows) => {
    if (!hasProject) return;
    setBulkSaving(true);
    try {
      const pid = projectId || activeProject?.id;
      await Promise.all(
        rows.map((row) =>
          base44.entities.ScheduleTask.create({ ...row, project_id: pid })
        )
      );
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

  const handleImportMPP = async (file) => {
    if (!projectId && !activeProject?.id) {
      toast.error("Select a project before importing");
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const tasks = parseMsProjectXml(text);
      if (!tasks.length) {
        throw new Error("Couldn't read tasks from the file. Please export the MPP as XML (File → Save As → XML) and retry.");
      }
      const creates = tasks
        .filter((t) => !t.isSummary)
        .map((t) =>
          base44.entities.ScheduleTask.create({
            project_id: projectId || activeProject?.id,
            task_name: t.name,
            task_type: "Task",
            phase: PHASES.includes("Fabrication") ? "Fabrication" : PHASES[0],
            start_date: t.start || new Date().toISOString().split("T")[0],
            end_date: t.finish || t.start || new Date().toISOString().split("T")[0],
            status: t.pct >= 100 ? "Complete" : t.pct > 0 ? "In Progress" : "Not Started",
            percent_complete: t.pct,
            priority: "Normal",
            notes: t.preds && t.preds.length ? `Predecessors: ${t.preds.join(", ")}` : undefined,
          })
        );
      await Promise.all(creates);
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
      toast.success(`Imported ${creates.length} tasks from ${file.name}`);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: "16px 24px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Schedule
            </h1>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {selectedProject ? selectedProject.name : "All Projects"} &middot; {scheduleTasks.length} Tasks
            </p>
          </div>
          <button
            onClick={() => setShowAddTask(true)}
            disabled={!hasProject}
            style={{
              background: "var(--accent)",
              color: "#fff",
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
            + Add Task
          </button>
          <button
            onClick={() => setShowBulkAdd(true)}
            disabled={!hasProject}
            style={{
              marginLeft: 8,
              background: "var(--bg-surface)",
              color: "#fff",
              border: "1px solid var(--accent-border)",
              borderRadius: "var(--radius-btn)",
              padding: "7px 14px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: !hasProject ? "not-allowed" : "pointer",
              opacity: !hasProject ? 0.45 : 1,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            + Bulk Add
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
      <div style={{ flexShrink: 0, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 24px 0" }}>
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
          <ScheduleGantt
            tasks={scheduleTasks}
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
        )}

        {view === "lookahead" && <LookaheadPlanner tasks={scheduleTasks} />}

        {view === "list" && (
          <ScheduleTaskList
            tasks={scheduleTasks}
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
        )}
      </div>

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        open={showDrawer}
        onClose={() => { setShowDrawer(false); setSelectedTask(null); }}
        onUpdate={(data) => updateTaskMut.mutate(data)}
        onDelete={(id) => deleteTaskMut.mutate(id)}
        allTasks={scheduleTasks}
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
      />

      <BulkAddTaskModal
        open={showBulkAdd}
        onClose={() => setShowBulkAdd(false)}
        onSubmit={handleBulkAdd}
        projectName={selectedProject?.name || ""}
        isSaving={bulkSaving}
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
          <button onClick={() => setSelectedIds(new Set())} style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--divider)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
