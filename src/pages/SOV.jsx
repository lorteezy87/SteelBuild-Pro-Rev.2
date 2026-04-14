import React, { useRef, useState } from "react";
import { useProjectContext } from "../components/shared/useProjectContext";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2, Download, Upload } from "lucide-react";
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
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const { data: sovs = [], isLoading, refetch } = useQuery({
    queryKey: ["sov-items", activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.SOVItem.filter({ project_id: activeProject.id }, "-created_at")
      : [],
    enabled: !!activeProject?.id,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.Expense.filter({ project_id: activeProject.id })
      : [],
    enabled: !!activeProject?.id,
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

  // ── Import template ─────────────────────────────────────────────────────────
  // Column order matches the SOVItem entity schema and what exportCSV emits.
  const TEMPLATE_COLUMNS = [
    "line_item_number",
    "description",
    "scheduled_value",
    "application_number",
    "period_from",
    "period_to",
    "previous_percent_complete",
    "current_percent_complete",
    "retainage_percent",
    "status",
  ];

  const downloadTemplate = () => {
    const sampleRows = [
      ["1", "Mobilization", "25000", "1", "2026-01-01", "2026-01-31", "0", "100", "10", "Draft"],
      ["2", "Site Preparation", "45000", "1", "2026-01-01", "2026-01-31", "0", "50", "10", "Draft"],
      ["3", "Structural Steel - Fabrication", "180000", "1", "2026-01-01", "2026-01-31", "0", "25", "10", "Draft"],
      ["4", "Structural Steel - Erection", "120000", "1", "2026-01-01", "2026-01-31", "0", "0", "10", "Draft"],
    ];
    const lines = [
      TEMPLATE_COLUMNS.join(","),
      ...sampleRows.map(r => r.map(c => `"${c}"`).join(",")),
    ];
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sov-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("SOV template downloaded");
  };

  // Minimal RFC-4180 CSV parser (handles quoted fields, escaped quotes, CRLF).
  const parseCSV = (text) => {
    const rows = [];
    let field = "";
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          row.push(field); field = "";
        } else if (ch === "\n") {
          row.push(field); rows.push(row); row = []; field = "";
        } else if (ch === "\r") {
          // swallow — handled by \n
        } else {
          field += ch;
        }
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    if (rows.length === 0) return [];
    const headers = rows[0].map(h => h.trim());
    return rows.slice(1)
      .filter(r => r.some(c => String(c).trim() !== ""))
      .map(r => {
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
        return obj;
      });
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so same file can be re-picked
    if (!file) return;
    if (!activeProject?.id) {
      toast.error("Select a project before importing SOV items");
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast.error("CSV is empty — nothing to import");
        return;
      }

      // Validate headers include at least description + scheduled_value
      const first = parsed[0];
      if (!("description" in first) || !("scheduled_value" in first)) {
        toast.error("CSV missing required columns (description, scheduled_value). Download the template for the correct format.");
        return;
      }

      // Build records for bulk insert
      const existingCount = sovs.length || 0;
      const baseApp = Number(parsed[0].application_number) || 1;
      const records = parsed.map((row, idx) => {
        const lineNum = Number(row.line_item_number) || (existingCount + idx + 1);
        const sovId = `SOV-${String(existingCount + idx + 1).padStart(3, "0")}`;
        return {
          sov_id: sovId,
          project_id: activeProject.id,
          project_name: activeProject.name || "",
          line_item_number: lineNum,
          description: row.description || "",
          scheduled_value: Number(row.scheduled_value) || 0,
          application_number: Number(row.application_number) || baseApp,
          period_from: row.period_from || null,
          period_to: row.period_to || null,
          previous_percent_complete: Number(row.previous_percent_complete) || 0,
          current_percent_complete: Number(row.current_percent_complete) || 0,
          retainage_percent: row.retainage_percent === "" || row.retainage_percent == null
            ? 10
            : Number(row.retainage_percent),
          status: row.status || "Draft",
        };
      });

      // Reject rows with no description or non-positive scheduled_value
      const invalid = records.filter(r => !r.description.trim() || !(r.scheduled_value > 0));
      if (invalid.length) {
        toast.error(`${invalid.length} row(s) invalid — description and scheduled_value > 0 required`);
        return;
      }

      await base44.entities.SOVItem.bulkCreate(records);
      await qc.invalidateQueries({ queryKey: ["sov-items"] });
      toast.success(`Imported ${records.length} SOV line item${records.length === 1 ? "" : "s"}`);
    } catch (err) {
      console.error("SOV import failed:", err);
      toast.error("Import failed: " + (err?.message || "unknown error"));
    } finally {
      setImporting(false);
    }
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

  const filtered = sovs
    .filter(s => {
      const matchApp = appFilter === "all" || String(s.application_number) === String(appFilter);
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchApp && matchStatus;
    })
    .sort((a, b) => {
      // Keep line items in numerical order by line_item_number, then by sov_id as tiebreaker
      const aNum = Number(a.line_item_number);
      const bNum = Number(b.line_item_number);
      if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum;
      return String(a.sov_id || "").localeCompare(String(b.sov_id || ""), undefined, { numeric: true });
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
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="w-3.5 h-3.5 mr-1" />
            Template
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportClick}
            disabled={importing || !activeProject?.id}
          >
            <Upload className="w-3.5 h-3.5 mr-1" />
            {importing ? "Importing…" : "Import CSV"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportFile}
            style={{ display: "none" }}
          />
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