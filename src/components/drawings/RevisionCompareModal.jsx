/**
 * RevisionCompareModal — visual diff between two revisions of one sheet.
 *
 * Light-table overlay: the OLD revision is tinted red, the NEW one
 * blue, composited with multiply on white. Unchanged linework reads dark,
 * content only in the old rev reads RED (removed), content only in the new
 * rev reads BLUE (added). Plus a wipe slider and side-by-side mode, and a
 * pixel nudge for sheets whose title blocks shifted between prints.
 *
 * Data source: drawing_revisions file snapshots (file_url + pdf_page),
 * written by the slip-sheet flow (RevisionUploadModal → recordSheetSlipSheet)
 * plus the live drawings row as "Current".
 *
 * Rendering is local pdfjs — the PDFs never leave the browser.
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle, ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  Columns2, Layers, MoveHorizontal, RotateCcw, RotateCw, Sparkles, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { entities } from "@/api/supabaseClient";
import { rasterizePage, RASTER_TARGET_WIDTH, canvasToPngBase64 } from "@/lib/pdfRasterize";
import RevisionDeltaCard from "@/components/drawings/RevisionDeltaCard";
import RFIFormModal from "@/components/rfis/RFIFormModal";
import { toast } from "sonner";
import { buildRfiPrefillFromDelta, createRfiAndLink } from "@/lib/rfiFromDelta";
import { useFlag } from "@/hooks/useFeatureFlag";
import { useAppSecurity } from "@/components/shared/useAppSecurity";
import { ensureCurrentRevision } from "@/lib/drawingHub";
import { invalidateEntity } from "@/services/cacheRegistry";
import { daysBetween, todayLocalISO } from "@/lib/dateMath";
import {
  generateRevisionDiff,
  setDeltaDismissed,
  sortDeltasBySeverity,
} from "@/lib/revisionSnapshotDiff";

const OLD_TINT = "#FF4D4D";   // removed content
const NEW_TINT = "#2F81F7";   // added content
const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3];

const mono = "var(--font-mono)";

// ── Raster helpers (pure canvas, no React) ──────────────────────────────

/** Tint dark linework toward `color`, keep paper white ("lighten" keeps the
 * per-channel max: black ink → color, white stays white). */
function tintCanvas(src, color) {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "lighten";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  return out;
}

// ── AI Revision Impact panel (review-only) ──────────────────────────────

