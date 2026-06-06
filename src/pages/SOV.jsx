import React, { useRef, useState, useMemo, useCallback } from "react";
import { useProjectContext } from "../components/shared/ProjectContext";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Pencil, Trash2, Lock, Check, ChevronDown, ChevronRight,
  ClipboardList, AlertTriangle, CheckCircle, Download, Upload,
  CheckSquare, Square,
} from "lucide-react";
import { BulkActionBar } from "@/components/design-system";
import KPIStrip from "../components/shared/KPIStrip";
import DeleteDialog from "../components/shared/DeleteDialog";
import SOVFormModal from "../components/sov/SOVFormModal";
import { CommandBar } from "@/components/design-system";
import { PhoenixPanel } from "../components/shared/PhoenixPanel";
import { PTD } from "../components/shared/PhoenixTable";
import { formatCurrency, formatPercent, roundCurrency } from "../components/shared/formatters";
import { getNextNumber } from "../components/shared/numberSequencing";
import { toast } from "sonner";
import { usePermissions } from "@/services/permissions";
import SovImportReviewModal from "../components/sov/SovImportReviewModal";
import {
  parseCsvToAoa,
  aoaToRows,
  buildSovStaged,
  SOV_TEMPLATE_COLUMNS,
  SOV_TEMPLATE_SAMPLE,
} from "../lib/importSovSpreadsheet";

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
  const { can } = usePermissions();

  /* ── UI state ── */
  const [appFilter, setAppFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [importing, setImporting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [stagedImport, setStagedImport] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
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
  // Project cost codes — used to auto-map imported SOV lines to a steel code.
  const { data: costCodes = [] } = useQuery({
    queryKey: ["cost-codes", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.CostCode.filter({ project_id: activeProject.id }, "cost_code_number")
      : [],
    enabled: !!activeProject?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: sovs = [], isLoading, refetch } = useQuery({
    queryKey: ["sov-items", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.SOVItem.filter({ project_id: activeProject.id }, "-created_at")
      : [],
    enabled: !!activeProject?.id,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.Expense.filter({ project_id: activeProject.id })
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
      return entities.SOVItem.create({
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
    mutationFn: ({ id, data }) => entities.SOVItem.update(id, data),
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
    mutationFn: (id) => entities.SOVItem.delete(id),
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
    mutationFn: ({ id }) => entities.SOVItem.update(id, { current_percent_complete: 100 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sov-items"] });
      toast.success("Filled to 100%");
    },
    onError: () => toast.error("Failed to update"),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids) => Promise.allSettled(ids.map((id) => entities.SOVItem.delete(id))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sov-items"] });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      toast.success("Deleted selected SOV items");
    },
    onError: () => toast.error("Bulk delete failed"),
  });

  const bulkStatusMut = useMutation({
    mutationFn: ({ ids, status }) => Promise.allSettled(ids.map((id) => entities.SOVItem.update(id, { status }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sov-items"] });
      setSelectedIds(new Set());
      toast.success("Status updated");
    },
    onError: () => toast.error("Bulk status update failed"),
  });

  const bulkFillMut = useMutation({
    mutationFn: (ids) => Promise.allSettled(ids.map((id) => entities.SOVItem.update(id, { current_percent_complete: 100 }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sov-items"] });
      setSelectedIds(new Set());
      toast.success("Filled selected to 100%");
    },
    onError: () => toast.error("Bulk fill failed"),
  });

  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((s) => s.id)));
  };

  const handleSave = (d) => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };

  /* ═══════════════════════════════════════════════════════════════════
     Import template — downloadable CSV template + CSV import
     ═══════════════════════════════════════════════════════════════════ */
  const downloadTemplate = () => {
    const lines = [
      SOV_TEMPLATE_COLUMNS.join(","),
      ...SOV_TEMPLATE_SAMPLE.map((r) => r.map((c) => `"${c}"`).join(",")),
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

  const handleImportClick = () => fileInputRef.current?.click();

  // Parse a CSV or XLSX file into canonical rows, stage them (with auto-mapped
  // steel cost codes + validity), and open the review modal. Nothing is written
  // until the user confirms in SovImportReviewModal.
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be re-picked
    if (!file) return;
    if (!activeProject?.id) {
      toast.error("Select a project before importing SOV items");
      return;
    }
    setImporting(true);
    try {
      const name = (file.name || "").toLowerCase();
      let rows;
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = aoaToRows(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }));
      } else {
        rows = aoaToRows(parseCsvToAoa(await file.text()));
      }
      if (rows.length === 0) {
        toast.error("File is empty — nothing to import");
        return;
      }
      const first = rows[0];
      if (!("description" in first) || !("scheduled_value" in first)) {
        toast.error("File missing required columns (description, scheduled_value). Download the template for the correct format.");
        return;
      }
      const staged = buildSovStaged(rows, {
        project: activeProject,
        existingCount: sovs.length || 0,
        costCodes,
      });
      if (!staged.some((s) => s.valid)) {
        toast.error("No valid rows — each row needs a description and scheduled_value > 0");
        return;
      }
      setStagedImport(staged);
      setReviewOpen(true);
    } catch (err) {
      console.error("SOV import parse failed:", err);
      toast.error("Could not read file: " + (err?.message || "unknown error"));
    } finally {
      setImporting(false);
    }
  };

  // Commit the reviewed valid records (from SovImportReviewModal).
  const handleConfirmImport = async (validRecords) => {
    if (!validRecords?.length) return;
    setImporting(true);
    try {
      await entities.SOVItem.bulkCreate(validRecords);
      await qc.invalidateQueries({ queryKey: ["sov-items"] });
      toast.success(`Imported ${validRecords.length} SOV line item${validRecords.length === 1 ? "" : "s"}`);
      setReviewOpen(false);
      setStagedImport([]);
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

  /* ── calc() with over-billing detection (Requirement 5) ──
   * All currency math is rounded to cents at each step so the row-level
   * display, totals row, and mismatch-variance all agree. Previously the
   * raw floats propagated (e.g. 99.99 * 33.33 / 100 = 33.326667) and the
   * totals row disagreed with the sum of the rendered rows by a few cents
   * on a 50-line SOV — enough to trip the mismatch-variance warning on
   * otherwise-correct pay apps. */
  const calc = useCallback((s) => {
    const sv = roundCurrency(s.scheduled_value);
    const prevPct = Number(s.previous_percent_complete) || 0;
    const curPct = Number(s.current_percent_complete) || 0;
    const retPct = effectiveRetainage != null
      ? effectiveRetainage
      : (Number(s.retainage_percent) || 0);
    const thisPeriod = roundCurrency(sv * ((curPct - prevPct) / 100));
    const toDate = roundCurrency(sv * (curPct / 100));
    const balance = roundCurrency(sv - toDate);
    const retAmt = roundCurrency(toDate * (retPct / 100));
    const netToDate = roundCurrency(toDate - retAmt);
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

  const totals = useMemo(() => {
    // Round AFTER each accumulation so the running totals agree with the
    // displayed rows exactly. Not rounding here re-introduces the drift
    // calc() just eliminated.
    const acc = filtered.reduce((a, s) => {
      const c = calc(s);
      a.scheduled  = roundCurrency(a.scheduled  + roundCurrency(s.scheduled_value));
      a.thisPeriod = roundCurrency(a.thisPeriod + c.thisPeriod);
      a.toDate     = roundCurrency(a.toDate     + c.toDate);
      a.balance    = roundCurrency(a.balance    + c.balance);
      a.retainage  = roundCurrency(a.retainage  + c.retAmt);
      a.net        = roundCurrency(a.net        + c.netToDate);
      return a;
    }, { scheduled: 0, thisPeriod: 0, toDate: 0, balance: 0, retainage: 0, net: 0 });
    return acc;
  }, [filtered, calc]);

  /* ── Requirement 10 — SOV mismatch detection ── */
  const projectBudget = Number(
    activeProject?.revised_contract_value
    || activeProject?.original_contract_value
    || activeProject?.contract_value
    || activeProject?.budget
    || 0,
  );
  const totalScheduledValue = useMemo(
    () => roundCurrency(
      sovs.reduce((sum, s) => roundCurrency(sum + roundCurrency(s.scheduled_value)), 0),
    ),
    [sovs],
  );
  const mismatchVariance = projectBudget > 0
    ? roundCurrency(totalScheduledValue - projectBudget)
    : 0;
  // Mismatch threshold scales with contract size: $0.50 floor or 0.1% of
  // project budget, whichever is larger. A $0.01 tolerance was noise-
  // sensitive — rounding drift on a $12M contract beats it routinely,
  // firing false-positive "SOV doesn't match contract" warnings.
  const mismatchTolerance = Math.max(0.5, projectBudget * 0.001);
  const hasMismatch = projectBudget > 0 && Math.abs(mismatchVariance) > mismatchTolerance;

  /* ── Requirement 6 — Phase grouping ── */
  const phaseGroups = useMemo(() => {
    if (!groupByPhase) return null;
    const groups = {};
    filtered.forEach(s => {
      const key = s.phase
        || s.cost_code
        || (s.description || "Ungrouped").split(/[\s-]/)[0]
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
  const COL_COUNT = 16;

  /* ═══════════════════════════════════════════════════════════════
     Column definitions
     ═══════════════════════════════════════════════════════════════ */
  const columns = [
    { label: <span onClick={toggleSelectAll} style={{ cursor: "pointer" }}>{selectedIds.size > 0 && selectedIds.size === filtered.length ? <CheckSquare size={12} color="var(--accent)" /> : <Square size={12} color="var(--text-muted)" />}</span> },
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
        <td
          style={{ padding: "9px 14px", textAlign: "center", cursor: "pointer" }}
          onClick={(e) => { e.stopPropagation(); toggleSelect(s.id); }}
        >
          {selectedIds.has(s.id)
            ? <CheckSquare size={12} color="var(--accent)" />
            : <Square size={12} color="var(--text-muted)" />}
        </td>
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
            {can("edit", "sov_item") && (
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => { setEditing(s); setModalOpen(true); }}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
            {can("delete", "sov_item") && (
              <Button variant="ghost" size="icon" className="h-7 w-7"
                style={{ color: "var(--status-error)" }}
                onClick={() => setDeleteTarget(s)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
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
      <td colSpan={4} style={{
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
              background: "var(--bg-surface-low)", borderBottom: "1px solid var(--divider)",
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
            {can("create", "sov_item") && (
              <Button
                size="sm"
                onClick={() => { setEditing(null); setModalOpen(true); }}
                style={{ background: "var(--accent)", color: "#fff", border: "none", fontWeight: 700 }}
              >
                + Add First Line Item
              </Button>
            )}
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
        <CommandBar
          eyebrow={activeProject?.name || "BILLING"}
          title="Schedule of Values"
          count={sovs.length}
          unit=" · LINE ITEMS"
          subtitle={`${formatCurrency(totalScheduledValue || 0)} scheduled value · pay app billing control`}
        >
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {["Draft", "Submitted", "Certified", "Paid"].map(s =>
                <SelectItem key={s} value={s}>{s}</SelectItem>
              )}
            </SelectContent>
          </Select>
          <button
            onClick={() => setGroupByPhase(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: groupByPhase ? "var(--accent-muted)" : "var(--bg-surface)",
              border: groupByPhase ? "1px solid var(--accent)" : "1px solid var(--border-default)",
              color: groupByPhase ? "var(--accent)" : "var(--text-secondary)",
              borderRadius: "var(--radius-btn)", padding: "8px 12px",
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
            }}
          >
            Group by Phase
          </button>
          <Select value={globalRetainage} onValueChange={setGlobalRetainage}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Retainage" /></SelectTrigger>
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
              style={{ width: 64, height: 32, fontFamily: "var(--font-mono)", fontSize: 11 }}
            />
          )}
          <button
            onClick={downloadTemplate}
            title="Download blank SOV CSV template"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--bg-surface)", border: "1px solid var(--border-default)",
              color: "var(--text-secondary)", borderRadius: "var(--radius-btn)",
              padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
            }}
          >
            <Download size={12} /> Template
          </button>
          <button
            onClick={handleImportClick}
            disabled={importing || !activeProject?.id}
            title="Import SOV line items from CSV"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--bg-surface)", border: "1px solid var(--border-default)",
              color: "var(--text-secondary)", borderRadius: "var(--radius-btn)",
              padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              letterSpacing: "0.08em", cursor: importing ? "not-allowed" : "pointer",
              textTransform: "uppercase", opacity: importing ? 0.5 : 1,
            }}
          >
            <Upload size={12} /> {importing ? "Importing…" : "Import"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleImportFile}
            style={{ display: "none" }}
          />
          <button
            onClick={exportCSV}
            style={{
              background: "var(--bg-surface)", border: "1px solid var(--border-default)",
              color: "var(--text-secondary)", borderRadius: "var(--radius-btn)",
              padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
            }}
          >
            Export
          </button>
          <button
            onClick={refetch}
            style={{
              background: "var(--bg-surface)", border: "1px solid var(--border-default)",
              color: "var(--text-muted)", borderRadius: "var(--radius-btn)",
              padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
            }}
          >
            Refresh
          </button>
          {can("create", "sov_item") && (
            <button
              onClick={() => { setEditing(null); setModalOpen(true); }}
              style={{
                background: "var(--accent)", color: "var(--bg-base)", border: "none",
                borderRadius: "var(--radius-btn)", padding: "8px 14px",
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
            >
              + New Item
            </button>
          )}
        </CommandBar>

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
          <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            {/* Requirement 3 — Sticky thead */}
            <thead>
              <tr>
                {columns.map((col, i) => (
                  <th key={i} style={{
                    fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.12em",
                    textTransform: "uppercase", color: "var(--text-muted)",
                    fontWeight: 700, padding: "12px 16px",
                    background: "var(--bg-surface-low)",
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
      <SovImportReviewModal
        open={reviewOpen}
        onClose={() => { setReviewOpen(false); setStagedImport([]); }}
        staged={stagedImport}
        onConfirm={handleConfirmImport}
        importing={importing}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete SOV Item"
        description={`Delete ${deleteTarget?.sov_id}?`}
      />

      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          {
            label: "Fill to 100%",
            icon: Check,
            onClick: () => bulkFillMut.mutate([...selectedIds]),
          },
          {
            label: "Mark Draft",
            onClick: () => bulkStatusMut.mutate({ ids: [...selectedIds], status: "Draft" }),
          },
          {
            label: "Mark Submitted",
            onClick: () => bulkStatusMut.mutate({ ids: [...selectedIds], status: "Submitted" }),
          },
          {
            label: "Delete Selected",
            icon: Trash2,
            variant: "danger",
            onClick: () => setBulkDeleteOpen(true),
          },
        ]}
      />

      <DeleteDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={() => bulkDeleteMut.mutate([...selectedIds])}
        title="Delete SOV Items"
        description={`Delete ${selectedIds.size} selected SOV item${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`}
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
