import React, { useEffect, useRef, useState } from "react";
import { X, ExternalLink, ArrowUpRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { importAnalyzedDrawings } from "@/lib/importAnalyzedDrawings";
import FindingRow from "./FindingRow";
import { mono, display, AI_ACCENT, STAGE_ACCENT, STATUS_COLORS, pill } from "./tokens";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

/**
 * Plain fixed overlay (NOT Radix Dialog). Shows:
 *   - Header: file name, stage pill, status, open-PDF link
 *   - Tabs (implicit via sections): AI summary, sheet index, findings by severity
 *   - FindingRow handles dismiss + create-RFI per finding.
 *
 * Re-fetches its own sheets/findings on mount and invalidates on change
 * so the list below updates without a parent refetch.
 */
export default function AnalysisDetailModal({ analysis, onClose }) {
  const ref = useRef(null);
  const qc = useQueryClient();
  const open = !!analysis;
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  const runImport = async () => {
    if (!analysis) return;
    setImporting(true);
    try {
      const res = await importAnalyzedDrawings(analysis);
      if (res.skipped) {
        toast.message("Already imported to Drawings");
      } else {
        toast.success(`Imported as "${res.setName}" (${res.drawingCount} sheet${res.drawingCount === 1 ? "" : "s"})`);
      }
      qc.invalidateQueries({ queryKey: ["drawing_analyses"] });
      qc.invalidateQueries({ queryKey: ["drawings"] });
      qc.invalidateQueries({ queryKey: ["drawing_sets"] });
    } catch (e) {
      toast.error(`Import failed: ${e?.message || e}`);
    } finally {
      setImporting(false);
    }
  };

  const { data: sheets = [] } = useQuery({
    queryKey: ["drawing_sheets", analysis?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drawing_sheets")
        .select("*")
        .eq("analysis_id", analysis.id)
        .order("page_index", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: findings = [] } = useQuery({
    queryKey: ["drawing_findings", analysis?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drawing_findings")
        .select("*")
        .eq("analysis_id", analysis.id)
        .order("severity", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  if (!open) return null;

  const stageColor  = STAGE_ACCENT[analysis.drawing_stage] || "var(--text-muted)";
  const statusColor = STATUS_COLORS[analysis.analysis_status] || STATUS_COLORS.pending;

  const grouped = SEVERITY_ORDER.map(sev => ({
    severity: sev,
    items: findings.filter(f => f.severity === sev),
  })).filter(g => g.items.length > 0);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["drawing_findings", analysis.id] });
    qc.invalidateQueries({ queryKey: ["drawing_analyses"] });
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1100 }}
      />
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
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--divider)",
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={pill(stageColor)}>{analysis.drawing_stage || "—"}</span>
              {analysis.revision && (
                <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>REV {analysis.revision}</span>
              )}
              <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: statusColor, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                {analysis.analysis_status === "processing" && "● "}
                {analysis.analysis_status}
              </span>
            </div>
            <div style={{ ...display, fontSize: 15, fontWeight: 700, color: "var(--text-primary)", wordBreak: "break-word" }}>
              {analysis.file_name}
            </div>
          </div>
          {analysis.file_url && (
            <a
              href={analysis.file_url} target="_blank" rel="noreferrer"
              style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, fontSize: 11, ...mono }}
            >
              <ExternalLink size={14} /> PDF
            </a>
          )}

          {/* Import-to-Drawings control. Shown only once the analysis is
              complete so we don't promote partial data. When already
              imported, shows a success chip; otherwise offers the import
              button (auto-import should normally already have run). */}
          {analysis.analysis_status === "complete" && (
            analysis.imported_set_id ? (
              <span style={{
                ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--status-success)",
                border: "1px solid var(--status-success)",
                borderRadius: 2, padding: "3px 8px",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                <ArrowUpRight size={12} strokeWidth={2.5} /> IN DRAWINGS
              </span>
            ) : (
              <button
                onClick={runImport}
                disabled={importing}
                style={{
                  ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: AI_ACCENT,
                  background: "transparent",
                  border: `1px solid ${AI_ACCENT}`,
                  borderRadius: 2,
                  padding: "3px 10px",
                  cursor: importing ? "not-allowed" : "pointer",
                  opacity: importing ? 0.6 : 1,
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}
              >
                <ArrowUpRight size={12} strokeWidth={2.5} />
                {importing ? "IMPORTING…" : "IMPORT TO DRAWINGS"}
              </button>
            )
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {/* AI summary */}
          {analysis.analysis_status === "complete" && analysis.ai_summary && (
            <div style={{
              borderLeft: `3px solid ${AI_ACCENT}`,
              background: "color-mix(in srgb, " + AI_ACCENT + " 6%, transparent)",
              padding: "12px 14px", marginBottom: 16,
            }}>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: AI_ACCENT, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
                AI SUMMARY
              </div>
              <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
                {analysis.ai_summary}
              </div>
            </div>
          )}

          {analysis.analysis_status === "processing" && (
            <div style={{ textAlign: "center", padding: "40px 16px" }}>
              <div style={{ ...mono, fontSize: 11, color: AI_ACCENT, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                ● Analyzing drawing set…
              </div>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>
                Usually 30–90 seconds depending on page count
              </div>
            </div>
          )}

          {analysis.analysis_status === "error" && (
            <div style={{
              border: "1px solid var(--status-error)",
              background: "color-mix(in srgb, var(--status-error) 8%, transparent)",
              padding: "12px 14px", marginBottom: 16,
            }}>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--status-error)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
                ANALYSIS FAILED
              </div>
              <div style={{ fontSize: 12, color: "var(--text-primary)" }}>
                {analysis.error_message || "Unknown error — retry from the drawing list."}
              </div>
            </div>
          )}

          {/* Sheet index */}
          {sheets.length > 0 && (
            <section style={{ marginBottom: 20 }}>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
                SHEET INDEX ({sheets.length})
              </div>
              <div style={{ border: "1px solid var(--border-default)" }}>
                {sheets.map((s, i) => (
                  <div key={s.id} style={{
                    display: "grid", gridTemplateColumns: "110px 1fr 90px",
                    padding: "6px 10px", gap: 12,
                    borderBottom: i < sheets.length - 1 ? "1px solid var(--divider)" : "none",
                    alignItems: "baseline",
                  }}>
                    <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
                      {s.sheet_number}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-primary)" }}>
                      {s.sheet_title || "—"}
                    </span>
                    <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {s.sheet_category || ""}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Findings by severity */}
          {grouped.length > 0 && (
            <section>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
                FINDINGS ({findings.filter(f => !f.dismissed).length} open / {findings.length} total)
              </div>
              {grouped.map(g => (
                <div key={g.severity} style={{ marginBottom: 14 }}>
                  <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
                    {g.severity} ({g.items.length})
                  </div>
                  {g.items.map(f => (
                    <FindingRow key={f.id} finding={f} analysis={analysis} onChanged={invalidate} />
                  ))}
                </div>
              ))}
            </section>
          )}

          {analysis.analysis_status === "complete" && findings.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <div style={{ ...mono, fontSize: 11, color: "var(--status-success)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                ✓ No findings flagged
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* eslint-disable-next-line no-unused-vars */
// display is imported for consistency with other modules even if not used below
