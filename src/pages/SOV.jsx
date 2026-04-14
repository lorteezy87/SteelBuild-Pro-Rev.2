import React, { useRef, useState, useMemo, useCallback } from "react";
import { useProjectContext } from "../components/shared/useProjectContext";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Pencil, Trash2, Lock, Check, ChevronDown, ChevronRight,
  ClipboardList, AlertTriangle, CheckCircle, Download, Upload,
} from "lucide-react";
import KPIStrip from "../components/shared/KPIStrip";
import DeleteDialog from "../components/shared/DeleteDialog";
import SOVFormModal from "../components/sov/SOVFormModal";
import { PhoenixPanel } from "../components/shared/PhoenixPanel";
import { PTD } from "../components/shared/PhoenixTable";
import { formatCurrency, formatPercent } from "../components/shared/formatters";
import { getNextNumber } from "../components/shared/numberSequencing";
import { toast } from "sonner";

/* ═══════════════════════════════════════════════════════════════════
   1. Progress Visualization — slim horizontal bar
   ═══════════════════════════════════════════════════════════════════ */
function MiniBar({ ratio, label }) {
  const pct = Math.min(Math.max((ratio || 0) * 100, 0), 120);
  const displayPct = Math.min(pct, 100);
  const barColor =
    pct > 95 ? "var(--status-error)" :
    pct >= 80 ? "var(--status-warning)" :
    "var(--status-success)";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, minWidth: 70 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
        {label}
      </span>
      <div style={{
        width: "100%", height: 4, borderRadius: 2,
        background: "var(--bg-surface-low)", overflow: "hidden",
      }}>
        <div style={{
          width: `${displayPct}%`, height: "100%", borderRadius: 2,
          background: barColor, transition: "width 0.3s ease",
        }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   2. Status Badges — high-visibility colored pills
   ═══════════════════════════════════════════════════════════════════ */
function SOVStatusPill({ status }) {
  const map = {
    Draft: {
      bg: "var(--info-muted)", color: "var(--status-info)",
      border: "var(--info-border)", Icon: null,
    },
    Submitted: {
      bg: "var(--warning-muted)", color: "var(--status-warning)",
      border: "var(--warning-border)", Icon: null,
    },
    Certified: {
      bg: "var(--success-muted)", color: "var(--status-success)",
      border: "var(--success-border)", Icon: Lock,
    },
    Paid: {
      bg: "var(--success-muted)", color: "var(--status-success)",
      border: "var(--success-border)", Icon: CheckCircle,
    },
  };
  const s = map[status] || {
    bg: "var(--hover-bg)", color: "var(--text-muted)",
    border: "var(--border-default)", Icon: null,
  };
  const { Icon } = s;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 9999,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
      whiteSpace: "nowrap", fontFamily: "var(--font-body)",
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
    }}>
      {Icon && <Icon style={{ width: 12, height: 12 }} />}
      {status || "\u2014"}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   5. Over-billing Protection — badge component
   ═══════════════════════════════════════════════════════════════════ */
function OverBilledBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 6px", borderRadius: 4, marginLeft: 4,
      fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
      background: "var(--danger-muted)", color: "var(--status-error)",
      border: "1px solid var(--danger-border)",
      fontFamily: "var(--font-mono)", textTransform: "uppercase",
    }}>
      <AlertTriangle style={{ width: 10, height: 10 }} />
      OVER-BILLED
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */
export default function SOV() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();

  /* ── UI state ── */
  const [appFilter, setAppFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  /* Requirement 4 — global retainage toggle */
  const [globalRetainage, setGlobalRetainage] = useState("per-row"); // "per-row" | "5" | "10" | "custom"
  const [customRetainage, setCustomRetainage] = useState("");

  /* Requirement 6 — phase grouping */
  const [groupByPhase, setGroupByPhase] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  /* Requirement 7 — fill to complete hover */
  const [hoveredRow, setHoveredRow] = useState(null);

  /* ── Queries ── */
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
    staleTime: 5 * 60 * 1000,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.Expense.filter({ project_id: activeProject.id })
      : [],
    enabled: !!activeProject?.id,
  });

  /* ── Mutations ── */
  const createMut = useMutation({
    mutationFn: async (d) => {
      let sovId;
      try {
        sovId = activeProject?.id
          ? await getNextNumber(activeProject.id, 'SOV')
          : null;
      } catch (e) {
        console.warn('getNextNumber failed, using fallback:', e);
        sovId = null;
      }
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

  /* Requirement 7 — Fill to Complete mutation (separate so it doesn't close modal) */
  const fillCompleteMut = useMutation({
    mutationFn: ({ id }) => base44.entities.SOVItem.update(id, { current_percent_complete: 100 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sov-items"] });
      toast.success("Filled to 100%");
    },
    onError: () => toast.error("Failed to update"),
  });

  const handleSave = (d) => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };

  /* ═══════════════════════════════════════════════════════════════════
     Import template — downloadable CSV template + CSV import
     ═══════════════════════════════════════════════════════════════════ */
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
      ["1", "Mobilization",                     "25000",  "1", "2026-01-01", "2026-01-31", "0", "100", "10", "Draft"],
      ["2", "Site Preparation",                 "45000",  "1", "2026-01-01", "2026-01-31", "0", "50",  "10", "Draft"],
      ["3", "Structural Steel - Fabrication",   "180000", "1", "2026-01-01", "2026-01-31", "0", "25",  "10", "Draft"],
      ["4", "Structural Steel - Erection",      "120000", "1", "2026-01-01", "2026-01-31", "0", "0",   "10", "Draft"],
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
          // handled by \n
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

      const first = parsed[0];
      if (!("description" in first) || !("scheduled_value" in first)) {
        toast.error("CSV missing required columns (description, scheduled_value). Download the template for the correct format.");
        return;
      }

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

  /* ── Effective retainage % ── */
  const effectiveRetainage = useMemo(() => {
    if (globalRetainage === "per-row") return null;
    if (globalRetainage === "custom") return Number(customRetainage) || 0;
    return Number(globalRetainage);
  }, [globalRetainage, customRetainage]);

  /* ── calc() with over-billing detection (Requirement 5) ── */
  const calc = useCallback((s) => {
    const sv = Number(s.scheduled_value) || 0;
    const prevPct = Number(s.previous_percent_complete) || 0;
    const curPct = Number(s.current_percent_complete) || 0;
    const retPct = effectiveRetainage != null
      ? effectiveRetainage
      : (Number(s.retainage_percent) || 0);
    const thisPeriod = sv * ((curPct - prevPct) / 100);
    const toDate = sv * (curPct / 100);
    const balance = sv - toDate;
    const retAmt = toDate * (retPct / 100);
    const netToDate = toDate - retAmt;
    const overBilled = curPct > 100 || balance < 0;
    return { thisPeriod, toDate, balance, retAmt, netToDate, retPct, overBilled };
  }, [effectiveRetainage]);

  /* ── Derived data ── */
  const appNumbers = useMemo(
    () => [...new Set(sovs.map(s => s.application_number).filter(Boolean))].sort((a, b) => Number(a) - Number(b)),
    [sovs],
  );

  /* Requirement 9 — badge counts per app */
  const appCounts = useMemo(() => {
    const counts = {};
    sovs.forEach(s => {
      const key = String(s.application_number || "");
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [sovs]);

  const filtered = useMemo(() => sovs
    .filter(s => {
      const matchApp = appFilter === "all" || String(s.application_number) === String(appFilter);
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchApp && matchStatus;
    })
    .sort((a, b) => {
      // Keep line items in numerical order by line_item_number; fall back to sov_id.
      const aNum = Number(a.line_item_number);
      const bNum = Number(b.line_item_number);
      if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum;
      return String(a.sov_id || "").localeCompare(String(b.sov_id || ""), undefined, { numeric: true });
    }),
  [sovs, appFilter, statusFilter]);

  const totals = useMemo(() => filtered.reduce((acc, s) => {
    const c = calc(s);
    acc.scheduled += Number(s.scheduled_value) || 0;
    acc.thisPeriod += c.thisPeriod;
    acc.toDate += c.toDate;
    acc.balance += c.balance;
    acc.retainage += c.retAmt;
    acc.net += c.netToDate;
    return acc;
  }, { scheduled: 0, thisPeriod: 0, toDate: 0, balance: 0, retainage: 0, net: 0 }), [filtered, calc]);

  /* ── Requirement 10 — SOV mismatch detection ── */
  const projectBudget = Number(
    activeProject?.revised_contract_value
    || activeProject?.original_contract_value
    || activeProject?.contract_value
    || activeProject?.budget
    || 0,
  );
  const totalScheduledValue = useMemo(
    () => sovs.reduce((sum, s) => sum + (Number(s.scheduled_value) || 0), 0),
    [sovs],
  );
  const mismatchVariance = projectBudget > 0 ? totalScheduledValue - projectBudget : 0;
  const hasMismatch = projectBudget > 0 && Math.abs(mismatchVariance) > 0.01;

  /* ── Requirement 6 — Phase grouping ── */
  const phaseGroups = useMemo(() => {
    if (!groupByPhase) return null;
    const groups = {};
    filtered.forEach(s => {
      const key = s.phase
        || s.cost_code
        || (s.description || "Ungrouped").split(/[\s\-]/)[0]
        || "Ungrouped";
      if (!groups[key]) {
        groups[key] = {
          label: key, items: [],
          sub: { scheduled: 0, toDate: 0, balance: 0 },
        };
      }
      groups[key].items.push(s);
      const c = calc(s);
      groups[key].sub.scheduled += Number(s.scheduled_value) || 0;
      groups[key].sub.toDate += c.toDate;
      groups[key].sub.balance += c.balance;
    });
    return Object.values(groups).sort((a, b) => a.label.localeCompare(b.label));
  }, [filtered, groupByPhase, calc]);

  const toggleGroup = (label) =>
    setCollapsedGroups(prev => ({ ...prev, [label]: !prev[label] }));

  /* ── KPIs ── */
  const kpis = [
    { label: "Scheduled Value", value: formatCurrency(totals.scheduled), color: "blue" },
    { label: "This Period", value: formatCurrency(totals.thisPeriod), color: "purple" },
    { label: "To Date", value: formatCurrency(totals.toDate), color: "green" },
    { label: "Balance", value: formatCurrency(totals.balance), color: "amber" },
    { label: "Retainage", value: formatCurrency(totals.retainage), color: "rose" },
    { label: "Net to Date", value: formatCurrency(totals.net), color: "green" },
  ];

  /* ── CSV export ── */
  const exportCSV = () => {
    const headers = [
      "SOV ID", "Description", "Project", "App #", "Scheduled",
      "Prev %", "Curr %", "This Period", "To Date", "Balance",
      "Retainage", "Net", "Status",
    ];
    const rows = filtered.map(s => {
      const c = calc(s);
      return [
        s.sov_id, s.description, s.project_name, s.application_number,
        s.scheduled_value, s.previous_percent_complete, s.current_percent_complete,
        c.thisPeriod.toFixed(2), c.toDate.toFixed(2), c.balance.toFixed(2),
        c.retAmt.toFixed(2), c.netToDate.toFixed(2), s.status,
      ];
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

  const nextSovId = `SOV-${String((sovs.length || 0) + 1).padStart(3, '0')}`;
  const COL_COUNT = 15;

  /* ═══════════════════════════════════════════════════════════════
     Column definitions
     ═══════════════════════════════════════════════════════════════ */
  const columns = [
    { label: "Line #" }, { label: "Description" }, { label: "Project" },
    { label: "Sched. Value", right: true }, { label: "Prev %", right: true },
    { label: "Curr %", right: true }, { label: "This Period", right: true },
    { label: "To Date", right: true }, { label: "Actual", right: true },
    { label: "Variance", right: true }, { label: "Balance", right: true },
    {
      label: effectiveRetainage != null
        ? `Retainage (Global: ${effectiveRetainage}%)`
        : "Retainage",
      right: true,
    },
    { label: "Net", right: true }, { label: "Status" }, { label: "" },
  ];

  /* ═══════════════════════════════════════════════════════════════
     Render a single SOV row
     ═══════════════════════════════════════════════════════════════ */
  const renderRow = (s) => {
    const c = calc(s);
    const sv = Number(s.scheduled_value) || 0;
    const curPct = Number(s.current_percent_complete) || 0;
    const toDateRatio = sv > 0 ? c.toDate / sv : 0;
    const sovActual = expenses
      .filter(e => e.sov_line_item_id === s.id && e.payment_status !== 'Voided')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const variance = c.toDate - sovActual;
    const isHovered = hoveredRow === s.id;

    return (
      <tr
        key={s.id}
        onClick={() => { setEditing(s); setModalOpen(true); }}
        onMouseEnter={() => setHoveredRow(s.id)}
        onMouseLeave={() => setHoveredRow(null)}
        style={{
          borderBottom: "1px solid var(--divider)",
          background: c.overBilled ? "var(--danger-muted)" : (isHovered ? "var(--bg-row-hover)" : "transparent"),
          borderLeft: c.overBilled ? "4px solid var(--status-error)" : "4px solid transparent",
          cursor: "pointer",
          transition: "background 0.1s",
        }}
      >
        <PTD mono accent>{s.line_item_number}</PTD>
        <PTD style={{ maxWidth: 160 }}>{s.description}</PTD>
        <PTD muted>{s.project_name}</PTD>
        <PTD right mono>{formatCurrency(s.scheduled_value)}</PTD>
        <PTD right mono>{formatPercent(s.previous_percent_complete)}</PTD>
        {/* Requirement 1 — Curr % with progress bar */}
        <PTD right mono>
          <MiniBar ratio={curPct / 100} label={formatPercent(curPct)} />
        </PTD>
        <PTD right mono>{formatCurrency(c.thisPeriod)}</PTD>
        {/* Requirement 1 — To Date with progress bar */}
        <PTD right mono>
          <MiniBar ratio={toDateRatio} label={formatCurrency(c.toDate)} />
        </PTD>
        <PTD right mono style={{ color: sovActual > c.toDate ? "var(--status-error)" : "var(--status-success)" }}>
          {formatCurrency(sovActual)}
        </PTD>
        <PTD right mono style={{ color: variance < 0 ? "var(--status-error)" : "var(--status-success)", fontWeight: 700 }}>
          {formatCurrency(variance)}
        </PTD>
        {/* Requirement 5 — Balance cell with over-billed badge */}
        <PTD right mono style={c.overBilled ? { color: "var(--status-error)", fontWeight: 700, background: "rgba(239,68,68,0.12)", borderRadius: 4 } : {}}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end" }}>
            {formatCurrency(c.balance)}
            {c.overBilled && <OverBilledBadge />}
          </span>
        </PTD>
        <PTD right mono style={{ color: "var(--status-warning)" }}>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span>{formatCurrency(c.retAmt)}</span>
            {effectiveRetainage != null && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                @{c.retPct}%
              </span>
            )}
          </span>
        </PTD>
        <PTD right mono bold style={{ color: "var(--accent)" }}>{formatCurrency(c.netToDate)}</PTD>
        {/* Requirement 2 — Status pill */}
        <PTD><SOVStatusPill status={s.status} /></PTD>
        {/* Actions + Requirement 7 Fill to Complete */}
        <PTD>
          <div style={{ display: "flex", gap: 2, alignItems: "center" }} onClick={e => e.stopPropagation()}>
            {curPct < 100 && isHovered && (
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                title="Fill to 100%"
                onClick={() => fillCompleteMut.mutate({ id: s.id })}
                style={{ color: "var(--status-success)" }}
              >
                <Check className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => { setEditing(s); setModalOpen(true); }}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              style={{ color: "var(--status-error)" }}
              onClick={() => setDeleteTarget(s)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </PTD>
      </tr>
    );
  };

  /* ═══════════════════════════════════════════════════════════════
     Totals row
     ═══════════════════════════════════════════════════════════════ */
  const tdTotalStyle = (color) => ({
    fontFamily: "var(--font-mono)", fontSize: 11,
    color: color || "var(--text-primary)", fontWeight: 700,
    textAlign: "right", padding: "8px 12px",
  });

  const renderTotalsRow = () => (
    <tr style={{ background: "var(--bg-surface-low)", borderTop: "2px solid var(--divider)" }}>
      <td colSpan={3} style={{
        fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em",
        color: "var(--accent)", fontWeight: 700, padding: "8px 12px",
      }}>TOTALS</td>
      <td style={tdTotalStyle()}>{formatCurrency(totals.scheduled)}</td>
      <td colSpan={2} />
      <td style={tdTotalStyle()}>{formatCurrency(totals.thisPeriod)}</td>
      <td style={tdTotalStyle()}>{formatCurrency(totals.toDate)}</td>
      <td colSpan={2} />
      <td style={tdTotalStyle()}>{formatCurrency(totals.balance)}</td>
      <td style={tdTotalStyle("var(--status-warning)")}>{formatCurrency(totals.retainage)}</td>
      <td style={tdTotalStyle("var(--accent)")}>{formatCurrency(totals.net)}</td>
      <td colSpan={2} />
    </tr>
  );

  /* ═══════════════════════════════════════════════════════════════
     Requirement 6 — Grouped table body
     ═══════════════════════════════════════════════════════════════ */
  const renderGroupedBody = () => {
    if (!phaseGroups) return null;
    return phaseGroups.map(group => {
      const isCollapsed = !!collapsedGroups[group.label];
      return (
        <React.Fragment key={group.label}>
          <tr
            style={{
              background: "var(--bg-sidebar)", borderBottom: "1px solid var(--divider)",
              borderTop: "2px solid var(--divider)", cursor: "pointer",
            }}
            onClick={() => toggleGroup(group.label)}
          >
            <td colSpan={COL_COUNT} style={{
              padding: "8px 12px", fontFamily: "var(--font-body)",
              fontSize: 12, fontWeight: 700, color: "var(--text-primary)",
              letterSpacing: "0.04em",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {isCollapsed
                  ? <ChevronRight style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
                  : <ChevronDown style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
                }
                <span style={{ textTransform: "uppercase" }}>{group.label}</span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                  background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
                  color: "var(--accent)", borderRadius: 4, padding: "1px 6px",
                }}>{group.items.length}</span>
                <span style={{
                  marginLeft: "auto", fontFamily: "var(--font-mono)",
                  fontSize: 10, color: "var(--text-muted)",
                }}>
                  Sched: {formatCurrency(group.sub.scheduled)}
                  {" | "}To Date: {formatCurrency(group.sub.toDate)}
                  {" | "}Bal: {formatCurrency(group.sub.balance)}
                </span>
              </div>
            </td>
          </tr>
          {!isCollapsed && group.items.map(s => renderRow(s))}
        </React.Fragment>
      );
    });
  };

  /* ═══════════════════════════════════════════════════════════════
     Requirement 8 — Rich empty state
     ═══════════════════════════════════════════════════════════════ */
  const renderEmptyState = () => (
    <tr>
      <td colSpan={COL_COUNT}>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "64px 24px", textAlign: "center",
        }}>
          <ClipboardList style={{
            width: 56, height: 56, color: "var(--text-disabled)",
            marginBottom: 16, strokeWidth: 1.2,
          }} />
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 18, fontWeight: 700,
            color: "var(--text-primary)", marginBottom: 6,
          }}>
            No Schedule of Values yet
          </div>
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)",
            maxWidth: 360, marginBottom: 20, lineHeight: 1.5,
          }}>
            Add your first line item to start tracking progress billing
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button
              size="sm"
              onClick={() => { setEditing(null); setModalOpen(true); }}
              style={{ background: "var(--accent)", color: "#fff", border: "none", fontWeight: 700 }}
            >
              + Add First Line Item
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={downloadTemplate}
              style={{ fontWeight: 600 }}
              title="Download blank CSV template"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Download Template
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={handleImportClick}
              disabled={importing || !activeProject?.id}
              style={{ fontWeight: 600 }}
              title="Upload filled template"
            >
              <Upload className="w-3.5 h-3.5 mr-1" />
              {importing ? "Importing…" : "Import CSV"}
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );

  /* ═══════════════════════════════════════════════════════════════
     No-project guard
     ═══════════════════════════════════════════════════════════════ */
  if (!activeProject?.id) return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>&#128202;</div>
      <div style={{
        fontFamily: "var(--font-body)", fontSize: 20, fontWeight: 700,
        color: "var(--text-disabled)", marginBottom: 6,
      }}>
        Select a project to view SOV
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
        Use the project selector in the top right.
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════
     MAIN RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div>
      {/* ── Requirement 10: SOV Mismatch Alert Banner ── */}
      {hasMismatch && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 16px", marginBottom: 12, borderRadius: 8,
          background: Math.abs(mismatchVariance) > projectBudget * 0.05
            ? "var(--danger-muted)" : "var(--warning-muted)",
          border: `1px solid ${Math.abs(mismatchVariance) > projectBudget * 0.05
            ? "var(--danger-border)" : "var(--warning-border)"}`,
        }}>
          <AlertTriangle style={{
            width: 18, height: 18, flexShrink: 0,
            color: Math.abs(mismatchVariance) > projectBudget * 0.05
              ? "var(--status-error)" : "var(--status-warning)",
          }} />
          <span style={{
            fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600,
            color: Math.abs(mismatchVariance) > projectBudget * 0.05
              ? "var(--status-error)" : "var(--status-warning)",
          }}>
            SOV MISMATCH: Total Scheduled Value ({formatCurrency(totalScheduledValue)}) differs from Budget ({formatCurrency(projectBudget)}) by {formatCurrency(Math.abs(mismatchVariance))}
          </span>
        </div>
      )}

      {/* ── Requirement 3: Sticky header zone (KPI + page header) ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "var(--bg-page)", paddingBottom: 4 }}>

        {/* Page heading + toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ marginBottom: 12 }}>
          <div>
            <h1 style={{
              fontFamily: "var(--font-body)", fontSize: 22, fontWeight: 800,
              color: "var(--text-primary)", margin: 0,
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>
              Schedule of Values
            </h1>
            <p style={{
              fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700,
              color: "var(--text-muted)", marginTop: 4,
              letterSpacing: "0.12em", textTransform: "uppercase",
            }}>
              {sovs.length} line items
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {["Draft", "Submitted", "Certified", "Paid"].map(s =>
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                )}
              </SelectContent>
            </Select>

            {/* Requirement 6 — Group by Phase toggle */}
            <Button
              variant={groupByPhase ? "default" : "outline"} size="sm"
              onClick={() => setGroupByPhase(v => !v)}
              style={groupByPhase ? { background: "var(--accent)", color: "#fff", border: "none" } : {}}
            >
              Group by Phase
            </Button>

            {/* Requirement 4 — Global Retainage toggle */}
            <Select value={globalRetainage} onValueChange={setGlobalRetainage}>
              <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Retainage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="per-row">Per-Row Retainage</SelectItem>
                <SelectItem value="5">Global 5%</SelectItem>
                <SelectItem value="10">Global 10%</SelectItem>
                <SelectItem value="custom">Custom %</SelectItem>
              </SelectContent>
            </Select>
            {globalRetainage === "custom" && (
              <Input
                type="number" placeholder="%"
                value={customRetainage}
                onChange={e => setCustomRetainage(e.target.value)}
                style={{ width: 64, height: 36, fontFamily: "var(--font-mono)", fontSize: 12 }}
              />
            )}

            <Button
              size="sm"
              onClick={() => { setEditing(null); setModalOpen(true); }}
              style={{ background: "var(--accent)", color: "#fff", border: "none" }}
            >
              + New Item
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTemplate} title="Download blank SOV CSV template">
              <Download className="w-3.5 h-3.5 mr-1" />
              Template
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportClick}
              disabled={importing || !activeProject?.id}
              title="Import SOV line items from CSV"
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

        {/* Requirement 9 — Application View Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
          <TabButton
            active={appFilter === "all"}
            onClick={() => setAppFilter("all")}
            label="All"
            count={sovs.length}
          />
          {appNumbers.map(n => (
            <TabButton
              key={n}
              active={appFilter === String(n)}
              onClick={() => setAppFilter(String(n))}
              label={`App #${n}`}
              count={appCounts[String(n)] || 0}
            />
          ))}
        </div>

        {/* Requirement 3 — Sticky KPI strip */}
        <KPIStrip items={kpis} />
      </div>

      {/* ── Main data table ── */}
      <PhoenixPanel title="Schedule of Values" count={filtered.length}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", maxHeight: "calc(100vh - 380px)", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            {/* Requirement 3 — Sticky thead */}
            <thead>
              <tr>
                {columns.map((col, i) => (
                  <th key={i} style={{
                    fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.12em",
                    textTransform: "uppercase", color: "var(--text-muted)",
                    fontWeight: 700, padding: "12px 16px",
                    background: "var(--bg-sidebar)",
                    borderBottom: "1px solid var(--divider)",
                    textAlign: col.right ? "right" : "left",
                    whiteSpace: "nowrap",
                    position: "sticky", top: 0, zIndex: 10,
                  }}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={COL_COUNT} style={{
                    textAlign: "center", padding: "40px 0",
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    color: "rgba(200,210,230,0.30)", letterSpacing: "0.1em",
                  }}>LOADING...</td>
                </tr>
              ) : filtered.length === 0 ? (
                renderEmptyState()
              ) : groupByPhase ? (
                <>
                  {renderGroupedBody()}
                  {renderTotalsRow()}
                </>
              ) : (
                <>
                  {filtered.map(s => renderRow(s))}
                  {renderTotalsRow()}
                </>
              )}
            </tbody>
          </table>
        </div>
      </PhoenixPanel>

      {/* ── Modals ── */}
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

/* ═══════════════════════════════════════════════════════════════════
   Requirement 9 — Tab button component for Application View
   ═══════════════════════════════════════════════════════════════════ */
function TabButton({ active, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 14px", borderRadius: 6,
        border: "1px solid var(--border-default)",
        fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600,
        cursor: "pointer", transition: "all 0.15s",
        background: active ? "var(--accent)" : "var(--bg-surface)",
        color: active ? "#fff" : "var(--text-secondary)",
      }}
    >
      {label}
      <span style={{
        marginLeft: 6, fontFamily: "var(--font-mono)", fontSize: 9,
        background: active ? "rgba(255,255,255,0.2)" : "var(--accent-muted)",
        color: active ? "#fff" : "var(--accent)",
        borderRadius: 4, padding: "1px 5px", fontWeight: 700,
      }}>
        {count}
      </span>
    </button>
  );
}
