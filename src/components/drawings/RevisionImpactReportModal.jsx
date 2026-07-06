/**
 * RevisionImpactReportModal — package-level AI "Revision Impact Report".
 *
 * Given a drawing SET, finds the sheets that changed in the latest revision
 * round and runs the per-sheet AI diff across all of them, then aggregates the
 * deltas into one report (severity rollup + per-sheet sections + downstream
 * rework exposure). On-demand, review-only, idempotent: already-diffed sheets
 * are reused for free (no render, no AI spend).
 */
import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Check, DollarSign, Download, FileWarning, Layers, Sparkles } from "lucide-react";
import { entities } from "@/api/supabaseClient";
import { useAppSecurity } from "@/components/shared/useAppSecurity";
import { rasterizePageToPngBase64 } from "@/lib/pdfRasterize";
import {
  generateRevisionDiff,
  loadComparisonWithDeltas,
  setDeltaDismissed,
  sortDeltasBySeverity,
} from "@/lib/revisionSnapshotDiff";
import { selectChangedSheets, summarizePackageReport } from "@/lib/revisionPackageReport";
import RevisionDeltaCard, { SEV_COLOR } from "@/components/drawings/RevisionDeltaCard";
import RFIFormModal from "@/components/rfis/RFIFormModal";
import { toast } from "sonner";
import { useFlag } from "@/hooks/useFeatureFlag";
import { buildRfiPrefillFromDelta, createRfiAndLink } from "@/lib/rfiFromDelta";
import { BackchargeFormModal } from "@/pages/Backcharges";
import { buildBackchargePrefillFromSheet, createBackchargeFromDelta, sheetsWithRevisionBackcharge } from "@/lib/backchargeFromDelta";
import { listBackcharges } from "@/lib/backcharge/repository";
import { downloadRevisionImpactPdf } from "@/lib/exports/revisionImpactPDF";

const mono = "var(--font-mono)";
const SEV_ORDER = ["critical", "high", "medium", "low", "info"];

