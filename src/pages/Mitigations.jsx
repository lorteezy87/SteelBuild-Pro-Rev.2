import { useProjectContext } from "@/components/shared/useProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import MitigationFormModal from "@/components/mitigations/MitigationFormModal";
import MitigationDetailPanel from "@/components/mitigations/MitigationDetailPanel";
import DeleteDialog from "@/components/shared/DeleteDialog";
import StatCard from "@/components/shared/StatCard";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import DonutChart from "@/components/shared/DonutChart";
import { createPageUrl } from "@/utils";
import { CommandBar } from "@/components/design-system";
import { Plus, Download } from "lucide-react";
import { setDraft, takeDraft } from "@/lib/draftStorage";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  Open: "var(--status-warning)",
  "Pending PM Review": "#0891B2",
  Noticed: "var(--status-info)",
  "Action Taken": "var(--accent)",
  Resolved: "var(--status-success)",
  Escalated: "var(--status-error)",
};

const STATUSES = ["Open", "Pending PM Review", "Noticed", "Action Taken", "Resolved", "Escalated"];

const ROOT_CAUSE_COLORS = {
  "Design Error":          "#FF5C5C",
  "Site Readiness":        "#E8650A",
  "Material Delay":        "#FFB400",
  "Coordination Gap":      "#0EA5E9",
  "Scope Change":          "#0891B2",
  "Weather/Force Majeure": "#8898A8",
  "Subcontractor":         "#06B6D4",
  "Owner Decision":        "#FF9F43",
  "Other":                 "#64748B",
};

const ROOT_CAUSE_CATEGORIES = Object.keys(ROOT_CAUSE_COLORS);

const IMPACT_TYPE_COLORS = {
  Schedule: "#0EA5E9",
  Cost: "#FFB400",
  Safety: "#FF5C5C",
};

const STATUS_TOOLTIPS = {
  Open: "New issue identified — needs triage and classification",
  "Pending PM Review": "Awaiting Project Manager review and approval",
  Noticed: "Notice of Delay or Differing Site Condition sent to GC/Owner",
  "Action Taken": "Actively burning man-hours to resolve (field mods, re-detailing, etc.)",
  Resolved: "Issue closed — mitigation complete, costs finalized",
  Escalated: "GC rejected or ignored — needs executive intervention",
};

const SOURCE_PAGE_MAP = {
  RFI: "RFIs",
  Drawing: "Drawings",
  Constraint: "Constraints",
  Delivery: "Deliveries",
  WorkPackage: "WorkPackages",
  ChangeOrder: "ChangeOrders",
};

const SORT_OPTIONS = [
  { key: "days_open",  label: "Days Open" },
  { key: "exposure",   label: "Exposure $" },
  { key: "expected",   label: "Expected Value" },
  { key: "status",     label: "Status" },
  { key: "date",       label: "Date" },
];

// ─── Utility: Days between two dates ─────────────────────────────────────────
function daysOpen(identifiedDate) {
  if (!identifiedDate) return 0;
  const start = new Date(identifiedDate + "T00:00:00");
  const now = new Date();
  return Math.max(0, Math.floor((now - start) / 86400000));
}

// ─── Utility: Expected value = exposure x (recovery_likelihood / 100) ────────
function expectedValue(m) {
  const exposure = Number(m.cost_exposure) || 0;
  const likelihood = m.recovery_likelihood != null ? Number(m.recovery_likelihood) : 50;
  return exposure * (likelihood / 100);
}

// ─── Utility: Is stale? (no update in 14+ days) ─────────────────────────────
function isStale(m) {
  const lastUpdate = m.updated_at || m.identified_date;
  if (!lastUpdate) return false;
  const d = new Date(lastUpdate);
  return (Date.now() - d.getTime()) > 14 * 86400000;
}

// ─── Utility: Is high exposure? ─────────────────────────────────────────────
function isHighExposure(m) {
  return (Number(m.cost_exposure) || 0) >= 50000;
}

// ─── Mini SVG Pie Chart for Root Cause Analysis ─────────────────────────────
function RootCausePieChart({ data, size = 140 }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  let cumAngle = -90; // Start at 12 o'clock

  const slices = data.map((d) => {
    const angle = (d.count / total) * 360;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const largeArc = angle > 180 ? 1 : 0;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { ...d, path };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="var(--bg-surface)" strokeWidth={1.5}>
            <title>{s.label}: {s.count} ({Math.round((s.count / total) * 100)}%)</title>
          </path>
        ))}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
              {s.label} ({s.count})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Exposure Burn-down Mini Chart ──────────────────────────────────────────
