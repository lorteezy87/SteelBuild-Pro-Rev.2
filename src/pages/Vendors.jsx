import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/ProjectContext";
import { toast } from "sonner";
import VendorFormModal from "@/components/vendors/VendorFormModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { BulkActionBar } from "@/components/design-system";
import { exportToCSV } from "@/lib/csv";
import { batchProcess } from "@/utils/batchProcess";
import VendorControlCenter from "./vendors/VendorControlCenter";

export default function Vendors() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  // Bulk selection state (new — no Vendor bulk existed before)
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  // ── Queries ──
  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => entities.Vendor.list("-is_preferred"),
    staleTime: 5 * 60 * 1000,
  });

  // Project-scoped data for performance tracking
  const { data: deliveries = [] } = useQuery({
    queryKey: ["deliveries", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.Delivery.filter({ project_id: activeProject.id })
      : [],
    enabled: !!activeProject?.id,
    staleTime: 2 * 60 * 1000,
  });

  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.ChangeOrder.filter({ project_id: activeProject.id })
      : [],
    enabled: !!activeProject?.id,
    staleTime: 2 * 60 * 1000,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.Expense.filter({ project_id: activeProject.id })
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
    mutationFn: (data) => entities.Vendor.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setShowForm(false);
      setEditing(null);
      toast.success("Vendor created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: (data) => entities.Vendor.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setShowForm(false);
      setEditing(null);
      toast.success("Vendor updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.Vendor.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setDeleteTarget(null);
      toast.success("Vendor deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  // Bulk mutations (new — mirrors RFIs.jsx pattern)
  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }) => {
      const results = await batchProcess(ids, (id) => entities.Vendor.update(id, data));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      setSelectedIds(new Set());
      await qc.invalidateQueries({ queryKey: ["vendors"] });
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed`);
      } else {
        toast.success("Vendors updated");
      }
    },
    onError: (err) => toast.error(`Bulk update failed: ${err?.message || "unknown error"}`),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => {
      const results = await batchProcess(ids, (id) => entities.Vendor.delete(id));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} deletes failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      const count = results.succeeded.length;
      setSelectedIds(new Set());
      setShowBulkDelete(false);
      await qc.invalidateQueries({ queryKey: ["vendors"] });
      if (results.failed.length > 0) {
        toast.warning(`${count} deleted, ${results.failed.length} failed`);
      } else {
        toast.success(`${count} vendor${count === 1 ? "" : "s"} deleted`);
      }
    },
    onError: (err) => toast.error(`Bulk delete failed: ${err?.message || "unknown error"}`),
  });

  const handleSave = (data) => {
    if (editing) updateMut.mutate({ ...data, id: editing.id });
    else createMut.mutate(data);
  };

  // ── Selection helpers (new) ──
  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleAll = (checked) =>
    setSelectedIds(checked ? new Set(filtered.map((v) => v.id)) : new Set());

  // ── Filters ──
  const filtered = useMemo(() => vendors.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || v.company_name?.toLowerCase().includes(q) || v.contact_person?.toLowerCase().includes(q) || v.vendor_type?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || v.status === statusFilter;
    const matchType = typeFilter === "all" || v.vendor_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  }), [vendors, search, statusFilter, typeFilter]);

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

  // Shared dialogs remain owned by Vendors.jsx alongside the mutations.
  const modals = (
    <>
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
      <DeleteDialog
        open={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={() => bulkDeleteMut.mutate([...selectedIds])}
        title={`Delete ${selectedIds.size} Vendor${selectedIds.size === 1 ? "" : "s"}`}
        description={`Permanently delete ${selectedIds.size} selected vendor${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`}
      />
    </>
  );

  return (
    <div className="vendor-page">
      <VendorControlCenter
        vendors={vendors}
        filtered={filtered}
        vendorStats={vendorStats}
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        vendorTypes={types}
        onExport={exportCSV}
        onCreate={() => {
          setEditing(null);
          setShowForm(true);
        }}
        onOpenVendor={(vendor) => {
          setEditing(vendor);
          setShowForm(true);
        }}
        projectHealth={activeProject?.health_status || null}
        percentComplete={
          activeProject?.scope_complete_pct_override != null
            ? Number(activeProject.scope_complete_pct_override)
            : null
        }
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
      />

      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          {
            label: "MARK ACTIVE",
            icon: "check",
            onClick: () => bulkUpdateMut.mutate({ ids: [...selectedIds], data: { status: "Active" } }),
          },
          {
            label: "MARK INACTIVE",
            icon: "more",
            onClick: () => bulkUpdateMut.mutate({ ids: [...selectedIds], data: { status: "Inactive" } }),
          },
          {
            label: "MARK PREFERRED",
            icon: "action",
            onClick: () => bulkUpdateMut.mutate({ ids: [...selectedIds], data: { is_preferred: true } }),
          },
          {
            label: "DELETE",
            icon: "x",
            variant: "danger",
            onClick: () => setShowBulkDelete(true),
          },
        ]}
      />

      {modals}
    </div>
  );
}
