import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useProjectContext } from "@/components/shared/useProjectContext";
import InspectionFormModal from "@/components/inspections/InspectionFormModal";
import InspectionList from "@/components/inspections/InspectionList";
import DeleteDialog from "@/components/shared/DeleteDialog";

export default function Inspections() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: inspections = [] } = useQuery({
    queryKey: ["inspections", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Inspection.filter({ project_id: projectId })
        : [],
    initialData: [],
    enabled: !!projectId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Inspection.create({ ...data, project_id: data.project_id || projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspections", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Inspection created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: (data) => base44.entities.Inspection.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspections", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Inspection updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Inspection.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["inspections", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      setDeleteTarget(null);
      toast.success("Inspection deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ ...data, id: editing.id });
    } else {
      createMut.mutate(data);
    }
  };

  const filtered = inspections.filter((i) => {
    const typeMatch = filterType === "all" || i.inspection_type === filterType;
    const statusMatch = filterStatus === "all" || i.status === filterStatus;
    return typeMatch && statusMatch;
  });

  const stats = {
    total: inspections.length,
    scheduled: inspections.filter((i) => i.status === "Scheduled").length,
    inProgress: inspections.filter((i) => i.status === "In Progress").length,
    completed: inspections.filter((i) => i.status === "Completed").length,
    approved: inspections.filter((i) => i.sign_off_status === "Approved").length,
    rejected: inspections.filter((i) => i.sign_off_status === "Rejected").length,
  };

  const types = [
    "Steel Fabrication",
    "Welds",
    "Material",
    "Dimensional",
    "Surface Prep",
    "Coating",
    "Installation",
    "Connections",
    "Field Verification",
    "Other",
  ];

  const statuses = ["Scheduled", "In Progress", "Completed", "On Hold", "Cancelled"];

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
            Inspections
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
            {selectedProject ? selectedProject.name : "All Projects"} • {filtered.length} Inspections
          </p>
        </div>

        <button
           onClick={() => {setEditing(null); setShowForm(true);}}
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
           Create Inspection
         </button>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "12px" }}>
        <StatCard label="Total" value={stats.total} color="var(--accent)" />
        <StatCard label="Scheduled" value={stats.scheduled} color="var(--status-info)" />
        <StatCard label="In Progress" value={stats.inProgress} color="var(--status-warning)" />
        <StatCard label="Completed" value={stats.completed} color="var(--status-success)" />
        <StatCard label="Approved" value={stats.approved} color="var(--status-success)" />
        <StatCard label="Rejected" value={stats.rejected} color="var(--status-error)" />
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
          {["all", ...types.slice(0, 5)].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              style={{
                background: filterType === type ? "var(--accent)" : "var(--bg-surface-low)",
                color: filterType === type ? "white" : "var(--text-secondary)",
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
              {type === "all" ? "All" : type.slice(0, 6)}
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
              {status === "all" ? "All" : status.slice(0, 6)}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <InspectionFormModal
          projectId={projectId}
          inspection={editing}
          onClose={() => {setShowForm(false); setEditing(null);}}
          onSave={handleSave}
          isSaving={createMut.isPending || updateMut.isPending}
        />
      )}

      {/* Inspections List */}
      <InspectionList inspections={filtered} onEdit={(inspection) => {setEditing(inspection); setShowForm(true);}} onDelete={setDeleteTarget} />

      {/* Delete Dialog */}
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteMut.isPending && deleteTarget?.id) {
            deleteMut.mutate(deleteTarget.id);
          }
        }}
        title="Delete Inspection"
        description="Delete this record? This cannot be undone."
      />
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "none",
        borderRadius: "var(--radius-card)",
        padding: "12px",
        borderTop: `2px solid ${color}`,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "18px",
          fontWeight: 600,
          color: color,
          marginBottom: "4px",
        }}
      >
        {value}
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
        {label}
      </div>
    </div>
  );
}
