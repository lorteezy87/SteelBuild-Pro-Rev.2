import { useProjectContext } from "@/components/shared/useProjectContext";
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import ResourceFormModal from "@/components/resources/ResourceFormModal";
import ResourceList from "@/components/resources/ResourceList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { toast } from "sonner";
import StatCard from "@/components/shared/StatCard";

// ── Keyframe injection (once) ──
const STYLE_ID = "resource-mgmt-keyframes";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes overAllocPulse {
      0%, 100% { box-shadow: 0 0 8px rgba(239,68,68,0.15); }
      50%      { box-shadow: 0 0 22px rgba(239,68,68,0.45); }
    }
    @keyframes ghostShimmer {
      0%   { opacity: 0.25; }
      50%  { opacity: 0.42; }
      100% { opacity: 0.25; }
    }
    @keyframes fadeSlideUp {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

// ── Ghost placeholder data for empty state ──
const GHOST_RESOURCES = [
  { name: "Welding Team A", type: "Labor", role: "CWI / Fitter", hours: "320h budget" },
  { name: "Trucking Fleet", type: "Equipment", role: "Flatbed / Lowboy", hours: "160h budget" },
  { name: "Ironworkers Local 86", type: "Subcontractor", role: "Erection Crew", hours: "480h budget" },
];

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

  // Pull in WPs so each resource row can show what's assigned to it.
  // Matches via work_packages.crew (text) against resource.name.
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.WorkPackage.filter({ project_id: projectId })
        : base44.entities.WorkPackage.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  // DB column is `availability`, not `availability_status`
  const getStatus = (r) => r.availability || r.availability_status || "Available";

  const filtered = resources.filter((r) => {
    const typeMatch = filterType === "all" || r.resource_type === filterType;
    const statusMatch = filterStatus === "all" || getStatus(r) === filterStatus;
    return typeMatch && statusMatch;
  });

  const stats = {
    total: resources.length,
    labor: resources.filter((r) => r.resource_type === "Labor").length,
    equipment: resources.filter((r) => r.resource_type === "Equipment").length,
    subcontractor: resources.filter((r) => r.resource_type === "Subcontractor").length,
    material: resources.filter((r) => r.resource_type === "Material").length,
    available: resources.filter((r) => getStatus(r) === "Available").length,
    allocated: resources.filter((r) => getStatus(r) === "Allocated").length,
    overAllocated: resources.filter((r) => getStatus(r) === "Over-Allocated").length,
  };

  // ResourceFormModal.toEntity() already maps UI fields → DB columns, so we
  // pass the payload straight through here.  The DB columns are:
  //   name, resource_type, role, capacity (=budget hrs), unit, cost_rate (=hourly rate),
  //   availability (=status), notes, metadata (JSONB with actual_hours, forecast_hours)

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Resource.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["resources"] }); toast.success("Resource updated"); setShowForm(false); setEditing(null); },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Resource.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["resources"] }); toast.success("Resource deleted"); setDeleteTarget(null); },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const handleSave = (data) => {
    // data comes from ResourceFormModal.toEntity() — already DB-mapped
    if (editing) updateMut.mutate({ id: editing.id, data });
    else toast.error("Unexpected save path — use form modal");
  };

  const types = ["Labor", "Equipment", "Subcontractor", "Material"];
  const statuses = ["Available", "Allocated", "Over-Allocated", "On Leave"];

  const isEmpty = resources.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              fontWeight: 800,
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
            {selectedProject ? selectedProject.name : "All Projects"} {" \u00B7 "} {filtered.length} Resources
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Sync Company Resources concept button */}
          <button
            onClick={() => toast.info("Company resource sync coming soon")}
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-btn)",
              padding: "8px 16px",
              fontFamily: "var(--font-display)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            Sync Company Resources
          </button>

          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            style={{
              background: "var(--accent)",
              color: "#07090E",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "8px 20px",
              fontFamily: "var(--font-display)",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "background 0.15s, box-shadow 0.15s",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; e.currentTarget.style.boxShadow = "0 0 16px rgba(200,155,32,0.25)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.boxShadow = "none"; }}
          >
            + Add Resource
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
        <StatCard label="Total" value={stats.total} color="var(--accent)" />
        <StatCard label="Labor" value={stats.labor} color="var(--status-info)" />
        <StatCard label="Equipment" value={stats.equipment} color="var(--status-warning)" />
        <StatCard label="Subs" value={stats.subcontractor} color="var(--accent)" />
        <StatCard label="Available" value={stats.available} color="var(--status-success)" />
        <StatCard label="Allocated" value={stats.allocated} color="var(--status-info)" />
        <StatCard label="Over-Allocated" value={stats.overAllocated} color="var(--status-error)" pulse={stats.overAllocated > 0} />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
                color: filterType === type ? "#07090E" : "var(--text-secondary)",
                border: `1px solid ${filterType === type ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: "var(--radius-badge)",
                padding: "6px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                minHeight: 32,
              }}
            >
              {type === "all" ? "All" : type}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
                color: filterStatus === status ? "#07090E" : "var(--text-secondary)",
                border: `1px solid ${filterStatus === status ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: "var(--radius-badge)",
                padding: "6px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                minHeight: 32,
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

      {/* Empty State with ghost placeholders */}
      {isEmpty && (
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-card)",
            padding: "40px 32px",
            textAlign: "center",
            animation: "fadeSlideUp 0.3s ease-out both",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 800,
              color: "var(--text-primary)",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            No Resources Yet
          </div>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--text-muted)",
              margin: "0 0 24px 0",
              lineHeight: 1.6,
            }}
          >
            Add your first crew, equipment, or subcontractor to start tracking resources.
          </p>

          {/* Ghost placeholder cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 560, margin: "0 auto 24px" }}>
            {GHOST_RESOURCES.map((ghost, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr auto",
                  gap: 16,
                  alignItems: "center",
                  padding: "12px 16px",
                  background: "var(--bg-surface-low)",
                  border: "1px dashed var(--bg-surface-high)",
                  borderRadius: "var(--radius-card)",
                  animation: `ghostShimmer 2.5s ease-in-out infinite`,
                  animationDelay: `${i * 0.4}s`,
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-disabled)" }}>{ghost.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)", marginTop: 2 }}>{ghost.type}</div>
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)" }}>{ghost.role}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)", marginTop: 2 }}>{ghost.hours}</div>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    color: "var(--text-disabled)",
                    border: "1px dashed var(--divider)",
                    borderRadius: 4,
                    padding: "3px 8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Ghost
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            style={{
              background: "var(--accent)",
              color: "#07090E",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "10px 24px",
              fontFamily: "var(--font-display)",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "background 0.15s, box-shadow 0.15s",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              minHeight: 44,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; e.currentTarget.style.boxShadow = "var(--shadow-glow-gold)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.boxShadow = "none"; }}
          >
            + Add First Resource
          </button>
        </div>
      )}

      {/* Resources List (only shown when not empty) */}
      {!isEmpty && (
        <ResourceList resources={filtered} workPackages={workPackages} onEdit={(r) => { setEditing(r); setShowForm(true); }} onDelete={setDeleteTarget} />
      )}

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

