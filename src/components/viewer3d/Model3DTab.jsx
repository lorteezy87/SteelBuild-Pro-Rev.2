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
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { normalizePieceMark } from "@/services/modelElementStatus";
import { findGuidsByMark, describeSelection } from "@/lib/ifc/viewerSelection";
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
import Model3dSyncPanel from "@/components/viewer3d/Model3dSyncPanel";
import { useCanonicalReportingRealtime } from "@/hooks/useCanonicalReportingRealtime";
import {
  buildModel3DDisplayedClaims,
  buildModel3DViewModel,
} from "@/components/viewer3d/model3dTabDerive";
import { useModel3DInteractionState } from "@/components/viewer3d/useModel3DInteractionState";
import {
  Model3DLegend,
  Model3DRow,
  PieceControlPanel,
} from "@/components/viewer3d/Model3DTabViews";

import "./viewerControls.css";

const IfcModelViewer = lazy(() => import("@/components/viewer3d/IfcModelViewer"));

const mono = { fontFamily: "var(--font-mono)" };

const COLOR_MODES = [
  { key: "model", label: "Model" },
  { key: "fab", label: "Fab" },
  { key: "type", label: "Type" },
  { key: "sequence", label: "Sequence" },
  { key: "status", label: "Detailing" },
];
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

export default function Model3DTab(props) {
  return <ProjectModel3DTab key={props.projectId || "no-project"} {...props} />;
}

