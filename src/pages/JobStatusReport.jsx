import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44, resolveFileUrl } from "@/api/base44Client";
import {
  FileText, Download, Loader2, CheckCircle2,
  AlertCircle, Building2, Calendar, RefreshCw, Search, X,
  Eye, Filter, Clock, AlertTriangle,
} from "lucide-react";
import ProjectDrilldownModal from "../components/reports/ProjectDrilldownModal";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

/* ─── Helpers ──────────────────────────────────────────────────── */
const HEALTH = {
  "On Track": { color: "var(--success)", label: "On Track" },
  "Watch":    { color: "var(--warning)", label: "Watch" },
  "At Risk":  { color: "var(--danger)",  label: "At Risk" },
};

const HEALTH_SORT_ORDER = { "At Risk": 0, "Watch": 1, "On Track": 2 };

const PHASE_TOKEN = {
  "Pre-Construction":      "var(--text-muted)",
  "Detailing":             "var(--info)",
  "Procurement":           "var(--warning)",
  "Fabrication":           "var(--accent)",
  "Delivery":              "var(--phase-delivery)",
  "Installation":          "var(--phase-erection)",
  "Installation/Erection": "var(--phase-erection)",
  "Erection":              "var(--phase-erection)",
  "Closeout":              "var(--phase-closeout)",
};

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long", year: "numeric", month: "long", day: "numeric",
  timeZone: "America/Phoenix",
});

function getReportAge(project) {
  const d = project.last_report_date || project.lastReportDate;
  if (!d) return null;
  const ms = Date.now() - new Date(d).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

/**
 * Compute report readiness for a project.
 * Returns { pct, missing, status } where status is one of:
 *   'ready', 'needs-review', 'missing-data', 'never-run'
 */
function computeReadiness(project) {
  const checks = [
    { key: "phase",            label: "phase",           ok: !!project.phase },
    { key: "health_status",    label: "health",          ok: !!project.health_status },
    { key: "contract_value",   label: "contract value",  ok: !!(project.original_contract_value || project.contract_value) },
    { key: "target_date",      label: "target date",     ok: !!project.target_completion_date },
    { key: "pm",               label: "project manager", ok: !!(project.project_manager || project.pm_name || project.owner) },
  ];
  const ok = checks.filter(c => c.ok).length;
  const pct = Math.round((ok / checks.length) * 100);
  const missing = checks.filter(c => !c.ok).map(c => c.label);
  const age = getReportAge(project);

  let status;
  if (missing.length >= 2)             status = "missing-data";
  else if (project.health_status === "At Risk") status = "needs-review";
  else if (age === null)               status = "never-run";
  else                                 status = "ready";

  return { pct, missing, status, age };
}

const READINESS_META = {
  "ready":         { label: "READY",        color: "var(--success)", bg: "var(--success-muted)", border: "var(--success-border)" },
  "needs-review":  { label: "NEEDS REVIEW", color: "var(--warning)", bg: "var(--warning-muted)", border: "var(--warning-border)" },
  "missing-data":  { label: "MISSING DATA", color: "var(--danger)",  bg: "var(--danger-muted)",  border: "var(--danger-border)" },
  "never-run":     { label: "NOT YET RUN",  color: "var(--info)",    bg: "var(--info-muted)",    border: "var(--info-border)" },
};

/* ─── Filter chip ──────────────────────────────────────────────── */
function FilterChip({ label, count, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: active ? "var(--accent-muted)" : "var(--bg-surface-low)",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--border-default)"}`,
        borderRadius: 999,
        padding: "5px 12px",
        cursor: "pointer",
        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
        color: active ? "var(--accent)" : "var(--text-secondary)",
        letterSpacing: "0.08em", textTransform: "uppercase",
        transition: "all 0.12s",
      }}
    >
      {color && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
      )}
      {label}
      {typeof count === "number" && (
        <span style={{
          background: active ? "var(--accent)" : "var(--bg-surface-high)",
          color: active ? "var(--on-accent)" : "var(--text-muted)",
          borderRadius: 10, padding: "0 6px", fontSize: 8,
        }}>{count}</span>
      )}
    </button>
  );
}

