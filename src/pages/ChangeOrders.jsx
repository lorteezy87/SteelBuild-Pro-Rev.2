import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/useProjectContext";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Download } from "lucide-react";
import StatusBadge from "../components/shared/StatusBadge";
import PageHeader from "../components/shared/PageHeader";
import SearchFilter from "../components/shared/SearchFilter";
import DeleteDialog from "../components/shared/DeleteDialog";
import KPIStrip from "../components/shared/KPIStrip";
import COFormModal from "../components/changeorders/COFormModal";
import { getNextNumber } from "../components/shared/numberSequencing";
import { PhoenixPanel } from "../components/shared/PhoenixPanel";
import PhoenixTable, { PTR, PTD } from "../components/shared/PhoenixTable";
import { formatCurrency, formatDate } from "../components/shared/formatters";
import { toast } from "sonner";

export default function ChangeOrders() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: cos = [], isLoading, refetch } = useQuery({
    queryKey: ["change-orders", activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.ChangeOrder.filter({ project_id: activeProject.id }, "-created_date")
      : [],
    enabled: !!activeProject?.id,
  });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => base44.entities.Project.list(), initialData: [] });

  const createMut = useMutation({
    mutationFn: async (d) => {
      let coNumber;
      try {
        coNumber = activeProject?.id
          ? await getNextNumber(activeProject.id, "CO")
          : null;
      } catch (e) {
        coNumber = null;
      }
      if (!coNumber) {
        coNumber = `CO-${String((cos.length || 0) + 1).padStart(3, "0")}`;
      }
      return base44.entities.ChangeOrder.create({
        ...d,
        co_number: coNumber,
        project_id: d.project_id || activeProject?.id,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["change-orders"] }); qc.invalidateQueries({ queryKey: ["projects"] }); setModalOpen(false); setEditing(null); toast.success("Change order created"); },
    onError: (err) => { toast.error("Failed to create change order: " + (err?.message || "Unknown error")); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ChangeOrder.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["change-orders"] }); qc.invalidateQueries({ queryKey: ["projects"] }); setModalOpen(false); setEditing(null); toast.success("Change order updated"); },
    onError: (err) => { toast.error("Failed to update change order: " + (err?.message || "Unknown error")); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ChangeOrder.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["change-orders"] }); setDeleteTarget(null); toast.success("Change order deleted"); },
    onError: () => { toast.error("Failed to delete change order"); },
  });

  const handleSave = (d) => { if (editing) updateMut.mutate({ id: editing.id, data: d }); else createMut.mutate(d); };

  const approvedVal = cos.filter(c => c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  const pendingVal = cos.filter(c => c.status === "Submitted" || c.status === "Under Review").reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  // Scope contract to active project only
  const activeProjectData = activeProject?.id ? projects.filter(p => p.id === activeProject.id) : [];
  const totalContract = activeProjectData.reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0);
  const revisedContract = totalContract + approvedVal;

  const kpis = [
    { label: "Total COs", value: cos.length, color: "slate" },
    { label: "Approved Value", value: formatCurrency(approvedVal), color: "green" },
    { label: "Pending Value", value: formatCurrency(pendingVal), color: "amber" },
    { label: "Original Contract", value: formatCurrency(totalContract), color: "blue" },
    { label: "Revised Contract", value: formatCurrency(revisedContract), color: "purple" },
    { label: "Net Change", value: formatCurrency(approvedVal), color: approvedVal >= 0 ? "green" : "rose" },
  ];

  const filtered = useMemo(() => cos.filter(c => {
    const q = debouncedSearch.toLowerCase();
    const matchSearch = !q || c.title?.toLowerCase().includes(q) || c.co_number?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  }), [cos, debouncedSearch, statusFilter]);

  // Waterfall: Original → Approved COs → Revised
  const waterfallTotal = revisedContract;
  const showWaterfall = totalContract > 0 && waterfallTotal > 0;

  const exportCSV = () => {
    const headers = ["CO #", "Title", "Project", "Reason", "Status", "Submitted", "Amount", "Approved By"];
    const rows = filtered.map(c => [c.co_number, c.title, c.project_name, c.reason_code, c.status, c.submitted_date, c.co_amount, c.approved_by]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c ?? ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "change_orders.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const cols = [
    { label: "CO #" }, { label: "Title" }, { label: "Project" }, { label: "Reason" },
    { label: "Status" }, { label: "Submitted" }, { label: "Amount", right: true }, { label: "Approved By" }, { label: "" }
  ];

  if (!activeProject?.id) return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>$</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 20, fontWeight: 700, color: "var(--text-disabled)", marginBottom: 6 }}>Select a project to view Change Orders</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Use the project selector in the top right.</div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Change Orders" subtitle={`${cos.length} change orders`} onAdd={() => { setEditing(null); setModalOpen(true); }} onRefresh={refetch} addLabel="New CO" />
      <KPIStrip items={kpis} />

      {/* Contract Waterfall */}
      {showWaterfall && (
        <PhoenixPanel title="Contract Waterfall" style={{ marginBottom: 14, padding: "14px 16px" }}>
          <div style={{ padding: "14px 16px" }}>
            <div style={{ display: "flex", gap: 0, height: 36, borderRadius: "var(--radius-card)", overflow: "hidden", background: "var(--bg-void)" }}>
              {/* Original */}
              <div style={{ flex: totalContract / waterfallTotal, background: "var(--info-muted)", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 60 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent-light)", letterSpacing: "0.08em", padding: "0 6px", textAlign: "center" }}>ORIGINAL<br />{formatCurrency(totalContract)}</span>
              </div>
              {/* Approved COs */}
              {approvedVal !== 0 && (
                <div style={{ flex: Math.abs(approvedVal) / waterfallTotal, background: approvedVal >= 0 ? "var(--success-muted)" : "var(--danger-muted)", borderLeft: `2px solid ${approvedVal >= 0 ? "var(--status-success)" : "var(--status-error)"}`, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 40 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: approvedVal >= 0 ? "var(--status-success)" : "var(--status-error)", letterSpacing: "0.06em", padding: "0 4px", textAlign: "center" }}>+COs<br />{formatCurrency(approvedVal)}</span>
                </div>
              )}
              {/* Pending */}
              {pendingVal > 0 && (
                <div style={{ flex: pendingVal / waterfallTotal, background: "var(--warning-muted)", borderLeft: "2px solid var(--status-warning)", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 30 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-warning)", padding: "0 4px", textAlign: "center" }}>PEND</span>
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Original Contract</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent-light)", fontWeight: 700, letterSpacing: "0.06em" }}>REVISED: {formatCurrency(revisedContract)}</span>
            </div>
          </div>
        </PhoenixPanel>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <SearchFilter search={search} onSearchChange={setSearch} filters={[
            { key: "status", value: statusFilter, onChange: setStatusFilter, placeholder: "Status", options: ["Draft", "Submitted", "Under Review", "Approved", "Rejected", "Void"] },
          ]} />
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} style={{ marginBottom: 16 }}><Download className="w-3.5 h-3.5 mr-1" />Export</Button>
      </div>

      <PhoenixPanel title="Change Order Log" count={filtered.length}>
        <PhoenixTable columns={cols} loading={isLoading} empty="NO CHANGE ORDERS FOUND">
          {filtered.map(c => (
            <PTR key={c.id} onClick={() => { setEditing(c); setModalOpen(true); }}>
              <PTD mono accent>{c.co_number}</PTD>
              <PTD style={{ maxWidth: 180 }}>{c.title}</PTD>
              <PTD muted>{c.project_name}</PTD>
              <PTD muted>{c.reason_code}</PTD>
              <PTD><StatusBadge status={c.status} /></PTD>
              <PTD>{formatDate(c.submitted_date)}</PTD>
              <PTD right mono bold style={{ color: (c.co_amount || 0) < 0 ? "var(--status-error)" : "var(--status-success)" }}>{formatCurrency(c.co_amount)}</PTD>
              <PTD>{c.approved_by || "—"}</PTD>
              <PTD>
                <div style={{ display: "flex", gap: 2 }} onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(c); setModalOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--status-error)" }} onClick={() => setDeleteTarget(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </PTD>
            </PTR>
          ))}
        </PhoenixTable>
        {/* Totals row */}
        {filtered.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(9,1fr)", padding: "8px 12px", borderTop: "1px solid var(--divider)", background: "var(--bg-surface-low)", gap: 8 }}>
            <div style={{ gridColumn: "span 6", fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Totals — {filtered.filter(c => c.status === "Approved").length} Approved · {filtered.filter(c => ["Submitted","Under Review"].includes(c.status)).length} Pending
            </div>
            <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: approvedVal >= 0 ? "var(--status-success)" : "var(--status-error)" }}>
              {formatCurrency(filtered.reduce((s, c) => s + (Number(c.co_amount) || 0), 0))}
            </div>
            <div style={{ gridColumn: "span 2" }} />
          </div>
        )}
      </PhoenixPanel>

      <COFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={handleSave} co={editing} projects={projects} nextNumber={`CO-${String((cos.length || 0) + 1).padStart(3, "0")}`} />
      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMut.mutate(deleteTarget.id)} title="Delete Change Order" description={`Delete ${deleteTarget?.co_number}?`} />
    </div>
  );
}