import { useProjectContext } from "@/components/shared/useProjectContext";
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import ResourceFormModal from "@/components/resources/ResourceFormModal";
import ResourceList from "@/components/resources/ResourceList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { toast } from "sonner";

export default function ResourceManagement() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: resources = [] } = useQuery({
    queryKey: ["resources", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Resource.filter({ project_id: projectId })
        : base44.entities.Resource.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const filtered = resources.filter((r) => {
    const typeMatch = filterType === "all" || r.resource_type === filterType;
    const statusMatch = filterStatus === "all" || r.availability_status === filterStatus;
    return typeMatch && statusMatch;
  });

  const stats = {
    total: resources.length,
    labor: resources.filter((r) => r.resource_type === "Labor").length,
    equipment: resources.filter((r) => r.resource_type === "Equipment").length,
    subcontractor: resources.filter((r) => r.resource_type === "Subcontractor").length,
    material: resources.filter((r) => r.resource_type === "Material").length,
    available: resources.filter((r) => r.availability_status === "Available").length,
    allocated: resources.filter((r) => r.availability_status === "Allocated").length,
    overAllocated: resources.filter((r) => r.availability_status === "Over-Allocated").length,
  };

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Resource.update(id, {
      ...data,
      budget_hours: data.budget_hours ? parseFloat(data.budget_hours) : 0,
      actual_hours: parseFloat(data.actual_hours) || 0,
      forecast_hours: data.forecast_hours ? parseFloat(data.forecast_hours) : 0,
      hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : 0,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["resources"] }); toast.success("Resource updated"); setShowForm(false); setEditing(null); },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Resource.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["resources"] }); toast.success("Resource deleted"); setDeleteTarget(null); },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const handleSave = (data) => {
    if (editing) updateMut.mutate({ id: editing.id, data });
    // create is handled by ResourceFormModal internally
  };

  const types = ["Labor", "Equipment", "Subcontractor", "Material"];
  const statuses = ["Available", "Allocated", "Over-Allocated", "On Leave"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 24,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Resource Management
          </h1>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-muted)",
              marginTop: 4,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {selectedProject ? selectedProject.name : "All Projects"} • {filtered.length} Resources
          </p>
        </div>

        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          style={{
            background: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "8px 16px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            fontWeight: 700,
            cursor: "pointer",
            transition: "background 0.15s",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          + Add Resource
        </button>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
        <StatCard label="Total" value={stats.total} color="var(--accent)" />
        <StatCard label="Labor" value={stats.labor} color="var(--status-info)" />
        <StatCard label="Equipment" value={stats.equipment} color="var(--status-warning)" />
        <StatCard label="Subs" value={stats.subcontractor} color="var(--accent)" />
        <StatCard label="Available" value={stats.available} color="var(--status-success)" />
        <StatCard label="Allocated" value={stats.allocated} color="var(--status-info)" />
        <StatCard label="Over-Allocated" value={stats.overAllocated} color="var(--status-error)" />
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
            Type:
          </span>
          {["all", ...types].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              style={{
                background: filterType === type ? "var(--accent)" : "var(--bg-surface)",
                color: filterType === type ? "white" : "var(--text-secondary)",
                border: `1px solid ${filterType === type ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: "6px",
                padding: "6px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "8px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {type === "all" ? "All" : type}
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
            Status:
          </span>
          {["all", ...statuses].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                background: filterStatus === status ? "var(--accent)" : "var(--bg-surface)",
                color: filterStatus === status ? "white" : "var(--text-secondary)",
                border: `1px solid ${filterStatus === status ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: "6px",
                padding: "6px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "8px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {status === "all" ? "All" : status}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <ResourceFormModal projectId={projectId} editing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSave={handleSave} />
      )}

      {/* Resources List */}
      <ResourceList resources={filtered} onEdit={(r) => { setEditing(r); setShowForm(true); }} onDelete={setDeleteTarget} />

      {/* Delete Dialog */}
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Resource"
        description="Delete this resource? This cannot be undone."
      />
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "10px",
        padding: "12px",
        borderTop: `2px solid ${color}`,
      }}
    >
      <div
        style={{
          fontSize: "18px",
          fontWeight: 700,
          color: color,
          marginBottom: "4px",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "8px",
          color: "var(--text-muted)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}