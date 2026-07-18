import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { CheckCircle2,
  AlertCircle, Building2, Search, X,
  Eye, Filter, Clock, AlertTriangle, FileSpreadsheet,
} from "lucide-react";
import ProjectDrilldownModal from "../components/reports/ProjectDrilldownModal";
import PsrSpreadsheetImportModal from "@/components/reports/PsrSpreadsheetImportModal";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { CommandBar } from "@/components/design-system";
import { getPsrReportDate } from "@/lib/importPsrSpreadsheet";

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
  const d = getPsrReportDate(project);
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
function ReportTableRow({ project, index, onDrilldown, onPreview }) {
  const health = HEALTH[project.health_status] || { color: "var(--text-muted)", label: "—" };
  const readiness = computeReadiness(project);
  const readyMeta = READINESS_META[readiness.status];
  const phaseColor = PHASE_TOKEN[project.phase] || "var(--text-muted)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 110px 110px 120px 130px 1fr 140px",
        gap: 0,
        alignItems: "center",
        padding: "10px 14px",
        borderBottom: "1px solid var(--divider)",
        background: index % 2 === 1 ? "var(--bg-surface-lowest)" : "transparent",
        borderLeft: `3px solid ${phaseColor}`,
        transition: "background 0.12s",
        cursor: "pointer",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-row-hover)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = index % 2 === 1 ? "var(--bg-surface-lowest)" : "transparent"; }}
      onClick={onDrilldown}
    >
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
      </div>
    </div>
  );
}

/* ─── Preview drawer ───────────────────────────────────────────── */
function PreviewDrawer({ project, onClose }) {
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
        </div>
      </div>
    </> 
  );
}

/* ─── Main page ────────────────────────────────────────────────── */
export default function JobStatusReport() {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const [drilldownProject, setDrilldownProject] = useState(null);
  const [previewProject, setPreviewProject] = useState(null);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [readinessFilter, setReadinessFilter] = useState("all");
  const [psrImportOpen, setPsrImportOpen] = useState(false);

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
      const d = getPsrReportDate(p);
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

  return (
    <div className="sb-dashboard-reference-page" style={{ maxWidth: 1280, margin: "0 auto", paddingBottom: 40 }}>
      <CommandBar
        eyebrow="OWNER REPORTING"
        title="Job Status Reports"
        count={projects.length}
        unit=" · PROJECTS"
        subtitle={today}
      >
        <button
          onClick={() => setPsrImportOpen(true)}
          disabled={projects.length === 0}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px", borderRadius: "var(--radius-btn)",
            background: "var(--bg-surface-low)",
            border: "1px solid var(--border-default)",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            cursor: projects.length === 0 ? "not-allowed" : "pointer",
            letterSpacing: "0.08em", textTransform: "uppercase",
            opacity: projects.length === 0 ? 0.55 : 1,
            whiteSpace: "nowrap",
          }}
        >
          <FileSpreadsheet size={12} /> Import PSR
        </button>
      </CommandBar>

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
          gridTemplateColumns: "2fr 110px 110px 120px 130px 1fr 140px",
          gap: 0,
          padding: "10px 14px",
          background: "var(--bg-surface-low)",
          borderBottom: "1px solid var(--border-default)",
          position: "sticky", top: 0, zIndex: 2,
        }}>
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
              onDrilldown={() => setDrilldownProject(p)}
              onPreview={() => setPreviewProject(p)}
            />
          ))
        )}
      </div>

      {/* Preview drawer */}
      <PreviewDrawer
        project={previewProject}
        onClose={() => setPreviewProject(null)}
      />

      {/* Drilldown modal */}
      {drilldownProject && (
        <ProjectDrilldownModal
          project={drilldownProject}
          onClose={() => setDrilldownProject(null)}
        />
      )}

      <PsrSpreadsheetImportModal
        open={psrImportOpen}
        projects={projects}
        onClose={() => setPsrImportOpen(false)}
      />
    </div>
  );
}
