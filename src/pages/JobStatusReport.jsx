import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  FileText, Download, Loader2, CheckCircle2,
  AlertCircle, Building2, Calendar, ChevronRight, RefreshCw, Search, X,
  ArrowUpDown,
} from "lucide-react";
import ProjectDrilldownModal from "../components/reports/ProjectDrilldownModal";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

// ─── Helpers ─────────────────────────────────────────────────────
const HEALTH = {
  "On Track": { color: "var(--status-success)", label: "On Track" },
  "Watch":    { color: "var(--status-warning)", label: "Watch" },
  "At Risk":  { color: "var(--status-error)", label: "At Risk" },
};

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long", year: "numeric", month: "long", day: "numeric",
  timeZone: "America/Phoenix",
});

const PHASE_COLORS = {
  Detailing:    "#3B82F6",
  Fabrication:  "#8B5CF6",
  Delivery:     "#F59E0B",
  Erection:     "#F97316",
};

const HEALTH_SORT_ORDER = { "At Risk": 0, "Watch": 1, "On Track": 2 };

function getReportAge(project) {
  const d = project.last_report_date || project.lastReportDate;
  if (!d) return null;
  const ms = Date.now() - new Date(d).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function freshnessColor(daysAgo) {
  if (daysAgo === null) return "var(--status-error)";
  if (daysAgo <= 1) return "var(--status-success)";
  if (daysAgo <= 5) return "var(--status-warning)";
  return "var(--status-error)";
}

// ─── Single project row ───────────────────────────────────────────
function ProjectReportRow({ project, index, onDrilldown }) {
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleDownload = async () => {
    setStatus("loading");
    setErrorMsg("");
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
      setStatus("done");
      setTimeout(() => setStatus("idle"), 4000);
    } catch (err) {
      setErrorMsg(err.message || "Failed to generate report");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    }
  };

  const health = HEALTH[project.health_status] || { color: "var(--text-muted)", label: "Unknown" };
  const isLoading = status === "loading";

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "12px 16px",
      background: "var(--bg-surface)",
      border: "none",
      borderLeft: "2px solid transparent",
      borderRadius: "var(--radius-card)",
      transition: "background 0.1s, border-color 0.1s",
    }}
    onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-surface-low)"; e.currentTarget.style.borderLeftColor = "var(--accent)"; }}
    onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-surface)"; e.currentTarget.style.borderLeftColor = "transparent"; }}
    >
      {/* Index */}
      <div style={{
        width: 28, height: 28, borderRadius: 2,
        background: "var(--bg-surface-high)",
        border: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-mono)",
        fontSize: 10, fontWeight: 600,
        color: "var(--text-muted)",
        flexShrink: 0,
      }}>
        {String(index + 1).padStart(2, "0")}
      </div>

      {/* Health dot */}
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: health.color,
        boxShadow: `0 0 8px ${health.color}99`,
        flexShrink: 0,
      }} />

      {/* Project info */}
      <div style={{ flex: 1, minWidth: 0 }}>
      <div
        onClick={onDrilldown}
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginBottom: 3,
          cursor: "pointer",
          textDecoration: "underline",
          textDecorationColor: "var(--accent-border)",
          textUnderlineOffset: 3,
          transition: "color 0.15s",
        }}
        onMouseEnter={e => e.currentTarget.style.color = "var(--accent)"}
        onMouseLeave={e => e.currentTarget.style.color = "var(--text-primary)"}
      >
        {project.name}
      </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {project.project_number && (
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 8,
              color: "var(--accent-light)", letterSpacing: "0.08em",
              background: "var(--accent-muted)",
              borderRadius: 9999, padding: "2px 8px",
            }}>
              {project.project_number}
            </span>
          )}
          {project.phase && (() => {
            const phaseColor = PHASE_COLORS[project.phase];
            return phaseColor ? (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                letterSpacing: "0.06em",
                background: `${phaseColor}20`,
                color: phaseColor,
                border: `1px solid ${phaseColor}40`,
                padding: "3px 8px",
                borderRadius: 6,
              }}>
                {project.phase}
              </span>
            ) : (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 8,
                color: "var(--text-muted)", letterSpacing: "0.06em",
              }}>
                {project.phase}
              </span>
            );
          })()}
          {project.client && (
            <span style={{
              fontFamily: "var(--font-body)", fontSize: 10,
              color: "var(--text-muted)",
            }}>
              · {project.client}
            </span>
          )}
          {(() => {
            const age = getReportAge(project);
            return age !== null ? (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 8,
                color: "var(--text-muted)", letterSpacing: "0.04em",
              }}>
                · Generated {age}d ago
              </span>
            ) : (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 8,
                color: "var(--text-disabled)", letterSpacing: "0.04em", fontStyle: "italic",
              }}>
                · Not yet generated
              </span>
            );
          })()}
        </div>
      </div>

      {/* Status feedback */}
      <div style={{ flexShrink: 0, minWidth: 100, textAlign: "right" }}>
        {status === "done" && (
           <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
             <CheckCircle2 size={12} color="var(--status-success)" />
             <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "var(--status-success)", letterSpacing: "0.06em" }}>
               DOWNLOADED
             </span>
           </div>
         )}
         {status === "error" && (
           <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
             <AlertCircle size={12} color="var(--status-error)" />
             <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "var(--status-error)", letterSpacing: "0.06em" }}>
               FAILED
             </span>
           </div>
         )}
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={isLoading}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 14px",
          background: isLoading
            ? "var(--info-muted)"
            : status === "done"
            ? "var(--success-muted)"
            : "var(--info-muted)",
          border: "none",
          borderRadius: "var(--radius-btn)",
          cursor: isLoading ? "not-allowed" : "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: 9, fontWeight: 700,
          color: status === "done" ? "var(--status-success)" : "var(--accent-light)",
          letterSpacing: "0.08em",
          flexShrink: 0,
          transition: "opacity 0.15s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={e => { if (!isLoading) e.currentTarget.style.opacity = "0.75"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
      >
        {isLoading ? (
          <><Loader2 size={10} className="spin-icon" /> GENERATING…</>
        ) : status === "done" ? (
          <><CheckCircle2 size={10} /> DONE</>
        ) : (
          <><Download size={10} /> PDF</>
        )}
      </button>

      {/* Freshness indicator */}
      <div
        title={(() => {
          const age = getReportAge(project);
          if (age === null) return "Never generated";
          if (age <= 1) return "Generated within 24h";
          return `Generated ${age}d ago`;
        })()}
        style={{
          width: 8, height: 8, borderRadius: "50%",
          background: freshnessColor(getReportAge(project)),
          flexShrink: 0,
        }}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────
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
  const [search, setSearch] = useState("");
  const [groupByHealth, setGroupByHealth] = useState(false);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = projects;
    if (q) {
      result = result.filter(p =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.project_number || "").toLowerCase().includes(q)
      );
    }
    if (groupByHealth) {
      result = [...result].sort((a, b) => {
        const aOrder = HEALTH_SORT_ORDER[a.health_status] ?? 3;
        const bOrder = HEALTH_SORT_ORDER[b.health_status] ?? 3;
        return aOrder - bOrder;
      });
    }
    return result;
  }, [projects, search, groupByHealth]);

  const handleGenerateAll = async () => {
    setBulkStatus("loading");
    setBulkResults([]);
    setBulkError("");
    try {
      const res = await base44.functions.invoke("generateExecutivePDF", {});
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

  const onTrack  = projects.filter(p => p.health_status === "On Track").length;
  const watch    = projects.filter(p => p.health_status === "Watch").length;
  const atRisk   = projects.filter(p => p.health_status === "At Risk").length;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 40 }}>
      <style>{`
        .spin-icon { animation: spin 0.9s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "var(--info-muted)",
            border: "1px solid var(--info-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <FileText size={16} color="var(--status-info)" />
          </div>
          <div>
            <h1 style={{ fontFamily: "var(--font-body)", fontSize: 16, fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "0.04em" }}>
              EXECUTIVE SUMMARY REPORTS
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
              <Calendar size={10} color="rgba(160,175,210,0.40)" />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                {today}
              </span>
            </div>
          </div>
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0", paddingLeft: 46 }}>
          Generate weekly PDF summaries covering budget health, change orders, and open critical RFIs.
        </p>
      </div>

      {/* ── Portfolio health strip ── */}
      {projects.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10, marginBottom: 20,
        }}>
          {[
            { label: "On Track", count: onTrack, color: "var(--status-success)" },
            { label: "Watch",    count: watch,   color: "var(--status-warning)" },
            { label: "At Risk",  count: atRisk,  color: "var(--status-error)" },
          ].map(({ label, count, color }) => {
            const isBg = color.includes('success') ? 'var(--success-muted)' : color.includes('warning') ? 'var(--warning-muted)' : 'var(--danger-muted)';
            const isBorder = color.includes('success') ? 'var(--success-border)' : color.includes('warning') ? 'var(--warning-border)' : 'var(--danger-border)';
            return (
            <div key={label} style={{
              background: "var(--bg-surface)",
              border: "none",
              borderTop: `2px solid ${count > 0 ? color : "var(--bg-surface-high)"}`,
              borderRadius: "var(--radius-card)",
              padding: "12px 16px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                {label}
              </span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600,
                color: count > 0 ? color : "var(--text-muted)",
              }}>
                {count}
              </span>
            </div>
          );
          })}
        </div>
      )}

      {/* ── Report contents legend ── */}
       <div style={{
         display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
         background: "var(--bg-surface-low)",
         border: "none",
         borderLeft: "2px solid var(--accent)",
         borderRadius: "var(--radius-card)",
         padding: "10px 16px",
         marginBottom: 20,
       }}>
         <span style={{ fontFamily: "var(--font-body)", fontSize: 8, fontWeight: 700, color: "var(--accent-light)", letterSpacing: "0.12em", textTransform: "uppercase", marginRight: 4 }}>
           Each PDF includes
         </span>
         {["Budget KPIs", "Cost Burn Bar", "EVM / CPI", "Change Orders", "Open Critical RFIs"].map((item, i, arr) => (
           <React.Fragment key={item}>
             <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>{item}</span>
             {i < arr.length - 1 && <ChevronRight size={10} color="var(--text-muted)" />}
           </React.Fragment>
         ))}
       </div>

      {/* ── Project count + Search bar + Sort toggle ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        marginBottom: 14,
      }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0 }}>
          {filteredProjects.length}{search ? ` of ${projects.length}` : ""} Project{projects.length !== 1 ? "s" : ""}
        </span>

        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <Search size={13} color="var(--text-muted)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Search by project name or number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%",
              background: "var(--bg-surface-low)",
              border: "none",
              borderRadius: "var(--radius-input)",
              padding: "8px 36px 8px 36px",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--text-primary)",
              outline: "none",
              transition: "border-color 0.15s, box-shadow 0.15s",
              boxSizing: "border-box",
            }}
            onFocus={e => { e.target.style.outline = "1px solid var(--accent)"; }}
            onBlur={e => { e.target.style.outline = "none"; }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--text-muted)",
              display: "flex", alignItems: "center",
            }}>
              <X size={13} />
            </button>
          )}
        </div>

        <button
          onClick={() => setGroupByHealth(v => !v)}
          title={groupByHealth ? "Clear health grouping" : "Group by health status"}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "7px 12px",
            background: groupByHealth ? "var(--accent-muted)" : "var(--bg-surface-low)",
            border: groupByHealth ? "1px solid var(--accent-border)" : "1px solid transparent",
            borderRadius: "var(--radius-btn)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
            color: groupByHealth ? "var(--accent-light)" : "var(--text-muted)",
            letterSpacing: "0.08em", textTransform: "uppercase",
            flexShrink: 0,
            transition: "all 0.15s",
          }}
        >
          <ArrowUpDown size={11} /> HEALTH
        </button>

        <button
          onClick={handleGenerateAll}
          disabled={bulkStatus === "loading" || projects.length === 0}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "9px 20px",
            background: bulkStatus === "done" ? "var(--success-muted)" : "var(--accent-muted)",
            border: "none",
            borderRadius: "var(--radius-btn)",
            cursor: bulkStatus === "loading" ? "not-allowed" : "pointer",
            fontFamily: "var(--font-body)",
            fontSize: 10, fontWeight: 700,
            color: bulkStatus === "done" ? "var(--status-success)" : "var(--accent-light)",
            letterSpacing: "0.08em", textTransform: "uppercase",
            opacity: (bulkStatus === "loading" || projects.length === 0) ? 0.55 : 1,
            transition: "all 0.15s",
          }}
        >
          {bulkStatus === "loading" ? (
            <><Loader2 size={11} className="spin-icon" /> GENERATING ALL…</>
          ) : bulkStatus === "done" ? (
            <><CheckCircle2 size={11} /> ALL DONE — {bulkResults.length} REPORTS</>
          ) : (
            <><Download size={11} /> GENERATE ALL ({projects.length})</>
          )}
        </button>
      </div>

      {/* Bulk error */}
      {bulkStatus === "error" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--danger-muted)", border: "1px solid var(--danger-border)",
          borderRadius: 8, padding: "10px 14px", marginBottom: 12,
        }}>
          <AlertCircle size={13} color="var(--status-error)" />
          <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--status-error)" }}>{bulkError || "Failed to generate all reports."}</span>
        </div>
      )}

      {/* Bulk result links */}
      {bulkStatus === "done" && bulkResults.length > 0 && (
        <div style={{
          background: "var(--bg-surface-low)",
          border: "none",
          borderLeft: "2px solid var(--status-success)",
          borderRadius: "var(--radius-card)",
          padding: "14px 16px",
          marginBottom: 14,
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--status-success)", marginBottom: 10, letterSpacing: "0.10em" }}>
            ✓ {bulkResults.length} REPORTS READY — CLICK TO DOWNLOAD
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {bulkResults.map(r => (
              <div key={r.project_id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px",
                background: "var(--bg-surface-mid)",
                borderRadius: "var(--radius-card)",
                border: "none",
              }}>
                <div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>{r.project_name}</div>
                  {r.project_number && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em", marginTop: 2 }}>{r.project_number}</div>
                  )}
                </div>
                {r.file_url ? (
                  <a
                    href={r.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      fontFamily: "var(--font-mono)", fontSize: 8,
                      color: "var(--status-info)", letterSpacing: "0.06em",
                      textDecoration: "none",
                      padding: "5px 10px",
                      background: "var(--info-muted)",
                      border: "1px solid var(--info-border)",
                      borderRadius: 6,
                    }}
                  >
                    <Download size={9} /> OPEN PDF
                  </a>
                ) : (
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "var(--text-muted)" }}>No URL</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Project list ── */}
      {isLoading ? (
        <LoadingSkeleton variant="table" rows={6} />
      ) : filteredProjects.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <Building2 size={36} color="var(--text-disabled)" style={{ margin: "0 auto 12px" }} />
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
            {search ? `NO PROJECTS MATCH "${search.toUpperCase()}"` : "NO PROJECTS FOUND"}
          </p>
          {search && (
            <button onClick={() => setSearch("")} style={{
              marginTop: 8, background: "none", border: "1px solid var(--border-strong)",
              borderRadius: 6, padding: "5px 14px", color: "var(--text-muted)",
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, cursor: "pointer", letterSpacing: "0.08em",
            }}>
              CLEAR SEARCH
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filteredProjects.map((p, i) => (
            <ProjectReportRow key={p.id} project={p} index={i} onDrilldown={() => setDrilldownProject(p)} />
          ))}
        </div>
      )}

      {/* ── Project Drilldown Modal ── */}
      {drilldownProject && (
        <ProjectDrilldownModal
          project={drilldownProject}
          onClose={() => setDrilldownProject(null)}
        />
      )}

      {/* ── Automation notice ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginTop: 24,
        padding: "10px 16px",
        background: "var(--bg-surface-low)",
        border: "none",
        borderRadius: "var(--radius-card)",
        }}>
        <RefreshCw size={11} color="var(--text-disabled)" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
          AUTOMATED GENERATION RUNS EVERY MONDAY AT 6:00 AM
        </span>
      </div>
    </div>
  );
}