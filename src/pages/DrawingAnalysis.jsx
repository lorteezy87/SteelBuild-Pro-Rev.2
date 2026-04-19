import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useProjectContext } from "@/components/shared/useProjectContext";
import PageHeader from "@/components/shared/PageHeader";
import DrawingUploadZone from "@/components/drawings/analysis/DrawingUploadZone";
import AnalysisCard from "@/components/drawings/analysis/AnalysisCard";
import AnalysisDetailModal from "@/components/drawings/analysis/AnalysisDetailModal";
import { analyzeDrawing } from "@/lib/analyzeDrawing";
import { mono, display, AI_ACCENT } from "@/components/drawings/analysis/tokens";
import { toast } from "sonner";

/**
 * Drawing Analysis — Phase 1.
 *
 *   Upload PDF → llm-proxy + Claude → drawing_analyses / _sheets / _findings.
 *   Click a card → side drawer with sheet index and findings.
 *   Findings can be dismissed or promoted to a draft RFI.
 *
 * Phase 2 will expand the RFI flow (author, assignees, due date); Phase 3
 * adds pdf-vs-pdf revision-delta detection.
 */
export default function DrawingAnalysis() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;

  const qc = useQueryClient();
  const [openAnalysis, setOpenAnalysis] = useState(null);

  const { data: analyses = [], isLoading } = useQuery({
    queryKey: ["drawing_analyses", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("drawing_analyses")
        .select("*")
        .eq("project_id", projectId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId,
    refetchInterval: (q) => {
      // Poll while any row is still processing so the UI flips to 'complete'
      // without a manual refresh.
      const list = q.state.data || [];
      return list.some(a => a.analysis_status === "processing" || a.analysis_status === "pending")
        ? 4000
        : false;
    },
  });

  // All findings for the loaded analyses, so the card chips can show counts
  // without a per-row fetch.
  const analysisIds = analyses.map(a => a.id);
  const { data: allFindings = [] } = useQuery({
    queryKey: ["drawing_findings_bulk", analysisIds.join(",")],
    queryFn: async () => {
      if (analysisIds.length === 0) return [];
      const { data, error } = await supabase
        .from("drawing_findings")
        .select("id, analysis_id, severity, dismissed")
        .in("analysis_id", analysisIds);
      if (error) throw error;
      return data || [];
    },
    enabled: analysisIds.length > 0,
  });

  // Kick off analyzeDrawing() for any row still in 'pending' — only when the
  // user is here to see the result. Naive debouncer on analysis id via ref.
  const [kicked, setKicked] = useState(() => new Set());
  useEffect(() => {
    const pending = analyses.filter(a => a.analysis_status === "pending" && !kicked.has(a.id));
    if (pending.length === 0) return;
    setKicked(prev => {
      const next = new Set(prev);
      pending.forEach(p => next.add(p.id));
      return next;
    });
    for (const row of pending) {
      analyzeDrawing(row)
        .then(() => {
          qc.invalidateQueries({ queryKey: ["drawing_analyses", projectId] });
          qc.invalidateQueries({ queryKey: ["drawing_sheets", row.id] });
          qc.invalidateQueries({ queryKey: ["drawing_findings_bulk"] });
          toast.success(`${row.file_name} analyzed`);
        })
        .catch((e) => {
          qc.invalidateQueries({ queryKey: ["drawing_analyses", projectId] });
          toast.error(`Analysis failed: ${e?.message || e}`);
        });
    }
  }, [analyses, kicked, qc, projectId]);

  const findingsByAnalysis = allFindings.reduce((acc, f) => {
    (acc[f.analysis_id] = acc[f.analysis_id] || []).push(f);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeader
        title="Drawing Analysis"
        subtitle={`${activeProject?.name || "Select a project"} • AI-assisted review of structural steel PDFs`}
        onRefresh={() => {
          qc.invalidateQueries({ queryKey: ["drawing_analyses", projectId] });
          qc.invalidateQueries({ queryKey: ["drawing_findings_bulk"] });
        }}
      />

      {!projectId && (
        <div style={{
          border: "1px solid var(--border-default)", padding: "20px 24px",
          background: "var(--bg-surface)",
        }}>
          <div style={{ ...display, fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
            No project selected
          </div>
          <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>
            Choose a project from the navigation header to upload a drawing set.
          </div>
        </div>
      )}

      {projectId && (
        <DrawingUploadZone
          projectId={projectId}
          projectName={activeProject?.name}
          onUploaded={() => {
            qc.invalidateQueries({ queryKey: ["drawing_analyses", projectId] });
          }}
        />
      )}

      {projectId && (
        <div>
          <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
            UPLOADED SETS ({analyses.length})
          </div>

          {isLoading && (
            <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>Loading…</div>
          )}

          {!isLoading && analyses.length === 0 && (
            <div style={{
              border: "1px dashed var(--border-default)", padding: "28px 20px",
              textAlign: "center", background: "var(--bg-surface)",
            }}>
              <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                No drawings uploaded yet
              </div>
              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                Drop an IFC / shop / revision PDF above to start.
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
            {analyses.map(a => (
              <AnalysisCard
                key={a.id}
                analysis={a}
                findings={findingsByAnalysis[a.id] || []}
                onOpen={setOpenAnalysis}
              />
            ))}
          </div>
        </div>
      )}

      <AnalysisDetailModal
        analysis={openAnalysis}
        onClose={() => setOpenAnalysis(null)}
      />

      {/* Subtle AI-layer footprint so the page reads as the AI module */}
      <div style={{ ...mono, fontSize: 9, color: AI_ACCENT, letterSpacing: "0.2em", textTransform: "uppercase", textAlign: "right", marginTop: 24 }}>
        ◈ AI LAYER — POWERED BY CLAUDE
      </div>
    </div>
  );
}