function RevisionAiPanel({
  status, summary, deltas, error, retryMsg, cached, downstream,
  disabled, light = false, onGenerate, onRegenerate, onToggleDismiss, onCreateRfi, onClose,
}) {
  const kept = deltas.filter((d) => !d.dismissed).length;
  return (
    <div style={{
      width: 360, flexShrink: 0, display: "flex", flexDirection: "column",
      borderRadius: 10, border: "1px solid var(--border-default)",
      // SP4: `--bg-base` isn't remapped by the `.detailing-cc` alias, so swap it
      // to the alias-remapped `--bg-surface` when the parent dialog is light.
      background: light ? "var(--bg-surface)" : "var(--bg-base, #0D1117)", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
        borderBottom: "1px solid var(--border-default)", flexShrink: 0,
      }}>
        <Sparkles size={14} style={{ color: "var(--accent)" }} />
        <span style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
          Revision Impact
        </span>
        <span style={{ fontFamily: mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", border: "1px solid var(--border-default)", borderRadius: 4, padding: "1px 4px" }}>AI</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="sbd-btn-ghost" style={{ minHeight: 26, padding: "2px 6px" }} onClick={onClose} title="Close panel"><X size={13} /></button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {downstream && (
          <div style={{
            display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8,
            background: "color-mix(in srgb, #F85149 14%, transparent)", border: "1px solid color-mix(in srgb, #F85149 40%, transparent)",
          }}>
            <AlertTriangle size={14} style={{ color: "#F85149", flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontFamily: "var(--font-body)", fontSize: 11.5, color: "var(--text-primary)", lineHeight: 1.5 }}>
              This sheet is already <strong>{downstream}</strong> — any real change here may mean rework or a backcharge.
            </span>
          </div>
        )}

        {status === "idle" && (
          <>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
              Compare the two selected revisions with AI for a steel-aware list of what changed — member sizes,
              connections, dimensions, grids, materials — each with a severity and a recommended action.
            </p>
            <button type="button" className="sbd-btn-primary" disabled={disabled} onClick={() => onGenerate(false)}
              style={{ alignSelf: "flex-start", opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
              <Sparkles size={13} style={{ marginRight: 6 }} /> Generate diff
            </button>
            {disabled && (
              <span style={{ fontFamily: mono, fontSize: 9, color: "var(--text-muted)" }}>
                Select two revisions with captured files and let them finish rendering first.
              </span>
            )}
          </>
        )}

        {status === "running" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", padding: 16, color: "var(--text-muted)", fontFamily: mono, fontSize: 11, letterSpacing: "0.06em" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(245,158,11,0.25)", borderTopColor: "var(--accent)", animation: "spin 0.7s linear infinite" }} />
            ANALYZING REVISIONS…
            {retryMsg && <span style={{ fontSize: 10, textAlign: "center", letterSpacing: 0 }}>{retryMsg}</span>}
          </div>
        )}

        {status === "error" && (
          <>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--status-error)", lineHeight: 1.5 }}>{error}</div>
            <button type="button" className="sbd-btn-ghost" onClick={() => onGenerate(false)} style={{ alignSelf: "flex-start" }}>
              <RotateCw size={13} style={{ marginRight: 6 }} /> Try again
            </button>
          </>
        )}

        {status === "done" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", color: "var(--text-primary)" }}>
                {kept} CHANGE{kept === 1 ? "" : "S"}
              </span>
              {cached && <span style={{ fontFamily: mono, fontSize: 8, color: "var(--text-muted)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "1px 4px" }}>CACHED</span>}
              <span style={{ flex: 1 }} />
              <button type="button" className="sbd-btn-ghost" style={{ minHeight: 26, padding: "2px 8px", fontSize: 10 }} onClick={() => onRegenerate()} title="Re-run the AI diff">
                <RotateCw size={11} style={{ marginRight: 4 }} /> Regenerate
              </button>
            </div>

            {summary && (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary, var(--text-muted))", lineHeight: 1.6, margin: 0 }}>{summary}</p>
            )}

            {deltas.length === 0 && (
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", padding: 8 }}>
                No material changes detected between these two revisions.
              </div>
            )}

            {deltas.map((d) => (
              <RevisionDeltaCard key={d.id} delta={d} onToggleDismiss={onToggleDismiss} onCreateRfi={onCreateRfi} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────

export default function RevisionCompareModal({ open, onClose, drawing }) {
  const drawingId = drawing?.id || null;

  const { data: revisionRows = [], isLoading } = useQuery({
    queryKey: ["drawing-revisions", "sheet", drawingId],
    queryFn: () => entities.DrawingRevision.filter({ drawing_id: drawingId }, "-version_number"),
    enabled: open && !!drawingId,
    staleTime: 30_000,
  });

  // Comparable versions: the live drawing row ("Current") + every history
  // row that captured a file snapshot. Non-current rows only — the current
  // revision row mirrors the drawing itself.
  const candidates = useMemo(() => {
    if (!drawing) return [];
    const list = [];
    if (drawing.file_url) {
      list.push({
        key: "current",
        label: `Current — Rev ${drawing.revision_number ?? "—"}`,
        fileUrl: drawing.file_url,
        pdfPage: drawing.pdf_page || 1,
      });
    }
    for (const rev of revisionRows) {
      if (!rev?.file_url || rev.is_current) continue;
      list.push({
        key: rev.id,
        label: `Rev ${rev.revision_code}${rev.issued_at ? ` · ${String(rev.issued_at).slice(0, 10)}` : ` · v${rev.version_number}`}`,
        fileUrl: rev.file_url,
        pdfPage: rev.pdf_page || 1,
      });
    }
    return list;
  }, [drawing, revisionRows]);

  const [oldKey, setOldKey] = useState(null);
  const [newKey, setNewKey] = useState(null);
  const [mode, setMode] = useState("overlay"); // overlay | wipe | side
  const [wipePct, setWipePct] = useState(50);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState("");

  // Default pair: newest history rev vs current.
  useEffect(() => {
    if (!open) return;
    const keys = candidates.map((c) => c.key);
    if (!keys.includes(newKey)) setNewKey(keys[0] || null);
    if (!keys.includes(oldKey) || oldKey === newKey) setOldKey(keys[1] || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidates]);

  const oldSel = candidates.find((c) => c.key === oldKey) || null;
  const newSel = candidates.find((c) => c.key === newKey) || null;

  const bufferCacheRef = useRef(new Map());
  const rastersRef = useRef({ old: null, new: null });
  const displayRef = useRef(null);       // overlay/wipe canvas
  const sideOldRef = useRef(null);
  const sideNewRef = useRef(null);
  const renderSeqRef = useRef(0);

  // Free cached PDF bytes when the modal closes.
  useEffect(() => {
    if (!open) {
      bufferCacheRef.current = new Map();
      rastersRef.current = { old: null, new: null };
      setOffset({ x: 0, y: 0 });
      setRenderError("");
    }
  }, [open]);

  // Compose the visible canvas(es) from the cached rasters. Cheap — runs on
  // every mode / offset / wipe change without touching pdfjs.
  const compose = useCallback(() => {
    const { old: oldRaster, new: newRaster } = rastersRef.current;
    if (!oldRaster || !newRaster) return;
    if (mode === "side") {
      for (const [ref, raster] of [[sideOldRef, oldRaster], [sideNewRef, newRaster]]) {
        const canvas = ref.current;
        if (!canvas) continue;
        canvas.width = raster.width;
        canvas.height = raster.height;
        canvas.getContext("2d").drawImage(raster, 0, 0);
      }
      return;
    }
    const canvas = displayRef.current;
    if (!canvas) return;
    const W = Math.max(oldRaster.width, newRaster.width);
    const H = Math.max(oldRaster.height, newRaster.height);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);
    if (mode === "overlay") {
      ctx.drawImage(tintCanvas(oldRaster, OLD_TINT), 0, 0);
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(tintCanvas(newRaster, NEW_TINT), offset.x, offset.y);
      ctx.globalCompositeOperation = "source-over";
    } else {
      // wipe: old underneath, new on top clipped to the left wipePct%.
      ctx.drawImage(oldRaster, 0, 0);
      const split = Math.round((wipePct / 100) * W);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, split, H);
      ctx.clip();
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, split, H);
      ctx.drawImage(newRaster, offset.x, offset.y);
      ctx.restore();
      ctx.fillStyle = "#F59E0B"; // wipe divider (canvas can't read CSS vars)
      ctx.fillRect(split - 1, 0, 2, H);
    }
  }, [mode, offset, wipePct]);

  // Rasterize when the selected pair changes.
  useEffect(() => {
    if (!open || !oldSel || !newSel) return;
    const seq = ++renderSeqRef.current;
    setRendering(true);
    setRenderError("");
    (async () => {
      const cache = bufferCacheRef.current;
      const [oldRaster, newRaster] = await Promise.all([
        rasterizePage({ fileUrl: oldSel.fileUrl, page: oldSel.pdfPage, bufferCache: cache }),
        rasterizePage({ fileUrl: newSel.fileUrl, page: newSel.pdfPage, bufferCache: cache }),
      ]);
      if (renderSeqRef.current !== seq) return; // stale selection
      rastersRef.current = { old: oldRaster, new: newRaster };
      compose();
    })()
      .catch((err) => {
        if (renderSeqRef.current !== seq) return;
        console.error("[RevisionCompareModal] render failed:", err);
        setRenderError(err?.message || "Failed to render one of the revisions.");
      })
      .finally(() => {
        if (renderSeqRef.current === seq) setRendering(false);
      });
    // compose intentionally omitted — pair changes always re-compose via rasters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, oldSel?.fileUrl, oldSel?.pdfPage, newSel?.fileUrl, newSel?.pdfPage]);

  // Re-compose (no re-raster) on mode / offset / wipe changes.
  useEffect(() => {
    compose();
  }, [compose]);

  const swap = () => {
    setOldKey(newKey);
    setNewKey(oldKey);
  };
  const nudge = (dx, dy) => setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
  const zoomBy = (dir) => {
    setZoom((z) => {
      const i = ZOOM_STEPS.indexOf(z);
      const next = ZOOM_STEPS[Math.min(Math.max(0, i + dir), ZOOM_STEPS.length - 1)];
      return next ?? 1;
    });
  };

  const sheetLabel = [drawing?.sheet_number, drawing?.title].filter(Boolean).join(" — ");
  const notEnough = !isLoading && candidates.length < 2;

  // ── AI "what changed" (flag-gated, review-only) ─────────────────────────
  const aiEnabled = useFlag("revision_ai_diff");
  const { user } = useAppSecurity();
  const [aiOpen, setAiOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState("idle"); // idle | running | done | error
  const [aiSummary, setAiSummary] = useState(null);
  const [aiDeltas, setAiDeltas] = useState([]);
  const [aiError, setAiError] = useState("");
  const [aiRetryMsg, setAiRetryMsg] = useState("");
  const [aiCached, setAiCached] = useState(false);
  const [rfiDraft, setRfiDraft] = useState(null); // { deltaId, prefill } | null

  // A new selection pair invalidates stale results (don't clobber a live run).
  useEffect(() => {
    if (aiStatus === "running") return;
    setAiStatus("idle");
    setAiDeltas([]);
    setAiSummary(null);
    setAiError("");
    setAiRetryMsg("");
    setAiCached(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldKey, newKey]);

  // Is THIS sheet already downstream? Same fields/semantics as
  // detailingRevisionImpact — a change here means potential rework.
  const downstream = useMemo(() => {
    const reached = (d) => !!d && daysBetween(d, todayLocalISO()) >= 0;
    if (!drawing) return null;
    if (reached(drawing.ready_for_install_date)) return "in the field";
    if (reached(drawing.final_delivery_date)) return "delivered";
    if (reached(drawing.fabrication_finish_date)) return "fabricated";
    return null;
  }, [drawing]);

  const qc = useQueryClient();
  const resolveRevisionId = useCallback(async (cand) => {
    if (!cand) return null;
    if (cand.key !== "current") return cand.key; // already a drawing_revisions id
    const cur = revisionRows.find((r) => r.is_current);
    if (cur?.id) return cur.id;
    const minted = await ensureCurrentRevision({ drawing, userId: user?.id || null });
    // Provisioned a current revision on demand — refresh the register/hub
    // revision caches so the new row shows without a manual reload.
    if (minted?.__provisioned && drawing?.project_id) invalidateEntity(qc, "drawing_revision", drawing.project_id);
    return minted?.id || null;
  }, [revisionRows, drawing, user, qc]);

  const runAiDiff = async (force = false) => {
    if (!oldSel || !newSel) return;
    setAiStatus("running");
    setAiError("");
    setAiRetryMsg("");
    try {
      const [fromRevisionId, toRevisionId] = await Promise.all([
        resolveRevisionId(oldSel),
        resolveRevisionId(newSel),
      ]);
      if (!fromRevisionId || !toRevisionId) throw new Error("Couldn't resolve the two revisions for these selections.");
      if (fromRevisionId === toRevisionId) throw new Error("Pick two different revisions to compare.");
      const res = await generateRevisionDiff({
        projectId: drawing?.project_id,
        drawingId: drawing?.id,
        fromRevisionId,
        toRevisionId,
        fromImageB64: canvasToPngBase64(rastersRef.current.old),
        toImageB64: canvasToPngBase64(rastersRef.current.new),
        fromLabel: oldSel?.label,
        toLabel: newSel?.label,
        sheetNumber: drawing?.sheet_number,
        requestedBy: user?.email || null,
        force,
        onRetry: ({ attempt, maxAttempts, delay }) =>
          setAiRetryMsg(`Rate-limited — retry ${attempt}/${maxAttempts - 1} in ${Math.round(delay / 1000)}s…`),
      });
      setAiSummary(res.comparison?.ai_summary || null);
      setAiDeltas(sortDeltasBySeverity(res.deltas || []));
      setAiCached(!!res.cached);
      setAiStatus("done");
    } catch (e) {
      setAiError(e?.message || "The diff failed. Try again.");
      setAiStatus("error");
    }
  };

  const toggleDismiss = async (delta) => {
    const next = !delta.dismissed;
    setAiDeltas((list) => list.map((d) => (d.id === delta.id ? { ...d, dismissed: next } : d)));
    try {
      await setDeltaDismissed({ deltaId: delta.id, dismissed: next, userId: user?.id || null });
    } catch {
      setAiDeltas((list) => list.map((d) => (d.id === delta.id ? { ...d, dismissed: !next } : d)));
    }
  };

  const openRfiFromDelta = (delta) =>
    setRfiDraft({ deltaId: delta.id, prefill: buildRfiPrefillFromDelta(delta, { sheetNumber: drawing?.sheet_number }) });

  const saveRfiFromDelta = async (formData) => {
    try {
      const created = await createRfiAndLink({ projectId: drawing?.project_id, formData, deltaId: rfiDraft?.deltaId });
      setAiDeltas((list) => list.map((d) => (d.id === rfiDraft?.deltaId ? { ...d, linked_rfi_id: created.id, _linkedRfiNumber: created.rfi_number } : d)));
      setRfiDraft(null);
      toast.success(`Created ${created.rfi_number || "RFI"} from this change`);
    } catch (e) {
      toast.error(e?.message || "Failed to create the RFI.");
    }
  };

  const aiBusyDisabled = rendering || isLoading || notEnough || !oldSel || !newSel;

  // SP4: under canonical presentation, tag this portaled Radix dialog `.detailing-cc` so
  // the header/controls/AI-rail chrome inherits the shell's light token-alias.
  // The DialogContent bg is already `--bg-surface-secondary` (alias-remapped
  // light); the canvas viewport keeps its functional gray. Flag off → no class,
  // byte-identical.

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="detailing-cc"
        style={{
          maxWidth: "min(96vw, 1500px)",
          width: "96vw",
          height: "92vh",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 16,
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
        }}
      >
        <DialogHeader style={{ flexShrink: 0 }}>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Layers size={16} style={{ color: "var(--accent)" }} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                Compare Revisions
              </span>
              <span style={{ fontFamily: mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                {sheetLabel || "Sheet"}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        {notEnough ? (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px dashed var(--border-default)", borderRadius: 10,
            color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 13,
            textAlign: "center", padding: 30, lineHeight: 1.6,
          }}>
            No prior revision file is captured for this sheet yet.<br />
            Upload the next revision through "New Revision Upload" and the superseded
            version will be archived here automatically for overlay compare.
          </div>
        ) : (
          <>
            {/* ── Controls ──────────────────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
              <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 800, color: OLD_TINT, letterSpacing: "0.08em" }}>OLD</span>
              <select
                className="sbd-select"
                value={oldKey || ""}
                onChange={(e) => setOldKey(e.target.value)}
                aria-label="Old revision"
                style={{ fontFamily: mono, fontSize: 10, padding: "5px 8px", maxWidth: 220 }}
              >
                {candidates.filter((c) => c.key !== newKey).map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <button type="button" className="sbd-btn-ghost" onClick={swap} title="Swap old/new"
                style={{ minHeight: 30, padding: "4px 8px", display: "inline-flex", alignItems: "center" }}>
                <ArrowLeftRight size={13} />
              </button>
              <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 800, color: NEW_TINT, letterSpacing: "0.08em" }}>NEW</span>
              <select
                className="sbd-select"
                value={newKey || ""}
                onChange={(e) => setNewKey(e.target.value)}
                aria-label="New revision"
                style={{ fontFamily: mono, fontSize: 10, padding: "5px 8px", maxWidth: 220 }}
              >
                {candidates.filter((c) => c.key !== oldKey).map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>

              <span style={{ width: 1, height: 22, background: "var(--border-default)", margin: "0 2px" }} />

              {[
                { key: "overlay", label: "Overlay", icon: Layers },
                { key: "wipe", label: "Wipe", icon: MoveHorizontal },
                { key: "side", label: "Side by side", icon: Columns2 },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    minHeight: 30, padding: "4px 10px", borderRadius: 7, cursor: "pointer",
                    border: `1px solid ${mode === key ? "var(--accent)" : "var(--border-default)"}`,
                    background: mode === key ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "transparent",
                    color: mode === key ? "var(--accent)" : "var(--text-muted)",
                    fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                  }}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}

              {mode === "wipe" && (
                <input
                  type="range" min={0} max={100} value={wipePct}
                  onChange={(e) => setWipePct(Number(e.target.value))}
                  aria-label="Wipe position"
                  style={{ width: 140, accentColor: "var(--accent)" }}
                />
              )}

              <span style={{ flex: 1 }} />

              {/* Alignment nudge (new layer) + zoom */}
              {mode !== "side" && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
                  title="Nudge the NEW layer to align sheets that shifted between prints">
                  <button type="button" className="sbd-btn-ghost" style={{ minHeight: 28, padding: "2px 6px" }} onClick={() => nudge(-1, 0)}><ChevronLeft size={12} /></button>
                  <button type="button" className="sbd-btn-ghost" style={{ minHeight: 28, padding: "2px 6px" }} onClick={() => nudge(0, -1)}><ChevronUp size={12} /></button>
                  <button type="button" className="sbd-btn-ghost" style={{ minHeight: 28, padding: "2px 6px" }} onClick={() => nudge(0, 1)}><ChevronDown size={12} /></button>
                  <button type="button" className="sbd-btn-ghost" style={{ minHeight: 28, padding: "2px 6px" }} onClick={() => nudge(1, 0)}><ChevronRight size={12} /></button>
                  <button type="button" className="sbd-btn-ghost" style={{ minHeight: 28, padding: "2px 6px" }} title="Reset alignment"
                    onClick={() => setOffset({ x: 0, y: 0 })}>
                    <RotateCcw size={12} />
                  </button>
                  {(offset.x !== 0 || offset.y !== 0) && (
                    <span className="sbd-num" style={{ fontFamily: mono, fontSize: 9, color: "var(--text-muted)" }}>
                      {offset.x},{offset.y}px
                    </span>
                  )}
                </div>
              )}
              <button type="button" className="sbd-btn-ghost" style={{ minHeight: 28, padding: "2px 7px" }} onClick={() => zoomBy(-1)} title="Zoom out"><ZoomOut size={13} /></button>
              <span className="sbd-num" style={{ fontFamily: mono, fontSize: 10, color: "var(--text-muted)", minWidth: 34, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
              <button type="button" className="sbd-btn-ghost" style={{ minHeight: 28, padding: "2px 7px" }} onClick={() => zoomBy(1)} title="Zoom in"><ZoomIn size={13} /></button>

              {aiEnabled && (
                <>
                  <span style={{ width: 1, height: 22, background: "var(--border-default)", margin: "0 2px" }} />
                  <button
                    type="button"
                    onClick={() => setAiOpen((v) => !v)}
                    title="AI: what changed between these revisions?"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      minHeight: 30, padding: "4px 10px", borderRadius: 7, cursor: "pointer",
                      border: `1px solid ${aiOpen ? "var(--accent)" : "var(--border-default)"}`,
                      background: aiOpen ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "transparent",
                      color: aiOpen ? "var(--accent)" : "var(--text-muted)",
                      fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                    }}
                  >
                    <Sparkles size={12} /> AI Diff
                  </button>
                </>
              )}
            </div>

            {/* ── Legend ───────────────────────────────────────────── */}
            {mode === "overlay" && (
              <div style={{ display: "flex", gap: 12, flexShrink: 0, fontFamily: mono, fontSize: 9, letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                <span><span style={{ color: OLD_TINT }}>■</span> only in OLD (removed)</span>
                <span><span style={{ color: NEW_TINT }}>■</span> only in NEW (added)</span>
                <span><span style={{ color: "var(--text-primary)" }}>■</span> unchanged</span>
              </div>
            )}

            {/* ── Canvas + AI rail ─────────────────────────────────── */}
            <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 10 }}>
            <div style={{
              flex: 1, minWidth: 0, overflow: "auto", borderRadius: 10,
              border: "1px solid var(--border-default)", background: "#3A3F46",
              position: "relative",
            }}>
              {(rendering || isLoading) && (
                <div style={{
                  position: "absolute", inset: 0, zIndex: 2, display: "flex",
                  alignItems: "center", justifyContent: "center", gap: 10,
                  background: "rgba(13,17,23,0.55)", color: "var(--text-primary)",
                  fontFamily: mono, fontSize: 11, letterSpacing: "0.08em",
                }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(245,158,11,0.25)", borderTopColor: "var(--accent)", animation: "spin 0.7s linear infinite" }} />
                  RENDERING SHEETS…
                </div>
              )}
              {renderError ? (
                <div style={{ padding: 24, color: "var(--status-error)", fontFamily: "var(--font-body)", fontSize: 12 }}>
                  {renderError}
                </div>
              ) : mode === "side" ? (
                <div style={{ display: "flex", gap: 8, padding: 10, alignItems: "flex-start" }}>
                  {[
                    { ref: sideOldRef, label: oldSel?.label, tintColor: OLD_TINT },
                    { ref: sideNewRef, label: newSel?.label, tintColor: NEW_TINT },
                  ].map(({ ref, label, tintColor }, i) => (
                    <div key={i} style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 800, color: tintColor, letterSpacing: "0.08em", marginBottom: 4 }}>
                        {label || "—"}
                      </div>
                      <canvas ref={ref} style={{ width: `${100 * zoom}%`, height: "auto", display: "block", background: "#fff", borderRadius: 4 }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 10 }}>
                  <canvas
                    ref={displayRef}
                    style={{
                      width: `${RASTER_TARGET_WIDTH * zoom}px`,
                      maxWidth: zoom === 1 ? "100%" : undefined,
                      height: "auto", display: "block", background: "#fff", borderRadius: 4,
                    }}
                  />
                </div>
              )}
            </div>
            {aiEnabled && aiOpen && (
              <RevisionAiPanel
                status={aiStatus}
                summary={aiSummary}
                deltas={aiDeltas}
                error={aiError}
                retryMsg={aiRetryMsg}
                cached={aiCached}
                downstream={downstream}
                disabled={aiBusyDisabled}
                light
                onGenerate={runAiDiff}
                onRegenerate={() => runAiDiff(true)}
                onToggleDismiss={toggleDismiss}
                onCreateRfi={openRfiFromDelta}
                onClose={() => setAiOpen(false)}
              />
            )}
            </div>
          </>
        )}

        {rfiDraft && (
          <RFIFormModal
            projectId={drawing?.project_id}
            rfi={null}
            prefill={rfiDraft.prefill}
            onClose={() => setRfiDraft(null)}
            onSave={saveRfiFromDelta}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
