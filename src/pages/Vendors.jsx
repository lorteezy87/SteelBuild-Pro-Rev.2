import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/ProjectContext";
import { toast } from "sonner";
import { AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import VendorFormModal from "@/components/vendors/VendorFormModal";
import VendorList from "@/components/vendors/VendorList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { CommandBar, Button as DSButton } from "@/components/design-system";
import KPIStrip from "../components/shared/KPIStrip";
import SearchFilter from "../components/shared/SearchFilter";
import { PhoenixPanel } from "../components/shared/PhoenixPanel";
import { formatCurrency } from "../components/shared/formatters";
import { Plus, RefreshCw } from "lucide-react";
import { VENDOR_STATUS } from "@/lib/enums";
import { exportToCSV } from "@/lib/csv";

export default function Vendors() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  // ── Queries ──
  const { data: vendors = [], refetch } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => base44.entities.Vendor.list("-is_preferred"),
    staleTime: 5 * 60 * 1000,
  });

  // Project-scoped data for performance tracking
  const { data: deliveries = [] } = useQuery({
    queryKey: ["deliveries", activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.Delivery.filter({ project_id: activeProject.id })
      : [],
    enabled: !!activeProject?.id,
    staleTime: 2 * 60 * 1000,
  });

  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders", activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.ChangeOrder.filter({ project_id: activeProject.id })
      : [],
    enabled: !!activeProject?.id,
    staleTime: 2 * 60 * 1000,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.Expense.filter({ project_id: activeProject.id })
      : [],
    enabled: !!activeProject?.id,
    staleTime: 2 * 60 * 1000,
  });

  // ── Compute per-vendor stats from project data ──
  const vendorStats = useMemo(() => {
    const stats = {};
    const normalize = (name) => (name || "").trim().toLowerCase();

    // Deliveries by vendor
    for (const d of deliveries) {
      const key = normalize(d.vendor);
      if (!key) continue;
      if (!stats[key]) stats[key] = { deliveryCount: 0, onTimeCount: 0, lateCount: 0, deliveries: [], coCount: 0, coValue: 0, totalSpend: 0 };
      stats[key].deliveryCount += 1;
      stats[key].deliveries.push(d);
      if (d.status === "Delivered") {
        const scheduled = d.scheduled_date ? new Date(d.scheduled_date) : null;
        const actual = d.actual_date ? new Date(d.actual_date) : null;
        if (scheduled && actual) {
          if (actual <= scheduled) stats[key].onTimeCount += 1;
          else stats[key].lateCount += 1;
        }
      }
    }

    // COs by vendor (matching vendor field or description)
    for (const co of changeOrders) {
      // Try matching CO to vendor via reason/description or title
      // COs don't have a direct vendor field, so we check if vendor name appears in title/description
      for (const vendorName of Object.keys(stats)) {
        if (normalize(co.title).includes(vendorName) || normalize(co.description).includes(vendorName)) {
          stats[vendorName].coCount += 1;
          stats[vendorName].coValue += Number(co.co_amount) || 0;
        }
      }
    }

    // Expenses by vendor
    for (const exp of expenses) {
      const key = normalize(exp.vendor);
      if (!key) continue;
      if (!stats[key]) stats[key] = { deliveryCount: 0, onTimeCount: 0, lateCount: 0, deliveries: [], coCount: 0, coValue: 0, totalSpend: 0 };
      stats[key].totalSpend += Number(exp.amount) || 0;
    }

    // Compute on-time rates
    for (const key of Object.keys(stats)) {
      const s = stats[key];
      const delivered = s.onTimeCount + s.lateCount;
      s.onTimeRate = delivered > 0 ? Math.round((s.onTimeCount / delivered) * 100) : null;
    }

    // Map back to company_name (original casing)
    const result = {};
    for (const v of vendors) {
      const key = normalize(v.company_name);
      if (stats[key]) result[v.company_name] = stats[key];
    }
    return result;
  }, [vendors, deliveries, changeOrders, expenses]);

  // ── Mutations ──
  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Vendor.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setShowForm(false);
      setEditing(null);
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
    if (editing) updateMut.mutate({ ...data, id: editing.id });
    else createMut.mutate(data);
  };

  // ── Filters ──
  const filtered = useMemo(() => vendors.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || v.company_name?.toLowerCase().includes(q) || v.contact_person?.toLowerCase().includes(q) || v.vendor_type?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || v.status === statusFilter;
    const matchType = typeFilter === "all" || v.vendor_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  }), [vendors, search, statusFilter, typeFilter]);

  // ── Stats ──
  const activeCount = vendors.filter(v => v.status === VENDOR_STATUS.ACTIVE).length;
  const preferredCount = vendors.filter(v => v.is_preferred).length;
  const totalSpend = Object.values(vendorStats).reduce((s, v) => s + (v.totalSpend || 0), 0);
  const totalDeliveries = Object.values(vendorStats).reduce((s, v) => s + (v.deliveryCount || 0), 0);

  // Risk flags
  const riskVendors = useMemo(() => {
    const now = new Date();
    return vendors.filter(v => {
      if (v.status === VENDOR_STATUS.PROBATION || v.status === VENDOR_STATUS.SUSPENDED) return true;
      if (v.certifications_expiry && new Date(v.certifications_expiry) < now) return true;
      if (v.insurance_expiry && new Date(v.insurance_expiry) < now) return true;
      const stats = vendorStats[v.company_name];
      if (stats && stats.onTimeRate !== null && stats.onTimeRate < 70) return true;
      return false;
    });
  }, [vendors, vendorStats]);

  const kpis = [
    { label: "Total Vendors", value: vendors.length, color: "slate" },
    { label: "Active", value: activeCount, color: "green" },
    { label: "Preferred", value: preferredCount, color: "blue" },
    { label: "Deliveries", value: totalDeliveries, color: "amber" },
    { label: "Total Spend", value: formatCurrency(totalSpend), color: totalSpend > 0 ? "purple" : "slate" },
    { label: "At Risk", value: riskVendors.length, color: riskVendors.length > 0 ? "rose" : "slate" },
  ];

  const types = [...new Set(vendors.map(v => v.vendor_type).filter(Boolean))].sort();

  const exportCSV = () => {
    const headers = ["Company", "Type", "Contact", "Phone", "Email", "Status", "Preferred", "Deliveries", "On-Time %", "COs", "Spend"];
    const rows = filtered.map(v => {
      const stats = vendorStats[v.company_name] || {};
      return [
        v.company_name, v.vendor_type, v.contact_person, v.phone, v.email,
        v.status, v.is_preferred ? "Yes" : "No",
        stats.deliveryCount || 0, stats.onTimeRate != null ? `${stats.onTimeRate}%` : "N/A",
        stats.coCount || 0, stats.totalSpend || 0,
      ];
    });
    exportToCSV({ filename: "vendors.csv", headers, rows });
  };

  return (
    <div>
      <CommandBar
        eyebrow="SUPPLY CHAIN"
        title="Vendors & Suppliers"
        count={vendors.length}
        unit=" · VENDORS"
        subtitle={`${activeCount} active${riskVendors.length > 0 ? ` · ${riskVendors.length} at risk` : ""} · certs · insurance · on-time performance`}
      >
        <DSButton variant="secondary" onClick={refetch} title="Refresh">
          <RefreshCw size={12} /> Refresh
        </DSButton>
        <DSButton variant="primary" icon="plus" onClick={() => { setEditing(null); setShowForm(true); }}>
          New Vendor
        </DSButton>
      </CommandBar>

      <KPIStrip items={kpis} />

      {/* ── Risk Flags Panel ── */}
      {riskVendors.length > 0 && (
        <PhoenixPanel
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={14} style={{ color: "var(--status-error)" }} />
            Vendor Risk Flags
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", fontWeight: 400 }}>
              {riskVendors.length} vendor{riskVendors.length !== 1 ? "s" : ""}
            </span>
          </span>}
          style={{ marginBottom: 14, border: "1px solid rgba(248,81,73,0.3)" }}
        >
          <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            {riskVendors.slice(0, 5).map(v => {
              const now = new Date();
              const reasons = [];
              if (v.certifications_expiry && new Date(v.certifications_expiry) < now) reasons.push("Cert expired");
              if (v.insurance_expiry && new Date(v.insurance_expiry) < now) reasons.push("Insurance expired");
              if (v.status === VENDOR_STATUS.PROBATION) reasons.push("On probation");
              if (v.status === VENDOR_STATUS.SUSPENDED) reasons.push("Suspended");
              const stats = vendorStats[v.company_name];
              if (stats?.onTimeRate !== null && stats?.onTimeRate < 70) reasons.push(`${stats.onTimeRate}% on-time`);

              return (
                <div key={v.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", background: "var(--bg-surface-low)",
                  borderRadius: "var(--radius-card)", borderLeft: "3px solid var(--status-error)",
                }}>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>
                    {v.company_name}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", fontWeight: 600 }}>
                    {reasons.join(" \u00B7 ")}
                  </span>
                  <Button variant="ghost" size="sm" style={{ fontFamily: "var(--font-mono)", fontSize: 9, padding: "4px 8px", height: "auto" }}
                    onClick={() => { setEditing(v); setShowForm(true); }}>
                    Review
                  </Button>
                </div>
              );
            })}
            {riskVendors.length > 5 && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center", padding: "4px 0" }}>
                +{riskVendors.length - 5} more at-risk vendors
              </div>
            )}
          </div>
        </PhoenixPanel>
      )}

      {/* ── Search & Filters ── */}
      <div className="filter-bar-responsive" style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <SearchFilter search={search} onSearchChange={setSearch} filters={[
            { key: "status", value: statusFilter, onChange: setStatusFilter, placeholder: "Status", options: Object.values(VENDOR_STATUS) },
            ...(types.length > 1 ? [{ key: "type", value: typeFilter, onChange: setTypeFilter, placeholder: "Type", options: types }] : []),
          ]} />
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} style={{ marginBottom: 16 }}>
          <Download className="w-3.5 h-3.5 mr-1" />Export
        </Button>
      </div>

      {/* ── Vendor List ── */}
      <VendorList
        vendors={filtered}
        onEdit={(vendor) => { setEditing(vendor); setShowForm(true); }}
        onDelete={setDeleteTarget}
        vendorStats={vendorStats}
      />

      {/* ── Modals ── */}
      <VendorFormModal
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSave={handleSave}
        vendor={editing}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Vendor"
        description={`Delete ${deleteTarget?.company_name}? This cannot be undone.`}
      />
    </div>
  );
}
