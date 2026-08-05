/**
 * Presentational building blocks for Job Status Report.
 */
// @ts-nocheck
import React from "react";
import {
  CheckCircle2,
  Eye,
  AlertTriangle,
  X,
} from "lucide-react";
import {
  HEALTH,
  PHASE_TOKEN,
  READINESS_META,
  computeReadiness,
} from "./jobStatusReportHelpers";

/* ─── Filter chip ──────────────────────────────────────────────── */
export function FilterChip({ label, count, active, onClick, color }) {
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
export function KpiTile({ label, value, color, icon: Icon, sub }) {
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
export function ReportTableRow({ project, index, onDrilldown, onPreview }) {
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
export function PreviewDrawer({ project, onClose }) {
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
