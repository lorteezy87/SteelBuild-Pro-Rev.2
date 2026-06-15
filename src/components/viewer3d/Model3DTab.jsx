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
import { ELEMENT_STATUS_META } from "@/services/modelElementStatus";
import { FAB_STATUS_META, FAB_STATUS_ORDER } from "@/lib/fabStatus";
import { extractIfcRoster } from "@/lib/ifc/extractIfcRoster";
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
const TYPE_PALETTE = { beam: "#3b82f6", column: "#f97316", plate: "#22c55e", member: "#a855f7", other: "#94a3b8" };
const TYPE_LABELS = [["beam", "Beam"], ["column", "Column"], ["plate", "Plate"], ["member", "Member"]];
const SEQ_PALETTE = ["#3b82f6", "#f97316", "#22c55e", "#a855f7", "#eab308", "#ef4444", "#14b8a6", "#ec4899", "#8b5cf6", "#84cc16", "#06b6d4", "#f59e0b"];
// Stable categorical color for a sequence/phase label.
function seqColor(seq) {
  if (seq == null || seq === "") return null;
  const s = String(seq);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SEQ_PALETTE[h % SEQ_PALETTE.length];
}

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

export default function Model3DTab({ modelMapping, modelElementRows, projectId }) {
  const qc = useQueryClient();
  const [buffer, setBuffer] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [modelFile, setModelFile] = useState(null); // the picked File (for upload)
  const [source, setSource] = useState(null);        // null | "picked" | "stored"
  const [picked, setPicked] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [colorMode, setColorMode] = useState("model"); // model | type | sequence | status
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
        const buf = await res.arrayBuffer();
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

  // GlobalId -> fab-status color (excludes "unmapped" so those keep native color).
  const statusByGuid = useMemo(() => {
    const map = new Map();
    const byStatus = modelMapping?.guidsByStatus || {};
    for (const [status, guids] of Object.entries(byStatus)) {
      if (status === "unmapped") continue;
      const color = ELEMENT_STATUS_META[status]?.color;
      if (!color) continue;
      for (const guid of guids) map.set(guid, color);
    }
    return map;
  }, [modelMapping]);

  // GlobalId -> erection sequence, from the imported roster (model_elements).
  const seqByGuid = useMemo(() => {
    const map = new Map();
    for (const r of modelElementRows || []) {
      if (r?.element_guid && r.sequence_number != null && r.sequence_number !== "") {
        map.set(r.element_guid, String(r.sequence_number));
      }
    }
    return map;
  }, [modelElementRows]);

  // GlobalId -> manual fab_status, from the imported roster.
  const fabByGuid = useMemo(() => {
    const map = new Map();
    for (const r of modelElementRows || []) {
      if (r?.element_guid && r.fab_status) map.set(r.element_guid, r.fab_status);
    }
    return map;
  }, [modelElementRows]);
  const hasRoster = (modelElementRows?.length || 0) > 0;

  // The mode-aware color function the viewer paints with. Returning null falls
  // back to the part's native IFC color (see loadIfcGeometry.recolor).
  const colorFor = useMemo(() => {
    if (colorMode === "type") return (info) => TYPE_PALETTE[info.ifcType] || TYPE_PALETTE.other;
    if (colorMode === "sequence") return (info) => (info.guid ? seqColor(seqByGuid.get(info.guid)) : null);
    if (colorMode === "status") return (info) => (info.guid ? statusByGuid.get(info.guid) : null);
    if (colorMode === "fab") return (info) => (info.guid ? FAB_STATUS_META[fabByGuid.get(info.guid)]?.color : null);
    return () => null; // "model" → native colors
  }, [colorMode, seqByGuid, statusByGuid, fabByGuid]);

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
      setRoster({ step: "saving" });
      const up = await integrations.Core.UploadFile({ file });
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
      toast.success("Model removed from this project.");
    } catch (err) {
      toast.error("Couldn't remove the model: " + (err?.message || String(err)));
    }
  };

  // Manual fab-status assignment: set every part of an assembly (matched by
  // piece_mark) to a stage, then recolor by it. Null clears the status.
  const assignFab = useMutation({
    mutationFn: async ({ pieceMark, status }) => {
      const { error } = await supabase
        .from("model_elements")
        .update({ fab_status: status })
        .eq("project_id", projectId)
        .eq("piece_mark", pieceMark)
        .eq("is_deleted", false);
      if (error) throw error;
      return { status };
    },
    onSuccess: ({ status }) => {
      qc.invalidateQueries({ queryKey: ["model-elements", projectId] });
      setColorMode("fab");
      toast.success(status ? `Marked ${FAB_STATUS_META[status].label}` : "Fab status cleared");
    },
    onError: (e) => toast.error(e?.message || "Couldn't set fab status."),
  });

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
          <IfcModelViewer buffer={buffer} colorFor={colorFor} onPick={setPicked} />
        </Suspense>
        <button type="button" onClick={toggleFullscreen} title={isFullscreen ? "Exit full screen" : "Full screen"} style={fsBtn}>
          {isFullscreen ? "Exit full screen" : "Full screen"}
        </button>
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
          <div style={{ ...mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>Selected</div>
          {picked ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
              <Row label="Assembly" value={picked.assemblyMark} strong />
              <Row label="Part" value={picked.partMark} />
              <Row label="Name" value={picked.name} />
              <Row label="Sequence" value={picked.sequence} />
              <Row label="GUID" value={picked.guid} small />

              {projectId && (picked.assemblyMark || picked.partMark) && (
                <div style={{ marginTop: 8, borderTop: "1px solid var(--divider)", paddingTop: 9 }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>Set fab status</div>
                  {hasRoster ? (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 7 }}>
                        {FAB_STATUS_ORDER.map((s) => {
                          const current = fabByGuid.get(picked.guid) === s;
                          return (
                            <button
                              key={s}
                              type="button"
                              disabled={assignFab.isPending}
                              onClick={() => assignFab.mutate({ pieceMark: picked.assemblyMark || picked.partMark, status: current ? null : s })}
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
                        Applies to the whole assembly ({picked.assemblyMark || picked.partMark}).
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
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Click a member in the model.</div>
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
