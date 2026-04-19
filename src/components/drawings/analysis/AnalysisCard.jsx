import React from "react";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mono, display, surface, STATUS_COLORS, STAGE_ACCENT, SEVERITY_COLORS, pill } from "./tokens";

/**
 * List-item card: file name, stage pill, status, and a severity-bucket
 * breakdown of findings. Click opens AnalysisDetailModal.
 */
export default function AnalysisCard({ analysis, findings = [], onOpen }) {
  const qc = useQueryClient();

  const retry = async (e) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from("drawing_analyses")
        .update({ analysis_status: "pending", error_message: null })
        .eq("id", analysis.id);
      if (error) throw new Error(error.message);
      toast.message("Retrying analysis…");
      qc.invalidateQueries({ queryKey: ["drawing_analyses"] });
    } catch (err) {
      toast.error(`Retry failed: ${err.message}`);
    }
  };
  const statusColor = STATUS_COLORS[analysis.analysis_status] || STATUS_COLORS.pending;
  const stageColor  = STAGE_ACCENT[analysis.drawing_stage]    || "var(--text-muted)";

  const counts = findings.reduce((acc, f) => {
    if (f.dismissed) return acc;
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  const uploaded = analysis.uploaded_at
    ? new Date(analysis.uploaded_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";

  return (
    <button
      onClick={() => onOpen?.(analysis)}
      style={{
        ...surface,
        display: "block", width: "100%", textAlign: "left",
        padding: "14px 16px",
        borderLeft: `3px solid ${stageColor}`,
        cursor: "pointer",
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-secondary)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-surface)")}
    >
      {/* Top row: stage pill + status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={pill(stageColor)}>{analysis.drawing_stage || "—"}</span>
          {analysis.revision && (
            <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
              REV {analysis.revision}
            </span>
          )}
        </div>
        <span style={{
          ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
          textTransform: "uppercase", color: statusColor,
        }}>
          {analysis.analysis_status === "processing" && "● "}
          {analysis.analysis_status || "pending"}
        </span>
      </div>

      {/* File name */}
      <div style={{ ...display, fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2, wordBreak: "break-word" }}>
        {analysis.file_name}
      </div>

      {/* Summary row */}
      <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginBottom: 10 }}>
        {uploaded}
        {analysis.uploaded_by ? ` · ${analysis.uploaded_by}` : ""}
        {analysis.sheet_count ? ` · ${analysis.sheet_count} sheet${analysis.sheet_count === 1 ? "" : "s"}` : ""}
      </div>

      {/* Severity chips */}
      {analysis.analysis_status === "complete" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["critical", "high", "medium", "low", "info"].map((sev) => {
            const n = counts[sev] || 0;
            if (n === 0) return null;
            return (
              <span key={sev} style={{
                ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: SEVERITY_COLORS[sev],
                padding: "2px 6px",
                border: `1px solid ${SEVERITY_COLORS[sev]}`,
                borderRadius: 2,
              }}>
                {n} {sev}
              </span>
            );
          })}
          {findings.filter(f => !f.dismissed).length === 0 && (
            <span style={{ ...mono, fontSize: 10, color: "var(--status-success)" }}>
              ✓ No findings
            </span>
          )}
        </div>
      )}

      {analysis.analysis_status === "error" && (
        <div style={{ marginTop: 4 }}>
          {analysis.error_message && (
            <div style={{ ...mono, fontSize: 10, color: "var(--status-error)", marginBottom: 6 }}>
              {analysis.error_message}
            </div>
          )}
          <button
            onClick={retry}
            style={{
              ...mono, fontSize: 9, fontWeight: 700,
              letterSpacing: "0.12em", textTransform: "uppercase",
              padding: "3px 10px",
              background: "transparent",
              border: "1px solid var(--status-error)",
              color: "var(--status-error)",
              borderRadius: 2,
              cursor: "pointer",
            }}
          >
            RETRY
          </button>
        </div>
      )}
    </button>
  );
}