export default function RevisionImpactReportModal({ open, onClose, set, projectId }) {
  const { user } = useAppSecurity();
  // SP4: portaled Radix dialog. Under command_ui, tag `.detailing-cc` (light
  // token-alias) and swap the hardcoded dark `--bg-base` to the alias-remapped
  // `--bg-surface`. Flag off → byte-identical dark dialog.
  const commandUi = useFlag("command_ui");
  const setSheets = useMemo(() => (Array.isArray(set?.sheets) ? set.sheets : []), [set]);

  const { data: allRevisions = [], isLoading } = useQuery({
    queryKey: ["drawing-revisions", projectId],
    queryFn: () => (projectId ? entities.DrawingRevision.filter({ project_id: projectId }) : []),
    enabled: open && !!projectId,
    staleTime: 60_000,
  });

  const { data: projectBackcharges = [] } = useQuery({
    queryKey: ["backcharges", projectId],
    queryFn: () => (projectId ? listBackcharges(projectId) : []),
    enabled: open && !!projectId,
    staleTime: 60_000,
  });
  const loggedBcSheets = useMemo(() => sheetsWithRevisionBackcharge(projectBackcharges), [projectBackcharges]);

  const revisionsForSet = useMemo(() => {
    const ids = new Set(setSheets.map((s) => String(s.id)));
    return (allRevisions || []).filter((r) => ids.has(String(r.drawing_id)));
  }, [allRevisions, setSheets]);

  const changedSheets = useMemo(
    () => selectChangedSheets(setSheets, revisionsForSet),
    [setSheets, revisionsForSet],
  );
  const renderableCount = changedSheets.filter((e) => e.renderable).length;

  const [status, setStatus] = useState("idle"); // idle | running | done
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const runSeq = useRef(0);
  const [rfiDraft, setRfiDraft] = useState(null); // { deltaId, prefill } | null
  const [bcDraft, setBcDraft] = useState(null); // { sheet, prefill } | null
  const [bcSaving, setBcSaving] = useState(false);
  const [sessionLoggedBc, setSessionLoggedBc] = useState(() => new Set());

  // Reset when the set changes or the modal reopens.
  useEffect(() => {
    setStatus("idle");
    setProgress({ done: 0, total: 0 });
    setResults([]);
    setError("");
  }, [set?.setId, set?.key, open]);

  const summary = useMemo(() => summarizePackageReport(results), [results]);

  const baseResult = (entry) => ({
    sheetNumber: entry.sheetNumber,
    drawingId: entry.drawing?.id,
    downstream: entry.downstream,
    renderable: entry.renderable,
  });

  async function diffSheet(entry, bufferCache) {
    if (!entry.renderable) return { ...baseResult(entry), deltas: [] };
    // Reuse a completed diff for this exact pair — no render, no AI spend.
    try {
      const { comparison, deltas } = await loadComparisonWithDeltas({
        drawingId: entry.drawing.id,
        fromRevisionId: entry.fromRevisionId,
        toRevisionId: entry.toRevisionId,
      });
      if (comparison?.compare_status === "complete") {
        return { ...baseResult(entry), deltas: sortDeltasBySeverity(deltas), cached: true };
      }
    } catch {
      /* fall through to a fresh diff */
    }
    const [fromImageB64, toImageB64] = await Promise.all([
      rasterizePageToPngBase64({ fileUrl: entry.fromFile.fileUrl, page: entry.fromFile.pdfPage, bufferCache }),
      rasterizePageToPngBase64({ fileUrl: entry.toFile.fileUrl, page: entry.toFile.pdfPage, bufferCache }),
    ]);
    const res = await generateRevisionDiff({
      projectId,
      drawingId: entry.drawing.id,
      fromRevisionId: entry.fromRevisionId,
      toRevisionId: entry.toRevisionId,
      fromImageB64,
      toImageB64,
      fromLabel: "prior revision",
      toLabel: "current revision",
      sheetNumber: entry.sheetNumber,
      requestedBy: user?.email || null,
    });
    return { ...baseResult(entry), deltas: sortDeltasBySeverity(res.deltas || []), cached: !!res.cached };
  }

  const runReport = async () => {
    const seq = ++runSeq.current;
    setStatus("running");
    setError("");
    setResults([]);
    setProgress({ done: 0, total: renderableCount });
    const bufferCache = new Map();
    const collected = [];
    let spent = 0;
    for (const entry of changedSheets) {
      if (runSeq.current !== seq) return; // modal closed / set changed mid-run
      let r;
      try {
        r = await diffSheet(entry, bufferCache);
      } catch (e) {
        r = { ...baseResult(entry), deltas: [], error: e?.message || "Diff failed." };
      }
      collected.push(r);
      if (entry.renderable) spent += 1;
      if (runSeq.current !== seq) return;
      setProgress({ done: spent, total: renderableCount });
      setResults([...collected]);
    }
    if (runSeq.current !== seq) return;
    setStatus("done");
  };

  const toggleDismiss = async (delta) => {
    const next = !delta.dismissed;
    const flip = (val) =>
      setResults((rs) =>
        rs.map((r) => ({ ...r, deltas: (r.deltas || []).map((d) => (d.id === delta.id ? { ...d, dismissed: val } : d)) })),
      );
    flip(next);
    try {
      await setDeltaDismissed({ deltaId: delta.id, dismissed: next, userId: user?.id || null });
    } catch {
      flip(!next);
    }
  };

  const openRfiFromDelta = (delta) =>
    setRfiDraft({ deltaId: delta.id, prefill: buildRfiPrefillFromDelta(delta, { sheetNumber: delta.sheet_number }) });

  const saveRfiFromDelta = async (formData) => {
    try {
      const created = await createRfiAndLink({ projectId, formData, deltaId: rfiDraft?.deltaId });
      setResults((rs) =>
        rs.map((r) => ({ ...r, deltas: (r.deltas || []).map((d) => (d.id === rfiDraft?.deltaId ? { ...d, linked_rfi_id: created.id, _linkedRfiNumber: created.rfi_number } : d)) })),
      );
      setRfiDraft(null);
      toast.success(`Created ${created.rfi_number || "RFI"} from this change`);
    } catch (e) {
      toast.error(e?.message || "Failed to create the RFI.");
    }
  };

  const openBackcharge = (sheet) =>
    setBcDraft({ sheet, prefill: buildBackchargePrefillFromSheet(sheet) });

  const saveBackcharge = async (formData) => {
    setBcSaving(true);
    try {
      await createBackchargeFromDelta({ projectId, formData, sheet: bcDraft?.sheet });
      const sn = bcDraft?.sheet?.sheetNumber;
      if (sn) setSessionLoggedBc((prev) => new Set(prev).add(String(sn)));
      setBcDraft(null);
      toast.success("Backcharge logged for rework exposure");
    } catch (e) {
      toast.error(e?.message?.includes("row-level security") ? "Only PM+ can create backcharges." : (e?.message || "Failed to log the backcharge."));
    } finally {
      setBcSaving(false);
    }
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  const exportPdf = () => {
    try {
      downloadRevisionImpactPdf({ set, results, summary });
    } catch {
      toast.error("Could not generate the PDF.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={commandUi ? "detailing-cc" : undefined}
        style={{
          maxWidth: "min(96vw, 1100px)", width: "96vw", height: "92vh",
          display: "flex", flexDirection: "column", gap: 12, padding: 16,
          background: commandUi ? "var(--bg-surface)" : "var(--bg-base, #0D1117)", border: "1px solid var(--border-default)",
        }}
      >
        <DialogHeader style={{ flexShrink: 0 }}>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Sparkles size={16} style={{ color: "var(--accent)" }} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                Revision Impact Report
              </span>
              <span style={{ fontFamily: mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                {set?.name || "Set"}
              </span>
              <span style={{ fontFamily: mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", border: "1px solid var(--border-default)", borderRadius: 4, padding: "1px 4px" }}>AI</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {isLoading ? (
            <Centered>Loading revisions…</Centered>
          ) : changedSheets.length === 0 ? (
            <Centered>
              No changed sheets in <strong>{set?.name || "this set"}</strong> yet.<br />
              The report lights up the first time a new revision round is uploaded for a sheet in this set.
            </Centered>
          ) : (
            <>
              {/* ── Idle: confirm before spend ──────────────────────── */}
              {status === "idle" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 8 }}>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary, var(--text-muted))", lineHeight: 1.6, margin: 0 }}>
                    <strong style={{ color: "var(--text-primary)" }}>{changedSheets.length}</strong> changed sheet
                    {changedSheets.length === 1 ? "" : "s"} in this set
                    {renderableCount !== changedSheets.length && (
                      <> ({renderableCount} comparable, {changedSheets.length - renderableCount} missing a prior file)</>
                    )}. Running the report diffs each comparable sheet with AI; already-diffed sheets are reused for free.
                  </p>
                  <button type="button" className="sbd-btn-primary" disabled={renderableCount === 0} onClick={runReport}
                    style={{ alignSelf: "flex-start", opacity: renderableCount === 0 ? 0.5 : 1, cursor: renderableCount === 0 ? "not-allowed" : "pointer" }}>
                    <Sparkles size={13} style={{ marginRight: 6 }} /> Run report on {renderableCount} sheet{renderableCount === 1 ? "" : "s"}
                  </button>
                </div>
              )}

              {/* ── Running: progress ───────────────────────────────── */}
              {status === "running" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
                  <div style={{ fontFamily: mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                    DIFFING SHEET {Math.min(progress.done + 1, progress.total)} OF {progress.total}…
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--bg-surface, rgba(255,255,255,0.06))", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", transition: "width 0.3s ease" }} />
                  </div>
                </div>
              )}

              {/* ── Summary (once anything has resolved) ────────────── */}
              {(status === "running" || status === "done") && results.length > 0 && (
                <SummaryStrip summary={summary} onExport={status === "done" ? exportPdf : undefined} />
              )}

              {/* ── Per-sheet sections ──────────────────────────────── */}
              {results.map((r) => (
                <SheetSection key={r.drawingId} result={r} onToggleDismiss={toggleDismiss} onCreateRfi={openRfiFromDelta}
                  onLogBackcharge={openBackcharge}
                  backcharged={loggedBcSheets.has(r.sheetNumber) || sessionLoggedBc.has(String(r.sheetNumber))} />
              ))}
            </>
          )}
        </div>

        {rfiDraft && (
          <RFIFormModal
            projectId={projectId}
            rfi={null}
            prefill={rfiDraft.prefill}
            onClose={() => setRfiDraft(null)}
            onSave={saveRfiFromDelta}
          />
        )}

        {bcDraft && (
          <BackchargeFormModal
            open
            initial={bcDraft.prefill}
            busy={bcSaving}
            onClose={() => setBcDraft(null)}
            onSubmit={saveBackcharge}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Centered({ children }) {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
      color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 13, lineHeight: 1.7, padding: 30,
    }}>
      <div>{children}</div>
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 70 }}>
      <span className="sbd-num" style={{ fontFamily: mono, fontSize: 18, fontWeight: 800, color: color || "var(--text-primary)" }}>{value}</span>
      <span style={{ fontFamily: mono, fontSize: 8.5, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

function SummaryStrip({ summary, onExport }) {
  return (
    <div style={{
      display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", padding: "12px 14px",
      borderRadius: 10, border: "1px solid var(--border-default)", background: "var(--bg-input, rgba(255,255,255,0.02))",
    }}>
      <Kpi label="Changes" value={summary.totalDeltas} />
      <Kpi label="Sheets" value={`${summary.sheetsDiffed}/${summary.sheetsChanged}`} />
      {summary.downstreamExposure > 0 && (
        <Kpi label="Rework risk" value={summary.downstreamExposure} color="#F85149" />
      )}
      {summary.sheetsBlocked > 0 && <Kpi label="No prior file" value={summary.sheetsBlocked} color="var(--text-muted)" />}
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {SEV_ORDER.filter((s) => summary.bySeverity[s] > 0).map((s) => (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV_COLOR[s] }} />
            {summary.bySeverity[s]} {s.toUpperCase()}
          </span>
        ))}
      </div>
      {onExport && (
        <button type="button" onClick={onExport} className="sbd-btn" title="Download this report as a PDF"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, padding: "5px 10px" }}>
          <Download size={13} /> Export PDF
        </button>
      )}
    </div>
  );
}

