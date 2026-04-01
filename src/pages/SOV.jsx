import React, { useState } from "react";
import { useProjectContext } from "../components/shared/useProjectContext";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2 } from "lucide-react";
import StatusBadge from "../components/shared/StatusBadge";
import KPIStrip from "../components/shared/KPIStrip";
import DeleteDialog from "../components/shared/DeleteDialog";
import SOVFormModal from "../components/sov/SOVFormModal";
import { PhoenixPanel } from "../components/shared/PhoenixPanel";
import PhoenixTable, { PTR, PTD } from "../components/shared/PhoenixTable";
import { formatCurrency, formatPercent } from "../components/shared/formatters";
import { getNextNumber } from "../components/shared/numberSequencing";
import { toast } from "sonner";

export default function SOV() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const [appFilter, setAppFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: sovs = [], isLoading, refetch } = useQuery({
    queryKey: ["sov-items", activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.SOVItem.filter({ project_id: activeProject.id }, "-created_date")
      : [],
    enabled: !!activeProject?.id,
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.Expense.filter({ project_id: activeProject.id })
      : [],
    enabled: !!activeProject?.id,
    initialData: [],
  });

  const createMut = useMutation({
    mutationFn: async (d) => {
      // Try backend sequence first, fall back to length-based if it fails
      let sovId;
      try {
        sovId = activeProject?.id
          ? await getNextNumber(activeProject.id, 'SOV')
          : null;
      } catch (e) {
        console.warn('getNextNumber failed, using fallback:', e);
        sovId = null;
      }

      // Fallback — always produces a valid ID
      if (!sovId) {
        sovId = `SOV-${String((sovs.length || 0) + 1).padStart(3, '0')}`;
      }

      return base44.entities.SOVItem.create({
        ...d,
        sov_id: sovId,
        project_id: d.project_id || activeProject?.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sov-items"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("SOV item created");
    },
    onError: (err) => {
      toast.error("Failed to create SOV item: " + (err?.message || "Check that a project is selected and try again."));
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SOVItem.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sov-items"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("SOV item updated");
    },
    onError: (err) => {
      toast.error("Failed to update SOV item: " + (err?.message || "Unknown error"));
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.SOVItem.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sov-items"] });
      setDeleteTarget(null);
      toast.success("SOV item deleted");
    },
    onError: () => {
      toast.error("Failed to delete SOV item");
    },
  });

  const handleSave = (d) => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };

  const calc = (s) => {
    const sv = Number(s.scheduled_value) || 0;
    const prevPct = Number(s.previous_percent_complete) || 0;
    const curPct = Number(s.current_percent_complete) || 0;
    const retPct = Number(s.retainage_percent) || 0;
    const thisPeriod = sv * ((curPct - prevPct) / 100);
    const toDate = sv * (curPct / 100);
    const balance = sv - toDate;
    const retAmt = toDate * (retPct / 100);
    return { thisPeriod, toDate, balance, retAmt, netToDate: toDate - retAmt };
  };

  const appNumbers = [...new Set(sovs.map(s => s.application_number).filter(Boolean))].sort();

  const filtered = sovs.filter(s => {
    const matchApp = appFilter === "all" || String(s.application_number) === String(appFilter);
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    return matchApp && matchStatus;
  });

  const totals = filtered.reduce((acc, s) => {
    const c = calc(s);
    acc.scheduled += Number(s.scheduled_value) || 0;
    acc.thisPeriod += c.thisPeriod;
    acc.toDate += c.toDate;
    acc.balance += c.balance;
    acc.retainage += c.retAmt;
    acc.net += c.netToDate;
    return acc;
  }, { scheduled: 0, thisPeriod: 0, toDate: 0, balance: 0, retainage: 0, net: 0 });

  const kpis = [
    { label: "Scheduled Value", value: formatCurrency(totals.scheduled), color: "blue" },
    { label: "This Period", value: formatCurrency(totals.thisPeriod), color: "purple" },
    { label: "To Date", value: formatCurrency(totals.toDate), color: "green" },
    { label: "Balance", value: formatCurrency(totals.balance), color: "amber" },
    { label: "Retainage", value: formatCurrency(totals.retainage), color: "rose" },
    { label: "Net to Date", value: formatCurrency(totals.net), color: "green" },
  ];

  const exportCSV = () => {
    const headers = ["SOV ID", "Description", "Project", "App #", "Scheduled", "Prev %", "Curr %", "This Period", "To Date", "Balance", "Retainage", "Net", "Status"];
    const rows = filtered.map(s => {
      const c = calc(s);
      return [s.sov_id, s.description, s.project_name, s.application_number, s.scheduled_value, s.previous_percent_complete, s.current_percent_complete, c.thisPeriod.toFixed(2), c.toDate.toFixed(2), c.balance.toFixed(2), c.retAmt.toFixed(2), c.netToDate.toFixed(2), s.status];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${c ?? ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sov.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Compute a sensible next ID to show in the form
  const nextSovId = `SOV-${String((sovs.length || 0) + 1).padStart(3, '0')}`;

  if (!activeProject?.id) return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 20, fontWeight: 700, color: "var(--text-disabled)", marginBottom: 6 }}>
        Select a project to view SOV
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
        Use the project selector in the top right.
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 style={{ fontFamily: "var(--font-body)", fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Schedule of Values
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {sovs.length} line items
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={appFilter} onValueChange={setAppFilter}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All Apps" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Applications</SelectItem>
              {appNumbers.map(n => <SelectItem key={n} value={String(n)}>App #{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {["Draft", "Submitted", "Certified", "Paid"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => { setEditing(null); setModalOpen(true); }}
            style={{ background: "var(--accent)", color: "#fff", border: "none" }}
          >
            + New Item
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>Export CSV</Button>
          <Button variant="outline" size="sm" onClick={refetch}>Refresh</Button>
        </div>
      </div>

      <KPIStrip items={kpis} />

      <PhoenixPanel title="Schedule of Values" count={filtered.length}>
        <PhoenixTable
          columns={[
            { label: "Line #" }, { label: "Description" }, { label: "Project" },
            { label: "Sched. Value", right: true }, { label: "Prev %", right: true }, { label: "Curr %", right: true },
            { label: "This Period", right: true }, { label: "To Date", right: true },
            { label: "Actual", right: true }, { label: "Variance", right: true },
            { label: "Balance", right: true }, { label: "Retainage", right: true },
            { label: "Net", right: true }, { label: "Status" }, { label: "" }
          ]}
          loading={isLoading}
          empty="NO SOV ITEMS FOUND"
        >
          {filtered.map(s => {
            const c = calc(s);
            const sovActual = expenses
              .filter(e => e.sov_line_item_id === s.id && e.payment_status !== 'Voided')
              .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
            const variance = c.toDate - sovActual;
            return (
              <PTR key={s.id} onClick={() => { setEditing(s); setModalOpen(true); }}>
                <PTD mono accent>{s.line_item_number}</PTD>
                <PTD style={{ maxWidth: 160 }}>{s.description}</PTD>
                <PTD muted>{s.project_name}</PTD>
                <PTD right mono>{formatCurrency(s.scheduled_value)}</PTD>
                <PTD right mono>{formatPercent(s.previous_percent_complete)}</PTD>
                <PTD right mono>{formatPercent(s.current_percent_complete)}</PTD>
                <PTD right mono>{formatCurrency(c.thisPeriod)}</PTD>
                <PTD right mono>{formatCurrency(c.toDate)}</PTD>
                <PTD right mono style={{ color: sovActual > c.toDate ? 'var(--status-error)' : 'var(--status-success)' }}>
                  {formatCurrency(sovActual)}
                </PTD>
                <PTD right mono style={{ color: variance < 0 ? 'var(--status-error)' : 'var(--status-success)', fontWeight: 700 }}>
                  {formatCurrency(variance)}
                </PTD>
                <PTD right mono>{formatCurrency(c.balance)}</PTD>
                <PTD right mono style={{ color: "var(--status-warning)" }}>{formatCurrency(c.retAmt)}</PTD>
                <PTD right mono bold style={{ color: "var(--accent)" }}>{formatCurrency(c.netToDate)}</PTD>
                <PTD><StatusBadge status={s.status} /></PTD>
                <PTD>
                  <div style={{ display: "flex", gap: 2 }} onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(s); setModalOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--status-error)" }} onClick={() => setDeleteTarget(s)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </PTD>
              </PTR>
            );
          })}

          {filtered.length > 0 && (
            <tr style={{ background: "var(--bg-surface-low)", borderTop: "1px solid var(--divider)" }}>
              <td colSpan={3} style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--accent)", fontWeight: 700, padding: "8px 12px" }}>
                TOTALS
              </td>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", fontWeight: 700, textAlign: "right", padding: "8px 12px" }}>
                {formatCurrency(totals.scheduled)}
              </td>
              <td colSpan={2} />
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", fontWeight: 700, textAlign: "right", padding: "8px 12px" }}>
                {formatCurrency(totals.thisPeriod)}
              </td>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", fontWeight: 700, textAlign: "right", padding: "8px 12px" }}>
                {formatCurrency(totals.toDate)}
              </td>
              <td colSpan={2} />
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", fontWeight: 700, textAlign: "right", padding: "8px 12px" }}>
                {formatCurrency(totals.balance)}
              </td>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--status-warning)", fontWeight: 700, textAlign: "right", padding: "8px 12px" }}>
                {formatCurrency(totals.retainage)}
              </td>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", fontWeight: 700, textAlign: "right", padding: "8px 12px" }}>
                {formatCurrency(totals.net)}
              </td>
              <td colSpan={2} />
            </tr>
          )}
        </PhoenixTable>
      </PhoenixPanel>

      <SOVFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        sov={editing}
        projects={projects}
        nextId={nextSovId}
        activeProject={activeProject}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete SOV Item"
        description={`Delete ${deleteTarget?.sov_id}?`}
      />
    </div>
  );
}