import React, { useEffect, useRef } from "react";
import { X, ArrowRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { mono, display, AI_ACCENT, STATUS_COLORS, SEVERITY_COLORS, DELTA_TYPE_LABEL, pill } from "./tokens";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

/**
 * Detail drawer for a drawing_revision_comparisons row. Right-side slide-in,
 * plain fixed overlay (NOT Radix). Shows:
 *   - FROM → TO header with stage + revision
 *   - AI summary
 *   - Deltas grouped by severity
 *   - Dismiss + Create RFI per delta (RFI link for now; full dialog is
 *     inherited from the Phase-2 pattern, reused here via the same
 *     CreateRfiFromFindingDialog signature by translating a delta into a
 *     finding-shaped object.)
 */
export default function ComparisonDetailModal({ comparison, fromAnalysis, toAnalysis, onClose }) {
  const ref = useRef(null);
  const qc = useQueryClient();
  const open = !!comparison;

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  const { data: deltas = [] } = useQuery({
    queryKey: ["drawing_revision_deltas", comparison?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drawing_revision_deltas")
        .select("*")
        .eq("comparison_id", comparison.id)
        .order("severity", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  if (!open) return null;

  const statusColor = STATUS_COLORS[comparison.compare_status] || STATUS_COLORS.pending;

  const grouped = SEVERITY_ORDER
    .map(sev => ({ severity: sev, items: deltas.filter(d => d.severity === sev) }))
    .filter(g => g.items.length > 0);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["drawing_revision_deltas", comparison.id] });
    qc.invalidateQueries({ queryKey: ["drawing_revision_comparisons"] });
  };

  const dismiss = async (d) => {
    try {
      const { error } = await supabase
        .from("drawing_revision_deltas")
        .update({ dismissed: true, dismissed_at: new Date().toISOString() })
        .eq("id", d.id);
      if (error) throw new Error(error.message);
      toast.success("Delta dismissed");
      invalidate();
    } catch (e) {
      toast.error(`Dismiss failed: ${e.message}`);
    }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1100 }} />
      <div
        ref={ref}
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        style={{
          position: "fixed", top: 0, right: 0,
          width: 720, maxWidth: "96vw", height: "100vh",
          background: "var(--bg-surface-secondary)",
          borderLeft: `3px solid ${AI_ACCENT}`,
          display: "flex", flexDirection: "column",
          zIndex: 1101, outline: "none",
        }}
      >
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--divider)",
          display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: AI_ACCENT, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
              REVISION COMPARE · {comparison.compare_status}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center" }}>
              <RevInfo label="FROM" analysis={fromAnalysis} />
              <ArrowRight size={16} style={{ color: AI_ACCENT }} />
              <RevInfo label="TO" analysis={toAnalysis} />
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {comparison.compare_status === "processing" && (
            <div style={{ textAlign: "center", padding: "40px 16px" }}>
              <div style={{ ...mono, fontSize: 11, color: AI_ACCENT, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                ● Comparing revisions…
              </div>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>
                Both PDFs are sent in one message. Usually 30–120 seconds.
              </div>
            </div>
          )}

          {comparison.compare_status === "error" && (
            <div style={{
              border: "1px solid var(--status-error)",
              background: "color-mix(in srgb, var(--status-error) 8%, transparent)",
              padding: "12px 14px", marginBottom: 16,
            }}>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--status-error)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
                COMPARISON FAILED
              </div>
              <div style={{ fontSize: 12, color: "var(--text-primary)" }}>
                {comparison.error_message || "Unknown error — retry from the card."}
              </div>
            </div>
          )}

          {comparison.compare_status === "complete" && comparison.ai_summary && (
            <div style={{
              borderLeft: `3px solid ${AI_ACCENT}`,
              background: "color-mix(in srgb, " + AI_ACCENT + " 6%, transparent)",
              padding: "12px 14px", marginBottom: 16,
            }}>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: AI_ACCENT, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
                AI SUMMARY
              </div>
              <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
                {comparison.ai_summary}
              </div>
            </div>
          )}

          {comparison.compare_status === "complete" && grouped.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <div style={{ ...mono, fontSize: 11, color: "var(--status-success)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                ✓ No significant deltas flagged
              </div>
            </div>
          )}

          {grouped.map(g => (
            <section key={g.severity} style={{ marginBottom: 18 }}>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
                {g.severity} ({g.items.length})
              </div>
              {g.items.map(d => (
                <DeltaRow key={d.id} delta={d} onDismiss={() => dismiss(d)} />
              ))}
            </section>
          ))}
        </div>

        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--divider)",
          display: "flex", gap: 8, flexShrink: 0,
        }}>
          <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {deltas.filter(d => !d.dismissed).length} open · {deltas.length} total
          </span>
          <button onClick={onClose} style={{
            marginLeft: "auto",
            padding: "6px 14px", background: "transparent",
            border: "1px solid var(--border-default)", borderRadius: 2,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer",
          }}>
            CLOSE
          </button>
        </div>
      </div>
    </>
  );
}

function DeltaRow({ delta, onDismiss }) {
  const color = SEVERITY_COLORS[delta.severity] || SEVERITY_COLORS.info;
  return (
    <div style={{
      borderLeft: `3px solid ${color}`,
      background: "var(--bg-surface)",
      padding: "10px 14px",
      marginBottom: 8,
      opacity: delta.dismissed ? 0.45 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
        <span style={pill(color)}>{delta.severity}</span>
        <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em" }}>
          {DELTA_TYPE_LABEL[delta.delta_type] || delta.delta_type}
        </span>
        {delta.sheet_number && (
          <span style={{ ...mono, fontSize: 10, color: "var(--accent)" }}>{delta.sheet_number}</span>
        )}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.45, marginBottom: 6 }}>
        {delta.description}
      </div>
      {delta.recommended_action && (
        <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
          <span style={{ color: "var(--accent)", letterSpacing: "0.12em", fontWeight: 700 }}>ACTION · </span>
          {delta.recommended_action}
        </div>
      )}
      {!delta.dismissed && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onDismiss}
            style={{
              padding: "4px 10px", background: "transparent",
              border: "1px solid var(--border-default)", borderRadius: 2,
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer",
            }}
          >
            DISMISS
          </button>
        </div>
      )}
    </div>
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