function ExposureBurnDown({ mitigations, width = 260, height = 80 }) {
  // Group by month and show cumulative resolved vs open exposure
  const monthly = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short" });
      months.push({ key, label, openExposure: 0, resolvedExposure: 0 });
    }
    mitigations.forEach((m) => {
      const date = m.identified_date || m.created_at?.slice(0, 10);
      if (!date) return;
      const mKey = date.slice(0, 7);
      const exposure = Number(m.cost_exposure) || 0;
      months.forEach((mo) => {
        if (mKey <= mo.key) {
          if (m.status === "Resolved") {
            mo.resolvedExposure += exposure;
          } else {
            mo.openExposure += exposure;
          }
        }
      });
    });
    return months;
  }, [mitigations]);

  const maxVal = Math.max(...monthly.map((m) => m.openExposure + m.resolvedExposure), 1);
  const barW = Math.floor((width - 40) / monthly.length);

  return (
    <div>
      <svg width={width} height={height + 20} viewBox={`0 0 ${width} ${height + 20}`}>
        {monthly.map((m, i) => {
          const totalH = ((m.openExposure + m.resolvedExposure) / maxVal) * (height - 10);
          const resolvedH = ((m.resolvedExposure) / maxVal) * (height - 10);
          const x = 20 + i * barW + 4;
          return (
            <g key={m.key}>
              {/* Open (bottom) */}
              <rect
                x={x} y={height - totalH}
                width={barW - 8} height={totalH}
                rx={3} fill="rgba(255,122,122,0.35)"
              >
                <title>Open: ${m.openExposure.toLocaleString()}</title>
              </rect>
              {/* Resolved overlay (top of stack) */}
              <rect
                x={x} y={height - resolvedH}
                width={barW - 8} height={resolvedH}
                rx={3} fill="rgba(0,214,143,0.45)"
              >
                <title>Resolved: ${m.resolvedExposure.toLocaleString()}</title>
              </rect>
              {/* Month label */}
              <text
                x={x + (barW - 8) / 2} y={height + 14}
                textAnchor="middle"
                style={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--text-muted)" }}
              >
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(255,122,122,0.5)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>Open</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(0,214,143,0.6)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>Resolved</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function Mitigations() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeProject } = useProjectContext();
  const projectId = useProjectId();
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("days_open");
  const [sortAsc, setSortAsc] = useState(false);
  const [showExecutiveView, setShowExecutiveView] = useState(true);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selected, setSelected] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Check for pre-populated mitigation handed off from another page
  // (Constraint promotion, Alert escalation). takeDraft() consumes the
  // draft on read so a refresh of /Mitigations doesn't rehydrate it.
  useEffect(() => {
    const data = takeDraft("new-mitigation");
    if (data) {
      setPrefill(data);
      setEditing(null);
      setShowForm(true);
    }
  }, []);

  // ── Data Fetching ───────────────────────────────────────────────────────
  const { data: mitigations = [], isError: mitigationsError } = useQuery({
    queryKey: ["mitigations", projectId],
    queryFn: async () => {
      try {
        return projectId
          ? await base44.entities.MitigationLog.filter({ project_id: projectId })
          : await base44.entities.MitigationLog.list("-identified_date");
      } catch (err) {
        console.warn("[Mitigations] query failed:", err?.message);
        return [];
      }
    },
    retry: false,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  // ── Sorting + Filtering ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = mitigations.filter((m) => {
      return filterStatus === "all" || m.status === filterStatus;
    });

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "days_open":
          cmp = daysOpen(a.identified_date) - daysOpen(b.identified_date);
          break;
        case "exposure":
          cmp = (Number(a.cost_exposure) || 0) - (Number(b.cost_exposure) || 0);
          break;
        case "expected":
          cmp = expectedValue(a) - expectedValue(b);
          break;
        case "status": {
          const si = (s) => STATUSES.indexOf(s);
          cmp = si(a.status) - si(b.status);
          break;
        }
        case "date":
          cmp = new Date(a.identified_date || 0) - new Date(b.identified_date || 0);
          break;
        default:
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [mitigations, filterStatus, sortBy, sortAsc]);

  // ── Statistics ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const open = mitigations.filter((m) => m.status !== "Resolved").length;
    const escalated = mitigations.filter((m) => m.status === "Escalated").length;
    const pendingReview = mitigations.filter((m) => m.status === "Pending PM Review").length;
    const coCandidates = mitigations.filter((m) => m.is_co_candidate).length;
    const totalExposure = mitigations.reduce((sum, m) => sum + (Number(m.cost_exposure) || 0), 0);
    const totalExpectedValue = mitigations.reduce((sum, m) => sum + expectedValue(m), 0);
    const staleCount = mitigations.filter((m) => m.status !== "Resolved" && isStale(m)).length;
    const avgDaysOpen = mitigations.filter((m) => m.status !== "Resolved").length > 0
      ? Math.round(
          mitigations
            .filter((m) => m.status !== "Resolved")
            .reduce((sum, m) => sum + daysOpen(m.identified_date), 0) /
          mitigations.filter((m) => m.status !== "Resolved").length
        )
      : 0;
    const highExposureCount = mitigations.filter((m) => isHighExposure(m) && m.status !== "Resolved").length;

    return { open, escalated, pendingReview, coCandidates, totalExposure, totalExpectedValue, staleCount, avgDaysOpen, highExposureCount };
  }, [mitigations]);

  // ── Root Cause Analysis Data ───────────────────────────────────────────
  const rootCauseData = useMemo(() => {
    const counts = {};
    mitigations.forEach((m) => {
      const cat = m.root_cause_category || "Other";
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([label, count]) => ({
        label,
        count,
        color: ROOT_CAUSE_COLORS[label] || "#64748B",
      }))
      .sort((a, b) => b.count - a.count);
  }, [mitigations]);

  // ── Mutations ──────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (data) =>
      base44.entities.MitigationLog.create({ ...data, project_id: data.project_id || projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mitigations", projectId] });
      setShowForm(false);
      setEditing(null);
      setPrefill(null);
      toast.success("Mitigation logged");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: (data) => base44.entities.MitigationLog.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mitigations", projectId] });
      setShowForm(false);
      setEditing(null);
      if (selected) {
        const updated = mitigations.find((m) => m.id === selected.id);
        if (updated) setSelected(updated);
      }
      toast.success("Mitigation updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.MitigationLog.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["mitigations", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      if (selected?.id === deletedId) setSelected(null);
      setDeleteTarget(null);
      toast.success("Mitigation deleted");
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

  // ── Bulk Actions ───────────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((m) => m.id)));
    }
  };

  const handleBulkEscalate = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    try {
      for (const id of ids) {
        await base44.entities.MitigationLog.update(id, { status: "Escalated" });
      }
      qc.invalidateQueries({ queryKey: ["mitigations", projectId] });
      setSelectedIds(new Set());
      toast.success(`${ids.length} items escalated`);
    } catch (err) {
      toast.error("Bulk escalation failed: " + err.message);
    }
  };

  const handleBulkExport = () => {
    const items = filtered.filter((m) => selectedIds.has(m.id));
    if (items.length === 0) return;
    const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, "-");
    const projectName = selectedProject?.name || "All-Projects";
    const rows = [
      ["MIT #", "Title", "Status", "Source", "Source Ref", "Root Cause", "Responsible Party",
       "Identified Date", "Days Open", "Cost Exposure", "Recovery %", "Expected Value",
       "CO Candidate", "Notice Sent", "Notice To", "Notice Method", "Internal Notes"],
    ];
    items.forEach((m) => {
      rows.push([
        m.mitigation_number || "",
        `"${(m.title || "").replace(/"/g, '""')}"`,
        m.status,
        m.issue_source || "",
        m.source_entity_ref || "",
        m.root_cause_category || "",
        m.responsible_party || "",
        m.identified_date || "",
        daysOpen(m.identified_date),
        Number(m.cost_exposure) || 0,
        m.recovery_likelihood != null ? m.recovery_likelihood : 50,
        expectedValue(m).toFixed(2),
        m.is_co_candidate ? "Yes" : "No",
        m.notice_sent_date || "",
        m.notice_sent_to || "",
        m.notice_method || "",
        `"${(m.internal_notes || "").replace(/"/g, '""')}"`,
      ]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Mitigations_${projectName.replace(/\s+/g, "-")}_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${items.length} items`);
  };

  const handleExportAll = () => {
    setSelectedIds(new Set(filtered.map((m) => m.id)));
    // Next tick to let state update
    setTimeout(() => {
      const items = filtered;
      if (items.length === 0) return;
      const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, "-");
      const projectName = selectedProject?.name || "All-Projects";
      const rows = [
        ["MIT #", "Title", "Status", "Source", "Source Ref", "Root Cause", "Responsible Party",
         "Identified Date", "Days Open", "Cost Exposure", "Recovery %", "Expected Value",
         "CO Candidate", "Notice Sent", "Notice To", "Notice Method", "Internal Notes"],
      ];
      items.forEach((m) => {
        rows.push([
          m.mitigation_number || "",
          `"${(m.title || "").replace(/"/g, '""')}"`,
          m.status,
          m.issue_source || "",
          m.source_entity_ref || "",
          m.root_cause_category || "",
          m.responsible_party || "",
          m.identified_date || "",
          daysOpen(m.identified_date),
          Number(m.cost_exposure) || 0,
          m.recovery_likelihood != null ? m.recovery_likelihood : 50,
          expectedValue(m).toFixed(2),
          m.is_co_candidate ? "Yes" : "No",
          m.notice_sent_date || "",
          m.notice_sent_to || "",
          m.notice_method || "",
          `"${(m.internal_notes || "").replace(/"/g, '""')}"`,
        ]);
      });
      const csv = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Monthly-Mitigation-Report_${projectName.replace(/\s+/g, "-")}_${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setSelectedIds(new Set());
      toast.success("Monthly report exported");
    }, 0);
  };

  // ── CO Candidate auto-linking ──────────────────────────────────────────
  // NB: ChangeOrders doesn't currently consume this draft (no takeDraft
  // call there), so today this write is a no-op handoff. Routed through
  // setDraft anyway so the day someone wires it up they get auto-clear
  // semantics for free, and the previous localStorage version doesn't
  // accumulate stale entries every time a user clicks the action.
  const handleCreateCOFromMitigation = (m) => {
    setDraft("new-co-from-mitigation", {
      title: `CO from ${m.mitigation_number || "Mitigation"}: ${m.title}`,
      description: `Auto-generated from mitigation ${m.mitigation_number}.\nRoot cause: ${m.root_cause_category || "N/A"}\nOriginal exposure: $${(Number(m.cost_exposure) || 0).toLocaleString()}`,
      estimated_amount: Number(m.cost_exposure) || 0,
      project_id: m.project_id,
    });
    navigate(createPageUrl("ChangeOrders"));
  };

  // ── Sort toggle handler ────────────────────────────────────────────────
  const handleSort = (key) => {
    if (sortBy === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(key);
      setSortAsc(false);
    }
  };

  return (
    <ErrorBoundary label="Mitigations">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Setup banner */}
        {mitigationsError && mitigations.length === 0 && (
          <div style={{
            padding: "14px 18px", borderRadius: "var(--radius-card)",
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 18 }}>&#9888;</span>
            <div>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 700, color: "#F59E0B" }}>
                Mitigations table not set up yet
              </span>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
                Run migrations <code style={{ background: "var(--bg-surface)", padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>016_mitigation_tables.sql</code> and <code style={{ background: "var(--bg-surface)", padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>017_mitigation_enterprise_columns.sql</code> in your Supabase SQL Editor to enable this feature.
              </p>
            </div>
          </div>
        )}

        <CommandBar
          eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
          title="Mitigations"
          count={filtered.length}
          unit=" · ISSUES"
          subtitle={`${stats.open || 0} open · Defensive legal & financial engine`}
        >
          {mitigations.length > 0 && (
            <button
              onClick={handleExportAll}
              title="Export monthly snapshot for audit trail"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "var(--bg-surface)", border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-btn)", padding: "8px 12px",
                color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 10,
                fontWeight: 700, cursor: "pointer", textTransform: "uppercase",
                letterSpacing: "0.08em", whiteSpace: "nowrap",
              }}
            >
              <Download size={12} /> Monthly Report
            </button>
          )}
          <button
            onClick={() => setShowExecutiveView(!showExecutiveView)}
            style={{
              background: showExecutiveView ? "var(--accent-muted)" : "var(--bg-surface)",
              border: `1px solid ${showExecutiveView ? "var(--accent)" : "var(--border-default)"}`,
              borderRadius: "var(--radius-btn)", padding: "8px 12px",
              color: showExecutiveView ? "var(--accent)" : "var(--text-secondary)",
              fontFamily: "var(--font-mono)", fontSize: 10,
              fontWeight: 700, cursor: "pointer", textTransform: "uppercase",
              letterSpacing: "0.08em", whiteSpace: "nowrap",
            }}
          >
            {showExecutiveView ? "Hide" : "Show"} Exec View
          </button>
          <button
            onClick={() => { setEditing(null); setPrefill(null); setShowForm(true); }}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--accent)", color: "var(--bg-base)", border: "none",
              borderRadius: "var(--radius-btn)", padding: "8px 14px",
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
          >
            <Plus size={12} /> Log Issue
          </button>
        </CommandBar>

        {/* ═══ EXECUTIVE VIEW (Heatmap) ═════════════════════════════════════ */}
        {showExecutiveView && mitigations.length > 0 && (
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16, animation: "fadeIn 0.3s ease",
          }}>
            {/* Root Cause Analysis */}
            <div style={{
              background: "var(--bg-surface)", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)", padding: "16px 18px",
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
                Root Cause Analysis
              </div>
              {rootCauseData.length > 0 ? (
                <RootCausePieChart data={rootCauseData} />
              ) : (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>
                  Add root cause categories to see analysis
                </div>
              )}
            </div>

            {/* Exposure Burn-down */}
            <div style={{
              background: "var(--bg-surface)", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)", padding: "16px 18px",
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
                Exposure Burn-down (6 mo)
              </div>
              <ExposureBurnDown mitigations={mitigations} />
            </div>

            {/* Key Metrics Panel */}
            <div style={{
              background: "var(--bg-surface)", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)", padding: "16px 18px",
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Key Metrics
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <DonutChart
                  value={stats.open}
                  max={mitigations.length || 1}
                  size={52}
                  stroke={5}
                  color={stats.open > 0 ? "var(--status-error)" : "var(--status-success)"}
                  label={`${stats.open}`}
                />
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                    OPEN / TOTAL
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
                    {stats.open} / {mitigations.length}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ background: "var(--hover-bg)", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: stats.avgDaysOpen > 14 ? "var(--status-error)" : "var(--text-primary)" }}>
                    {stats.avgDaysOpen}d
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", marginTop: 2 }}>AVG DAYS OPEN</div>
                </div>
                <div style={{ background: "var(--hover-bg)", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: stats.staleCount > 0 ? "var(--status-error)" : "var(--text-muted)" }}>
                    {stats.staleCount}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", marginTop: 2 }}>STALE (14d+)</div>
                </div>
                <div style={{ background: "var(--hover-bg)", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: stats.highExposureCount > 0 ? "var(--status-warning-bright)" : "var(--text-muted)" }}>
                    {stats.highExposureCount}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", marginTop: 2 }}>HIGH ($50k+)</div>
                </div>
                <div style={{ background: "var(--hover-bg)", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: stats.pendingReview > 0 ? "#0891B2" : "var(--text-muted)" }}>
                    {stats.pendingReview}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", marginTop: 2 }}>PM REVIEW</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STATS STRIP ══════════════════════════════════════════════════ */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
          <StatCard label="Open Issues" value={stats.open} color="var(--status-warning)" />
          <StatCard label="Escalated" value={stats.escalated} color="var(--status-error)" />
          <StatCard label="CO Candidates" value={stats.coCandidates} color="var(--accent)" />
          <StatCard
            label="Total Exposure"
            value={`$${(stats.totalExposure || 0).toLocaleString()}`}
            color={stats.totalExposure > 50000 ? "var(--status-error)" : stats.totalExposure > 0 ? "var(--status-warning)" : "var(--status-success)"}
          />
          <StatCard
            label="Expected Recovery"
            value={`$${Math.round(stats.totalExpectedValue).toLocaleString()}`}
            color="var(--status-info)"
            sub={`${stats.totalExposure > 0 ? Math.round((stats.totalExpectedValue / stats.totalExposure) * 100) : 0}% weighted`}
          />
          <StatCard
            label="Avg Days Open"
            value={`${stats.avgDaysOpen}d`}
            color={stats.avgDaysOpen > 14 ? "var(--status-error)" : stats.avgDaysOpen > 7 ? "var(--status-warning)" : "var(--text-muted)"}
          />
        </div>

        {/* Missing-data warning: open items with $0 exposure */}
        {mitigations.length > 0 && (() => {
          const zeroExposure = mitigations.filter(m => m.status !== "Resolved" && !(Number(m.cost_exposure) > 0));
          if (zeroExposure.length === 0) return null;
          return (
            <div style={{
              padding: "8px 16px", borderRadius: "var(--radius-card)",
              background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.20)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, color: "#F59E0B", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                DATA GAP
              </span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>
                {zeroExposure.length} open item{zeroExposure.length !== 1 ? "s" : ""} ha{zeroExposure.length !== 1 ? "ve" : "s"} $0 cost exposure — update to see accurate totals.
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                ({zeroExposure.map(m => m.mitigation_number || "?").join(", ")})
              </span>
            </div>
          );
        })()}

        {/* ═══ FILTERS + SORT + BULK ACTIONS ════════════════════════════════ */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          {/* Status Filters */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              Status:
            </span>
            {["all", ...STATUSES].map((status) => {
              const count = status === "all" ? mitigations.length : mitigations.filter(m => m.status === status).length;
              return (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  title={status === "all" ? "Show all mitigations" : STATUS_TOOLTIPS[status] || ""}
                  style={{
                    background: filterStatus === status ? "var(--accent)" : "var(--bg-surface-low)",
                    color: filterStatus === status ? "#07090E" : "var(--text-secondary)",
                    border: "none", borderRadius: "var(--radius-btn)",
                    padding: "5px 12px", fontFamily: "var(--font-mono)",
                    fontSize: 9, fontWeight: 700, cursor: "pointer",
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    transition: "background 0.15s",
                    opacity: count === 0 && status !== "all" ? 0.5 : 1,
                  }}
                >
                  {status === "all" ? "All" : status}
                  {count > 0 && status !== "all" && (
                    <span style={{
                      marginLeft: 4, fontSize: 8, opacity: 0.7,
                      background: filterStatus === status ? "rgba(0,0,0,0.15)" : "var(--bg-surface-high)",
                      borderRadius: 8, padding: "1px 5px",
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sort toggles */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              Sort:
            </span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleSort(opt.key)}
                style={{
                  background: sortBy === opt.key ? "rgba(200,155,32,0.12)" : "transparent",
                  border: `1px solid ${sortBy === opt.key ? "rgba(200,155,32,0.30)" : "var(--border-default)"}`,
                  borderRadius: "var(--radius-btn)", padding: "4px 10px",
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                  color: sortBy === opt.key ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {opt.label} {sortBy === opt.key ? (sortAsc ? "\u25B2" : "\u25BC") : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
            background: "rgba(200,155,32,0.08)", border: "1px solid rgba(200,155,32,0.25)",
            borderRadius: "var(--radius-card)", animation: "fadeIn 0.2s ease",
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
              {selectedIds.size} selected
            </span>
            <button onClick={handleBulkEscalate} style={{
              background: "var(--danger-muted)", border: "1px solid var(--status-error)",
              borderRadius: "var(--radius-btn)", padding: "5px 14px",
              color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 9,
              fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              Escalate All
            </button>
            <button onClick={handleBulkExport} style={{
              background: "rgba(14,165,233,0.10)", border: "1px solid rgba(14,165,233,0.30)",
              borderRadius: "var(--radius-btn)", padding: "5px 14px",
              color: "#0EA5E9", fontFamily: "var(--font-mono)", fontSize: 9,
              fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              Export Selected
            </button>
            <button onClick={() => setSelectedIds(new Set())} style={{
              background: "transparent", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-btn)", padding: "5px 14px",
              color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9,
              fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              Clear
            </button>
          </div>
        )}

        {/* Form Modal */}
        {showForm && (
          <MitigationFormModal
            projectId={projectId}
            mitigation={editing}
            onClose={() => { setShowForm(false); setEditing(null); setPrefill(null); }}
            onSave={handleSave}
            isSaving={createMut.isPending || updateMut.isPending}
            prefill={prefill}
          />
        )}

        {/* ═══ DATA GRID ════════════════════════════════════════════════════ */}
        {filtered.length === 0 ? (
          <div style={{
            background: "var(--bg-surface)", borderRadius: "var(--radius-card)",
            padding: 40, textAlign: "center",
          }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              No mitigations logged
            </p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
              Log issues here to document your protective actions and notice history.
            </p>
          </div>
        ) : (
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-card)", overflow: "hidden",
          }}>
            {/* Table header */}
            <div style={{
              padding: "10px 16px", borderBottom: "1px solid var(--divider)",
              display: "grid",
              gridTemplateColumns: "32px 60px 1.2fr 75px 80px 70px 80px 55px 65px 48px 55px 80px",
              gap: 6, background: "var(--bg-surface-secondary)", alignItems: "center",
            }}>
              {/* Checkbox */}
              <div>
                <input
                  type="checkbox"
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll}
                  style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                  title="Select all"
                />
              </div>
              {["MIT #", "Title", "Status", "Source", "Impact", "Responsible", "CO", "Exposure", "Days", "Exp Val", "Actions"].map(
                (col) => (
                  <div key={col} style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                    color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase",
                    textAlign: ["Exposure", "Days", "Exp Val"].includes(col) ? "right" : "left",
                  }}>
                    {col}
                  </div>
                )
              )}
            </div>

            {/* Table rows */}
            {filtered.map((m) => {
              const statusColor = STATUS_COLORS[m.status] || "var(--text-muted)";
              const days = daysOpen(m.identified_date);
              const ev = expectedValue(m);
              const isHighExp = isHighExposure(m);
              const stale = m.status !== "Resolved" && isStale(m);
              const needsAttention = isHighExp || (stale && m.status !== "Resolved");
              const isSelected = selectedIds.has(m.id);

              return (
                <div
                  key={m.id}
                  onClick={() => setSelected(m)}
                  style={{
                    padding: "10px 16px", borderBottom: "1px solid var(--divider)",
                    display: "grid",
                    gridTemplateColumns: "32px 60px 1.2fr 75px 80px 70px 80px 55px 65px 48px 55px 80px",
                    gap: 6, alignItems: "center",
                    cursor: "pointer", transition: "background 0.1s",
                    background: isSelected
                      ? "rgba(200,155,32,0.06)"
                      : needsAttention
                        ? "rgba(255,92,92,0.04)"
                        : selected?.id === m.id
                          ? "var(--bg-surface-low)"
                          : "transparent",
                    borderLeft: needsAttention ? "3px solid var(--status-error)" : "3px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (selected?.id !== m.id && !isSelected) e.currentTarget.style.background = "var(--hover-bg)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isSelected
                      ? "rgba(200,155,32,0.06)"
                      : needsAttention
                        ? "rgba(255,92,92,0.04)"
                        : selected?.id === m.id
                          ? "var(--bg-surface-low)"
                          : "transparent";
                  }}
                >
                  {/* Checkbox */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(m.id)}
                      style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                    />
                  </div>

                  {/* MIT # */}
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>
                    {m.mitigation_number || "\u2014"}
                  </div>

                  {/* Title */}
                  <div style={{
                    fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
                    color: "var(--text-primary)", overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {m.title}
                  </div>

                  {/* Status chip */}
                  <div>
                    <span
                      title={STATUS_TOOLTIPS[m.status] || ""}
                      style={{
                        display: "inline-flex", alignItems: "center", padding: "3px 8px",
                        background: `${statusColor}18`, borderRadius: "var(--radius-badge, 6px)",
                      }}
                    >
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                        color: statusColor, textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        {m.status === "Pending PM Review" ? "PM REV" : m.status}
                      </span>
                    </span>
                  </div>

                  {/* Source */}
                  <div>
                    {m.issue_source && m.issue_source !== "Manual" ? (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          const page = SOURCE_PAGE_MAP[m.issue_source];
                          if (page && m.source_entity_ref) {
                            navigate(createPageUrl(page) + `?search=${encodeURIComponent(m.source_entity_ref)}`);
                          }
                        }}
                        title={m.source_entity_ref ? `Go to ${m.issue_source}: ${m.source_entity_ref}` : m.issue_source}
                        style={{
                          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                          color: SOURCE_PAGE_MAP[m.issue_source] ? "var(--status-info)" : "var(--text-secondary)",
                          cursor: SOURCE_PAGE_MAP[m.issue_source] && m.source_entity_ref ? "pointer" : "default",
                          textDecoration: SOURCE_PAGE_MAP[m.issue_source] && m.source_entity_ref ? "underline" : "none",
                          textDecorationStyle: "dotted", textUnderlineOffset: 2,
                          letterSpacing: "0.04em", textTransform: "uppercase",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          display: "inline-block", maxWidth: "100%",
                        }}
                      >
                        {m.source_entity_ref || m.issue_source}
                      </span>
                    ) : (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Manual</span>
                    )}
                  </div>

                  {/* Impact Type */}
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {(m.impact_types || "").split(",").filter(Boolean).map(tag => {
                      const t = tag.trim();
                      const color = IMPACT_TYPE_COLORS[t] || "var(--text-muted)";
                      return (
                        <span key={t} style={{
                          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                          color, background: `${color}18`, borderRadius: 3, padding: "1px 5px",
                          letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1.4,
                        }}>
                          {t === "Schedule" ? "\u23F1" : t === "Cost" ? "$" : "\u26A0"}
                        </span>
                      );
                    })}
                  </div>

                  {/* Responsible Party */}
                  <div style={{
                    fontFamily: "var(--font-body)", fontSize: 10,
                    color: m.responsible_party ? "var(--text-secondary)" : "rgba(255,100,100,0.45)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {m.responsible_party || "Unassigned"}
                  </div>

                  {/* CO Candidate */}
                  <div>
                    {m.is_co_candidate && (
                      <span
                        onClick={(e) => { e.stopPropagation(); handleCreateCOFromMitigation(m); }}
                        title="Click to create draft Change Order"
                        style={{
                          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                          color: "var(--accent)", background: "var(--accent-muted)",
                          borderRadius: "var(--radius-badge, 6px)", padding: "3px 7px",
                          letterSpacing: "0.06em", textTransform: "uppercase",
                          cursor: "pointer", borderBottom: "1px dashed var(--accent)",
                        }}
                      >
                        CO
                      </span>
                    )}
                  </div>

                  {/* Exposure */}
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 10, textAlign: "right",
                    fontWeight: isHighExp ? 700 : 400,
                    color: isHighExp ? "var(--status-error)" : "var(--text-secondary)",
                  }}>
                    {m.cost_exposure ? `$${Number(m.cost_exposure).toLocaleString()}` : "\u2014"}
                  </div>

                  {/* Days Open */}
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 10, textAlign: "right",
                    fontWeight: 700,
                    color: days > 30 ? "var(--status-error)" : days > 14 ? "var(--status-warning)" : days > 7 ? "var(--text-secondary)" : "var(--text-muted)",
                  }}>
                    {m.status === "Resolved" ? (
                      <span style={{ color: "var(--status-success)", fontWeight: 400 }}>Done</span>
                    ) : (
                      `${days}d`
                    )}
                  </div>

                  {/* Expected Value */}
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, textAlign: "right",
                    color: "var(--text-muted)",
                  }}>
                    {ev > 0 ? `$${Math.round(ev).toLocaleString()}` : "\u2014"}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => { setEditing(m); setPrefill(null); setShowForm(true); }}
                      style={{
                        background: "var(--bg-surface)", border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-btn)", padding: "4px 10px",
                        color: "var(--text-secondary)", fontFamily: "var(--font-mono)",
                        fontSize: 9, cursor: "pointer", fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(m)}
                      style={{
                        background: "transparent", border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-btn)", padding: "4px 10px",
                        color: "var(--status-error)", fontFamily: "var(--font-mono)",
                        fontSize: 9, cursor: "pointer", fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}
                    >
                      Del
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Detail Panel */}
        {selected && (
          <MitigationDetailPanel
            mitigation={selected}
            onClose={() => setSelected(null)}
            onEdit={(m) => { setSelected(null); setEditing(m); setPrefill(null); setShowForm(true); }}
            onDelete={(m) => { setSelected(null); setDeleteTarget(m); }}
            onCreateCO={handleCreateCOFromMitigation}
          />
        )}

        {/* Delete Dialog */}
        <DeleteDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (!deleteMut.isPending && deleteTarget?.id) {
              deleteMut.mutate(deleteTarget.id);
            }
          }}
          title="Delete Mitigation"
          description="Delete this mitigation record? This cannot be undone."
        />
      </div>
    </ErrorBoundary>
  );
}
