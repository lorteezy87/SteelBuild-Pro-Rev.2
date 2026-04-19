import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useProjectContext } from "@/components/shared/useProjectContext";
import PageHeader from "@/components/shared/PageHeader";
import { GitCompare } from "lucide-react";
import DrawingUploadZone from "@/components/drawings/analysis/DrawingUploadZone";
import AnalysisCard from "@/components/drawings/analysis/AnalysisCard";
import AnalysisDetailModal from "@/components/drawings/analysis/AnalysisDetailModal";
import CompareRevisionsDialog from "@/components/drawings/analysis/CompareRevisionsDialog";
import ComparisonCard from "@/components/drawings/analysis/ComparisonCard";
import ComparisonDetailModal from "@/components/drawings/analysis/ComparisonDetailModal";
import { analyzeDrawing } from "@/lib/analyzeDrawing";
import { compareRevisions } from "@/lib/compareRevisions";
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
  const [openComparison, setOpenComparison] = useState(null);
  const [showCompareDialog, setShowCompareDialog] = useState(false);

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

  // Self-heal: any row that's been sitting in 'processing' for more than
  // the stale threshold is almost certainly orphaned (tab closed mid-run,
  // browser crashed, etc.). Reset it to 'pending' so the kick effect below
  // can re-fire it. The threshold accounts for long multi-page PDFs.
  const STUCK_MS = 5 * 60 * 1000;
  useEffect(() => {
    const now = Date.now();
    const stuck = analyses.filter(a =>
      a.analysis_status === "processing" &&
      a.updated_at &&
      (now - new Date(a.updated_at).getTime()) > STUCK_MS
    );
    if (stuck.length === 0) return;
    (async () => {
      const ids = stuck.map(s => s.id);
      await supabase
        .from("drawing_analyses")
        .update({ analysis_status: "pending", error_message: "Recovered from stuck processing state." })
        .in("id", ids);
      qc.invalidateQueries({ queryKey: ["drawing_analyses", projectId] });
    })();
  }, [analyses, qc, projectId]);

  // Kick off analyzeDrawing() for any row still in 'pending'. Dedupe by
  // id + updated_at so a retry (which bumps updated_at via the trigger)
  // re-fires exactly once even though the id is the same.
  const [kicked, setKicked] = useState(() => new Set());
  useEffect(() => {
    const toKick = analyses
      .filter(a => a.analysis_status === "pending")
      .filter(a => !kicked.has(`${a.id}:${a.updated_at}`));
    if (toKick.length === 0) return;
    setKicked(prev => {
      const next = new Set(prev);
      toKick.forEach(p => next.add(`${p.id}:${p.updated_at}`));
      return next;
    });
    for (const row of toKick) {
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

  // ── Revision Comparisons (Phase 3) ─────────────────────────────────
  const { data: comparisons = [] } = useQuery({
    queryKey: ["drawing_revision_comparisons", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("drawing_revision_comparisons")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId,
    refetchInterval: (q) => {
      const list = q.state.data || [];
      return list.some(c => c.compare_status === "processing" || c.compare_status === "pending")
        ? 4000
        : false;
    },
  });

  const comparisonIds = comparisons.map(c => c.id);
  const { data: allDeltas = [] } = useQuery({
    queryKey: ["drawing_deltas_bulk", comparisonIds.join(",")],
    queryFn: async () => {
      if (comparisonIds.length === 0) return [];
      const { data, error } = await supabase
        .from("drawing_revision_deltas")
        .select("id, comparison_id, severity, dismissed")
        .in("comparison_id", comparisonIds);
      if (error) throw error;
      return data || [];
    },
    enabled: comparisonIds.length > 0,
  });

  const deltasByComparison = allDeltas.reduce((acc, d) => {
    (acc[d.comparison_id] = acc[d.comparison_id] || []).push(d);
    return acc;
  }, {});

  const analysesById = useMemo(
    () => Object.fromEntries(analyses.map(a => [a.id, a])),
    [analyses],
  );

  // Kick compareRevisions() for pending comparisons; dedupe by {id, updated_at}
  // so retries fire exactly once.
  const [comparisonKicked, setComparisonKicked] = useState(() => new Set());
  useEffect(() => {
    const toKick = comparisons
      .filter(c => c.compare_status === "pending")
      .filter(c => !comparisonKicked.has(`${c.id}:${c.updated_at}`))
      .filter(c => analysesById[c.from_analysis_id] && analysesById[c.to_analysis_id]);
    if (toKick.length === 0) return;
    setComparisonKicked(prev => {
      const next = new Set(prev);
      toKick.forEach(c => next.add(`${c.id}:${c.updated_at}`));
      return next;
    });
    for (const c of toKick) {
      const from = analysesById[c.from_analysis_id];
      const to   = analysesById[c.to_analysis_id];
      compareRevisions(c, from, to)
        .then(() => {
          qc.invalidateQueries({ queryKey: ["drawing_revision_comparisons", projectId] });
          qc.invalidateQueries({ queryKey: ["drawing_deltas_bulk"] });
          qc.invalidateQueries({ queryKey: ["drawing_revision_deltas", c.id] });
          toast.success("Revision comparison complete");
        })
        .catch((e) => {
          qc.invalidateQueries({ queryKey: ["drawing_revision_comparisons", projectId] });
          toast.error(`Comparison failed: ${e?.message || e}`);
        });
    }
  }, [comparisons, comparisonKicked, qc, projectId, analysesById]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <PageHeader
            title="Drawing Analysis"
            subtitle={`${activeProject?.name || "Select a project"} • AI-assisted review of structural steel PDFs`}
            onRefresh={() => {
              qc.invalidateQueries({ queryKey: ["drawing_analyses", projectId] });
              qc.invalidateQueries({ queryKey: ["drawing_findings_bulk"] });
              qc.invalidateQueries({ queryKey: ["drawing_revision_comparisons", projectId] });
            }}
          />
        </div>
        <button
          onClick={() => setShowCompareDialog(true)}
          disabled={!projectId || analyses.filter(a => a.analysis_status === "complete").length < 2}
          title={!projectId ? "Select a project first" : "Compare two completed analyses"}
          style={{
            padding: "8px 14px",
            background: "transparent",
            color: AI_ACCENT,
            border: `1px solid ${AI_ACCENT}`,
            borderRadius: 2,
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.1em", textTransform: "uppercase",
            cursor: (!projectId || analyses.filter(a => a.analysis_status === "complete").length < 2) ? "not-allowed" : "pointer",
            opacity: (!projectId || analyses.filter(a => a.analysis_status === "complete").length < 2) ? 0.5 : 1,
            display: "inline-flex", alignItems: "center", gap: 6,
            alignSelf: "flex-start",
            marginTop: 8,
          }}
        >
          <GitCompare size={12} strokeWidth={2.5} /> Compare Revisions
        </button>
      </div>

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

      {/* Revision Comparisons (Phase 3) */}
      {projectId && comparisons.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: AI_ACCENT, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
            REVISION COMPARISONS ({comparisons.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 12 }}>
            {comparisons.map(c => (
              <ComparisonCard
                key={c.id}
                comparison={c}
                fromAnalysis={analysesById[c.from_analysis_id]}
                toAnalysis={analysesById[c.to_analysis_id]}
                deltas={deltasByComparison[c.id] || []}
                onOpen={setOpenComparison}
              />
            ))}
          </div>
        </div>
      )}

      <AnalysisDetailModal
        analysis={openAnalysis}
        onClose={() => setOpenAnalysis(null)}
      />

      <ComparisonDetailModal
        comparison={openComparison}
        fromAnalysis={openComparison ? analysesById[openComparison.from_analysis_id] : null}
        toAnalysis={openComparison ? analysesById[openComparison.to_analysis_id] : null}
        onClose={() => setOpenComparison(null)}
      />

      {showCompareDialog && (
        <CompareRevisionsDialog
          open={showCompareDialog}
          onClose={() => setShowCompareDialog(false)}
          projectId={projectId}
          analyses={analyses}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["drawing_revision_comparisons", projectId] });
          }}
        />
      )}

      {/* Subtle AI-layer footprint so the page reads as the AI module */}
      <div style={{ ...mono, fontSize: 9, color: AI_ACCENT, letterSpacing: "0.2em", textTransform: "uppercase", textAlign: "right", marginTop: 24 }}>
        ◈ AI LAYER — POWERED BY CLAUDE
      </div>
    </div>
  );
}
