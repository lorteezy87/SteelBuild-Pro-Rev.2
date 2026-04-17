import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/useProjectContext";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Download, Check, AlertTriangle, Clock, DollarSign, Plus, CalendarDays, FileText, Zap, ChevronRight } from "lucide-react";
import PageHeader from "../components/shared/PageHeader";
import SearchFilter from "../components/shared/SearchFilter";
import DeleteDialog from "../components/shared/DeleteDialog";
import KPIStrip from "../components/shared/KPIStrip";
import COFormModal from "../components/changeorders/COFormModal";
import { getNextNumber } from "../components/shared/numberSequencing";
import { PhoenixPanel } from "../components/shared/PhoenixPanel";
import PhoenixTable, { PTR, PTD } from "../components/shared/PhoenixTable";
import ChevronPipeline from "../components/shared/ChevronPipeline";
import { formatCurrency, formatDate, roundCurrency, parseUTCDate } from "../components/shared/formatters";
import { toast } from "sonner";

/* ================================================================
   Status Pill — high-visibility solid-color badges
   ================================================================ */
const STATUS_PILL_CFG = {
  Draft:          { bg: "#6B7280", color: "#fff" },
  Submitted:      { bg: "#E3B341", color: "#000" },
  "Under Review": { bg: "#3B82F6", color: "#fff" },
  Approved:       { bg: "#3FB950", color: "#000", icon: true },
  Rejected:       { bg: "#F85149", color: "#fff" },
  Void:           { bg: "#374151", color: "#9CA3AF", strike: true },
};

function StatusPill({ status }) {
  const cfg = STATUS_PILL_CFG[status] || STATUS_PILL_CFG.Draft;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: cfg.bg, color: cfg.color,
      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
      padding: "3px 10px", borderRadius: 20, letterSpacing: "0.04em",
      textDecoration: cfg.strike ? "line-through" : "none",
      whiteSpace: "nowrap",
    }}>
      {cfg.icon && <Check size={11} strokeWidth={3} />}
      {status || "Draft"}
    </span>
  );
}

/* ================================================================
   Days Open — compute from submitted_date to today (or approval)
   ================================================================ */
function calcDaysOpen(co) {
  const start = parseUTCDate(co.submitted_date);
  if (!start) return null;
  const end = co.status === "Approved" && co.approval_date
    ? parseUTCDate(co.approval_date)
    : new Date();
  if (!end) return null;
  return Math.max(0, Math.floor((end - start) / 86400000));
}

function DaysOpenCell({ co }) {
  const days = calcDaysOpen(co);
  if (days === null) return <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{"\u2014"}</span>;
  let color = "var(--status-success)";
  let bold = false;
  if (days > 14) { color = "var(--status-error)"; bold = true; }
  else if (days >= 7) { color = "var(--status-warning)"; }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: bold ? 700 : 400, color,
    }}>
      <Clock size={11} />{days}d
    </span>
  );
}

/* ================================================================
   Cost Impact Badge — $, $$, $$$
   ================================================================ */
function CostBadge({ amount }) {
  const abs = Math.abs(Number(amount) || 0);
  let label, color, bold;
  if (abs >= 25000) { label = "$$$"; color = "var(--status-error)"; bold = true; }
  else if (abs >= 5000) { label = "$$"; color = "var(--status-warning)"; bold = false; }
  else { label = "$"; color = "var(--text-muted)"; bold = false; }
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: bold ? 800 : 600,
      color, marginLeft: 6, letterSpacing: "0.03em",
    }}>{label}</span>
  );
}

/* ================================================================
   Reason Code Donut — SVG ring chart with legend
   ================================================================ */
const DONUT_COLORS = [
  "#3B82F6", "#3FB950", "#E3B341", "#F85149", "#A78BFA",
  "#F472B6", "#22D3EE", "#FB923C", "#6EE7B7", "#818CF8",
];

