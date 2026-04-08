import { useProjectContext } from "@/components/shared/useProjectContext";
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import InspectionFormModal from "@/components/inspections/InspectionFormModal";
import InspectionList from "@/components/inspections/InspectionList";
import DeleteDialog from "@/components/shared/DeleteDialog";

const TYPES = [
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

const TYPE_ABBREV = {
  "Steel Fabrication": "Steel Fab",
  "Field Verification": "Field Verify",
  "Surface Prep": "Surf Prep",
};

const STATUSES = ["Scheduled", "In Progress", "Completed", "On Hold", "Cancelled"];

const STATUS_COLORS = {
  Scheduled: "var(--status-info, #0EA5E9)",
  "In Progress": "var(--status-warning, #F59E0B)",
  Completed: "var(--status-success, #10B981)",
  "On Hold": "var(--text-muted, #8898A8)",
  Cancelled: "var(--status-error, #FF3B3B)",
};

export default function Inspections() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: inspections = [], isLoading } = useQuery({
    queryKey: ["inspections", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Inspection.filter({ project_id: projectId })
        : base44.entities.Inspection.list("-inspection_date"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
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

  // Click stat card to filter
  const handleStatClick = (statusValue) => {
    if (filterStatus === statusValue) {
      setFilterStatus("all");
    } else {
      setFilterStatus(statusValue);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Breadcrumb */}
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
        letterSpacing: "0.10em", textTransform: "uppercase",
      }}>
        {selectedProject ? (
          <>{selectedProject.name} <span style={{ opacity: 0.4 }}>/</span> Inspections</>
        ) : (
          <>All Projects <span style={{ opacity: 0.4 }}>/</span> Inspections</>
        )}
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display, var(--font-body))",
              fontSize: 22,
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
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-muted)",
              marginTop: 4,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
            }}
          >
            {filtered.length} of {inspections.length} inspections
            {filterType !== "all" || filterStatus !== "all" ? " (filtered)" : ""}
          </p>
        </div>

        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          style={{
            background: "var(--accent)",
            color: "#07090E",
            border: "none",
            borderRadius: "var(--radius-btn)",
            padding: "8px 16px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 800,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          + New Inspection
        </button>
      </div>

      {/* Stats Grid — clickable, color-coded */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        <StatCard
          label="Total"
          value={stats.total}
          color="var(--accent)"
          active={filterStatus === "all"}
          onClick={() => setFilterStatus("all")}
        />
        <StatCard
          label="Scheduled"
          value={stats.scheduled}
          color={STATUS_COLORS.Scheduled}
          active={filterStatus === "Scheduled"}
          onClick={() => handleStatClick("Scheduled")}
        />
        <StatCard
          label="In Progress"
          value={stats.inProgress}
          color={STATUS_COLORS["In Progress"]}
          active={filterStatus === "In Progress"}
          onClick={() => handleStatClick("In Progress")}
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          color={STATUS_COLORS.Completed}
          active={filterStatus === "Completed"}
          onClick={() => handleStatClick("Completed")}
        />
        <StatCard
          label="Approved"
          value={stats.approved}
          color="var(--status-success, #10B981)"
          active={false}
          onClick={null}
        />
        <StatCard
          label="Rejected"
          value={stats.rejected}
          color="var(--status-error, #FF3B3B)"
          active={false}
          onClick={null}
        />
      </div>

      {/* Filters — full labels, no truncation */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            Type:
          </span>
          {["all", ...TYPES].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              aria-pressed={filterType === type}
              style={{
                background: filterType === type ? "var(--accent)" : "var(--bg-surface)",
                color: filterType === type ? "#07090E" : "var(--text-secondary)",
                border: filterType === type ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                borderRadius: "var(--radius-btn)",
                padding: "4px 10px",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                transition: "all 0.12s",
                whiteSpace: "nowrap",
              }}
            >
              {type === "all" ? "All" : (TYPE_ABBREV[type] || type)}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: "var(--divider, rgba(255,255,255,0.08))" }} />

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            Status:
          </span>
          {["all", ...STATUSES].map((status) => {
            const sColor = STATUS_COLORS[status];
            return (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                aria-pressed={filterStatus === status}
                style={{
                  background: filterStatus === status
                    ? (sColor ? `${sColor}20` : "var(--accent)")
                    : "var(--bg-surface)",
                  color: filterStatus === status
                    ? (sColor || "#07090E")
                    : "var(--text-secondary)",
                  border: filterStatus === status
                    ? `1px solid ${sColor || "var(--accent)"}`
                    : "1px solid var(--border-default)",
                  borderRadius: "var(--radius-btn)",
                  padding: "4px 10px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  transition: "all 0.12s",
                  whiteSpace: "nowrap",
                }}
              >
                {status === "all" ? "All" : status}
              </button>
            );
          })}

          {/* Active filter clear */}
          {(filterType !== "all" || filterStatus !== "all") && (
            <button
              onClick={() => { setFilterType("all"); setFilterStatus("all"); }}
              style={{
                background: "transparent",
                color: "var(--text-muted)",
                border: "1px dashed var(--border-default)",
                borderRadius: "var(--radius-btn)",
                padding: "4px 10px",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <InspectionFormModal
          projectId={projectId}
          inspection={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSave}
          isSaving={createMut.isPending || updateMut.isPending}
        />
      )}

      {/* Empty State */}
      {!isLoading && filtered.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "60px 20px", gap: 16,
          background: "var(--bg-surface)", border: "1px dashed var(--border-default)",
          borderRadius: "var(--radius-card)",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "var(--accent-muted, rgba(200,155,32,0.08))",
            border: "1px solid var(--accent-border, rgba(200,155,32,0.20))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24,
          }}>
            {inspections.length === 0 ? "🔍" : "🔎"}
          </div>
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600,
            color: "var(--text-primary)", textAlign: "center",
          }}>
            {inspections.length === 0
              ? "No Inspections Yet"
              : "No Inspections Match Your Filters"}
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)",
            textAlign: "center", maxWidth: 340, lineHeight: 1.6,
          }}>
            {inspections.length === 0
              ? "Create your first inspection to start tracking quality control for this project."
              : "Try adjusting your type or status filters, or clear all filters to see everything."}
          </div>
          {inspections.length === 0 ? (
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              style={{
                background: "var(--accent)", color: "#07090E", border: "none",
                borderRadius: "var(--radius-btn)", padding: "10px 24px",
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800,
                cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em",
                marginTop: 4, transition: "all 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
            >
              + Create First Inspection
            </button>
          ) : (
            <button
              onClick={() => { setFilterType("all"); setFilterStatus("all"); }}
              style={{
                background: "transparent", color: "var(--accent)",
                border: "1px solid var(--accent)", borderRadius: "var(--radius-btn)",
                padding: "8px 20px", fontFamily: "var(--font-mono)", fontSize: 10,
                fontWeight: 700, cursor: "pointer", textTransform: "uppercase",
                letterSpacing: "0.08em", marginTop: 4,
              }}
            >
              Clear All Filters
            </button>
          )}
        </div>
      ) : (
        /* Inspections List */
        <InspectionList
          inspections={filtered}
          onEdit={(inspection) => { setEditing(inspection); setShowForm(true); }}
          onDelete={setDeleteTarget}
        />
      )}

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

function StatCard({ label, value, color, active, onClick }) {
  const isClickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-pressed={isClickable ? active : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={{
        background: active ? `${color}10` : "var(--bg-surface)",
        border: active ? `1px solid ${color}40` : "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: "14px 14px 12px",
        borderLeft: `3px solid ${color}`,
        cursor: isClickable ? "pointer" : "default",
        transition: "all 0.15s",
        outline: "none",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 22,
          fontWeight: 800,
          color: color,
          marginBottom: 4,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
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
