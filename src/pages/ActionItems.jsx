import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/useProjectContext";
import ActionItemFormModal from "@/components/actionitems/ActionItemFormModal";
import ActionItemList from "@/components/actionitems/ActionItemList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { toast } from "sonner";

export default function ActionItems() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ActionItem.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      qc.invalidateQueries({ queryKey: ["action-items-all"] });
      toast.success("Action item updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ActionItem.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      qc.invalidateQueries({ queryKey: ["action-items-all"] });
      setDeleteTarget(null);
      toast.success("Action item deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const { data: actionItems = [] } = useQuery({
    queryKey: ["action-items", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.ActionItem.filter({ project_id: projectId }, "-due_date")
        : base44.entities.ActionItem.list("-due_date"),
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const filtered = actionItems.filter((ai) => {
    const statusMatch = filterStatus === "all" || ai.status === filterStatus;
    const priorityMatch = filterPriority === "all" || ai.priority === filterPriority;
    return statusMatch && priorityMatch;
  });

  const stats = {
    total: actionItems.length,
    open: actionItems.filter((ai) => ai.status === "Open").length,
    inProgress: actionItems.filter((ai) => ai.status === "In Progress").length,
    complete: actionItems.filter((ai) => ai.status === "Complete").length,
    cancelled: actionItems.filter((ai) => ai.status === "Cancelled").length,
    critical: actionItems.filter((ai) => ai.priority === "Critical").length,
  };

  const statuses = ["Open", "In Progress", "Complete", "Cancelled"];
  const priorities = ["Critical", "High", "Medium", "Low"];

  const handleResolve = (item) => {
    const isComplete = item.status === "Complete";
    updateMut.mutate({
      id: item.id,
      data: {
        status: isComplete ? "Open" : "Complete",
        resolved_date: isComplete ? null : new Date().toISOString().split("T")[0],
      },
    });
  };

  const handleEdit = (item) => setEditingItem(item);
  const handleDelete = (item) => setDeleteTarget(item);

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
            Action Items
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
            {selectedProject ? selectedProject.name : "All Projects"} • {filtered.length} Items
          </p>
        </div>

        <button
          onClick={() => setShowForm(true)}
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
          + New Action Item
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "12px" }}>
        {[
          { label: "Total", value: stats.total, color: "var(--accent)" },
          { label: "Open", value: stats.open, color: "var(--status-warning)" },
          { label: "In Progress", value: stats.inProgress, color: "var(--status-info)" },
          { label: "Complete", value: stats.complete, color: "var(--status-success)" },
          { label: "Cancelled", value: stats.cancelled, color: "var(--text-muted)" },
          { label: "Critical", value: stats.critical, color: "var(--status-error)" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "var(--bg-surface)",
              border: "none",
              borderRadius: "var(--radius-card)",
              padding: "12px",
              borderTop: `2px solid ${stat.color}`,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "18px",
                fontWeight: 600,
                color: stat.color,
                marginBottom: "4px",
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "8px",
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              alignSelf: "center",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Status:
          </span>
          {["all", ...statuses].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                background: filterStatus === status ? "var(--accent)" : "var(--bg-surface-low)",
                color: filterStatus === status ? "white" : "var(--text-secondary)",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "5px 12px",
                fontFamily: "var(--font-body)",
                fontSize: "8px",
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {status === "all" ? "All" : status}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              alignSelf: "center",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Priority:
          </span>
          {["all", ...priorities].map((priority) => (
            <button
              key={priority}
              onClick={() => setFilterPriority(priority)}
              style={{
                background: filterPriority === priority ? "var(--accent)" : "var(--bg-surface-low)",
                color: filterPriority === priority ? "white" : "var(--text-secondary)",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "5px 12px",
                fontFamily: "var(--font-body)",
                fontSize: "8px",
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {priority === "all" ? "All" : priority}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {(showForm || editingItem) && (
        <ActionItemFormModal
          projectId={editingItem?.project_id || projectId}
          actionItem={editingItem}
          onClose={() => {
            setShowForm(false);
            setEditingItem(null);
          }}
          onSave={(data) => {
            if (editingItem) {
              updateMut.mutate({ id: editingItem.id, data });
            }
          }}
        />
      )}

      {/* Action Items List */}
      <ActionItemList
        actionItems={filtered}
        onEdit={handleEdit}
        onResolve={handleResolve}
        onDelete={handleDelete}
      />

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Action Item"
        description={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      />
    </div>
  );
}
