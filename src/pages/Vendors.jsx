import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import VendorFormModal from "@/components/vendors/VendorFormModal";
import VendorList from "@/components/vendors/VendorList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

export default function Vendors() {
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterPreferred, setFilterPreferred] = useState(false);
  const [filterRating, setFilterRating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => base44.entities.Vendor.list("-is_preferred"),
    staleTime: 5 * 60 * 1000,
  });

  const filtered = vendors.filter((vendor) => {
    const statusMatch = filterStatus === "all" || vendor.status === filterStatus;
    const typeMatch = filterType === "all" || vendor.vendor_type === filterType;
    const preferredMatch = !filterPreferred || vendor.is_preferred;
    const ratingMatch = !filterRating || (vendor.performance_rating || 0) >= 4;
    const term = searchTerm.toLowerCase();
    const searchMatch = !searchTerm ||
      vendor.company_name?.toLowerCase().includes(term) ||
      vendor.contact_person?.toLowerCase().includes(term) ||
      vendor.vendor_type?.toLowerCase().includes(term) ||
      vendor.trade?.toLowerCase().includes(term) ||
      vendor.specialty?.toLowerCase().includes(term);
    return statusMatch && typeMatch && preferredMatch && ratingMatch && searchMatch;
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

  const clearAllFilters = () => {
    setFilterStatus("all");
    setFilterType("all");
    setFilterPreferred(false);
    setFilterRating(false);
    setSearchTerm("");
  };

  const hasActiveFilters = filterStatus !== "all" || filterType !== "all" || filterPreferred || filterRating || searchTerm;

  const types = ["Fabricator", "Supplier", "Subcontractor", "Material Supplier", "Equipment Rental", "Service Provider", "Testing Lab", "Other"];

  // Determine which stat card is "active" (at most one)
  const isTotalActive = !filterPreferred && !filterRating && filterStatus === "all";
  const isActiveActive = filterStatus === "Active" && !filterPreferred && !filterRating;
  const isPreferredActive = filterPreferred;
  const isHighRatingActive = filterRating;

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
        <StatCard
          label="Total" value={stats.total} color="var(--accent)"
          active={isTotalActive}
          onClick={() => { setFilterStatus("all"); setFilterPreferred(false); setFilterRating(false); }}
        />
        <StatCard
          label="Active" value={stats.active} color="var(--status-success)"
          active={isActiveActive}
          onClick={() => { setFilterStatus("Active"); setFilterPreferred(false); setFilterRating(false); }}
        />
        <StatCard
          label="Preferred" value={stats.preferred} color="var(--status-info)"
          active={isPreferredActive}
          onClick={() => setFilterPreferred((p) => !p)}
        />
        <StatCard
          label="High Rating" value={stats.highRating} color="var(--status-success)"
          active={isHighRatingActive}
          onClick={() => setFilterRating((r) => !r)}
        />
      </div>

      {/* Search & Filters */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <input type="text" placeholder="Search vendors by name, trade, or specialty..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ flex: 1, minWidth: "200px", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />

        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Status:</span>
          {["all", "Active", "Inactive", "Probation"].map((status) => (
            <button key={status} onClick={() => setFilterStatus(status)} style={{ background: filterStatus === status ? "var(--accent)" : "var(--bg-surface-low)", color: filterStatus === status ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {status === "all" ? "All" : status}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Type:</span>
          {["all", ...types].map((type) => (
            <button key={type} onClick={() => setFilterType(type)} style={{ background: filterType === type ? "var(--accent)" : "var(--bg-surface-low)", color: filterType === type ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {type === "all" ? "All" : type}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && <VendorFormModal vendor={editing} onClose={() => {setShowForm(false); setEditing(null);}} onSave={handleSave} />}

      {/* Vendors List */}
      {isLoading ? (
        <LoadingSkeleton variant="table" rows={4} />
      ) : filtered.length === 0 ? (
        hasActiveFilters ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", background: "var(--bg-surface)", borderRadius: "var(--radius-card)", border: "1px solid var(--border-default)" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: 0.5 }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0, marginBottom: 12 }}>
              No vendors match your filters
            </p>
            <button
              onClick={clearAllFilters}
              style={{ background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: "var(--radius-btn)", padding: "6px 16px", fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "white"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--accent)"; }}
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 24px", background: "var(--bg-surface)", borderRadius: "var(--radius-card)", border: "1px dashed var(--border-default)" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16, opacity: 0.4 }}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0, marginBottom: 6 }}>
              No vendors yet
            </p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", margin: 0, marginBottom: 20, textAlign: "center", maxWidth: 340 }}>
              You haven't added any suppliers yet. Click + Add Vendor to begin building your project team.
            </p>
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius-btn)", padding: "8px 20px", fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
            >
              + Add Vendor
            </button>
          </div>
        )
      ) : (
        <VendorList vendors={filtered} onEdit={(vendor) => {setEditing(vendor); setShowForm(true);}} onDelete={setDeleteTarget} />
      )}

      {/* Delete Dialog */}
      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMut.mutate(deleteTarget.id)} title="Delete Vendor" description="Delete this record? This cannot be undone." />
    </div>
  );
}

function StatCard({ label, value, color, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--bg-surface)",
        border: "none",
        borderRadius: "var(--radius-card)",
        padding: "12px",
        borderTop: `2px solid ${color}`,
        cursor: "pointer",
        transition: "box-shadow 0.15s, transform 0.15s",
        transform: hovered ? "translateY(-1px)" : "none",
        boxShadow: active
          ? `0 0 0 1.5px ${color}, 0 2px 8px rgba(0,0,0,0.12)`
          : hovered
            ? "0 2px 8px rgba(0,0,0,0.10)"
            : "none",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 600, color: color, marginBottom: "4px" }}>{value}</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}
