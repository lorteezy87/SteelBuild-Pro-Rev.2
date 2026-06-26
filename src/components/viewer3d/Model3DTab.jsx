/**
 * Model3DTab — the Detailing Control Center "3D Model" tab. Hosts the lazy IFC
 * viewer, builds the GlobalId→status color map from the page's existing
 * `modelMapping` read-model (summarizeElementStatuses.guidsByStatus), and shows a
 * status legend + a click-to-identify panel.
 *
 * Slice 1: the IFC is loaded from a local file the user picks (proves the render
 * + coloring + picking end to end). Slice 2 swaps the file picker for upload →
 * Storage + roster → model_elements, so the model persists per project.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ELEMENT_STATUS_META, normalizePieceMark } from "@/services/modelElementStatus";
import { FAB_STATUS_META, FAB_STATUS_ORDER, resolveFabAssignment } from "@/lib/fabStatus";
import { TYPE_PALETTE, seqColor, buildStatusByGuid, buildSeqByGuid, buildFabByGuid, buildMarkByGuid, buildStatusByMark, buildSeqByMark, buildFabByMark, colorFnFor } from "@/lib/ifc/viewerColoring";
import { extractIfcRoster } from "@/lib/ifc/extractIfcRoster";
import { gzipBuffer, gunzipBuffer } from "@/lib/ifc/gzip";
import { importIfcRoster, removeProjectModel } from "@/services/ifcRosterImport";
import { integrations, resolveFileUrl } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

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

const fsBtn = {
  position: "absolute", top: 10, left: 10, padding: "6px 12px", borderRadius: 8,
  border: "1px solid var(--border-default)", background: "rgba(13,17,23,0.72)",
  color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 11,
  fontWeight: 700, letterSpacing: "0.05em", cursor: "pointer", zIndex: 2,
};

const linkBtn = {
  background: "none", border: "none", color: "var(--accent)", cursor: "pointer",
  textDecoration: "underline", font: "inherit", padding: 0,
};

const saveBanner = {
  position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 3,
  display: "flex", alignItems: "center", gap: 12, padding: "8px 10px 8px 16px",
  borderRadius: 999, background: "color-mix(in srgb, var(--accent) 20%, rgba(13,17,23,0.92))",
  border: "1px solid color-mix(in srgb, var(--accent) 55%, transparent)",
  boxShadow: "0 6px 24px rgba(0,0,0,0.4)", whiteSpace: "nowrap",
};

const loadingChip = {
  position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 3,
  display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999,
  background: "rgba(13,17,23,0.82)", border: "1px solid var(--border-default)",
  color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 11,
  fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "nowrap", boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
};

export default function Model3DTab({ modelMapping, modelElementRows, projectId, rosterLoading }) {
  const qc = useQueryClient();
  const [buffer, setBuffer] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [modelFile, setModelFile] = useState(null); // the picked File (for upload)
  const [source, setSource] = useState(null);        // null | "picked" | "stored"
  const [picked, setPicked] = useState(null);
  const [selectedGuids, setSelectedGuids] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  // Persisted so the view (e.g. "Fab") survives leaving + returning to the tab —
  // otherwise it resets to native colors and looks like the statuses "erased".
  const [colorMode, setColorMode] = useState(() => {
    try { return localStorage.getItem("sbp:viewer-colormode") || "model"; } catch { return "model"; }
  });
  useEffect(() => {
    try { localStorage.setItem("sbp:viewer-colormode", colorMode); } catch { /* ignore */ }
  }, [colorMode]);
  // Roster import: idle | extracting | confirm | importing | done
  const [roster, setRoster] = useState({ step: "idle" });

  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // Auto-load the project's stored model (slice 2b) so the tab opens without
  // re-picking. A freshly-picked file takes precedence over the stored one.
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

  useEffect(() => {
    if (!storedModel?.file_url || buffer || source === "picked") return;
    let cancelled = false;
    (async () => {
      try {
        const url = await resolveFileUrl(storedModel.file_url);
        if (!url) return;
        const res = await fetch(url);
        let buf = await res.arrayBuffer();
        // Inflate gzipped models (newer uploads are stored `<name>.gz`); older
        // uncompressed `.ifc` models load as-is.
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

  // GlobalId → color maps from the page's data (logic + tests in viewerColoring).
  const statusByGuid = useMemo(() => buildStatusByGuid(modelMapping), [modelMapping]);
  const seqByGuid = useMemo(() => buildSeqByGuid(modelElementRows), [modelElementRows]);
  // Optimistic fab colors: applied the instant you assign a status, so the model
  // recolors immediately instead of waiting on a slow (12k-row) refetch. guid → status.
  const [optimisticFab, setOptimisticFab] = useState(() => new Map());
  // Optimistic mark-wide fab assignments (whole-assembly mode only). Kept SEPARATE
  // from optimisticFab so a per-piece assign never leaks onto the mark map and
  // bleeds color onto same-mark siblings. mark → status.
  const [optimisticFabByMark, setOptimisticFabByMark] = useState(() => new Map());
  // Assign scope: "piece" (per-GUID, default) flips only the clicked piece(s);
  // "assembly" (per-mark) flips every part sharing the clicked piece's mark.
  const [fabScope, setFabScope] = useState("piece");
  const fabByGuid = useMemo(() => {
    const map = buildFabByGuid(modelElementRows);
    for (const [guid, status] of optimisticFab) {
      if (status) map.set(guid, status); else map.delete(guid);
    }
    return map;
  }, [modelElementRows, optimisticFab]);
  const hasRoster = (modelElementRows?.length || 0) > 0;
  const guidToMark = useMemo(() => {
    const m = new Map();
    for (const r of modelElementRows || []) if (r?.element_guid) m.set(r.element_guid, r.piece_mark);
    return m;
  }, [modelElementRows]);

  // Mark-keyed fallback maps: color a part by its piece mark when its GUID isn't
  // directly on a roster row (CSV imports leave element_guid NULL; a CSV update
  // touches only one part of a multi-part assembly). markByGuid bridges the
  // rendered part's GUID → its normalized mark. (guidToMark above stays RAW —
  // it feeds the DB `.in("piece_mark", …)` query, which needs the real marks.)
  const markByGuid = useMemo(() => buildMarkByGuid(modelElementRows), [modelElementRows]);
  const seqByMark = useMemo(() => buildSeqByMark(modelElementRows), [modelElementRows]);
  const statusByMark = useMemo(() => buildStatusByMark(modelMapping), [modelMapping]);
  const fabByMark = useMemo(() => {
    const map = buildFabByMark(modelElementRows);
    // Mirror only WHOLE-ASSEMBLY optimistic assignments onto the mark map, so a
    // mark-wide assign colors the whole assembly immediately. Per-piece assigns
    // live in optimisticFab (guid-keyed) ONLY and must not touch the mark map —
    // otherwise one piece's status would bleed onto its same-mark siblings.
    for (const [mark, status] of optimisticFabByMark) {
      const mk = normalizePieceMark(mark);
      if (!mk) continue;
      if (status) map.set(mk, status); else map.delete(mk);
    }
    return map;
  }, [modelElementRows, optimisticFabByMark]);

  // The mode-aware color function the viewer paints with (null → native IFC color).
  const colorFor = useMemo(
    () => colorFnFor(colorMode, {
      statusByGuid, seqByGuid, fabByGuid,
      markByGuid, statusByMark, seqByMark, fabByMark,
      // Per-piece coloring: a roster GUID with no individual fab status stays
      // neutral instead of inheriting a same-mark sibling's color. Whole-assembly
      // mode keeps the broad mark fallback so flipping a mark paints every part.
      perPieceFab: fabScope === "piece",
    }),
    [colorMode, statusByGuid, seqByGuid, fabByGuid, markByGuid, statusByMark, seqByMark, fabByMark, fabScope],
  );

  // Persist a freshly-picked model so it auto-loads next time: upload the .ifc to
  // Storage + write model_registry (file_url) + the piece roster (model_elements).
  // Runs automatically on load — no separate "import" step — and doesn't block the
  // render (the viewer already has the local buffer).
  const persistModel = async (file, buf) => {
    if (!projectId) return; // render-only outside a project
    setRoster({ step: "extracting", done: 0, total: 0 });
    try {
      const result = await extractIfcRoster(buf, (done, total) =>
        setRoster({ step: "extracting", done, total }),
      );
      // Guard the silent zero: if the IFC has no IfcBeam/Column/Plate/Member, both
      // the geometry render and the roster come back empty (the viewer also skips
      // non-structural types). That happens when the model is a reference/proxy
      // export (members as IfcBuildingElementProxy). Saving it persists an empty,
      // uncolorable model with a success toast — confusing. Stop and tell the user
      // the real cause instead, and let them load a corrected export.
      if (!result.rows.length) {
        setRoster({ step: "idle" });
        toast.warning(
          "No structural members found — this IFC has no beams, columns, plates, or members " +
          "(it looks like a reference/proxy export). Re-export from your detailer with structural " +
          "members, then load it again.",
        );
        return;
      }
      setRoster({ step: "saving" });
      // gzip the IFC before upload so large models (50 MB+) fit under the storage
      // bucket limit and download faster. The stored object is `<name>.gz`; the
      // auto-loader detects that suffix and inflates. Falls back to the raw file
      // if the browser lacks CompressionStream.
      let uploadFile = file;
      const gz = await gzipBuffer(buf).catch(() => null);
      if (gz) uploadFile = new File([gz], `${file.name}.gz`);
      const up = await integrations.Core.UploadFile({ file: uploadFile });
      const { created } = await importIfcRoster({
        projectId, fileName: file.name, schema: result.schema, fileUrl: up.path, rows: result.rows,
      });
      qc.invalidateQueries({ queryKey: ["model-elements", projectId] });
      qc.invalidateQueries({ queryKey: ["project-model", projectId] });
      setSource("stored");
      setRoster({ step: "done", created });
      toast.success(`Model saved to this project${created ? ` · ${created.toLocaleString()} pieces` : ""}.`);
    } catch (err) {
      setRoster({ step: "error", message: err?.message || String(err) });
      toast.error("Couldn't save the model: " + (err?.message || String(err)));
    }
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadErr(null); setPicked(null); setRoster({ step: "idle" });
    try {
      const buf = await file.arrayBuffer();
      setModelFile(file);
      setSource("picked");       // a local preview — not saved until the user clicks Save
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
      qc.invalidateQueries({ queryKey: ["model-elements", projectId] });
      qc.invalidateQueries({ queryKey: ["project-model", projectId] });
      setBuffer(null); setModelFile(null); setSource(null); setFileName(null);
      setPicked(null); setRoster({ step: "idle" }); setRemoveConfirm(false);
      setOptimisticFab(new Map()); setOptimisticFabByMark(new Map());
      toast.success("Model removed from this project.");
    } catch (err) {
      toast.error("Couldn't remove the model: " + (err?.message || String(err)));
    }
  };

  // Manual fab-status assignment. Two scopes:
  //  - guid: per-piece — UPDATE only the selected element_guid(s), so only the
  //    clicked piece changes (siblings sharing the mark are untouched).
  //  - mark: whole-assembly (or guid-less fallback) — UPDATE every row sharing
  //    the piece_mark, flipping the whole assembly.
  // Null status clears the stage.
  const assignFab = useMutation({
    mutationFn: async ({ mode, guids, marks, status }) => {
      let query = supabase
        .from("model_elements")
        .update({ fab_status: status })
        .eq("project_id", projectId)
        .eq("is_deleted", false);
      query = mode === "guid"
        ? query.in("element_guid", guids)
        : query.in("piece_mark", marks);
      const { error } = await query;
      if (error) throw error;
      return { mode, guids, marks, status };
    },
    onSuccess: ({ mode, guids, marks, status }) => {
      // Recolor NOW, scoped to match the write, so colors flip immediately
      // without waiting on the (12k-row) refetch.
      if (mode === "guid") {
        // Per-piece: only the assigned GUID(s). Do NOT touch the mark map, so
        // same-mark siblings keep their own (often native) color.
        setOptimisticFab((prev) => {
          const next = new Map(prev);
          for (const g of guids) next.set(g, status);
          return next;
        });
      } else {
        // Whole-assembly: mirror onto the mark map (colors every part of the
        // mark) AND set the loaded GUIDs of those marks so they paint at once.
        const markSet = new Set(marks.map((m) => normalizePieceMark(m)));
        setOptimisticFabByMark((prev) => {
          const next = new Map(prev);
          for (const m of marks) next.set(normalizePieceMark(m), status);
          return next;
        });
        setOptimisticFab((prev) => {
          const next = new Map(prev);
          for (const r of modelElementRows || []) {
            if (r?.element_guid && markSet.has(normalizePieceMark(r.piece_mark))) next.set(r.element_guid, status);
          }
          for (const g of selectedGuids) next.set(g, status);
          return next;
        });
      }
      setColorMode("fab");
      qc.invalidateQueries({ queryKey: ["model-elements", projectId] });
      const n = mode === "guid" ? guids.length : marks.length;
      const unit = mode === "guid" ? "piece" : "mark";
      toast.success(status
        ? `${n} ${unit}${n === 1 ? "" : "s"} → ${FAB_STATUS_META[status].label}`
        : "Fab status cleared");
    },
    onError: (e) => toast.error(e?.message || "Couldn't set fab status."),
  });

  // Assign a status to the current selection at the chosen scope. Per-piece
  // targets the selected GUID(s) directly; whole-assembly (or a guid-less piece
  // in per-piece mode) targets the piece mark(s).
  const setFab = (status) => {
    const target = resolveFabAssignment({ scope: fabScope, picked, selectedGuids, guidToMark });
    if (target.mode === "none") {
      toast.error(selectedGuids.length
        ? "This piece has no roster row or Assembly/Part mark to set a status on."
        : "Select a piece first.");
      return;
    }
    if (target.fellBackToMark) {
      // Per-piece couldn't scope by GUID (CSV roster / re-exported model) — be
      // explicit that this flips the whole mark instead of just the clicked part.
      toast.info("This piece isn't matched to the model by GlobalId, so the status applies to its whole mark.");
    }
    assignFab.mutate({ mode: target.mode, guids: target.guids, marks: target.marks, status });
  };

  const legend = useMemo(() => {
    const counts = modelMapping?.counts || {};
    return Object.entries(ELEMENT_STATUS_META)
      .map(([key, meta]) => ({ key, ...meta, count: counts[key] || 0 }))
      .filter((b) => b.count > 0);
  }, [modelMapping]);

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
        {loadErr && <div role="alert" style={{ color: "var(--status-error)", fontSize: 12 }}>{loadErr}</div>}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ display: "flex", height: isFullscreen ? "100vh" : "min(72vh, 720px)", minHeight: 420, border: isFullscreen ? "none" : "1px solid var(--border-default)", borderRadius: isFullscreen ? 0 : 10, overflow: "hidden", background: "var(--bg-base, #0d1117)" }}
    >
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <Suspense fallback={<LoadingSkeleton variant="page" />}>
          <IfcModelViewer buffer={buffer} colorFor={colorFor} onPick={setPicked} onSelect={setSelectedGuids} />
        </Suspense>
        <button type="button" onClick={toggleFullscreen} title={isFullscreen ? "Exit full screen" : "Full screen"} style={fsBtn}>
          {isFullscreen ? "Exit full screen" : "Full screen"}
        </button>

        {/* The roster (model_elements) loads alongside the geometry; until it
            lands, a color mode that depends on it can't fully paint — say so
            instead of letting it read as "broken". */}
        {buffer && rosterLoading && (colorMode === "fab" || colorMode === "sequence" || colorMode === "status") && (
          <div style={loadingChip}>Loading {colorMode === "fab" ? "fab" : colorMode === "sequence" ? "sequence" : "status"} colors…</div>
        )}

        {/* Unmissable Save prompt while previewing an unsaved model. */}
        {source === "picked" && projectId && (
          <div style={saveBanner}>
            {(roster.step === "extracting" || roster.step === "saving") ? (
              <span style={{ ...mono, fontSize: 12, color: "var(--text-primary)" }}>
                Saving to project…{roster.step === "extracting" && roster.total ? ` ${roster.done.toLocaleString()}/${roster.total.toLocaleString()}` : ""}
              </span>
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

      <aside style={{ width: 270, flexShrink: 0, borderLeft: "1px solid var(--border-default)", background: "var(--bg-surface-low)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--divider)" }}>
          <div style={{ ...mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>Model</div>
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
                  Saving to project…{roster.step === "extracting" && roster.total ? ` reading pieces ${roster.done.toLocaleString()} / ${roster.total.toLocaleString()}` : ""}
                </div>
              )}

              {/* Unsaved preview → explicit Save (no accidental auto-save). */}
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
                  Couldn&apos;t save: {roster.message}.{" "}
                  <button type="button" onClick={() => modelFile && buffer && persistModel(modelFile, buffer)} style={linkBtn}>Retry</button>
                </div>
              )}

              {/* Saved model → status + Remove. */}
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
          <div style={{ ...mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>Color by</div>
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
        </div>

        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--divider)" }}>
          <div style={{ ...mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>
            Selected{selectedGuids.length > 1 ? ` · ${selectedGuids.length}` : ""}
          </div>
          {selectedGuids.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>
              Click a member. Ctrl / Shift-click to add more.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
              {selectedGuids.length > 1 ? (
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{selectedGuids.length} pieces selected</div>
              ) : picked ? (
                <>
                  <Row label="Assembly" value={picked.assemblyMark} strong />
                  <Row label="Part" value={picked.partMark} />
                  <Row label="Name" value={picked.name} />
                  <Row label="Sequence" value={picked.sequence} />
                  <Row label="GUID" value={picked.guid} small />
                </>
              ) : null}

              {projectId && (
                <div style={{ marginTop: 8, borderTop: "1px solid var(--divider)", paddingTop: 9 }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>Set fab status</div>
                  {hasRoster ? (
                    <>
                      {/* Scope toggle: per-piece (default) vs whole-assembly. */}
                      <div role="group" aria-label="Fab status scope" style={{ display: "flex", gap: 4, marginTop: 7 }}>
                        {[["piece", "This piece"], ["assembly", "Whole assembly"]].map(([key, label]) => {
                          const active = fabScope === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setFabScope(key)}
                              style={{
                                flex: 1, padding: "5px 6px", borderRadius: 6, cursor: "pointer",
                                border: `1px solid ${active ? "var(--accent)" : "var(--border-default)"}`,
                                background: active ? "color-mix(in srgb, var(--accent) 16%, var(--bg-surface-high))" : "var(--bg-surface-low)",
                                color: active ? "var(--accent)" : "var(--text-muted)",
                                fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700,
                                letterSpacing: "0.04em", textTransform: "uppercase",
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 7 }}>
                        {FAB_STATUS_ORDER.map((s) => {
                          const single = selectedGuids.length === 1 ? selectedGuids[0] : null;
                          const current = single ? fabByGuid.get(single) === s : false;
                          return (
                            <button
                              key={s}
                              type="button"
                              disabled={assignFab.isPending}
                              onClick={() => setFab(current ? null : s)}
                              style={{
                                display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                                padding: "6px 9px", borderRadius: 7, cursor: assignFab.isPending ? "default" : "pointer",
                                border: `1px solid ${current ? FAB_STATUS_META[s].color : "var(--border-default)"}`,
                                background: current ? `color-mix(in srgb, ${FAB_STATUS_META[s].color} 18%, var(--bg-surface-high))` : "var(--bg-surface-low)",
                                color: current ? "var(--text-primary)" : "var(--text-secondary)",
                                fontSize: 12, fontWeight: current ? 700 : 500,
                              }}
                            >
                              <span style={{ width: 11, height: 11, borderRadius: 2, background: FAB_STATUS_META[s].color, flexShrink: 0 }} />
                              {FAB_STATUS_META[s].label}
                              {current && <span style={{ marginLeft: "auto", ...mono, fontSize: 9, color: "var(--text-muted)" }}>✓ clear</span>}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ ...mono, fontSize: 8.5, color: "var(--text-muted)", marginTop: 7, lineHeight: 1.4 }}>
                        {fabScope === "assembly"
                          ? (selectedGuids.length > 1
                              ? `Applies to every part of all ${selectedGuids.length} selected marks.`
                              : `Applies to the whole assembly (${picked?.assemblyMark || picked?.partMark || "—"}).`)
                          : (selectedGuids.length > 1
                              ? `Applies only to the ${selectedGuids.length} selected pieces.`
                              : "Applies only to this piece — same-mark siblings are unaffected.")}
                      </div>
                    </>
                  ) : (
                    <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 7, lineHeight: 1.5 }}>
                      Import the piece roster first, then you can assign fab status.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 14px" }}>
          <div style={{ ...mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>Legend</div>
          <Legend
            mode={colorMode}
            statusLegend={legend}
            sequences={[...new Set(seqByGuid.values())].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))}
          />
        </div>
      </aside>
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

const hintStyle = { color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 };

function Swatch({ color, label, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{ width: 11, height: 11, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ color: "var(--text-secondary)", flex: 1 }}>{label}</span>
      {count != null && <span style={{ ...mono, color: "var(--text-muted)", fontSize: 11 }}>{count}</span>}
    </div>
  );
}

function Legend({ mode, statusLegend, sequences }) {
  if (mode === "type") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {TYPE_LABELS.map(([k, l]) => <Swatch key={k} color={TYPE_PALETTE[k]} label={l} />)}
      </div>
    );
  }
  if (mode === "sequence") {
    if (!sequences.length) return <div style={hintStyle}>Import the piece roster to color by erection sequence.</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sequences.slice(0, 24).map((s) => <Swatch key={s} color={seqColor(s)} label={`Seq ${s}`} />)}
        {sequences.length > 24 && <div style={hintStyle}>+{sequences.length - 24} more</div>}
      </div>
    );
  }
  if (mode === "status") {
    if (!statusLegend.length) return <div style={hintStyle}>No detailing status yet — pieces light up once they&apos;re linked to detailing packages. (For hand-set status, use the Fab mode.)</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {statusLegend.map((b) => <Swatch key={b.key} color={b.color} label={b.label} count={b.count} />)}
      </div>
    );
  }
  if (mode === "fab") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {FAB_STATUS_ORDER.map((s) => <Swatch key={s} color={FAB_STATUS_META[s].color} label={FAB_STATUS_META[s].label} />)}
        <div style={hintStyle}>Click a piece, then set its status. Unassigned pieces keep their model color.</div>
      </div>
    );
  }
  return <div style={hintStyle}>Showing the model&apos;s own (Tekla) member colors.</div>;
}
