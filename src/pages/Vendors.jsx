import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import VendorFormModal from "@/components/vendors/VendorFormModal";
import VendorList from "@/components/vendors/VendorList";
import DeleteDialog from "@/components/shared/DeleteDialog";

export default function Vendors() {
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => base44.entities.Vendor.list("-is_preferred"),
    initialData: [],
  });

  const filtered = vendors.filter((vendor) => {
    const statusMatch = filterStatus === "all" || vendor.status === filterStatus;
    const typeMatch = filterType === "all" || vendor.vendor_type === filterType;
    const searchMatch = !searchTerm || vendor.company_name.toLowerCase().includes(searchTerm.toLowerCase()) || vendor.contact_person?.toLowerCase().includes(searchTerm.toLowerCase());
    return statusMatch && typeMatch && searchMatch;
  });

  const stats = {
    total: vendors.length,
    active: vendors.filter((v) => v.status === "Active").length,
    preferred: vendors.filter((v) => v.is_preferred).length,
    highRating: vendors.filter((v) => (v.performance_rating || 0) >= 4).length,
  };

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Vendor.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setShowForm(false);
      toast.success("Vendor created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: (data) => base44.entities.Vendor.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setShowForm(false);
      setEditing(null);
      toast.success("Vendor updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Vendor.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setDeleteTarget(null);
      toast.success("Vendor deleted");
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

  const types = ["Fabricator", "Supplier", "Subcontractor", "Material Supplier", "Equipment Rental", "Service Provider", "Testing Lab", "Other"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-body)", fontSize: 24, fontWeight: 800, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>Vendors & Suppliers</h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>{filtered.length} Active • {stats.preferred} Preferred</p>
        </div>

        <button onClick={() => {setEditing(null); setShowForm(true);}} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius-btn)", padding: "8px 16px", fontFamily: "var(--font-body)", fontSize: "10px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")} onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}>+ Add Vendor</button>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
        <StatCard label="Total" value={stats.total} color="var(--accent)" />
        <StatCard label="Active" value={stats.active} color="var(--status-success)" />
        <StatCard label="Preferred" value={stats.preferred} color="var(--status-info)" />
        <StatCard label="High Rating" value={stats.highRating} color="var(--status-success)" />
      </div>

      {/* Search & Filters */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <input type="text" placeholder="Search vendors..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ flex: 1, minWidth: "200px", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />

        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Status:</span>
          {["all", "Active", "Inactive", "Probation"].map((status) => (
            <button key={status} onClick={() => setFilterStatus(status)} style={{ background: filterStatus === status ? "var(--accent)" : "var(--bg-surface-low)", color: filterStatus === status ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {status === "all" ? "All" : status}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Type:</span>
          {["all", ...types.slice(0, 3)].map((type) => (
            <button key={type} onClick={() => setFilterType(type)} style={{ background: filterType === type ? "var(--accent)" : "var(--bg-surface-low)", color: filterType === type ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {type === "all" ? "All" : type.split(" ")[0].slice(0, 5)}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && <VendorFormModal vendor={editing} onClose={() => {setShowForm(false); setEditing(null);}} onSave={handleSave} />}

      {/* Vendors List */}
      <VendorList vendors={filtered} onEdit={(vendor) => {setEditing(vendor); setShowForm(true);}} onDelete={setDeleteTarget} />

      {/* Delete Dialog */}
      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMut.mutate(deleteTarget.id)} title="Delete Vendor" description="Delete this record? This cannot be undone." />
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