function ReasonDonut({ cos: allCos }) {
  const breakdown = useMemo(() => {
    const map = {};
    for (const c of allCos) {
      const key = c.reason_code || "Unspecified";
      if (!map[key]) map[key] = { count: 0, amount: 0 };
      map[key].count += 1;
      map[key].amount += Number(c.co_amount) || 0;
    }
    return Object.entries(map).sort((a, b) => Math.abs(b[1].amount) - Math.abs(a[1].amount));
  }, [allCos]);

  if (breakdown.length === 0) return null;
  const totalAbs = breakdown.reduce((s, [, v]) => s + Math.abs(v.amount), 0);
  const radius = 52;
  const strokeWidth = 18;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const segments = breakdown.map(([reason, data], i) => {
    const fraction = totalAbs > 0 ? Math.abs(data.amount) / totalAbs : 0;
    const dashLen = fraction * circumference;
    const seg = (
      <circle
        key={reason}
        cx="70" cy="70" r={radius}
        fill="none"
        stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
        strokeWidth={strokeWidth}
        strokeDasharray={`${dashLen} ${circumference - dashLen}`}
        strokeDashoffset={-offset}
        style={{ transition: "stroke-dasharray 0.4s ease" }}
      />
    );
    offset += dashLen;
    return seg;
  });

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--bg-void)" strokeWidth={strokeWidth} />
        {segments}
        <text x="70" y="66" textAnchor="middle" dominantBaseline="central"
          style={{ transform: "rotate(90deg)", transformOrigin: "70px 70px", fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, fill: "var(--text-secondary)" }}>
          {breakdown.length}
        </text>
        <text x="70" y="82" textAnchor="middle" dominantBaseline="central"
          style={{ transform: "rotate(90deg)", transformOrigin: "70px 70px", fontFamily: "var(--font-body)", fontSize: 9, fill: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          reasons
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 200 }}>
        {breakdown.map(([reason, data], i) => (
          <div key={reason} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>{reason}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{data.count} CO{data.count !== 1 ? "s" : ""}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent-light)", fontWeight: 700, minWidth: 80, textAlign: "right" }}>{formatCurrency(data.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   Waterfall Segment with hover tooltip showing dollar amount
   ================================================================ */
function WaterfallSegment({ flex, background, borderLeft, label, amount, pctLabel, total, children, style: extraStyle }) {
  const [hover, setHover] = useState(false);
  const pct = total > 0 ? ((Math.abs(amount) / total) * 100).toFixed(1) : 0;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex, background, borderLeft,
        display: "flex", alignItems: "center", justifyContent: "center",
        minWidth: 40, position: "relative", cursor: "default",
        transition: "filter 0.15s",
        ...extraStyle,
      }}
    >
      {children}
      {hover && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          background: "var(--bg-surface)", border: "1px solid var(--divider)", borderRadius: "var(--radius-card)",
          padding: "6px 10px", whiteSpace: "nowrap", zIndex: 50,
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{label}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", fontWeight: 700 }}>{formatCurrency(amount)}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{pct}% of total</div>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   Legend Dot — colored dot + label + value
   ================================================================ */
function LegendDot({ color, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

/* ================================================================
   Pulse keyframe injection — for over-contract alert
   ================================================================ */
const PULSE_STYLE_ID = "cos-pulse-keyframes";
if (typeof document !== "undefined" && !document.getElementById(PULSE_STYLE_ID)) {
  const style = document.createElement("style");
  style.id = PULSE_STYLE_ID;
  style.textContent = `
    @keyframes cosPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(248,81,73,0.5); }
      50%      { box-shadow: 0 0 14px 4px rgba(248,81,73,0.25); }
    }
  `;
  document.head.appendChild(style);
}

/* ================================================================
   Main Component
   ================================================================ */
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
      ? base44.entities.ChangeOrder.filter({ project_id: activeProject.id }, "-created_at")
      : [],
    enabled: !!activeProject?.id,
  });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => base44.entities.Project.list(), staleTime: 5 * 60 * 1000 });

  // RFIs with cost impact — potential untracked COs
  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.RFI.filter({ project_id: activeProject.id })
      : [],
    enabled: !!activeProject?.id,
    staleTime: 2 * 60 * 1000,
  });

  // Detect RFIs that have cost impact but no linked CO
  const potentialCOs = useMemo(() => {
    if (!rfis.length) return [];
    const coTitlesLower = new Set(cos.map(c => (c.title || "").toLowerCase()));
    const coRFIRefs = new Set(cos.map(c => c.linked_rfi_id).filter(Boolean));
    return rfis
      .filter(r => {
        // RFI has cost impact flag or cost_impact_amount > 0
        const hasCost = r.cost_impact || (Number(r.cost_impact_amount) || 0) > 0;
        if (!hasCost) return false;
        // Not already linked to a CO
        if (coRFIRefs.has(r.id)) return false;
        // Title not already present as a CO title (fuzzy match)
        const rfiTitle = (r.title || "").toLowerCase();
        for (const ct of coTitlesLower) {
          if (ct && rfiTitle && (ct.includes(rfiTitle) || rfiTitle.includes(ct))) return false;
        }
        return true;
      })
      .map(r => ({
        id: r.id,
        rfi_number: r.rfi_number,
        title: r.title,
        amount: Number(r.cost_impact_amount) || 0,
        status: r.status,
      }));
  }, [rfis, cos]);

  const projectMap = useMemo(() => {
    const map = {};
    for (const p of projects) map[p.id] = p.name || p.project_name || "";
    return map;
  }, [projects]);

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

  // ── Pipeline breakdown by lifecycle stage ──
  const pipeline = useMemo(() => {
    const stages = [
      { key: "Draft", label: "DRAFT", color: "#6B7280" },
      { key: "Submitted", label: "SUBMITTED", color: "#E3B341" },
      { key: "Under Review", label: "REVIEW", color: "#3B82F6" },
      { key: "Approved", label: "APPROVED", color: "#3FB950" },
      { key: "Rejected", label: "REJECTED", color: "#F85149" },
      { key: "Void", label: "VOID", color: "#374151" },
    ];
    return stages.map(s => ({
      ...s,
      count: cos.filter(c => c.status === s.key).length,
      value: cos.filter(c => c.status === s.key).reduce((sum, c) => sum + (Number(c.co_amount) || 0), 0),
    }));
  }, [cos]);

  const approvedVal = roundCurrency(cos.filter(c => c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0));
  const pendingVal = roundCurrency(cos.filter(c => c.status === "Submitted" || c.status === "Under Review").reduce((s, c) => s + (Number(c.co_amount) || 0), 0));
  const draftVal = roundCurrency(cos.filter(c => c.status === "Draft").reduce((s, c) => s + (Number(c.co_amount) || 0), 0));
  const atRiskVal = roundCurrency(pendingVal + draftVal); // not yet approved = at risk
  // Scope contract to active project only
  const activeProjectData = activeProject?.id ? projects.filter(p => p.id === activeProject.id) : [];
  const totalContract = roundCurrency(activeProjectData.reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0));
  const revisedContract = roundCurrency(totalContract + approvedVal);

  // ── Action items: what needs attention today ──
  const actionItems = useMemo(() => {
    const items = [];
    // Drafts not yet priced (co_amount = 0 or missing)
    const unpriced = cos.filter(c => c.status === "Draft" && (!c.co_amount || Number(c.co_amount) === 0));
    if (unpriced.length > 0) items.push({ severity: "critical", label: `${unpriced.length} CO${unpriced.length !== 1 ? "s" : ""} not priced`, detail: unpriced.map(c => c.co_number || c.title).slice(0, 3).join(", "), action: "Price & submit", color: "var(--status-error)" });

    // Drafts with pricing but not submitted (sitting too long)
    const readyToSubmit = cos.filter(c => c.status === "Draft" && Number(c.co_amount) > 0);
    if (readyToSubmit.length > 0) items.push({ severity: "high", label: `${readyToSubmit.length} CO${readyToSubmit.length !== 1 ? "s" : ""} ready to submit`, detail: readyToSubmit.map(c => c.co_number || c.title).slice(0, 3).join(", "), action: "Submit to GC/Owner", color: "var(--status-warning)" });

    // Under Review for > 10 days
    const stale = cos.filter(c => (c.status === "Submitted" || c.status === "Under Review") && calcDaysOpen(c) > 10);
    if (stale.length > 0) items.push({ severity: "high", label: `${stale.length} CO${stale.length !== 1 ? "s" : ""} aging > 10 days`, detail: stale.map(c => `${c.co_number} (${calcDaysOpen(c)}d)`).slice(0, 3).join(", "), action: "Follow up", color: "var(--status-warning)" });

    // Missing backup/attachments
    const noBackup = cos.filter(c => c.status !== "Void" && c.status !== "Draft" && (!c.attachments || c.attachments.trim() === ""));
    if (noBackup.length > 0) items.push({ severity: "medium", label: `${noBackup.length} CO${noBackup.length !== 1 ? "s" : ""} missing backup`, detail: noBackup.map(c => c.co_number).slice(0, 3).join(", "), action: "Attach T&M / quotes", color: "var(--status-info)" });

    // Rejected needing revision
    const rejected = cos.filter(c => c.status === "Rejected");
    if (rejected.length > 0) items.push({ severity: "critical", label: `${rejected.length} rejected CO${rejected.length !== 1 ? "s" : ""} need revision`, detail: rejected.map(c => c.co_number).slice(0, 3).join(", "), action: "Revise & resubmit", color: "var(--status-error)" });

    return items;
  }, [cos]);

  const kpis = [
    { label: "Total COs", value: cos.length, color: "slate" },
    { label: "Approved", value: formatCurrency(approvedVal), color: "green" },
    { label: "Pending", value: formatCurrency(pendingVal), color: "amber" },
    { label: "At Risk", value: formatCurrency(atRiskVal), color: atRiskVal > 0 ? "rose" : "slate" },
    { label: "Revised Contract", value: formatCurrency(revisedContract), color: "purple" },
    { label: "Net Change", value: formatCurrency(approvedVal), color: approvedVal >= 0 ? "green" : "rose" },
  ];

  const filtered = useMemo(() => cos.filter(c => {
    const q = debouncedSearch.toLowerCase();
    const matchSearch = !q || c.title?.toLowerCase().includes(q) || c.co_number?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  }), [cos, debouncedSearch, statusFilter]);

  // Waterfall: denominator includes pending so all three segments are visible
  const waterfallDenom = totalContract + Math.abs(approvedVal) + pendingVal;
  const showWaterfall = totalContract > 0 && waterfallDenom > 0;
  const pctOriginal = waterfallDenom > 0 ? Math.round((totalContract / waterfallDenom) * 100) : 0;
  const pctApproved = waterfallDenom > 0 ? Math.round((Math.abs(approvedVal) / waterfallDenom) * 100) : 0;
  const pctPending = waterfallDenom > 0 ? Math.round((pendingVal / waterfallDenom) * 100) : 0;

  // Over-contract alert: (pending + approved) > 10% of original contract
  const coRatio = totalContract > 0 ? (Math.abs(pendingVal) + Math.abs(approvedVal)) / totalContract : 0;
  const showOverContractAlert = coRatio > 0.10;

  // Schedule impact total for filtered rows
  const totalScheduleImpact = useMemo(() =>
    filtered.reduce((s, c) => s + (Number(c.schedule_impact_days) || 0), 0),
    [filtered]
  );

  const exportCSV = () => {
    const headers = ["CO #", "Title", "Project", "Reason", "Status", "Days Open", "Submitted", "Amount", "Schedule Impact", "Approved By"];
    const rows = filtered.map(c => [
      c.co_number, c.title, c.project_name, c.reason_code, c.status,
      calcDaysOpen(c) ?? "", c.submitted_date, c.co_amount,
      c.schedule_impact_days ?? "", c.approved_by,
    ]);
    const csv = [headers, ...rows].map(r => r.map(cell => `"${cell ?? ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "change_orders.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const cols = [
    { label: "CO #" }, { label: "Title" }, { label: "Project" }, { label: "Reason" },
    { label: "Status" }, { label: "Days Open" }, { label: "Submitted" },
    { label: "Amount", right: true }, { label: "Sched. Impact" }, { label: "Approved By" }, { label: "" },
  ];

  /* ── No project selected ── */
  if (!activeProject?.id) return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>$</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 20, fontWeight: 700, color: "var(--text-disabled)", marginBottom: 6 }}>Select a project to view Change Orders</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Use the project selector in the top right.</div>
    </div>
  );

  /* ── Empty state: no COs exist ── */
  if (!isLoading && cos.length === 0) return (
    <div>
      <PageHeader title="Change Orders" subtitle="Revenue Control" onAdd={() => { setEditing(null); setModalOpen(true); }} onRefresh={refetch} addLabel="New CO" />
      <KPIStrip items={kpis} />

      {/* Potential COs from RFIs even when no COs exist yet */}
      {potentialCOs.length > 0 && (
        <PhoenixPanel
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={14} style={{ color: "var(--status-warning)" }} />
            Untracked Scope Changes Detected
          </span>}
          style={{ marginTop: 14, marginBottom: 14, border: "1px solid rgba(227,179,65,0.4)" }}
        >
          <div style={{ padding: "12px 16px" }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--status-warning)", marginBottom: 10 }}>
              {potentialCOs.length} RFI{potentialCOs.length !== 1 ? "s" : ""} with cost impact — no change orders created yet. Revenue at risk: {formatCurrency(potentialCOs.reduce((s, r) => s + r.amount, 0))}
            </div>
            {potentialCOs.slice(0, 3).map(r => (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
                background: "var(--bg-surface-low)", borderRadius: "var(--radius-card)", marginBottom: 4,
                borderLeft: "3px solid var(--status-warning)",
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent-light)", fontWeight: 700 }}>{r.rfi_number}</span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>{r.title}</span>
                {r.amount > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-warning)", fontWeight: 700 }}>{formatCurrency(r.amount)}</span>}
              </div>
            ))}
          </div>
        </PhoenixPanel>
      )}

      <div style={{
        textAlign: "center", padding: "80px 24px",
        background: "var(--bg-surface)", borderRadius: "var(--radius-card)",
        border: "1px solid var(--divider)", marginTop: 14,
      }}>
        <DollarSign size={48} strokeWidth={1.5} style={{ color: "var(--text-disabled)", marginBottom: 16 }} />
        <div style={{ fontFamily: "var(--font-body)", fontSize: 20, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>
          No Change Orders Yet
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)", maxWidth: 480, margin: "0 auto 24px" }}>
          Potential scope changes will appear here as they're identified from RFIs, drawings, and field conditions. Track every dollar from draft through approval.
        </div>
        <Button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          style={{ background: "var(--accent)", color: "#fff", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, letterSpacing: "0.06em" }}
        >
          <Plus size={14} style={{ marginRight: 6 }} />
          New Change Order
        </Button>
      </div>
      <COFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={handleSave} co={editing} projects={projects} nextNumber={`CO-${String((cos.length || 0) + 1).padStart(3, "0")}`} />
    </div>
  );

  /* ── Main render ── */
  return (
    <div>
      <PageHeader title="Change Orders" subtitle={`${cos.length} CO${cos.length !== 1 ? "s" : ""} \u00B7 ${formatCurrency(atRiskVal)} at risk`} onAdd={() => { setEditing(null); setModalOpen(true); }} onRefresh={refetch} addLabel="New CO" />

      {/* ── Over-Contract Alert Banner (pulse animation) ── */}
      {showOverContractAlert && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(248,81,73,0.12)", border: "1px solid rgba(248,81,73,0.4)",
          borderRadius: "var(--radius-card)", padding: "10px 16px", marginBottom: 14,
          animation: "cosPulse 2s ease-in-out infinite",
        }}>
          <AlertTriangle style={{ width: 18, height: 18, color: "#F85149", flexShrink: 0 }} />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
            color: "#F85149", letterSpacing: "0.04em",
          }}>
            HIGH RISK: Change orders represent {Math.round(coRatio * 100)}% of original contract value
          </span>
          <span style={{
            marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10,
            color: "#F85149", opacity: 0.8,
          }}>
            {formatCurrency(Math.abs(approvedVal) + Math.abs(pendingVal))} / {formatCurrency(totalContract)}
          </span>
        </div>
      )}

      <KPIStrip items={kpis} />

      {/* ── CO Pipeline — lifecycle stage visualization ── */}
      {cos.length > 0 && (
        <PhoenixPanel title="CO Pipeline" style={{ marginBottom: 14, padding: "14px 16px" }}>
          <div style={{ padding: "12px 16px" }}>
            <ChevronPipeline
              stages={pipeline.map(s => ({
                key: s.key,
                label: s.label,
                color: s.color,
                count: s.count,
              }))}
              currentStage={statusFilter !== "all" ? statusFilter : undefined}
              completedStages={[]}
              height={38}
              onStageClick={(key) => setStatusFilter(prev => prev === key ? "all" : key)}
            />
            {/* Value breakdown beneath pipeline */}
            <div style={{ display: "flex", gap: 0, marginTop: 6 }}>
              {pipeline.map(s => (
                <div key={s.key} style={{
                  flex: 1, textAlign: "center",
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                  color: s.count > 0 ? s.color : "var(--text-disabled)",
                  opacity: s.count > 0 ? 1 : 0.4,
                  cursor: "pointer",
                  padding: "4px 2px",
                }} onClick={() => setStatusFilter(prev => prev === s.key ? "all" : s.key)}>
                  {s.count > 0 ? formatCurrency(s.value) : "\u2014"}
                </div>
              ))}
            </div>
          </div>
        </PhoenixPanel>
      )}

      {/* ── Action Required Panel — what needs to go out today ── */}
      {actionItems.length > 0 && (
        <PhoenixPanel
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Zap size={14} style={{ color: "var(--status-warning)" }} />
            Action Required
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", fontWeight: 400 }}>
              {actionItems.length} item{actionItems.length !== 1 ? "s" : ""}
            </span>
          </span>}
          style={{ marginBottom: 14, border: "1px solid rgba(227,179,65,0.3)" }}
        >
          <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {actionItems.map((item, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px",
                background: "var(--bg-surface-low)",
                borderRadius: "var(--radius-card)",
                borderLeft: `3px solid ${item.color}`,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700,
                    color: item.color, marginBottom: 2,
                  }}>
                    {item.label}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400,
                  }}>
                    {item.detail}
                  </div>
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                  color: item.color, letterSpacing: "0.06em", textTransform: "uppercase",
                  whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4,
                }}>
                  {item.action} <ChevronRight size={10} />
                </div>
              </div>
            ))}
          </div>
        </PhoenixPanel>
      )}

      {/* ── Potential COs from RFIs — untracked work detection ── */}
      {potentialCOs.length > 0 && (
        <PhoenixPanel
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <FileText size={14} style={{ color: "var(--status-info)" }} />
            Potential COs from RFIs
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", fontWeight: 400 }}>
              {potentialCOs.length} untracked
            </span>
          </span>}
          style={{ marginBottom: 14, border: "1px solid rgba(59,130,246,0.3)" }}
        >
          <div style={{ padding: "10px 16px" }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
              These RFIs have cost impacts but no linked change order. Revenue may be at risk.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {potentialCOs.slice(0, 5).map(r => (
                <div key={r.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px",
                  background: "var(--bg-surface-low)",
                  borderRadius: "var(--radius-card)",
                  borderLeft: "3px solid var(--status-info)",
                }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent-light)", fontWeight: 700 }}>
                    {r.rfi_number || "RFI"}
                  </span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>
                    {r.title}
                  </span>
                  {r.amount > 0 && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-warning)", fontWeight: 700 }}>
                      {formatCurrency(r.amount)}
                    </span>
                  )}
                  <Button
                    variant="ghost" size="sm"
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                      color: "var(--accent-light)", letterSpacing: "0.06em",
                      padding: "4px 10px", height: "auto",
                    }}
                    onClick={() => {
                      setEditing(null);
                      setModalOpen(true);
                      // Pre-fill will happen via default form — user sees blank form to create CO from RFI context
                    }}
                  >
                    <Plus size={10} style={{ marginRight: 3 }} />CREATE CO
                  </Button>
                </div>
              ))}
              {potentialCOs.length > 5 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center", padding: "4px 0" }}>
                  +{potentialCOs.length - 5} more RFIs with cost impact
                </div>
              )}
            </div>
          </div>
        </PhoenixPanel>
      )}

      {/* ── Enhanced Contract Waterfall ── */}
      {showWaterfall && (
        <PhoenixPanel title="Contract Waterfall" style={{ marginBottom: 14, padding: "14px 16px" }}>
          <div style={{ padding: "14px 16px" }}>
            {/* Bar */}
            <div style={{ display: "flex", gap: 0, height: 40, borderRadius: "var(--radius-card)", overflow: "hidden", background: "var(--bg-void)" }}>
              {/* Original segment */}
              <WaterfallSegment
                flex={totalContract / waterfallDenom}
                background="var(--info-muted)"
                label="Original Contract"
                amount={totalContract}
                total={waterfallDenom}
                style={{ minWidth: 60 }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent-light)", letterSpacing: "0.06em", padding: "0 6px", textAlign: "center", lineHeight: 1.3 }}>
                  {pctOriginal}% Original<br />{formatCurrency(totalContract)}
                </span>
              </WaterfallSegment>
              {/* Approved COs segment */}
              {approvedVal !== 0 && (
                <WaterfallSegment
                  flex={Math.abs(approvedVal) / waterfallDenom}
                  background={approvedVal >= 0 ? "var(--success-muted)" : "var(--danger-muted)"}
                  borderLeft={`2px solid ${approvedVal >= 0 ? "var(--status-success)" : "var(--status-error)"}`}
                  label="Approved COs"
                  amount={approvedVal}
                  total={waterfallDenom}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: approvedVal >= 0 ? "var(--status-success)" : "var(--status-error)", letterSpacing: "0.04em", padding: "0 4px", textAlign: "center", lineHeight: 1.3 }}>
                    {pctApproved}% Approved<br />{formatCurrency(approvedVal)}
                  </span>
                </WaterfallSegment>
              )}
              {/* Pending segment — hatched diagonal stripes */}
              {pendingVal > 0 && (
                <WaterfallSegment
                  flex={pendingVal / waterfallDenom}
                  background="repeating-linear-gradient(-45deg, var(--warning-muted), var(--warning-muted) 4px, rgba(227,179,65,0.25) 4px, rgba(227,179,65,0.25) 8px)"
                  borderLeft="2px solid var(--status-warning)"
                  label="Pending COs"
                  amount={pendingVal}
                  total={waterfallDenom}
                  style={{ minWidth: 30 }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-warning)", padding: "0 4px", textAlign: "center", lineHeight: 1.3 }}>
                    {pctPending}% Pending
                  </span>
                </WaterfallSegment>
              )}
            </div>

            {/* Legend with colored dots */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 10, alignItems: "center" }}>
              <LegendDot color="#3B82F6" label="Original" value={formatCurrency(totalContract)} />
              <LegendDot color="#3FB950" label="Approved" value={formatCurrency(approvedVal)} />
              <LegendDot color="#E3B341" label="Pending" value={formatCurrency(pendingVal)} />
              <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent-light)", fontWeight: 700, letterSpacing: "0.06em" }}>
                REVISED: {formatCurrency(revisedContract)}
              </div>
            </div>
          </div>
        </PhoenixPanel>
      )}

      {/* ── Reason Code Donut ── */}
      {cos.length > 0 && (
        <PhoenixPanel title="Reason Code Breakdown" style={{ marginBottom: 14, padding: "14px 16px" }}>
          <div style={{ padding: "10px 16px" }}>
            <ReasonDonut cos={cos} />
          </div>
        </PhoenixPanel>
      )}

      {/* ── Filters + Export ── */}
      <div className="filter-bar-responsive" style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <SearchFilter search={search} onSearchChange={setSearch} filters={[
            { key: "status", value: statusFilter, onChange: setStatusFilter, placeholder: "Status", options: ["Draft", "Submitted", "Under Review", "Approved", "Rejected", "Void"] },
          ]} />
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} style={{ marginBottom: 16 }}><Download className="w-3.5 h-3.5 mr-1" />Export</Button>
      </div>

      {/* ── Change Order Table ── */}
      <PhoenixPanel title="Change Order Log" count={filtered.length}>
        <PhoenixTable columns={cols} loading={isLoading} empty="NO CHANGE ORDERS FOUND">
          {filtered.map(c => {
            const schedDays = Number(c.schedule_impact_days) || 0;
            return (
              <PTR key={c.id} onClick={() => { setEditing(c); setModalOpen(true); }}>
                <PTD mono accent>{c.co_number}</PTD>
                <PTD style={{ maxWidth: 180 }}>{c.title}</PTD>
                <PTD muted>{projectMap[c.project_id] || "\u2014"}</PTD>
                <PTD muted>{c.reason_code || "\u2014"}</PTD>
                <PTD><StatusPill status={c.status} /></PTD>
                <PTD><DaysOpenCell co={c} /></PTD>
                <PTD>{formatDate(c.submitted_date)}</PTD>
                {/* Amount + Cost Impact Badge */}
                <PTD right mono bold style={{ color: (c.co_amount || 0) < 0 ? "var(--status-error)" : "var(--status-success)" }}>
                  {formatCurrency(c.co_amount)}<CostBadge amount={c.co_amount} />
                </PTD>
                {/* Schedule Impact */}
                <PTD>
                  {schedDays > 0 ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--status-error)" }}>
                      <CalendarDays style={{ width: 12, height: 12 }} />+{schedDays}d
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{"\u2014"}</span>
                  )}
                </PTD>
                <PTD>{c.approved_by || "\u2014"}</PTD>
                <PTD>
                  <div style={{ display: "flex", gap: 2 }} onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(c); setModalOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--status-error)" }} onClick={() => setDeleteTarget(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </PTD>
              </PTR>
            );
          })}
        </PhoenixTable>

        {/* Totals row */}
        {filtered.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length},1fr)`, padding: "8px 12px", borderTop: "1px solid var(--divider)", background: "var(--bg-surface-low)", gap: 8 }}>
            <div style={{ gridColumn: "span 7", fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Totals {"\u2014"} {filtered.filter(c => c.status === "Approved").length} Approved {"\u00B7"} {filtered.filter(c => ["Submitted","Under Review"].includes(c.status)).length} Pending
            </div>
            <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: approvedVal >= 0 ? "var(--status-success)" : "var(--status-error)" }}>
              {formatCurrency(filtered.reduce((s, c) => s + (Number(c.co_amount) || 0), 0))}
            </div>
            {/* Schedule impact total */}
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: totalScheduleImpact > 0 ? "var(--status-error)" : "var(--text-muted)" }}>
              {totalScheduleImpact > 0 ? `+${totalScheduleImpact}d` : "\u2014"}
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