function SheetSection({ result: r, onToggleDismiss, onCreateRfi, onLogBackcharge, backcharged }) {
  const kept = (r.deltas || []).filter((d) => !d.dismissed);
  const hasHot = kept.some((d) => d.severity === "critical" || d.severity === "high");
  const reworkExposed = !!r.downstream && hasHot;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderBottom: "1px solid var(--border-default)", paddingBottom: 6 }}>
        <Layers size={13} style={{ color: "var(--text-muted)" }} />
        <span style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{r.sheetNumber || "Sheet"}</span>
        {r.downstream && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.06em", color: "#F85149", textTransform: "uppercase" }}>
            <AlertTriangle size={11} /> {r.downstream}
          </span>
        )}
        {reworkExposed && (backcharged ? (
          <span title="A backcharge has been logged for this rework exposure" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.06em", color: "#3FB950", textTransform: "uppercase" }}>
            <Check size={11} /> BC logged
          </span>
        ) : (
          <button type="button" onClick={() => onLogBackcharge?.(r)} title="Log a rework backcharge for this already-fabricated/delivered sheet"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: "1px solid rgba(248,81,73,0.4)", borderRadius: 4, padding: "1px 6px", cursor: "pointer", color: "#F85149", fontFamily: mono, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.04em" }}>
            <DollarSign size={11} /> Log backcharge
          </button>
        ))}
        {r.cached && <span style={{ fontFamily: mono, fontSize: 8, color: "var(--text-muted)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "1px 4px" }}>CACHED</span>}
        <span style={{ flex: 1 }} />
        {!r.error && r.renderable && (
          <span style={{ fontFamily: mono, fontSize: 9, color: "var(--text-muted)" }}>{kept.length} change{kept.length === 1 ? "" : "s"}</span>
        )}
      </div>

      {r.error ? (
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--status-error)" }}>{r.error}</div>
      ) : !r.renderable ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
          <FileWarning size={13} /> Changed, but no captured prior-revision file to compare against.
        </div>
      ) : kept.length === 0 ? (
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>No material changes detected.</div>
      ) : (
        kept.map((d) => <RevisionDeltaCard key={d.id} delta={d} onToggleDismiss={onToggleDismiss} onCreateRfi={onCreateRfi} />)
      )}
    </div>
  );
}