function ProjectModel3DTab({ modelMapping, modelElementRows, projectId, rosterLoading, rosterError }) {
  const qc = useQueryClient();
  useCanonicalReportingRealtime(projectId);
  const [buffer, setBuffer] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [modelFile, setModelFile] = useState(null);
  const [source, setSource] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [roster, setRoster] = useState({ step: "idle" });
  const {
    viewerRef, containerRef, picked, setPicked, selectedGuids, setSelectedGuids,
    colorStats, setColorStats, colorMode, setColorMode, markFallback, setMarkFallback,
    isFullscreen, measureMode, setMeasureMode, measureResult, setMeasureResult,
    isolatedKey, findQuery, setFindQuery, findResult, setFindResult,
    clipEnabled, setClipEnabled, clipPct, setClipPct, resetViewerState,
    toggleFullscreen, toggleMeasure, isolateBucket, isolateSelection, hideSelection, showAll,
  } = useModel3DInteractionState(projectId);

  const { data: storedModel, error: storedModelError } = useQuery({
    queryKey: ["project-model", projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
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
      if (error) throw error;
      return data || null;
    },
  });

  const { data: canonicalPieces = [], isPending: piecesLoading, error: piecesError, refetch: refetchPieces } = useQuery({
    queryKey: pieceControlKeys.canonicalPieces3d(projectId),
    enabled: !!projectId,
    // Live model_elements events refresh linked changes. Poll the slim piece
    // projection too: some deployments don't publish pieces, and a new split
    // lot can change mark ambiguity without touching an existing model row.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // Paged: this is the join the Fab color mode paints from, and a bare
    // select silently dropped every lot past row 1000 on big jobs.
    queryFn: () =>
      fetchAllProjectRowsPaged(supabase, "pieces", projectId, {
        select: "id,parent_piece_id,piece_mark,lot_code,lifecycle_status,on_hold,on_hold_reason,is_container,is_deleted,deleted_at,work_package_id",
        build: (query) => query.eq("is_deleted", false).is("deleted_at", null),
        onTruncated: () => { throw new Error("Piece evidence exceeded the paging limit."); },
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

  const viewModel = useMemo(
    () => buildModel3DViewModel({
      projectId,
      modelMapping,
      modelElementRows,
      canonicalPieces,
      selectedGuids,
      colorMode,
      markFallback,
      piecesLoading,
      piecesError,
      rosterLoading,
      rosterError,
      colorStats: null,
    }),
    [
      projectId, modelMapping, modelElementRows, canonicalPieces, selectedGuids,
      colorMode, markFallback, piecesLoading, piecesError, rosterLoading,
      rosterError,
    ],
  );
  const {
    hasRoster, evidenceError, fabUnavailable, markByGuid, canonicalPieceByGuid,
    canonicalDisplayByGuid, colorFor, fabLegend, selection, sequenceGuids,
    sequences, statusLegend, registerHref,
  } = viewModel;
  const claims = useMemo(
    () => buildModel3DDisplayedClaims({
      colorMode,
      colorStats,
      evidenceError,
      evidencePending: fabUnavailable && !evidenceError,
      hasRoster,
      directLinkCount: canonicalPieceByGuid.size,
      displayLinkCount: canonicalDisplayByGuid.size,
    }),
    [
      colorMode, colorStats, evidenceError, fabUnavailable, hasRoster,
      canonicalPieceByGuid, canonicalDisplayByGuid,
    ],
  );

  // Hover label / alt-click "whole mark": the roster's assembly mark by GUID.
  const labelFor = useCallback((guid) => markByGuid.get(guid) || null, [markByGuid]);

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
    mutationFn: ({ action, pieceIds }) => {
      if (fabUnavailable) throw new Error("Refresh piece and roster status before recording logistics.");
      return transitionPieceLots(action, projectId, pieceIds, { source: "3d_viewer" });
    },
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

  useEffect(() => {
    viewerRef.current?.setClipHeight(clipEnabled ? clipPct / 100 : null);
  }, [clipEnabled, clipPct, buffer]);

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
        {(loadErr || storedModelError) && (
          <div role="alert" style={{ color: "var(--status-error)", fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
            {loadErr || "Saved model lookup failed. Retry by reopening the 3D tab."}
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
      className="model-3d-shell"
      style={{ display: "flex", height: isFullscreen ? "100vh" : "min(72vh, 720px)", minHeight: 420, border: isFullscreen ? "none" : "1px solid var(--border-default)", borderRadius: isFullscreen ? 0 : 10, overflow: "hidden", background: "var(--bg-surface)" }}
    >
      <div className="model-3d-canvas" style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <Suspense fallback={<LoadingSkeleton variant="page" />}>
          <IfcModelViewer
            ref={viewerRef}
            buffer={buffer}
            colorFor={colorFor}
            labelFor={labelFor}
            onPick={setPicked}
            onSelect={setSelectedGuids}
            onColorStats={setColorStats}
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

        {buffer && claims.loadingColorLabel && (
          <div style={loadingChip}>Loading {claims.loadingColorLabel} colors…</div>
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

      <aside className="model-3d-sidebar" style={{ width: 290, flexShrink: 0, borderLeft: "1px solid var(--border-default)", background: "var(--bg-surface-low)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
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
              placeholder={claims.findPlaceholder}
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
          {colorMode === "fab" && (
            <div style={{ ...hintStyle, marginTop: 8 }} role={evidenceError ? "alert" : "status"}>
              {claims.fabCoverage}
              {evidenceError && <> <button type="button" style={linkBtn} onClick={() => { void refetchPieces(); void qc.invalidateQueries({ queryKey: pieceControlKeys.modelElements(projectId) }); }}>Retry status</button></>}
              {!fabUnavailable && claims.inferredLinkCount > 0 && <div>Matching-mark colors are inferred from one linked lot. Logistics requires an explicit part link.</div>}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            {!(colorMode === "fab" && fabUnavailable) && <Model3DLegend
              mode={colorMode}
              statusLegend={statusLegend}
              fabLegend={fabLegend}
              sequences={sequences}
              sequenceGuids={sequenceGuids}
              isolatedKey={isolatedKey}
              onIsolate={isolateBucket}
              markFallback={markFallback}
              onMarkFallback={setMarkFallback}
            />}
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
                  <Model3DRow label="Assembly" value={picked?.assemblyMark || selection.marks[0]} strong />
                  <Model3DRow label="Part" value={picked?.partMark} />
                  <Model3DRow label="Name" value={picked?.name} />
                  <Model3DRow label="Sequence" value={picked?.sequence || selection.sequences[0]} />
                  <Model3DRow label="GUID" value={picked?.guid || selection.guids[0]} small />
                </>
              ) : (
                <>
                  <Model3DRow label="Marks" value={selection.marks.slice(0, 8).join(", ") + (selection.marks.length > 8 ? ` +${selection.marks.length - 8}` : "")} strong />
                  {selection.sequences.length > 0 && <Model3DRow label="Sequence" value={selection.sequences.join(", ")} />}
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
            {fabUnavailable ? (
              <div style={hintStyle}>Piece Control unavailable until piece and roster status loads successfully.</div>
            ) : !hasRoster ? (
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
