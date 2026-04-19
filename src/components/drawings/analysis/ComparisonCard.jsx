import React from "react";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mono, display, surface, STATUS_COLORS, AI_ACCENT, SEVERITY_COLORS } from "./tokens";

/**
 * List card for a drawing_revision_comparisons row. Shows:
 *   - FROM → TO banner (filename + stage + revision)
 *   - status pill (pending / processing / complete / error)
 *   - delta_count + by-severity chips when complete
 *   - retry button when in error state
 *
 * Click opens ComparisonDetailModal.
 */
export default function ComparisonCard({ comparison, fromAnalysis, toAnalysis, deltas = [], onOpen }) {
  const qc = useQueryClient();
  const statusColor = STATUS_COLORS[comparison.compare_status] || STATUS_COLORS.pending;

  const counts = deltas.reduce((acc, d) => {
    if (d.dismissed) return acc;
    acc[d.severity] = (acc[d.severity] || 0) + 1;
    return acc;
  }, {});

  const retry = async (e) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from("drawing_revision_comparisons")
        .update({ compare_status: "pending", error_message: null })
        .eq("id", comparison.id);
      if (error) throw new Error(error.message);
      toast.message("Retrying comparison…");
      qc.invalidateQueries({ queryKey: ["drawing_revision_comparisons"] });
    } catch (err) {
      toast.error(`Retry failed: ${err.message}`);
    }
  };

  return (
    <button
      onClick={() => onOpen?.(comparison)}
      style={{
        ...surface,
        display: "block", width: "100%", textAlign: "left",
        padding: "14px 16px",
        borderLeft: `3px solid ${AI_ACCENT}`,
        cursor: "pointer",
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-secondary)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-surface)")}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: AI_ACCENT, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          REVISION COMPARE
        </span>
        <span style={{
          ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
          textTransform: "uppercase", color: statusColor,
        }}>
          {comparison.compare_status === "processing" && "● "}
          {comparison.compare_status || "pending"}
          {comparison.delta_count != null && comparison.compare_status === "complete"
            ? ` · ${comparison.delta_count} DELTAS`
            : ""}
        </span>
      </div>

      {/* From → To banner */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <RevInfo label="FROM" analysis={fromAnalysis} />
        <ArrowRight size={16} style={{ color: AI_ACCENT }} />
        <RevInfo label="TO" analysis={toAnalysis} />
      </div>

      {comparison.compare_status === "complete" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["critical","high","medium","low","info"].map((sev) => {
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
          {deltas.filter(d => !d.dismissed).length === 0 && comparison.delta_count === 0 && (
            <span style={{ ...mono, fontSize: 10, color: "var(--status-success)" }}>
              ✓ No significant changes
            </span>
          )}
        </div>
      )}

      {comparison.compare_status === "error" && (
        <div>
          {comparison.error_message && (
            <div style={{ ...mono, fontSize: 10, color: "var(--status-error)", marginBottom: 6 }}>
              {comparison.error_message}
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

function RevInfo({ label, analysis }) {
  if (!analysis) {
    return (
      <div>
        <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em" }}>{label}</div>
        <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>—</div>
      </div>
    );
  }
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em" }}>
        {label}
        {analysis.drawing_stage ? ` · ${analysis.drawing_stage}` : ""}
        {analysis.revision ? ` · Rev ${analysis.revision}` : ""}
      </div>
      <div style={{ ...display, fontSize: 12, color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {analysis.file_name}
      </div>
    </div>
  );
}
