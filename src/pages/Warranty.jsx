import { useProjectId } from "@/hooks/useProjectId";
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import WarrantyFormModal from "@/components/warranty/WarrantyFormModal";
import WarrantyList from "@/components/warranty/WarrantyList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import StatCard from "@/components/shared/StatCard";

export default function Warranty() {
  const projectId = useProjectId();
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: warranties = [] } = useQuery({
    queryKey: ["warranties", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Warranty.filter({ project_id: projectId })
        : base44.entities.Warranty.list("-start_date"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Warranty.create({ ...data, project_id: data.project_id || projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warranties", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Warranty created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: (data) => base44.entities.Warranty.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warranties", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Warranty updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Warranty.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["warranties", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      setDeleteTarget(null);
      toast.success("Warranty deleted");
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const filtered = warranties.filter((w) => {
    const typeMatch = filterType === "all" || w.warranty_type === filterType;
    let statusMatch = true;
    if (filterStatus !== "all") {
      if (!w.expiration_date) return false;
      const expDate = new Date(w.expiration_date);
      const daysUntilExpiry = Math.floor((expDate - today) / (1000 * 60 * 60 * 24));
      if (filterStatus === "active") statusMatch = w.is_active && daysUntilExpiry > 0;
      if (filterStatus === "expiring") statusMatch = w.is_active && daysUntilExpiry > 0 && daysUntilExpiry <= 90;
      if (filterStatus === "expired") statusMatch = daysUntilExpiry <= 0;
    }
    return typeMatch && statusMatch;
  });

  const stats = {
    total: warranties.length,
    active: warranties.filter((w) => {
      if (!w.expiration_date) return false;
      const expDate = new Date(w.expiration_date);
      return w.is_active && expDate > today;
    }).length,
    expiring: warranties.filter((w) => {
      if (!w.expiration_date) return false;
      const expDate = new Date(w.expiration_date);
      const daysUntilExpiry = Math.floor((expDate - today) / (1000 * 60 * 60 * 24));
      return w.is_active && daysUntilExpiry > 0 && daysUntilExpiry <= 90;
    }).length,
    expired: warranties.filter((w) => {
      if (!w.expiration_date) return false;
      const expDate = new Date(w.expiration_date);
      return expDate <= today;
    }).length,
  };

  const types = ["Material", "Structural Steel", "Connections", "Coating", "Welds", "Installation", "Equipment", "Other"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-body)", fontSize: 24, fontWeight: 800, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>Warranties</h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>{selectedProject ? selectedProject.name : "All Projects"} • {filtered.length} Records</p>
        </div>

        <button onClick={() => {setEditing(null); setShowForm(true);}} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius-btn)", padding: "8px 16px", fontFamily: "var(--font-body)", fontSize: "10px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")} onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}>+ Add Warranty</button>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
        <StatCard label="Total" value={stats.total} color="var(--accent)" />
        <StatCard label="Active" value={stats.active} color="var(--status-success)" />
        <StatCard label="Expiring Soon" value={stats.expiring} color="var(--status-warning)" />
        <StatCard label="Expired" value={stats.expired} color="var(--status-error)" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Type:</span>
          {["all", ...types.slice(0, 4)].map((type) => (
            <button key={type} onClick={() => setFilterType(type)} style={{ background: filterType === type ? "var(--accent)" : "var(--bg-surface-low)", color: filterType === type ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {type === "all" ? "All" : type.slice(0, 6)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Status:</span>
          {["all", "active", "expiring", "expired"].map((status) => (
            <button key={status} onClick={() => setFilterStatus(status)} style={{ background: filterStatus === status ? "var(--accent)" : "var(--bg-surface-low)", color: filterStatus === status ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {status === "all" ? "All" : status === "expiring" ? "Expiring" : status === "expired" ? "Expired" : "Active"}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && <WarrantyFormModal projectId={projectId} warranty={editing} onClose={() => {setShowForm(false); setEditing(null);}} onSave={handleSave} isSaving={createMut.isPending || updateMut.isPending} />}

      {/* Warranties List */}
      <WarrantyList warranties={filtered} onEdit={(warranty) => {setEditing(warranty); setShowForm(true);}} onDelete={setDeleteTarget} />

      {/* Delete Dialog */}
      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (!deleteMut.isPending && deleteTarget?.id) deleteMut.mutate(deleteTarget.id); }} title="Delete Warranty" description="Delete this record? This cannot be undone." />
    </div>
  );
}
