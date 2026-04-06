import { useProjectContext } from "@/components/shared/useProjectContext";
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import ChangeRequestFormModal from "@/components/changerequest/ChangeRequestFormModal";
import ChangeRequestList from "@/components/changerequest/ChangeRequestList";
import DeleteDialog from "@/components/shared/DeleteDialog";

export default function ChangeRequests() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: changeRequests = [] } = useQuery({
    queryKey: ["change-requests", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.ChangeRequest.filter({ project_id: projectId })
        : base44.entities.ChangeRequest.list("-request_date"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const filtered = changeRequests.filter((cr) => {
    const statusMatch = filterStatus === "all" || cr.status === filterStatus;
    const priorityMatch = filterPriority === "all" || cr.priority === filterPriority;
    return statusMatch && priorityMatch;
  });

  const stats = {
    total: changeRequests.length,
    submitted: changeRequests.filter((c) => c.status === "Submitted").length,
    approved: changeRequests.filter((c) => c.status === "Approved").length,
    rejected: changeRequests.filter((c) => c.status === "Rejected").length,
    totalCostImpact: changeRequests.reduce((sum, c) => sum + (c.estimated_cost_impact || 0), 0),
  };

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ChangeRequest.create({ ...data, project_id: data.project_id || projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change-requests", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Request created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: (data) => base44.entities.ChangeRequest.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change-requests", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Request updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ChangeRequest.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["change-requests", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      setDeleteTarget(null);
      toast.success("Request deleted");
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

  const statuses = ["Submitted", "Under Review", "Awaiting Approval", "Approved", "Rejected", "Approved with Conditions", "On Hold"];
  const priorities = ["Critical", "High", "Medium", "Low"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-body)", fontSize: 24, fontWeight: 800, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>Change Requests</h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>{selectedProject ? selectedProject.name : "All Projects"} • {filtered.length} Requests</p>
        </div>

        <button onClick={() => {setEditing(null); setShowForm(true);}} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius-btn)", padding: "8px 16px", fontFamily: "var(--font-body)", fontSize: "10px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")} onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}>+ New Request</button>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
        <StatCard label="Total" value={stats.total} color="var(--accent)" />
        <StatCard label="Submitted" value={stats.submitted} color="var(--status-warning)" />
        <StatCard label="Approved" value={stats.approved} color="var(--status-success)" />
        <StatCard label="Rejected" value={stats.rejected} color="var(--status-error)" />
        <StatCard label="Cost Impact" value={`$${(stats.totalCostImpact || 0).toLocaleString()}`} color={stats.totalCostImpact > 0 ? "var(--status-warning)" : "var(--status-success)"} />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Status:</span>
          {["all", ...statuses.slice(0, 3)].map((status) => (
            <button key={status} onClick={() => setFilterStatus(status)} style={{ background: filterStatus === status ? "var(--accent)" : "var(--bg-surface-low)", color: filterStatus === status ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {status === "all" ? "All" : status.slice(0, 6)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Priority:</span>
          {["all", ...priorities].map((priority) => (
            <button key={priority} onClick={() => setFilterPriority(priority)} style={{ background: filterPriority === priority ? "var(--accent)" : "var(--bg-surface-low)", color: filterPriority === priority ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {priority === "all" ? "All" : priority}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <ChangeRequestFormModal
          projectId={projectId}
          changeRequest={editing}
          onClose={() => {setShowForm(false); setEditing(null);}}
          onSave={handleSave}
          isSaving={createMut.isPending || updateMut.isPending}
        />
      )}

      {/* Change Requests List */}
      <ChangeRequestList requests={filtered} onEdit={(cr) => {setEditing(cr); setShowForm(true);}} onDelete={setDeleteTarget} />

      {/* Delete Dialog */}
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteMut.isPending && deleteTarget?.id) {
            deleteMut.mutate(deleteTarget.id);
          }
        }}
        title="Delete Request"
        description="Delete this record? This cannot be undone."
      />
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "none", borderRadius: "var(--radius-card)", padding: "12px", borderTop: `2px solid ${color}` }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 600, color: color, marginBottom: "4px" }}>{value}</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}