/* ─── KPI tile ─────────────────────────────────────────────────── */
function KpiTile({ label, value, color, icon: Icon, sub }) {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderTop: `2px solid ${color || "var(--border-default)"}`,
      borderRadius: "var(--radius-card)",
      padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 6,
      minHeight: 78,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {Icon && <Icon size={11} color="var(--text-muted)" />}
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
          color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase",
        }}>
          {label}
        </span>
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700,
        color: color || "var(--text-primary)", lineHeight: 1, letterSpacing: "-0.02em",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 8,
          color: "var(--text-muted)", letterSpacing: "0.06em",
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* ─── Table row ────────────────────────────────────────────────── */
function ReportTableRow({ project, index, selected, onSelect, onDrilldown, onDownload, onPreview, downloadState }) {
  const health = HEALTH[project.health_status] || { color: "var(--text-muted)", label: "—" };
  const readiness = computeReadiness(project);
  const readyMeta = READINESS_META[readiness.status];
  const phaseColor = PHASE_TOKEN[project.phase] || "var(--text-muted)";
  const isLoading = downloadState === "loading";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "28px 2fr 110px 110px 120px 130px 1fr 140px",
        gap: 0,
        alignItems: "center",
        padding: "10px 14px",
        borderBottom: "1px solid var(--divider)",
        background: selected
          ? "var(--accent-muted)"
          : index % 2 === 1 ? "var(--bg-surface-lowest)" : "transparent",
        borderLeft: `3px solid ${selected ? "var(--accent)" : phaseColor}`,
        transition: "background 0.12s",
        cursor: "pointer",
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--bg-row-hover)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = index % 2 === 1 ? "var(--bg-surface-lowest)" : "transparent"; }}
      onClick={onDrilldown}
    >
      {/* Select checkbox */}
      <div onClick={e => { e.stopPropagation(); onSelect(); }} style={{ display: "flex", alignItems: "center" }}>
        <div style={{
          width: 14, height: 14, borderRadius: 3,
          border: `1.5px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
          background: selected ? "var(--accent)" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {selected && <CheckCircle2 size={10} color="var(--on-accent)" strokeWidth={3} />}
        </div>
      </div>

      {/* Project name + number */}
      <div style={{ minWidth: 0, paddingRight: 12 }}>
        <div style={{
          fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
          color: "var(--text-primary)", lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {project.name}
        </div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 8,
          color: "var(--text-muted)", letterSpacing: "0.07em", marginTop: 2,
        }}>
          {project.project_number || "—"}{project.client ? ` · ${project.client}` : ""}
        </div>
      </div>

      {/* Phase */}
      <div style={{ paddingRight: 8 }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
          color: phaseColor, letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {project.phase || "—"}
        </span>
      </div>

      {/* Health */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, paddingRight: 8 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: health.color, flexShrink: 0,
        }} />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
          color: health.color, letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {health.label}
        </span>
      </div>

      {/* Completeness bar */}
      <div style={{ paddingRight: 8 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <div style={{
            flex: 1, height: 4, background: "var(--border-default)",
            borderRadius: 2, overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${readiness.pct}%`,
              background: readiness.pct === 100
                ? "var(--success)"
                : readiness.pct >= 60 ? "var(--warning)" : "var(--danger)",
              transition: "width 0.4s ease",
            }} />
          </div>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            color: "var(--text-muted)", minWidth: 30, textAlign: "right",
          }}>
            {readiness.pct}%
          </span>
        </div>
      </div>

      {/* Readiness badge */}
      <div style={{ paddingRight: 8 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 9px", borderRadius: 4,
          background: readyMeta.bg,
          border: `1px solid ${readyMeta.border}`,
          color: readyMeta.color,
          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
          letterSpacing: "0.08em",
        }}>
          {readyMeta.label}
        </span>
      </div>

      {/* Last generated */}
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9,
        color: "var(--text-muted)", letterSpacing: "0.04em",
        paddingRight: 8,
      }}>
        {readiness.age === null
          ? <span style={{ color: "var(--text-disabled)", fontStyle: "italic" }}>Never</span>
          : readiness.age === 0 ? "Today"
          : readiness.age === 1 ? "Yesterday"
          : `${readiness.age} days ago`}
        {readiness.missing.length > 0 && (
          <div style={{ color: "var(--danger)", fontSize: 8, marginTop: 2 }}>
            Missing: {readiness.missing.slice(0, 2).join(", ")}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
        <button
          title="Preview"
          onClick={onPreview}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "5px 9px", borderRadius: 4,
            background: "var(--bg-surface-low)",
            border: "1px solid var(--border-default)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
            cursor: "pointer", letterSpacing: "0.08em",
          }}
        >
          <Eye size={10} /> PREVIEW
        </button>
        <button
          title="Generate PDF"
          disabled={isLoading}
          onClick={onDownload}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "5px 11px", borderRadius: 4,
            background: isLoading ? "var(--info-muted)"
              : downloadState === "done" ? "var(--success-muted)"
              : "var(--accent)",
            border: `1px solid ${isLoading ? "var(--info-border)"
              : downloadState === "done" ? "var(--success-border)"
              : "var(--accent)"}`,
            color: downloadState === "done" ? "var(--success)" : "var(--on-accent)",
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
            cursor: isLoading ? "not-allowed" : "pointer", letterSpacing: "0.08em",
          }}
        >
          {isLoading ? <><Loader2 size={10} className="spin-icon" /> …</>
            : downloadState === "done" ? <><CheckCircle2 size={10} /> DONE</>
            : <><Download size={10} /> PDF</>}
        </button>
      </div>
    </div>
  );
}

