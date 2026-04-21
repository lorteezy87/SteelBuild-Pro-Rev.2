import { useProjectContext } from "@/components/shared/useProjectContext";
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import ChangeRequestFormModal from "@/components/changerequest/ChangeRequestFormModal";
import ChangeRequestList from "@/components/changerequest/ChangeRequestList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { CommandBar, KpiTile } from "@/components/design-system";
import { formatCurrency } from "@/components/shared/formatters";
import { Plus } from "lucide-react";

export default function ChangeRequests() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
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
    staleTime: 5 * 60 * 1000,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Change Requests"
        count={filtered.length}
        unit=" · REQUESTS"
        subtitle={`${stats.submitted} submitted · ${stats.approved} approved · pre-CO formal request tracking`}
      >
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--accent)", color: "var(--bg-base)", border: "none",
            borderRadius: "var(--radius-btn)", padding: "8px 14px",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <Plus size={12} /> New Request
        </button>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total"       value={stats.total}     color="var(--accent)" />
        <KpiTile compact label="Submitted"   value={stats.submitted} color="var(--status-warning)"
                 active={filterStatus === "Submitted"} onClick={() => setFilterStatus(filterStatus === "Submitted" ? "all" : "Submitted")} />
        <KpiTile compact label="Approved"    value={stats.approved}  color="var(--status-success)"
                 active={filterStatus === "Approved"}  onClick={() => setFilterStatus(filterStatus === "Approved" ? "all" : "Approved")} />
        <KpiTile compact label="Rejected"    value={stats.rejected}  color="var(--status-error)"
                 active={filterStatus === "Rejected"}  onClick={() => setFilterStatus(filterStatus === "Rejected" ? "all" : "Rejected")} />
        <KpiTile compact label="Cost Impact" value={formatCurrency(stats.totalCostImpact || 0, 0)}
                 color={stats.totalCostImpact > 0 ? "var(--status-warning)" : "var(--status-success)"} />
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
