import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useProjectContext } from "../components/shared/useProjectContext";
import DailyLogForm from "@/components/fieldops/DailyLogForm";
import DailyLogsList from "@/components/fieldops/DailyLogsList";
import DeleteDialog from "@/components/shared/DeleteDialog";

export default function DailyLogs() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const qc = useQueryClient();

  const { data: logs = [] } = useQuery({
    queryKey: ["daily-logs", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.DailyLog.filter({ project_id: projectId })
        : base44.entities.DailyLog.list("-date"),
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.DailyLog.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-logs", projectId] });
      toast.success("Daily log created");
      setShowForm(false);
      setEditing(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DailyLog.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-logs", projectId] });
      toast.success("Daily log updated");
      setShowForm(false);
      setEditing(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.DailyLog.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["daily-logs", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      toast.success("Daily log deleted");
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, data });
    } else {
      createMut.mutate(data);
    }
  };

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 24,
              fontWeight: 800,
              color: "var(--text-primary)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Daily Logs
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-muted)",
              marginTop: 4,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {selectedProject ? selectedProject.name : "All Projects"} • {logs.length} Entries
          </p>
        </div>

        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          style={{
            background: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: "var(--radius-btn)",
            padding: "8px 16px",
            fontFamily: "var(--font-body)",
            fontSize: "10px",
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          + New Log
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <DailyLogForm
          projectId={projectId}
          log={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
          isSaving={createMut.isPending || updateMut.isPending}
        />
      )}

      {/* Logs List */}
      <DailyLogsList
        logs={logs}
        onEdit={(log) => { setEditing(log); setShowForm(true); }}
        onDelete={(log) => setDeleteTarget(log)}
      />

      {/* Delete Confirmation */}
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteMut.isPending && deleteTarget?.id) {
            deleteMut.mutate(deleteTarget.id);
          }
        }}
        title="Delete Daily Log"
        description={`Delete log for ${deleteTarget?.date}? This cannot be undone.`}
      />
    </div>
  );
}
