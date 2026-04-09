import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { base44, resolveFileUrl } from "@/api/base44Client";
import { useProjectContext } from "@/components/shared/useProjectContext";
import * as pdfjsLib from "pdfjs-dist";
// Bundle the pdf.js worker with Vite so versions always match the installed
// pdfjs-dist package. Previously we loaded `.min.js` from cdnjs, but pdfjs-dist
// 4.x only ships `.mjs` workers and the file name was wrong, causing every
// drawing to fail to render.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const STAGES = {
  "Not Started": { color: "#6B7280" },
  "OFA":         { color: "#3B82F6" },
  "BFA":         { color: "#06B6D4" },
  "OFS":         { color: "#F59E0B" },
  "BFS":         { color: "#8B5CF6" },
  "FFF":         { color: "#EC4899" },
  "Released":    { color: "#10B981" },
};

const mono = { fontFamily: "var(--font-mono)" };

export default function DrawingViewer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id;

  const initialId = searchParams.get("id") || searchParams.get("drawingId") || searchParams.get("docId");

  const [activeId, setActiveId] = useState(initialId || null);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1.0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [resolvedUrl, setResolvedUrl] = useState(null);

  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);

  // ── Load all drawings for this project ──────────────────────────────────────
  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => projectId ? base44.entities.Drawing.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 30000,
  });

  const filtered = search.trim()
    ? drawings.filter(d =>
        d.sheet_number?.toLowerCase().includes(search.toLowerCase()) ||
        d.title?.toLowerCase().includes(search.toLowerCase())
      )
    : drawings;

  const activeDrawing = drawings.find(d => d.id === activeId);

  const activeIndex = filtered.findIndex(d => d.id === activeId);

  // Resolve file_url (storage path) to a signed URL
  useEffect(() => {
    let cancelled = false;
    setResolvedUrl(null);
    setPdfDoc(null);
    setPdfError(null);
    setCurrentPage(1);
    setTotalPages(0);

    const rawUrl = activeDrawing?.file_url;
    if (!rawUrl) return;

    resolveFileUrl(rawUrl)
      .then(url => { if (!cancelled) setResolvedUrl(url); })
      .catch(err => { if (!cancelled) setPdfError(`Failed to resolve file URL: ${err.message}`); });

    return () => { cancelled = true; };
  }, [activeDrawing?.file_url]);

  // Load the PDF once we have a signed URL
  useEffect(() => {
    if (!resolvedUrl) return;

    let cancelled = false;
    let loadingTask = null;

    loadingTask = pdfjsLib.getDocument(resolvedUrl);
    loadingTask.promise
      .then(doc => {
        if (cancelled) { doc.destroy(); return; }
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
        setPdfError(null);
      })
      .catch(err => {
        if (!cancelled) setPdfError(`PDF load failed: ${err.message}`);
      });

    return () => {
      cancelled = true;
      if (loadingTask) {
        loadingTask.destroy?.();
      }
    };
  }, [resolvedUrl]);

  // Destroy previous PDF document to prevent memory leaks
  useEffect(() => {
    return () => {
      if (pdfDoc) {
        pdfDoc.destroy().catch(() => {});
      }
    };
  }, [pdfDoc]);

  // ── Render page when doc, page, or zoom changes ────────────────────────────
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    // Cancel any in-flight render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    setRendering(true);
    try {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");

      renderTaskRef.current = page.render({ canvasContext: ctx, viewport });
      await renderTaskRef.current.promise;
    } catch (err) {
      if (err?.name !== "RenderingCancelledException") {
        console.error("Render error:", err);
      }
    } finally {
      setRendering(false);
      renderTaskRef.current = null;
    }
  }, [pdfDoc, currentPage, zoom]);

  useEffect(() => { renderPage(); }, [renderPage]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = filtered[activeIndex + 1];
        if (next) setActiveId(next.id);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = filtered[activeIndex - 1];
        if (prev) setActiveId(prev.id);
      } else if (e.key === "=" || e.key === "+") {
        setZoom(z => Math.min(4.0, +(z + 0.25).toFixed(2)));
      } else if (e.key === "-") {
        setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)));
      } else if (e.key === "0") {
        setZoom(1.0);
      } else if (e.key === "PageDown" || e.key === "j") {
        setCurrentPage(p => Math.min(totalPages, p + 1));
      } else if (e.key === "PageUp" || e.key === "k") {
        setCurrentPage(p => Math.max(1, p - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, activeIndex, totalPages]);

  // ── Fit width ──────────────────────────────────────────────────────────────
  const handleFitWidth = async () => {
    if (!pdfDoc || !canvasRef.current) return;
    const page = await pdfDoc.getPage(currentPage);
    const vp = page.getViewport({ scale: 1 });
    const container = canvasRef.current.parentElement;
    if (container) setZoom(+(container.clientWidth / vp.width).toFixed(2));
  };

  // ── Download ───────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    const url = resolvedUrl || await resolveFileUrl(activeDrawing?.file_url);
    if (!url) { toast?.error?.("No file URL available"); return; }
    const a = document.createElement("a");
    a.href = url;
    a.download = activeDrawing?.file_name || activeDrawing?.title || "drawing.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-page)", overflow: "hidden" }}>

      {/* ── Sheet List Sidebar ──────────────────────────────────────────────── */}
      <div style={{ width: 260, flexShrink: 0, borderRight: "1px solid var(--border-default)", display: "flex", flexDirection: "column", background: "var(--bg-surface)" }}>

        {/* Sidebar header */}
        <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--border-default)" }}>
          <button onClick={() => navigate("/Drawings")}
            style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, marginBottom: 10 }}>
            ← BACK TO DRAWINGS
          </button>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search sheets…"
            style={{ width: "100%", padding: "6px 10px", background: "var(--bg-page)", border: "1px solid var(--border-default)", borderRadius: 2, color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, boxSizing: "border-box" }} />
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>
            {filtered.length} / {drawings.length} SHEETS
          </div>
        </div>

        {/* Sheet list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.map((d, i) => {
            const isActive = d.id === activeId;
            const stageColor = STAGES[d.stage]?.color || "#6B7280";
            return (
              <div key={d.id} onClick={() => setActiveId(d.id)}
                style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.03)", background: isActive ? "rgba(200,155,32,0.12)" : "none", borderLeft: `3px solid ${isActive ? "var(--accent)" : "transparent"}`, transition: "background 0.1s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                  <div>
                    <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: isActive ? "var(--accent)" : "var(--text-primary)", marginBottom: 2 }}>
                      {d.sheet_number}
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>
                      {d.title}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                    <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: stageColor, border: `1px solid ${stageColor}44`, padding: "1px 5px", borderRadius: 2 }}>
                      {d.stage === "Released" ? "IFC" : (d.stage || "—")}
                    </span>
                    {d.priority_flag && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--status-error)", display: "inline-block" }} />}
                  </div>
                </div>
                <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", opacity: 0.5, marginTop: 3 }}>R{d.revision_number ?? "0"} · {d.discipline}</div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 24, ...mono, fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>NO SHEETS FOUND</div>
          )}
        </div>

        {/* Navigation footer */}
        {filtered.length > 0 && (
          <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button onClick={() => { const p = filtered[activeIndex - 1]; if (p) setActiveId(p.id); }}
              disabled={activeIndex <= 0}
              style={{ ...mono, fontSize: 12, background: "none", border: "1px solid var(--border-default)", borderRadius: 2, color: "var(--text-muted)", padding: "4px 10px", cursor: activeIndex <= 0 ? "not-allowed" : "pointer", opacity: activeIndex <= 0 ? 0.3 : 1 }}>←</button>
            <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>{activeIndex + 1} / {filtered.length}</span>
            <button onClick={() => { const n = filtered[activeIndex + 1]; if (n) setActiveId(n.id); }}
              disabled={activeIndex >= filtered.length - 1}
              style={{ ...mono, fontSize: 12, background: "none", border: "1px solid var(--border-default)", borderRadius: 2, color: "var(--text-muted)", padding: "4px 10px", cursor: activeIndex >= filtered.length - 1 ? "not-allowed" : "pointer", opacity: activeIndex >= filtered.length - 1 ? 0.3 : 1 }}>→</button>
          </div>
        )}
      </div>

      {/* ── Main Viewer ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Viewer toolbar */}
        <div style={{ height: 48, borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", gap: 10, padding: "0 16px", flexShrink: 0, background: "var(--bg-surface)" }}>
          {/* Sheet info */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {activeDrawing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{activeDrawing.sheet_number}</span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeDrawing.title}</span>
                <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", flexShrink: 0 }}>R{activeDrawing.revision_number ?? "0"}</span>
                {activeDrawing.stage && (
                  <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: STAGES[activeDrawing.stage]?.color, flexShrink: 0 }}>
                    {activeDrawing.stage === "Released" ? "IFC" : activeDrawing.stage}
                  </span>
                )}
              </div>
            ) : (
              <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>SELECT A SHEET</span>
            )}
          </div>

          {/* Page nav (for multi-page PDFs) */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
                style={toolBtn}>‹</button>
              <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>{currentPage}/{totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                style={toolBtn}>›</button>
            </div>
          )}

          {/* Zoom controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={() => setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)))} style={toolBtn}>−</button>
            <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)", minWidth: 42, textAlign: "center" }}>
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => setZoom(z => Math.min(4.0, +(z + 0.25).toFixed(2)))} style={toolBtn}>+</button>
          </div>

          <button onClick={() => setZoom(1.0)} style={{ ...toolBtn, ...mono, fontSize: 9 }}>1:1</button>
          <button onClick={handleFitWidth} style={{ ...toolBtn, ...mono, fontSize: 9 }}>FIT</button>
          <button onClick={handleDownload} disabled={!activeDrawing?.file_url}
            style={{ ...toolBtn, ...mono, fontSize: 9, color: "var(--accent)", opacity: activeDrawing?.file_url ? 1 : 0.3 }}>
            ↓ PDF
          </button>
        </div>

        {/* Canvas area */}
        <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 24, background: "#1a1a2e" }}>
          {!activeDrawing ? (
            <div style={{ margin: "auto", textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }}>▦</div>
              <p style={{ ...mono, fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.2em" }}>SELECT A SHEET FROM THE SIDEBAR</p>
              <p style={{ ...mono, fontSize: 9, color: "rgba(255,255,255,0.15)", marginTop: 8 }}>← → to navigate · + − to zoom · 0 to reset</p>
            </div>
          ) : pdfError ? (
            <div style={{ margin: "auto", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>⚠</div>
              <p style={{ ...mono, fontSize: 11, color: "var(--status-error)", letterSpacing: "0.1em" }}>{pdfError}</p>
              {activeDrawing.file_url && (
                <a href={activeDrawing.file_url} target="_blank" rel="noopener noreferrer"
                  style={{ ...mono, fontSize: 10, color: "var(--accent)", marginTop: 8, display: "block" }}>
                  OPEN IN NEW TAB →
                </a>
              )}
            </div>
          ) : !activeDrawing.file_url ? (
            <div style={{ margin: "auto", textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.15 }}>📄</div>
              <p style={{ ...mono, fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em" }}>NO PDF ATTACHED</p>
              <p style={{ ...mono, fontSize: 9, color: "rgba(255,255,255,0.15)", marginTop: 6 }}>Edit this sheet to attach a PDF file URL</p>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              {rendering && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", zIndex: 10, ...mono, fontSize: 10, color: "var(--accent)", letterSpacing: "0.2em" }}>
                  RENDERING…
                </div>
              )}
              <canvas ref={canvasRef} style={{ display: "block", boxShadow: "0 4px 32px rgba(0,0,0,0.6)" }} />
            </div>
          )}
        </div>

        {/* Keyboard shortcuts hint */}
        <div style={{ padding: "6px 16px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "var(--bg-surface)", display: "flex", gap: 16 }}>
          {[["← →", "Navigate sheets"], ["+ −", "Zoom"], ["0", "Reset zoom"], ["Page Up/Dn", "PDF pages"]].map(([key, desc]) => (
            <span key={key} style={{ ...mono, fontSize: 9, color: "rgba(255,255,255,0.2)" }}>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>{key}</span> {desc}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const toolBtn = {
  background: "none",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: "4px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  lineHeight: 1,
};
