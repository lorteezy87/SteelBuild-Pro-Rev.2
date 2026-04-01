import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useProjectContext } from "@/components/shared/useProjectContext";
import SafetyIncidentFormModal from "@/components/safety/SafetyIncidentFormModal";
import SafetyIncidentList from "@/components/safety/SafetyIncidentList";
import DeleteDialog from "@/components/shared/DeleteDialog";

export default function Safety() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: incidents = [] } = useQuery({
    queryKey: ["safety-incidents", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.SafetyIncident.filter({ project_id: projectId })
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
    mutationFn: (data) => base44.entities.SafetyIncident.create({ ...data, project_id: data.project_id || projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["safety-incidents", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Incident created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: (data) => base44.entities.SafetyIncident.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["safety-incidents", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Incident updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.SafetyIncident.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["safety-incidents", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      setDeleteTarget(null);
      toast.success("Incident deleted");
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

  const filtered = incidents.filter((i) => {
    const typeMatch = filterType === "all" || i.incident_type === filterType;
    const severityMatch = filterSeverity === "all" || i.severity === filterSeverity;
    const statusMatch = filterStatus === "all" || i.status === filterStatus;
    return typeMatch && severityMatch && statusMatch;
  });

  const stats = {
    total: incidents.length,
    critical: incidents.filter((i) => i.severity === "Critical").length,
    high: incidents.filter((i) => i.severity === "High").length,
    injuries: incidents.filter((i) => i.incident_type === "Injury").length,
    nearMisses: incidents.filter((i) => i.incident_type === "Near Miss").length,
    hazards: incidents.filter((i) => i.incident_type === "Hazard").length,
    open: incidents.filter((i) => i.status === "Open").length,
  };

  const types = ["Injury", "Near Miss", "Hazard", "Property Damage", "Environmental", "Behavioral", "Equipment Failure", "Other"];
  const severities = ["Critical", "High", "Medium", "Low"];
  const statuses = ["Open", "Under Investigation", "Action Plan", "In Progress", "Completed", "Closed"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-body)", fontSize: 24, fontWeight: 800, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>Safety & Hazards</h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>{selectedProject ? selectedProject.name : "All Projects"} • {filtered.length} Incidents</p>
        </div>

        <button onClick={() => {setEditing(null); setShowForm(true);}} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius-btn)", padding: "8px 16px", fontFamily: "var(--font-body)", fontSize: "10px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")} onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}>Create Incident</button>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "12px" }}>
        <StatCard label="Total" value={stats.total} color="var(--accent)" />
        <StatCard label="Critical" value={stats.critical} color="var(--status-error)" />
        <StatCard label="High" value={stats.high} color="var(--status-warning)" />
        <StatCard label="Injuries" value={stats.injuries} color="var(--status-error)" />
        <StatCard label="Near Misses" value={stats.nearMisses} color="var(--status-warning)" />
        <StatCard label="Hazards" value={stats.hazards} color="var(--status-info)" />
        <StatCard label="Open" value={stats.open} color="var(--accent)" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Type:</span>
          {["all", ...types.slice(0, 4)].map((type) => (
            <button key={type} onClick={() => setFilterType(type)} style={{ background: filterType === type ? "var(--accent)" : "var(--bg-surface-low)", color: filterType === type ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {type === "all" ? "All" : type.slice(0, 5)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Severity:</span>
          {["all", ...severities].map((sev) => (
            <button key={sev} onClick={() => setFilterSeverity(sev)} style={{ background: filterSeverity === sev ? "var(--accent)" : "var(--bg-surface-low)", color: filterSeverity === sev ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {sev === "all" ? "All" : sev}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Status:</span>
          {["all", "Open", "In Progress", "Completed", "Closed"].map((status) => (
            <button key={status} onClick={() => setFilterStatus(status)} style={{ background: filterStatus === status ? "var(--accent)" : "var(--bg-surface-low)", color: filterStatus === status ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {status === "all" ? "All" : status.slice(0, 6)}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && <SafetyIncidentFormModal projectId={projectId} incident={editing} onClose={() => {setShowForm(false); setEditing(null);}} onSave={handleSave} isSaving={createMut.isPending || updateMut.isPending} />}

      {/* Incidents List */}
      <SafetyIncidentList incidents={filtered} onEdit={(incident) => {setEditing(incident); setShowForm(true);}} onDelete={setDeleteTarget} />

      {/* Delete Dialog */}
      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (!deleteMut.isPending && deleteTarget?.id) deleteMut.mutate(deleteTarget.id); }} title="Delete Incident" description="Delete this record? This cannot be undone." />
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "none", borderRadius: "var(--radius-card)", padding: "12px", borderTop: `2px solid ${color}` }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 600, color: color, marginBottom: "4px" }}>{value}</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}
