/**
 * Model3DTab — the Detailing Control Center "3D Model" tab. Hosts the lazy IFC
 * viewer, builds the GlobalId→status color map from the page's existing
 * `modelMapping` read-model (summarizeElementStatuses.guidsByStatus), and shows a
 * status legend + a click-to-identify panel.
 *
 * Piece tracking lives here too: find-by-mark, click-to-isolate legend with live
 * counts, and a Piece Control panel that only offers the logistics action the
 * whole selection is eligible for (ship / deliver / erect — same rules as the
 * Piece Register). Everything derives from the roster + canonical pieces the tab
 * already holds; nothing is stored on the model itself.
 *
 * The IFC is persisted per project (upload → Storage + roster → model_elements)
 * and auto-loads on the next visit.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ELEMENT_STATUS_META, normalizePieceMark } from "@/services/modelElementStatus";
import { TYPE_PALETTE, seqColor, buildStatusByGuid, buildSeqByGuid, buildFabByGuid, buildMarkByGuid, buildStatusByMark, buildSeqByMark, buildFabByMark, buildCanonicalPieceByGuid, colorFnFor } from "@/lib/ifc/viewerColoring";
import { buildRowsByGuid, buildFabLegend, findGuidsByMark, summarizeSelection, describeSelection } from "@/lib/ifc/viewerSelection";
import { extractIfcRoster } from "@/lib/ifc/extractIfcRoster";
import { gzipBuffer, gunzipBuffer } from "@/lib/ifc/gzip";
import { importIfcRoster, removeProjectModel } from "@/services/ifcRosterImport";
import {
  assertStorageObjectSize, describeEmptyRoster, describePersistFailure, describePersistProgress, formatMb,
  persistLeftPartialWrite,
} from "@/lib/ifc/persistSteps";
import { integrations, resolveFileUrl } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { transitionPieceLots } from "@/lib/pieceControl/logisticsRepository";
import { pieceControlKeys, invalidatePieceControlQueries } from "@/lib/pieceControl/queryKeys";
import { fetchAllProjectRowsPaged } from "@/lib/pieceControl/pagedSelect";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";
import { pieceLifecycleLabel } from "@/lib/pieceControl/lifecycle";
import { createPageUrl } from "@/utils";
import Model3dSyncPanel from "@/components/viewer3d/Model3dSyncPanel";
import { useCanonicalReportingRealtime } from "@/hooks/useCanonicalReportingRealtime";

const IfcModelViewer = lazy(() => import("@/components/viewer3d/IfcModelViewer"));

const mono = { fontFamily: "var(--font-mono)" };

const COLOR_MODES = [
  { key: "model", label: "Model" },
  { key: "fab", label: "Fab" },
  { key: "type", label: "Type" },
  { key: "sequence", label: "Sequence" },
  { key: "status", label: "Detailing" },
];
const TYPE_LABELS = [["beam", "Beam"], ["column", "Column"], ["plate", "Plate"], ["member", "Member"]];

const viewerTools = {
  position: "absolute", top: 10, left: 10, display: "flex", gap: 6, zIndex: 2, flexWrap: "wrap",
  maxWidth: "calc(100% - 110px)",
};

const toolBtn = {
  padding: "6px 12px", borderRadius: 8,
  border: "1px solid var(--border-default)", background: "rgba(13,17,23,0.72)",
  color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 11,
  fontWeight: 700, letterSpacing: "0.05em", cursor: "pointer",
};

const linkBtn = {
  background: "none", border: "none", color: "var(--accent)", cursor: "pointer",
  textDecoration: "underline", font: "inherit", padding: 0,
};

const saveBanner = {
  position: "absolute", top: 52, left: "50%", transform: "translateX(-50%)", zIndex: 3,
  display: "flex", alignItems: "center", gap: 12, padding: "8px 10px 8px 16px",
  borderRadius: 999, background: "color-mix(in srgb, var(--accent) 20%, rgba(13,17,23,0.92))",
  border: "1px solid color-mix(in srgb, var(--accent) 55%, transparent)",
  boxShadow: "0 6px 24px rgba(0,0,0,0.4)", whiteSpace: "nowrap",
};

const loadingChip = {
  position: "absolute", top: 52, left: "50%", transform: "translateX(-50%)", zIndex: 3,
  display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999,
  background: "rgba(13,17,23,0.82)", border: "1px solid var(--border-default)",
  color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 11,
  fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "nowrap", boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
};

const sectionHead = {
  ...mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8,
};

const hintStyle = { color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 };

export default function Model3DTab({ modelMapping, modelElementRows, projectId, rosterLoading }) {
  const qc = useQueryClient();
  useCanonicalReportingRealtime(projectId);
  const viewerRef = useRef(null);
  const [buffer, setBuffer] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [modelFile, setModelFile] = useState(null);
  const [source, setSource] = useState(null);
  const [picked, setPicked] = useState(null);
  const [selectedGuids, setSelectedGuids] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [colorMode, setColorMode] = useState(() => {
    try { return localStorage.getItem("sbp:viewer-colormode") || "fab"; } catch { return "fab"; }
  });
  useEffect(() => {
    try { localStorage.setItem("sbp:viewer-colormode", colorMode); } catch { /* ignore */ }
  }, [colorMode]);
  const [roster, setRoster] = useState({ step: "idle" });

  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureResult, setMeasureResult] = useState(null);
  const [isolatedKey, setIsolatedKey] = useState(null); // legend bucket currently isolated
  const [findQuery, setFindQuery] = useState("");
  const [findResult, setFindResult] = useState(null);
  const [clipEnabled, setClipEnabled] = useState(false);
  const [clipPct, setClipPct] = useState(100);
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  const toggleMeasure = () => {
    setMeasureMode((on) => {
      if (on) setMeasureResult(null);
      return !on;
    });
  };

  const { data: storedModel } = useQuery({
    queryKey: ["project-model", projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("model_registry")
        .select("id, file_name, file_url, coordinate_system")
        .eq("project_id", projectId)
        .eq("file_type", "IFC")
        .eq("status", "active")
        .eq("is_deleted", false)
        .not("file_url", "is", null)
        .order("upload_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data || null;
    },
  });

  const { data: canonicalPieces = [] } = useQuery({
    queryKey: pieceControlKeys.canonicalPieces3d(projectId),
    enabled: !!projectId,
    // Paged: this is the join the Fab color mode paints from, and a bare
    // select silently dropped every lot past row 1000 on big jobs.
    queryFn: () =>
      fetchAllProjectRowsPaged(supabase, "pieces", projectId, {
        select: "id,piece_mark,lot_code,lifecycle_status,on_hold,on_hold_reason,is_container,is_deleted,deleted_at,work_package_id",
        build: (query) => query.eq("is_deleted", false).is("deleted_at", null),
      }),
  });

  useEffect(() => {
    if (!storedModel?.file_url || buffer || source === "picked") return;
    let cancelled = false;
    (async () => {
      try {
        const url = await resolveFileUrl(storedModel.file_url);
        if (!url) return;
        const res = await fetch(url);
        // A signed-URL 403/404 used to fall through to web-ifc as a "model" and
        // surface as a cryptic parse error; name the real failure instead.
        if (!res.ok) throw new Error(`Saved model download failed (HTTP ${res.status}). Re-save the IFC to this project.`);
        let buf = await res.arrayBuffer();
        if (storedModel.file_url.endsWith(".gz")) buf = await gunzipBuffer(buf);
        if (cancelled) return;
        setFileName(storedModel.file_name);
        setBuffer(buf);
        setSource("stored");
      } catch (err) {
        if (!cancelled) setLoadErr(err?.message || String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [storedModel, buffer, source]);

  const statusByGuid = useMemo(() => buildStatusByGuid(modelMapping), [modelMapping]);
  const seqByGuid = useMemo(() => buildSeqByGuid(modelElementRows), [modelElementRows]);
  const [markFallback, setMarkFallback] = useState(false);
  useEffect(() => { setMarkFallback(false); }, [projectId]);
  const fabByGuid = useMemo(() => buildFabByGuid(modelElementRows), [modelElementRows]);
  const hasRoster = (modelElementRows?.length || 0) > 0;
  const canonicalPieceByGuid = useMemo(
    () => buildCanonicalPieceByGuid(modelElementRows, canonicalPieces),
    [modelElementRows, canonicalPieces],
  );
  const rowsByGuid = useMemo(() => buildRowsByGuid(modelElementRows), [modelElementRows]);

  const markByGuid = useMemo(() => buildMarkByGuid(modelElementRows), [modelElementRows]);
  const seqByMark = useMemo(() => buildSeqByMark(modelElementRows), [modelElementRows]);
  const statusByMark = useMemo(() => buildStatusByMark(modelMapping), [modelMapping]);
  const fabByMark = useMemo(() => buildFabByMark(modelElementRows), [modelElementRows]);

  const colorFor = useMemo(
    () => colorFnFor(colorMode, {
      statusByGuid, seqByGuid, fabByGuid,
      markByGuid, statusByMark, seqByMark, fabByMark,
      canonicalPieceByGuid,
      perPieceFab: !markFallback,
    }),
    [colorMode, statusByGuid, seqByGuid, fabByGuid, markByGuid, statusByMark, seqByMark, fabByMark, canonicalPieceByGuid, markFallback],
  );

  // Hover label / alt-click "whole mark": the roster's assembly mark by GUID.
  const labelFor = useCallback((guid) => markByGuid.get(guid) || null, [markByGuid]);

  const fabLegend = useMemo(
    () => buildFabLegend({ rows: modelElementRows, canonicalPieceByGuid, fabByGuid }),
    [modelElementRows, canonicalPieceByGuid, fabByGuid],
  );

  const selection = useMemo(
    () => summarizeSelection(selectedGuids, { markByGuid, seqByGuid, canonicalPieceByGuid, rowsByGuid }),
    [selectedGuids, markByGuid, seqByGuid, canonicalPieceByGuid, rowsByGuid],
  );

  const resetViewerState = () => {
    setSelectedGuids([]); setPicked(null); setIsolatedKey(null);
    setFindQuery(""); setFindResult(null); setClipEnabled(false); setClipPct(100);
    setMeasureMode(false); setMeasureResult(null);
  };

  const persistModel = async (file, buf) => {
    if (!projectId) return;
    // Which pipeline step is running — names the failure for the operator and
    // for Sentry, since "Couldn't save the model" alone was undiagnosable.
    let step = "extract";
    setRoster({ step: "extracting", done: 0, total: 0, phase: "index" });
    try {
      // Reuse the viewer's already-parsed model when it is still open; a second
      // OpenModel of a 100 MB+ IFC is what used to push Safari over its memory
      // ceiling on the save path.
      const model = viewerRef.current?.getModelHandle?.() || null;
      const result = await extractIfcRoster(
        buf,
        (done, total, phase) => setRoster({ step: "extracting", done, total, phase }),
        { model },
      );
      if (!result.rows.length) {
        // Say what the file DID contain (types, property sets, keys) so the
        // detailer can fix the export config instead of guessing.
        console.warn("[Model3DTab] IFC produced no roster rows:", result.diagnostics);
        const message = describeEmptyRoster(result.diagnostics);
        setRoster({ step: "error", message });
        toast.warning(message, { duration: 15000 });
        return;
      }

      step = "compress";
      setRoster({ step: "saving", stage: "compressing model" });
      let uploadFile = file;
      const gz = await gzipBuffer(buf).catch(() => null);
      if (gz) uploadFile = new File([gz], `${file.name}.gz`);
      assertStorageObjectSize(uploadFile.size, gz ? "compressed model" : "model");

      step = "upload";
      setRoster({ step: "saving", stage: `uploading ${formatMb(uploadFile.size)}` });
      const up = await integrations.Core.UploadFile({ file: uploadFile });

      step = "register";
      setRoster({ step: "saving", stage: `writing pieces 0 / ${result.rows.length.toLocaleString()}` });
      const { created, linkSummary } = await importIfcRoster({
        projectId, fileName: file.name, schema: result.schema, fileUrl: up.path, rows: result.rows,
        onProgress: (done, total) =>
          setRoster({ step: "saving", stage: `writing pieces ${done.toLocaleString()} / ${total.toLocaleString()}` }),
      });
      qc.invalidateQueries({ queryKey: ["project-model", projectId] });
      await invalidatePieceControlQueries(qc, projectId, "import");
      setSource("stored");
      setRoster({ step: "done", created });
      const linkNote = linkSummary
        ? ` · linked ${linkSummary.linked ?? 0}` +
          (linkSummary.ambiguous ? ` · ambiguous ${linkSummary.ambiguous}` : "") +
          (linkSummary.unmatched ? ` · unmatched ${linkSummary.unmatched}` : "")
        : "";
      toast.success(
        `Model saved to this project${created ? ` · ${created.toLocaleString()} pieces` : ""}${linkNote}.`,
      );
    } catch (err) {
      const message = describePersistFailure(step, err);
      console.error(`[Model3DTab] save failed at step "${step}":`, err);
      // What the banner may claim about the project comes from the import's
      // VERIFIED rollback outcome, via the same helper the message uses, so the
      // two can never contradict each other the way they did in the incident.
      const partial = persistLeftPartialWrite(step, err);
      setRoster({ step: "error", message, partial });
      toast.error(message);
      // The message talks about this project's piece count, so the tab must
      // stop serving its pre-save read of model_registry / the roster.
      if (step === "register") {
        qc.invalidateQueries({ queryKey: ["project-model", projectId] });
        await invalidatePieceControlQueries(qc, projectId, "import").catch(() => { /* offline: the message already says so */ });
      }
    }
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadErr(null); setRoster({ step: "idle" });
    resetViewerState();
    try {
      const buf = await file.arrayBuffer();
      setModelFile(file);
      setSource("picked");
      setFileName(file.name);
      setBuffer(buf);
    } catch (err) {
      setLoadErr(err?.message || String(err));
    }
  };

  const [removeConfirm, setRemoveConfirm] = useState(false);
  const removeModel = async () => {
    if (!projectId) return;
    try {
      await removeProjectModel(projectId);
      qc.invalidateQueries({ queryKey: ["project-model", projectId] });
      await invalidatePieceControlQueries(qc, projectId, "import");
      setBuffer(null); setModelFile(null); setSource(null); setFileName(null);
      setRoster({ step: "idle" }); setRemoveConfirm(false);
      resetViewerState();
      setMarkFallback(false);
      toast.success("Model removed from this project.");
    } catch (err) {
      toast.error("Couldn't remove the model: " + (err?.message || String(err)));
    }
  };

  const canonicalLogistics = useMutation({
    mutationFn: ({ action, pieceIds }) =>
      transitionPieceLots(action, projectId, pieceIds, { source: "3d_viewer" }),
    onSuccess: async (_, variables) => {
      await invalidatePieceControlQueries(qc, projectId, "logistics");
      const n = variables.pieceIds.length;
      toast.success(`${variables.label || variables.action} recorded for ${n.toLocaleString()} piece${n === 1 ? "" : "s"}.`);
    },
    onError: (error) => toast.error(presentPieceControlError(error, "Piece Control logistics action failed.")),
  });

  // ── Viewer-driven piece tracking ─────────────────────────────────────

  const runFind = (raw) => {
    const q = normalizePieceMark(raw);
    if (!q) { setFindResult(null); return; }
    const r = findGuidsByMark(q, markByGuid);
    setFindResult(r);
    if (r.guids.length) {
      viewerRef.current?.selectGuids(r.guids, { fly: true });
    }
  };

  const isolateBucket = (key, guids) => {
    if (!viewerRef.current) return;
    if (isolatedKey === key) {
      viewerRef.current.showAll();
      setIsolatedKey(null);
      return;
    }
    if (!guids?.length) return;
    viewerRef.current.isolate(guids);
    setIsolatedKey(key);
  };

  const isolateSelection = () => {
    if (!selectedGuids.length) return;
    viewerRef.current?.isolate(selectedGuids);
    setIsolatedKey("selection");
  };
  const hideSelection = () => {
    if (!selectedGuids.length) return;
    viewerRef.current?.hide(selectedGuids);
    setIsolatedKey((k) => k ?? "hidden");
  };
  const showAll = () => {
    viewerRef.current?.showAll();
    setIsolatedKey(null);
  };

  useEffect(() => {
    viewerRef.current?.setClipHeight(clipEnabled ? clipPct / 100 : null);
  }, [clipEnabled, clipPct, buffer]);

  const sequenceGuids = useMemo(() => {
    const m = new Map();
    for (const [guid, seq] of seqByGuid) {
      if (!m.has(seq)) m.set(seq, []);
      m.get(seq).push(guid);
    }
    return m;
  }, [seqByGuid]);

  const legend = useMemo(() => {
    const counts = modelMapping?.counts || {};
    const guidsByStatus = modelMapping?.guidsByStatus || {};
    return Object.entries(ELEMENT_STATUS_META)
      .map(([key, meta]) => ({ key, ...meta, count: counts[key] || 0, guids: guidsByStatus[key] || [] }))
      .filter((b) => b.count > 0);
  }, [modelMapping]);

  const registerHref = useMemo(() => {
    const base = createPageUrl("PieceRegister");
    if (selection.pieces.length === 1) return `${base}?piece=${encodeURIComponent(selection.pieces[0].id)}`;
    return base;
  }, [selection.pieces]);

  if (!buffer) {
    const loadingStored = !!storedModel?.file_url && !loadErr;
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, minHeight: 360, justifyContent: "center" }}>
        <div style={{ ...mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)" }}>
          3D Model
        </div>
        {loadingStored ? (
          <div style={{ ...mono, fontSize: 12, color: "var(--text-muted)" }}>Loading saved model…</div>
        ) : (
          <>
            <p style={{ margin: 0, maxWidth: 460, textAlign: "center", color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6 }}>
              Load an IFC export from your detailer (Tekla → IFC). It renders in the
              browser and colors each member by its fabrication status. Pieces stay
              clickable for their mark, sequence, and links.
            </p>
            <label className="sbd-btn sbd-btn-primary" style={{ cursor: "pointer" }}>
              Load IFC…
              <input type="file" accept=".ifc" hidden onChange={pickFile} />
            </label>
          </>
        )}
        {loadErr && (
          <div role="alert" style={{ color: "var(--status-error)", fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
            {loadErr}
            <label style={{ ...linkBtn, cursor: "pointer" }}>
              Load a file instead
              <input type="file" accept=".ifc" hidden onChange={pickFile} />
            </label>
          </div>
        )}
      </div>
    );
  }

  const filtering = !!isolatedKey;

  return (
    <div
      ref={containerRef}
      style={{ display: "flex", height: isFullscreen ? "100vh" : "min(72vh, 720px)", minHeight: 420, border: isFullscreen ? "none" : "1px solid var(--border-default)", borderRadius: isFullscreen ? 0 : 10, overflow: "hidden", background: "var(--bg-surface)" }}
    >
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <Suspense fallback={<LoadingSkeleton variant="page" />}>
          <IfcModelViewer
            ref={viewerRef}
            buffer={buffer}
            colorFor={colorFor}
            labelFor={labelFor}
            onPick={setPicked}
            onSelect={setSelectedGuids}
            measureMode={measureMode}
            onMeasure={setMeasureResult}
          />
        </Suspense>
        <div style={viewerTools}>
          <button type="button" onClick={toggleFullscreen} title={isFullscreen ? "Exit full screen" : "Full screen"} style={toolBtn}>
            {isFullscreen ? "Exit full screen" : "Full screen"}
          </button>
          <button
            type="button"
            onClick={toggleMeasure}
            aria-pressed={measureMode}
            title={measureMode ? "Exit measure (clear line)" : "Measure point-to-point distance"}
            style={{
              ...toolBtn,
              border: `1px solid ${measureMode ? "#f5d90a" : "var(--border-default)"}`,
              color: measureMode ? "#f5d90a" : "var(--text-secondary)",
              background: measureMode ? "rgba(245,217,10,0.12)" : "rgba(13,17,23,0.72)",
            }}
          >
            {measureMode ? "Measuring…" : "Measure"}
          </button>
          <button type="button" onClick={isolateSelection} disabled={!selectedGuids.length} title="Isolate selected parts — ghost everything else (I)" style={{ ...toolBtn, opacity: selectedGuids.length ? 1 : 0.5 }}>
            Isolate
          </button>
          <button type="button" onClick={hideSelection} disabled={!selectedGuids.length} title="Hide selected parts (H)" style={{ ...toolBtn, opacity: selectedGuids.length ? 1 : 0.5 }}>
            Hide
          </button>
          {filtering && (
            <button type="button" onClick={showAll} title="Show every part again (U)" style={{ ...toolBtn, color: "var(--accent)", border: "1px solid var(--accent)" }}>
              Show all
            </button>
          )}
          <label
            title="Level cut — hide everything above this height to look at one floor"
            style={{ ...toolBtn, display: "flex", alignItems: "center", gap: 8, padding: "4px 10px" }}
          >
            <input type="checkbox" checked={clipEnabled} onChange={(e) => setClipEnabled(e.target.checked)} style={{ margin: 0 }} />
            Level cut
            <input
              type="range" min={2} max={100} step={1} value={clipPct}
              disabled={!clipEnabled}
              onChange={(e) => setClipPct(Number(e.target.value))}
              aria-label="Level cut height"
              style={{ width: 90, opacity: clipEnabled ? 1 : 0.4 }}
            />
            {clipEnabled && <span style={{ minWidth: 34, textAlign: "right" }}>{clipPct}%</span>}
          </label>
        </div>

        {buffer && rosterLoading && (colorMode === "fab" || colorMode === "sequence" || colorMode === "status") && (
          <div style={loadingChip}>Loading {colorMode === "fab" ? "fab" : colorMode === "sequence" ? "sequence" : "status"} colors…</div>
        )}

        {source === "picked" && projectId && (
          <div style={saveBanner}>
            {(roster.step === "extracting" || roster.step === "saving") ? (
              <span style={{ ...mono, fontSize: 12, color: "var(--text-primary)" }}>
                {describePersistProgress(roster)}
              </span>
            ) : roster.step === "error" && roster.partial ? (
              // "Previewing — not saved yet" would be a second false claim here:
              // the roster write started and its undo is unconfirmed. Saving is
              // still offered — a completed save replaces every earlier roster.
              <>
                <span style={{ fontSize: 12.5, color: "var(--status-error)" }}>
                  Save didn't finish — this attempt may have left rows behind
                </span>
                <button className="sbd-btn sbd-btn-primary" style={{ padding: "6px 16px" }}
                  onClick={() => modelFile && buffer && persistModel(modelFile, buffer)}>
                  Save again
                </button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 12.5, color: "var(--text-primary)" }}>Previewing — not saved yet</span>
                <button className="sbd-btn sbd-btn-primary" style={{ padding: "6px 16px" }}
                  onClick={() => modelFile && buffer && persistModel(modelFile, buffer)}>
                  Save to this project
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <aside style={{ width: 290, flexShrink: 0, borderLeft: "1px solid var(--border-default)", background: "var(--bg-surface-low)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--divider)" }}>
          <div style={{ ...sectionHead, marginBottom: 0 }}>Model</div>
          <div style={{ fontSize: 12, color: "var(--text-primary)", marginTop: 2, wordBreak: "break-all" }}>{fileName}</div>
          <label style={{ ...mono, fontSize: 10, color: "var(--accent)", cursor: "pointer", display: "inline-block", marginTop: 6 }}>
            {source === "stored" ? "Replace with updated model…" : "Load a different model…"}
            <input type="file" accept=".ifc" hidden onChange={pickFile} />
          </label>

          {!projectId ? (
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
              Open a project to save the model.
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              {(roster.step === "extracting" || roster.step === "saving") && (
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                  {describePersistProgress(roster)}
                </div>
              )}

              {source === "picked" && roster.step === "idle" && (
                <>
                  <button className="sbd-btn sbd-btn-primary" style={{ width: "100%", justifyContent: "center" }}
                    onClick={() => modelFile && buffer && persistModel(modelFile, buffer)}>
                    Save model to this project
                  </button>
                  <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.5 }}>
                    Previewing — not saved yet. Saving keeps it here (auto-loads next time) + imports the piece roster.
                  </div>
                </>
              )}
              {source === "picked" && roster.step === "error" && (
                <div style={{ ...mono, fontSize: 10, color: "var(--status-error)", lineHeight: 1.5 }}>
                  {roster.message}{" "}
                  <button type="button" onClick={() => modelFile && buffer && persistModel(modelFile, buffer)} style={linkBtn}>Retry</button>
                </div>
              )}

              {source === "stored" && roster.step !== "extracting" && roster.step !== "saving" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ ...mono, fontSize: 10, color: "var(--status-success)" }}>✓ Saved to this project · auto-loads</div>
                  {removeConfirm ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ color: "var(--text-secondary)" }}>Remove model?</span>
                      <button type="button" onClick={removeModel} style={{ ...linkBtn, color: "var(--status-error)" }}>Remove</button>
                      <button type="button" onClick={() => setRemoveConfirm(false)} style={linkBtn}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setRemoveConfirm(true)} style={{ ...linkBtn, alignSelf: "flex-start" }}>Remove model</button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--divider)" }}>
          <div style={sectionHead}>Find mark</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="search"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runFind(findQuery); }}
              placeholder={hasRoster ? "e.g. 1B12 or C4" : "Save the model first"}
              disabled={!hasRoster}
              aria-label="Find piece mark"
              style={{
                flex: 1, minWidth: 0, padding: "6px 9px", borderRadius: 7,
                border: "1px solid var(--border-default)", background: "var(--bg-surface)",
                color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 12,
              }}
            />
            <button type="button" className="sbd-btn" disabled={!hasRoster || !findQuery.trim()} onClick={() => runFind(findQuery)} style={{ padding: "6px 10px" }}>
              Go
            </button>
          </div>
          {findResult && (
            <div style={{ ...mono, fontSize: 10, marginTop: 6, lineHeight: 1.5, color: findResult.guids.length ? "var(--text-secondary)" : "var(--status-warning)" }}>
              {findResult.guids.length
                ? `${findResult.guids.length.toLocaleString()} part${findResult.guids.length === 1 ? "" : "s"} · ${findResult.marks.length} mark${findResult.marks.length === 1 ? "" : "s"}${findResult.matchKind !== "exact" ? ` (${findResult.matchKind} match)` : ""} — selected + framed`
                : `No mark matches "${findResult.query}" in this model.`}
              {findResult.guids.length > 0 && (
                <>
                  {" · "}
                  <button type="button" style={linkBtn} onClick={() => isolateBucket(`find:${findResult.query}`, findResult.guids)}>
                    {isolatedKey === `find:${findResult.query}` ? "show all" : "isolate"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--divider)" }}>
          <div style={sectionHead}>Color by</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {COLOR_MODES.map((m) => {
              const active = colorMode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setColorMode(m.key)}
                  style={{
                    padding: "5px 10px", borderRadius: 7, cursor: "pointer",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border-default)"}`,
                    background: active ? "color-mix(in srgb, var(--accent) 16%, var(--bg-surface-high))" : "var(--bg-surface-low)",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                    fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                    letterSpacing: "0.05em", textTransform: "uppercase",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          {colorMode === "model" && canonicalPieceByGuid.size > 0 && (
            <div style={{ ...hintStyle, marginTop: 8 }}>
              Switch to Fab to paint linked lots by Piece Control lifecycle.
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Legend
              mode={colorMode}
              statusLegend={legend}
              fabLegend={fabLegend}
              sequences={[...sequenceGuids.keys()].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))}
              sequenceGuids={sequenceGuids}
              isolatedKey={isolatedKey}
              onIsolate={isolateBucket}
              markFallback={markFallback}
              onMarkFallback={setMarkFallback}
            />
          </div>
          {projectId && hasRoster && (
            <Model3dSyncPanel projectId={projectId} modelElementRows={modelElementRows} />
          )}
        </div>

        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--divider)" }}>
          <div style={sectionHead}>
            Selected{selection.count ? ` · ${describeSelection(selection)}` : ""}
          </div>
          {selection.count === 0 ? (
            <div style={hintStyle}>
              Click a part. Ctrl / Shift-click adds, Alt-click grabs the whole mark. Hover shows the mark.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
              {selection.count === 1 ? (
                <>
                  <Row label="Assembly" value={picked?.assemblyMark || selection.marks[0]} strong />
                  <Row label="Part" value={picked?.partMark} />
                  <Row label="Name" value={picked?.name} />
                  <Row label="Sequence" value={picked?.sequence || selection.sequences[0]} />
                  <Row label="GUID" value={picked?.guid || selection.guids[0]} small />
                </>
              ) : (
                <>
                  <Row label="Marks" value={selection.marks.slice(0, 8).join(", ") + (selection.marks.length > 8 ? ` +${selection.marks.length - 8}` : "")} strong />
                  {selection.sequences.length > 0 && <Row label="Sequence" value={selection.sequences.join(", ")} />}
                </>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button type="button" style={linkBtn} onClick={() => viewerRef.current?.fitToGuids(selectedGuids)}>Frame</button>
                <span style={{ color: "var(--text-muted)" }}>·</span>
                <button type="button" style={linkBtn} onClick={isolateSelection}>Isolate</button>
                <span style={{ color: "var(--text-muted)" }}>·</span>
                <button type="button" style={linkBtn} onClick={hideSelection}>Hide</button>
                <span style={{ color: "var(--text-muted)" }}>·</span>
                <button type="button" style={linkBtn} onClick={() => viewerRef.current?.clearSelection()}>Clear</button>
              </div>
            </div>
          )}
        </div>

        {projectId && (
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--divider)" }}>
            <div style={sectionHead}>Piece Control</div>
            {!hasRoster ? (
              <div style={hintStyle}>Save the model to import its piece roster, then link marks to the Piece Register.</div>
            ) : selection.count === 0 ? (
              <div style={hintStyle}>
                Select parts to see their Piece Register status and record ship / deliver / erect.
              </div>
            ) : (
              <PieceControlPanel
                selection={selection}
                registerHref={registerHref}
                pending={canonicalLogistics.isPending}
                onAction={(a) => canonicalLogistics.mutate({ action: a.action, pieceIds: a.pieceIds, label: a.label })}
              />
            )}
          </div>
        )}

        <div style={{ padding: "12px 14px" }}>
          <div style={sectionHead}>Measure</div>
          {measureMode ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {measureResult?.phase === "done" && measureResult?.ftIn ? (
                <>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#f5d90a", fontFamily: "var(--font-mono)" }}>
                    {measureResult.ftIn}
                  </div>
                  <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>
                    {measureResult.decimalFeet != null ? `${measureResult.decimalFeet.toFixed(3)} ft` : ""}
                    {measureResult.meters != null ? ` · ${measureResult.meters.toFixed(3)} m` : ""}
                  </div>
                  <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", lineHeight: 1.5 }}>
                    Nearest 1/16″. Click two more points for a new measure. Toggle Measure off to clear.
                  </div>
                </>
              ) : measureResult?.phase === "a" ? (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  First point set{measureResult.snappedA ? " (vertex snap)" : ""}. Click the second point.
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  Click two points on the model. Ends snap to nearest vertices or edges (~2″). Result rounds to 1/16″.
                </div>
              )}
              <button
                type="button"
                onClick={() => setMeasureMode(false)}
                style={{ ...linkBtn, alignSelf: "flex-start", marginTop: 2 }}
              >
                Exit measure
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={hintStyle}>
                Point-to-point distance with vertex/edge snap. Displayed to the nearest 1/16″.
              </div>
              <button type="button" onClick={() => setMeasureMode(true)} className="sbd-btn" style={{ alignSelf: "flex-start" }}>
                Start measure
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function PieceControlPanel({ selection, registerHref, pending, onAction }) {
  const { pieces, linkedCount, unlinkedCount, holdCount, lifecycle, actions } = selection;
  const single = pieces.length === 1 ? pieces[0] : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
      {pieces.length === 0 ? (
        <div style={hintStyle}>
          {unlinkedCount.toLocaleString()} selected part{unlinkedCount === 1 ? " isn't" : "s aren't"} linked to a
          Piece Register lot. Run <strong>Sync marks</strong> above, or add the mark in the register.
        </div>
      ) : (
        <>
          {single ? (
            <>
              <Row label="Lot" value={`${single.piece_mark || selection.marks[0] || "—"}${single.lot_code ? ` · ${single.lot_code}` : ""}`} strong />
              <Row label="Status" value={single.on_hold ? `On Hold · ${pieceLifecycleLabel(single.lifecycle_status || "")}` : pieceLifecycleLabel(single.lifecycle_status || "")} />
              {single.on_hold && single.on_hold_reason && <Row label="Hold" value={single.on_hold_reason} />}
            </>
          ) : (
            <>
              <Row label="Lots" value={`${pieces.length.toLocaleString()} linked${unlinkedCount ? ` · ${unlinkedCount} unlinked part${unlinkedCount === 1 ? "" : "s"}` : ""}`} strong />
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {lifecycle.map((l) => (
                  <div key={l.key} style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                    <span>{l.label}</span>
                    <span style={mono}>{l.count}</span>
                  </div>
                ))}
                {holdCount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--status-error)" }}>
                    <span>On hold</span>
                    <span style={mono}>{holdCount}</span>
                  </div>
                )}
              </div>
            </>
          )}
          {linkedCount > 0 && unlinkedCount > 0 && single && (
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
              {unlinkedCount} selected part{unlinkedCount === 1 ? "" : "s"} not linked to a lot.
            </div>
          )}
          <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
            {actions.map((a) => (
              <button
                key={a.action}
                type="button"
                disabled={!a.enabled || pending}
                title={a.enabled ? `Record ${a.label.toLowerCase()} for ${a.pieceIds.length} lot${a.pieceIds.length === 1 ? "" : "s"}` : a.reason}
                onClick={() => a.enabled && onAction(a)}
                className={a.enabled ? "sbd-btn sbd-btn-primary" : "sbd-btn"}
                style={{ flex: 1, justifyContent: "center", padding: "6px 4px", opacity: a.enabled && !pending ? 1 : 0.5, cursor: a.enabled && !pending ? "pointer" : "not-allowed" }}
              >
                {pending && a.enabled ? "…" : a.label}
              </button>
            ))}
          </div>
          {!actions.some((a) => a.enabled) && (
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", lineHeight: 1.4 }}>
              {actions[0].reason?.startsWith("No linked")
                ? actions[0].reason
                : holdCount
                  ? "Release the hold in the Piece Register before recording logistics."
                  : "Station progress is recorded in the Piece Register; the 3D view records ship, deliver and erect once every selected lot is at the prior stage."}
            </div>
          )}
        </>
      )}
      <a href={registerHref} style={{ ...mono, fontSize: 10, color: "var(--accent)" }}>
        Open in Piece Register →
      </a>
    </div>
  );
}

function Row({ label, value, strong, small }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", width: 64, flexShrink: 0, textTransform: "uppercase" }}>{label}</span>
      <span style={{ color: value ? "var(--text-primary)" : "var(--text-muted)", fontWeight: strong ? 700 : 400, fontSize: small ? 10 : 12, ...(small ? mono : {}), wordBreak: "break-all" }}>
        {value || "—"}
      </span>
    </div>
  );
}

function Swatch({ color, label, count, active, onClick, title }) {
  const clickable = typeof onClick === "function";
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      title={title}
      aria-pressed={clickable ? !!active : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 8, fontSize: 12, width: "100%",
        padding: "3px 5px", margin: "0 -5px", borderRadius: 6, textAlign: "left",
        border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
        background: active ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
        color: "inherit", cursor: clickable ? "pointer" : "default", font: "inherit",
      }}
    >
      <span style={{ width: 11, height: 11, borderRadius: 2, background: color || "transparent", border: color ? "none" : "1px dashed var(--text-muted)", flexShrink: 0 }} />
      <span style={{ color: "var(--text-secondary)", flex: 1 }}>{label}</span>
      {count != null && <span style={{ ...mono, color: "var(--text-muted)", fontSize: 11 }}>{count.toLocaleString()}</span>}
    </button>
  );
}

function Legend({ mode, statusLegend, fabLegend, sequences, sequenceGuids, isolatedKey, onIsolate, markFallback, onMarkFallback }) {
  const isolateHint = <div style={{ ...hintStyle, fontSize: 10, marginTop: 4 }}>Click a row to isolate those parts; click again to show all.</div>;
  if (mode === "type") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {TYPE_LABELS.map(([k, l]) => <Swatch key={k} color={TYPE_PALETTE[k]} label={l} />)}
      </div>
    );
  }
  if (mode === "sequence") {
    if (!sequences.length) return <div style={hintStyle}>Import the piece roster to color by erection sequence.</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {sequences.slice(0, 24).map((s) => (
          <Swatch
            key={s}
            color={seqColor(s)}
            label={`Seq ${s}`}
            count={sequenceGuids.get(s)?.length}
            active={isolatedKey === `seq:${s}`}
            onClick={() => onIsolate(`seq:${s}`, sequenceGuids.get(s))}
            title="Isolate this erection sequence"
          />
        ))}
        {sequences.length > 24 && <div style={hintStyle}>+{sequences.length - 24} more</div>}
        {isolateHint}
      </div>
    );
  }
  if (mode === "status") {
    if (!statusLegend.length) return <div style={hintStyle}>No detailing status yet — pieces light up once they're linked to detailing packages. (For shop status, use the Fab mode.)</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {statusLegend.map((b) => (
          <Swatch
            key={b.key}
            color={b.color}
            label={b.label}
            count={b.count}
            active={isolatedKey === `status:${b.key}`}
            onClick={b.guids.length ? () => onIsolate(`status:${b.key}`, b.guids) : undefined}
            title={b.guids.length ? "Isolate these parts" : "No parts with a model GUID in this bucket"}
          />
        ))}
        {isolateHint}
      </div>
    );
  }
  if (mode === "fab") {
    const shown = fabLegend.filter((b) => b.count > 0);
    if (!shown.length) return <div style={hintStyle}>Save the model to import its roster, then Sync marks to paint Piece Register lifecycle.</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {shown.map((b) => (
          <Swatch
            key={b.key}
            color={b.color}
            label={b.label}
            count={b.count}
            active={isolatedKey === `fab:${b.key}`}
            onClick={() => onIsolate(`fab:${b.key}`, b.guids)}
            title={b.key === "unlinked" ? "Isolate parts with no Piece Register link or status" : `Isolate ${b.label} parts`}
          />
        ))}
        {isolateHint}
        <label style={{ ...hintStyle, fontSize: 10, display: "flex", alignItems: "center", gap: 6, marginTop: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={markFallback} onChange={(e) => onMarkFallback(e.target.checked)} style={{ margin: 0 }} />
          Fill unlinked parts from their mark's legacy status
        </label>
      </div>
    );
  }
  return <div style={hintStyle}>Showing the model's own (Tekla) member colors.</div>;
}
