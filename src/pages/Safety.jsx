import { useProjectId } from "@/hooks/useProjectId";
import React, { useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import SafetyIncidentFormModal from "@/components/safety/SafetyIncidentFormModal";
import SafetyIncidentList from "@/components/safety/SafetyIncidentList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { CommandBar, KpiTile, Button } from "@/components/design-system";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";

export default function Safety() {
  const projectId = useProjectId();
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: rawIncidents = [], isLoading } = useQuery({
    queryKey: ["safety-incidents", projectId],
    queryFn: () =>
      projectId
        ? entities.SafetyIncident.filter({ project_id: projectId })
        : entities.SafetyIncident.list("-incident_date"),
  });

  useRealtimeInvalidation("safety_incidents", projectId, [["safety-incidents", projectId]]);

  const incidents = React.useMemo(() => rawIncidents.filter((r) => !r.is_deleted), [rawIncidents]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useAutoOpenCreate(() => {
    setEditing(null);
    setShowForm(true);
  });

  // Field Hub rows deep-link here with ?id=<incident>; open it for edit/close.
  useAutoOpenEdit(
    incidents,
    (incident) => { setEditing(incident); setShowForm(true); },
    { enabled: !isLoading },
  );

  const createMut = useMutation({
    mutationFn: (data) => entities.SafetyIncident.create(withProjectId(data, projectId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["safety-incidents", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Incident created");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Create failed")),
  });

  const updateMut = useMutation({
    mutationFn: (data) => entities.SafetyIncident.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["safety-incidents", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Incident updated");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Update failed")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.SafetyIncident.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["safety-incidents", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      setDeleteTarget(null);
      toast.success("Incident deleted");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Delete failed")),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ ...data, id: editing.id });
    } else {
      createMut.mutate(data);
    }
  };

  const handleStatusChange = (incident, newStatus) => {
    if (incident.status === newStatus) return;
    updateMut.mutate({ id: incident.id, status: newStatus });
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

  return (
    <div
      className="sb-dashboard-reference-page"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Safety & Hazards"
        count={filtered.length}
        unit=" · INCIDENTS"
        subtitle={`${stats.open} open · ${stats.critical} critical · injuries / near-misses / hazards`}
      >
        <Button variant="primary" icon="plus" onClick={() => { setEditing(null); setShowForm(true); }}>
          Report Incident
        </Button>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total"       value={stats.total}      color="var(--accent)" />
        <KpiTile compact label="Critical"    value={stats.critical}   color="var(--status-error)"
                 active={filterSeverity === "Critical"} onClick={() => setFilterSeverity(filterSeverity === "Critical" ? "all" : "Critical")} />
        <KpiTile compact label="High"        value={stats.high}       color="var(--status-warning)"
                 active={filterSeverity === "High"} onClick={() => setFilterSeverity(filterSeverity === "High" ? "all" : "High")} />
        <KpiTile compact label="Injuries"    value={stats.injuries}   color="var(--status-error)"
                 active={filterType === "Injury"} onClick={() => setFilterType(filterType === "Injury" ? "all" : "Injury")} />
        <KpiTile compact label="Near Misses" value={stats.nearMisses} color="var(--status-warning)"
                 active={filterType === "Near Miss"} onClick={() => setFilterType(filterType === "Near Miss" ? "all" : "Near Miss")} />
        <KpiTile compact label="Hazards"     value={stats.hazards}    color="var(--status-info)"
                 active={filterType === "Hazard"} onClick={() => setFilterType(filterType === "Hazard" ? "all" : "Hazard")} />
        <KpiTile compact label="Open"        value={stats.open}       color="var(--phase-fabrication)"
                 active={filterStatus === "Open"} onClick={() => setFilterStatus(filterStatus === "Open" ? "all" : "Open")} />
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
      <SafetyIncidentList incidents={filtered} onEdit={(incident) => {setEditing(incident); setShowForm(true);}} onDelete={setDeleteTarget} onStatusChange={handleStatusChange} />

      {/* Delete Dialog */}
      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (!deleteMut.isPending && deleteTarget?.id) deleteMut.mutate(deleteTarget.id); }} title="Delete Incident" description="Delete this record? This cannot be undone." />
    </div>
  );
}