/* ─── Preview drawer ───────────────────────────────────────────── */
function PreviewDrawer({ project, onClose, onGenerate }) {
  if (!project) return null;
  const readiness = computeReadiness(project);
  const readyMeta = READINESS_META[readiness.status];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 380,
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border-default)",
        boxShadow: "-20px 0 50px rgba(0,0,0,0.7)",
        zIndex: 301,
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px 14px",
          borderBottom: "1px solid var(--divider)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.14em", marginBottom: 4 }}>REPORT PREVIEW</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
                {project.name}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.08em" }}>
                {project.project_number || "—"}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4,
            }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {/* Readiness badge */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 8 }}>READINESS</div>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 12px", borderRadius: 4,
              background: readyMeta.bg, border: `1px solid ${readyMeta.border}`,
              color: readyMeta.color, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            }}>
              {readyMeta.label} · {readiness.pct}%
            </span>
          </div>

          {/* Missing data */}
          {readiness.missing.length > 0 && (
            <div style={{
              marginBottom: 18,
              background: "var(--danger-muted)",
              border: "1px solid var(--danger-border)",
              borderRadius: 6,
              padding: "10px 12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <AlertTriangle size={11} color="var(--danger)" />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--danger)", letterSpacing: "0.08em" }}>
                  MISSING FIELDS
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>
                {readiness.missing.join(", ")}
              </div>
            </div>
          )}

          {/* Sections included */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 8 }}>SECTIONS INCLUDED</div>
            {[
              "Budget KPIs",
              "Cost Burn Bar",
              "EVM / CPI",
              "Change Orders",
              "Open Critical RFIs",
            ].map(s => (
              <div key={s} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", borderRadius: 4,
                background: "var(--bg-surface-low)",
                marginBottom: 4,
              }}>
                <CheckCircle2 size={11} color="var(--success)" />
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)" }}>{s}</span>
              </div>
            ))}
          </div>

          {/* Last generated */}
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 6 }}>LAST GENERATED</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>
              {readiness.age === null ? "Never generated"
                : readiness.age === 0 ? "Today"
                : `${readiness.age} days ago`}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--divider)", display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "9px 0", borderRadius: 6,
            background: "var(--bg-surface-low)",
            border: "1px solid var(--border-default)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
            cursor: "pointer",
          }}>
            CLOSE
          </button>
          <button onClick={onGenerate} style={{
            flex: 2, padding: "9px 0", borderRadius: 6,
            background: "var(--accent)", border: "none",
            color: "var(--on-accent)",
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <Download size={11} /> GENERATE PDF
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Main page ────────────────────────────────────────────────── */
export default function JobStatusReport() {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const [bulkStatus, setBulkStatus] = useState("idle");
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkError, setBulkError] = useState("");
  const [drilldownProject, setDrilldownProject] = useState(null);
  const [previewProject, setPreviewProject] = useState(null);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [readinessFilter, setReadinessFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [rowStates, setRowStates] = useState({}); // id → 'idle'|'loading'|'done'|'error'

  /* ── Enrich projects with readiness ── */
  const enriched = useMemo(
    () => projects.map(p => ({ ...p, _readiness: computeReadiness(p) })),
    [projects]
  );

  /* ── Operational KPIs ── */
  const kpis = useMemo(() => {
    const readyCount        = enriched.filter(p => p._readiness.status === "ready").length;
    const needsReviewCount  = enriched.filter(p => p._readiness.status === "needs-review").length;
    const missingDataCount  = enriched.filter(p => p._readiness.status === "missing-data").length;
    const atRiskCount       = enriched.filter(p => p.health_status === "At Risk").length;
    const weekAgo           = Date.now() - 7 * 86400000;
    const generatedThisWeek = enriched.filter(p => {
      const d = p.last_report_date || p.lastReportDate;
      return d && new Date(d).getTime() >= weekAgo;
    }).length;
    return { readyCount, needsReviewCount, missingDataCount, atRiskCount, generatedThisWeek };
  }, [enriched]);

  /* ── Filtering ── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter(p => {
      if (q) {
        const match =
          (p.name || "").toLowerCase().includes(q) ||
          (p.project_number || "").toLowerCase().includes(q) ||
          (p.client || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (healthFilter !== "all" && p.health_status !== healthFilter) return false;
      if (readinessFilter !== "all" && p._readiness.status !== readinessFilter) return false;
      return true;
    }).sort((a, b) => {
      const aOrder = HEALTH_SORT_ORDER[a.health_status] ?? 3;
      const bOrder = HEALTH_SORT_ORDER[b.health_status] ?? 3;
      return aOrder - bOrder;
    });
  }, [enriched, search, healthFilter, readinessFilter]);

  /* ── Selection ── */
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllVisible = () => {
    setSelectedIds(new Set(filtered.map(p => p.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  /* ── Single-row download ── */
  const handleRowDownload = async (project) => {
    setRowStates(s => ({ ...s, [project.id]: "loading" }));
    try {
      const response = await base44.functions.invoke("generateExecutivePDF", { project_id: project.id });
      const data = response.data;
      let blob;
      if (data instanceof ArrayBuffer || data?.byteLength !== undefined) {
        blob = new Blob([data], { type: "application/pdf" });
      } else if (data instanceof Blob) {
        blob = data;
      } else {
        throw new Error(data?.error || "Unexpected response from server");
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `executive-summary-${project.project_number || project.id}-${new Date().toISOString().split("T")[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setRowStates(s => ({ ...s, [project.id]: "done" }));
      setTimeout(() => setRowStates(s => ({ ...s, [project.id]: "idle" })), 4000);
    } catch {
      setRowStates(s => ({ ...s, [project.id]: "error" }));
      setTimeout(() => setRowStates(s => ({ ...s, [project.id]: "idle" })), 5000);
    }
  };

  /* ── Bulk / batch generate ── */
  const handleGenerateAll = async () => {
    setBulkStatus("loading");
    setBulkResults([]);
    setBulkError("");
    try {
      const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      const res = await base44.functions.invoke("generateExecutivePDF", ids ? { project_ids: ids } : {});
      const data = res.data;
      if (data?.reports) {
        setBulkResults(data.reports);
        setBulkStatus("done");
      } else {
        throw new Error(data?.error || "Unexpected response");
      }
    } catch (err) {
      setBulkError(err.message || "Failed to generate reports");
      setBulkStatus("error");
    }
  };

  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", paddingBottom: 40 }}>
      <style>{`
        .spin-icon { animation: spin 0.9s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 22, gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 8,
            background: "var(--accent-muted)",
            border: "1px solid var(--accent-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <FileText size={16} color="var(--accent)" />
          </div>
          <div>
            <h1 style={{
              fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800,
              color: "var(--text-primary)", margin: 0, letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}>
              Job Status Reports
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Calendar size={10} color="var(--text-muted)" />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                  {today}
                </span>
              </div>
              <span style={{ color: "var(--divider)" }}>·</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Clock size={10} color="var(--text-muted)" />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                  NEXT RUN: MON 6:00 AM
                </span>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleGenerateAll}
          disabled={bulkStatus === "loading" || projects.length === 0}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "11px 20px", borderRadius: 8,
            background: bulkStatus === "done" ? "var(--success-muted)" : "var(--accent)",
            border: "none",
            color: bulkStatus === "done" ? "var(--success)" : "var(--on-accent)",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800,
            cursor: bulkStatus === "loading" ? "not-allowed" : "pointer",
            letterSpacing: "0.08em", textTransform: "uppercase",
            opacity: (bulkStatus === "loading" || projects.length === 0) ? 0.55 : 1,
            transition: "all 0.15s",
            whiteSpace: "nowrap",
          }}
        >
          {bulkStatus === "loading" ? (<><Loader2 size={12} className="spin-icon" /> Generating…</>)
            : bulkStatus === "done" ? (<><CheckCircle2 size={12} /> Done · {bulkResults.length}</>)
            : (<><Download size={12} /> Generate {hasSelection ? `${selectedCount} Selected` : "All"}</>)}
        </button>
      </div>

      {/* ── Operational KPI row ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 10, marginBottom: 16,
      }}>
        <KpiTile label="Ready"             value={kpis.readyCount}        color="var(--success)" icon={CheckCircle2} sub="Full data, ready to generate" />
        <KpiTile label="Needs Review"      value={kpis.needsReviewCount}  color="var(--warning)" icon={AlertCircle} sub="At-risk — PM check" />
        <KpiTile label="Missing Data"      value={kpis.missingDataCount}  color="var(--danger)"  icon={AlertTriangle} sub="Blocked — fill fields" />
        <KpiTile label="At Risk"           value={kpis.atRiskCount}       color="var(--danger)"  icon={AlertCircle} sub="Flagged health status" />
        <KpiTile label="Generated / Week"  value={kpis.generatedThisWeek} color="var(--info)"    icon={Clock} sub="Last 7 days" />
      </div>

      {/* ── Insight band ── */}
      {(kpis.missingDataCount > 0 || kpis.needsReviewCount > 0) && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--bg-surface-low)",
          borderLeft: "2px solid var(--warning)",
          borderRadius: "var(--radius-card)",
          padding: "10px 16px",
          marginBottom: 16,
        }}>
          <AlertTriangle size={12} color="var(--warning)" />
          <span style={{
            fontFamily: "var(--font-body)", fontSize: 11,
            color: "var(--text-secondary)",
          }}>
            {kpis.missingDataCount > 0 && `${kpis.missingDataCount} project${kpis.missingDataCount > 1 ? "s" : ""} missing required fields`}
            {kpis.missingDataCount > 0 && kpis.needsReviewCount > 0 && " · "}
            {kpis.needsReviewCount > 0 && `${kpis.needsReviewCount} need${kpis.needsReviewCount === 1 ? "s" : ""} PM review before generation`}
          </span>
        </div>
      )}

      {/* ── Filter + search bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        marginBottom: 12,
      }}>
        <Filter size={12} color="var(--text-muted)" />
        <FilterChip label="All" count={enriched.length} active={healthFilter === "all" && readinessFilter === "all"} onClick={() => { setHealthFilter("all"); setReadinessFilter("all"); }} />
        <FilterChip label="At Risk" count={enriched.filter(p => p.health_status === "At Risk").length} active={healthFilter === "At Risk"} onClick={() => setHealthFilter(healthFilter === "At Risk" ? "all" : "At Risk")} color="var(--danger)" />
        <FilterChip label="Watch"   count={enriched.filter(p => p.health_status === "Watch").length}   active={healthFilter === "Watch"}   onClick={() => setHealthFilter(healthFilter === "Watch" ? "all" : "Watch")} color="var(--warning)" />
        <FilterChip label="Ready"   count={kpis.readyCount}         active={readinessFilter === "ready"}        onClick={() => setReadinessFilter(readinessFilter === "ready" ? "all" : "ready")} color="var(--success)" />
        <FilterChip label="Missing Data" count={kpis.missingDataCount} active={readinessFilter === "missing-data"} onClick={() => setReadinessFilter(readinessFilter === "missing-data" ? "all" : "missing-data")} color="var(--danger)" />

        <div style={{ position: "relative", flex: 1, minWidth: 200, marginLeft: "auto" }}>
          <Search size={12} color="var(--text-muted)" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="text"
            placeholder="Search project, number, or client…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%",
              background: "var(--bg-surface-low)",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              padding: "7px 32px 7px 32px",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--text-primary)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{
              position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--text-muted)",
            }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Batch action toolbar ── */}
      {hasSelection && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--accent-muted)",
          border: "1px solid var(--accent-border)",
          borderRadius: 6,
          padding: "8px 14px",
          marginBottom: 10,
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em" }}>
            {selectedCount} SELECTED
          </span>
          <button onClick={handleGenerateAll} style={{
            padding: "5px 11px", borderRadius: 4,
            background: "var(--accent)", border: "none",
            color: "var(--on-accent)",
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
            cursor: "pointer",
          }}>
            <Download size={9} style={{ marginRight: 4 }} /> GENERATE SELECTED
          </button>
          <button onClick={clearSelection} style={{
            padding: "5px 11px", borderRadius: 4,
            background: "transparent",
            border: "1px solid var(--border-default)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
            cursor: "pointer",
          }}>
            CLEAR
          </button>
        </div>
      )}

      {/* ── Reporting table ── */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        boxShadow: "var(--shadow-card)",
      }}>
        {/* Sticky header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "28px 2fr 110px 110px 120px 130px 1fr 140px",
          gap: 0,
          padding: "10px 14px",
          background: "var(--bg-surface-low)",
          borderBottom: "1px solid var(--border-default)",
          position: "sticky", top: 0, zIndex: 2,
        }}>
          <div onClick={selectedCount === filtered.length ? clearSelection : selectAllVisible} style={{ cursor: "pointer" }}>
            <div style={{
              width: 14, height: 14, borderRadius: 3,
              border: `1.5px solid ${selectedCount === filtered.length && filtered.length > 0 ? "var(--accent)" : "var(--border-strong)"}`,
              background: selectedCount === filtered.length && filtered.length > 0 ? "var(--accent)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {selectedCount === filtered.length && filtered.length > 0 && <CheckCircle2 size={10} color="var(--on-accent)" strokeWidth={3} />}
            </div>
          </div>
          {["Project", "Phase", "Health", "Completeness", "Readiness", "Last Generated", "Actions"].map(col => (
            <div key={col} style={{
              fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
              color: "var(--text-muted)", letterSpacing: "0.13em", textTransform: "uppercase",
              paddingRight: 8,
              textAlign: col === "Actions" ? "right" : "left",
            }}>
              {col}
            </div>
          ))}
        </div>

        {/* Rows */}
        {isLoading ? (
          <div style={{ padding: 24 }}>
            <LoadingSkeleton variant="table" rows={6} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <Building2 size={32} color="var(--text-disabled)" style={{ margin: "0 auto 10px" }} />
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
              {search || healthFilter !== "all" || readinessFilter !== "all"
                ? "NO PROJECTS MATCH YOUR FILTERS"
                : "NO PROJECTS FOUND"}
            </p>
          </div>
        ) : (
          filtered.map((p, i) => (
            <ReportTableRow
              key={p.id}
              project={p}
              index={i}
              selected={selectedIds.has(p.id)}
              onSelect={() => toggleSelect(p.id)}
              onDrilldown={() => setDrilldownProject(p)}
              onPreview={() => setPreviewProject(p)}
              onDownload={() => handleRowDownload(p)}
              downloadState={rowStates[p.id] || "idle"}
            />
          ))
        )}
      </div>

      {/* Bulk results */}
      {bulkStatus === "done" && bulkResults.length > 0 && (
        <div style={{
          marginTop: 14,
          background: "var(--bg-surface-low)",
          borderLeft: "2px solid var(--success)",
          borderRadius: "var(--radius-card)",
          padding: "14px 16px",
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--success)", marginBottom: 10, letterSpacing: "0.10em" }}>
            ✓ {bulkResults.length} REPORTS READY — CLICK TO DOWNLOAD
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {bulkResults.map(r => (
              <div key={r.project_id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "7px 12px",
                background: "var(--bg-surface)",
                borderRadius: 4,
              }}>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", fontWeight: 500 }}>{r.project_name}</div>
                {r.file_url && (
                  <button
                    onClick={async () => {
                      try {
                        const url = await resolveFileUrl(r.file_url);
                        if (url) window.open(url, "_blank", "noopener,noreferrer");
                      } catch { /* silently fail */ }
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      fontFamily: "var(--font-mono)", fontSize: 8,
                      color: "var(--info)", letterSpacing: "0.06em",
                      cursor: "pointer",
                      padding: "4px 10px",
                      background: "var(--info-muted)",
                      border: "1px solid var(--info-border)",
                      borderRadius: 4,
                    }}
                  >
                    <Download size={9} /> OPEN PDF
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {bulkStatus === "error" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--danger-muted)",
          border: "1px solid var(--danger-border)",
          borderRadius: 6, padding: "10px 14px", marginTop: 12,
        }}>
          <AlertCircle size={13} color="var(--danger)" />
          <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--danger)" }}>
            {bulkError || "Failed to generate reports."}
          </span>
        </div>
      )}

      {/* Automation footer */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginTop: 18,
        padding: "8px 14px",
        background: "var(--bg-surface-low)",
        borderRadius: "var(--radius-card)",
      }}>
        <RefreshCw size={10} color="var(--text-disabled)" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
          AUTOMATED GENERATION RUNS EVERY MONDAY AT 6:00 AM · INCLUDES BUDGET KPIS · COST BURN · EVM / CPI · CHANGE ORDERS · OPEN CRITICAL RFIS
        </span>
      </div>

      {/* Preview drawer */}
      <PreviewDrawer
        project={previewProject}
        onClose={() => setPreviewProject(null)}
        onGenerate={() => {
          if (previewProject) handleRowDownload(previewProject);
          setPreviewProject(null);
        }}
      />

      {/* Drilldown modal */}
      {drilldownProject && (
        <ProjectDrilldownModal
          project={drilldownProject}
          onClose={() => setDrilldownProject(null)}
        />
      )}
    </div>
  );
}
