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
import { ArrowLeft, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Keyboard, Film, RotateCw } from "lucide-react";
import ViewerHeader from "@/components/drawings/viewer/ViewerHeader";
import ShortcutsOverlay from "@/components/drawings/viewer/ShortcutsOverlay";
import RenderSkeleton from "@/components/drawings/viewer/RenderSkeleton";
import ThumbnailFilmstrip from "@/components/drawings/viewer/ThumbnailFilmstrip";
import ContextPanel from "@/components/drawings/viewer/ContextPanel";
import AnnotationLayer from "@/components/drawings/viewer/AnnotationLayer";
import AnnotationToolbar, { MARKUP_COLORS } from "@/components/drawings/viewer/AnnotationToolbar";
import { useMarkup } from "@/components/drawings/viewer/useMarkup";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// If a stored file_url is itself a Supabase signed URL with a JWT token,
// extract the storage path and re-sign so expired URLs still resolve.
function extractStoragePathFromSignedUrl(url) {
  try {
    const m = url.match(/\/object\/(?:sign|public)\/[^/]+\/(.+?)(?:\?|$)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

const STAGES = {
  "Not Started": { color: "#6B7280" },
  "OFA":         { color: "#3B82F6" },
  "BFA":         { color: "#06B6D4" },
  "OFS":         { color: "#F59E0B" },
  "BFS":         { color: "#F97316" },
  "FFF":         { color: "#84CC16" },
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [filmstripOpen, setFilmstripOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(true);
  const [zoom, setZoom] = useState(1.0);
  const [rotation, setRotation] = useState(0); // 0 | 90 | 180 | 270
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [resolvedUrl, setResolvedUrl] = useState(null);
  // "canvas" = pdfjs canvas render (enables clickable hyperlinks + cross-sheet nav)
  // "iframe" = browser-native PDF viewer (fallback, no annotation layer)
  // Default to canvas now that the pdfjs worker is bundled via Vite and reliable.
  const [renderMode, setRenderMode] = useState("canvas");

  const canvasRef = useRef(null);
  const annotLayerRef = useRef(null);
  const renderTaskRef = useRef(null);
  // pdfjs-extracted link hotspots (internal PDF links, external URLs).
  // Renamed from `annotations` to avoid colliding with the new `markup`
  // JSONB column used by AnnotationLayer.
  const [linkHotspots, setLinkHotspots] = useState([]);
  // Natural page size at scale 1 (PDF user units). Callouts are stored in
  // this coordinate space with a top-left origin, so the overlay multiplies
  // by `zoom` to position itself over the rendered canvas.
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  // Live pdfjs viewport for the current render. AnnotationLayer uses it to
  // project markup (stored in PDF units) to canvas pixels + hit-test pointer
  // events. Updated after every successful render.
  const [currentViewport, setCurrentViewport] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // ── Markup (Tier 3 annotations) ─────────────────────────────────────
  const [activeTool, setActiveTool] = useState("select");
  const [activeColor, setActiveColor] = useState(MARKUP_COLORS[0].value);

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

  // Markup hook is intentionally placed after activeDrawing so we can pass
  // its initial array in — Tier 3 persists drawing markup in drawings.markup.
  const markup = useMarkup({
    drawingId: activeId,
    initialMarkup: activeDrawing?.markup,
  });

  // Resolve file_url (storage path) to a signed URL.
  // If file_url is a stale Supabase signed URL, extract the path and re-sign.
  useEffect(() => {
    let cancelled = false;
    setResolvedUrl(null);
    setPdfDoc(null);
    setPdfError(null);
    setCurrentPage(1);
    setTotalPages(0);

    const rawUrl = activeDrawing?.file_url;
    if (!rawUrl) return;

    const isHttp = rawUrl.startsWith("http://") || rawUrl.startsWith("https://");
    const storagePath = isHttp ? extractStoragePathFromSignedUrl(rawUrl) : rawUrl;
    const toResolve = storagePath || rawUrl;

    resolveFileUrl(toResolve)
      .then(url => { if (!cancelled) setResolvedUrl(url); })
      .catch(err => {
        if (cancelled) return;
        // Fall back to raw URL — iframe may still load it
        if (isHttp) setResolvedUrl(rawUrl);
        else setPdfError(`Failed to resolve file URL: ${err.message}`);
      });

    return () => { cancelled = true; };
  }, [activeDrawing?.file_url]);

  // Load the PDF once we have a signed URL (only when canvas mode is active)
  useEffect(() => {
    if (!resolvedUrl || renderMode !== "canvas") return;

    let cancelled = false;
    let loadingTask = null;

    loadingTask = pdfjsLib.getDocument(resolvedUrl);
    loadingTask.promise
      .then(doc => {
        if (cancelled) { doc.destroy(); return; }
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        // Honor the active drawing's intended page (e.g. sheet B on page 3
        // of a multi-sheet master PDF). Previously we blindly reset to 1
        // here, which raced with the [activeDrawing?.id] effect — if this
        // fired second, a click would "appear to do nothing" (sheet became
        // active but PDF stayed on page 1). Clamp to the doc's page range.
        const desired = Number(activeDrawing?.pdf_page) || 1;
        setCurrentPage(Math.max(1, Math.min(doc.numPages, desired)));
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
  }, [resolvedUrl, renderMode]);

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
      const baseViewport = page.getViewport({ scale: 1, rotation });
      setPageSize({ width: baseViewport.width, height: baseViewport.height });
      const viewport = page.getViewport({ scale: zoom, rotation });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");

      renderTaskRef.current = page.render({ canvasContext: ctx, viewport });
      await renderTaskRef.current.promise;

      // Publish viewport + size so AnnotationLayer can project markup.
      // We do this AFTER the render so the overlay never displays against
      // a mismatched canvas (prevents a 1-frame "jump" on zoom).
      setCurrentViewport(viewport);
      setCanvasSize({ width: viewport.width, height: viewport.height });

      // ── Extract link annotations for clickable overlays ──────────────
      try {
        const annots = await page.getAnnotations({ intent: "display" });
        const linkAnnots = annots
          .filter(a => a.subtype === "Link" && a.rect)
          .map(a => {
            // Transform PDF rect [x1,y1,x2,y2] to canvas pixel coords
            const [x1, y1, x2, y2] = a.rect;
            const p1 = viewport.convertToViewportPoint(x1, y1);
            const p2 = viewport.convertToViewportPoint(x2, y2);
            const left = Math.min(p1[0], p2[0]);
            const top = Math.min(p1[1], p2[1]);
            const width = Math.abs(p2[0] - p1[0]);
            const height = Math.abs(p2[1] - p1[1]);
            return {
              id: a.id || `${x1}-${y1}`,
              left, top, width, height,
              url: a.url || null,
              dest: a.dest || null,
              unsafeUrl: a.unsafeUrl || null,
              title: a.title || "",
            };
          });
        setLinkHotspots(linkAnnots);
      } catch {
        setLinkHotspots([]);
      }
    } catch (err) {
      if (err?.name !== "RenderingCancelledException") {
        console.error("Render error:", err);
      }
    } finally {
      setRendering(false);
      renderTaskRef.current = null;
    }
  }, [pdfDoc, currentPage, zoom, rotation]);

  useEffect(() => { renderPage(); }, [renderPage]);

  // When the active drawing changes, jump to its source PDF page so callouts
  // overlay the correct sheet. Stored as `pdf_page` by DrawingSetUploadModal;
  // legacy rows without it default to page 1.
  useEffect(() => {
    if (!activeDrawing) return;
    const page = Number(activeDrawing.pdf_page) || 1;
    setCurrentPage(page);
  }, [activeDrawing?.id]);

  // Callout → navigation handler. If the targetSheetNumber resolves to a
  // drawing in the project list, switch to it. The effect above then jumps
  // to that drawing's pdf_page automatically.
  const normalizeSN = (s) => String(s || "").toUpperCase().replace(/[\s\-_.]/g, "");
  const onCalloutClick = useCallback((callout) => {
    if (!callout?.targetSheetNumber) return;
    const target = drawings.find(d =>
      normalizeSN(d.sheet_number) === normalizeSN(callout.targetSheetNumber)
    );
    if (target) setActiveId(target.id);
  }, [drawings]);

  // ── Handle annotation link click ──────────────────────────────────────────
  const handleAnnotationClick = useCallback(async (annot) => {
    // 1. Internal PDF destination (page ref within the same document)
    if (annot.dest) {
      try {
        let pageNum = null;
        if (typeof annot.dest === "string") {
          // Named destination — resolve via the PDF document
          const dest = await pdfDoc.getDestination(annot.dest);
          if (dest) {
            const pageRef = dest[0];
            pageNum = await pdfDoc.getPageIndex(pageRef) + 1;
          }
        } else if (Array.isArray(annot.dest)) {
          // Explicit destination array [pageRef, ...]
          const pageRef = annot.dest[0];
          pageNum = await pdfDoc.getPageIndex(pageRef) + 1;
        }
        if (pageNum && pageNum >= 1 && pageNum <= totalPages) {
          setCurrentPage(pageNum);
          return;
        }
      } catch { /* fall through to cross-sheet lookup */ }
    }

    // 2. External URL
    if (annot.url) {
      window.open(annot.url, "_blank", "noopener,noreferrer");
      return;
    }

    // 3. Cross-sheet reference — try to match against sheet numbers in this project
    //    Common patterns: "S-201", "S201", "A/S201", "DETAIL 3/S-201"
    const refText = annot.title || annot.unsafeUrl || "";
    if (refText) {
      const match = refText.match(/([A-Z]{1,2}[-\s]?\d{3,4})/i);
      if (match) {
        const sheetRef = match[1].toUpperCase().replace(/\s+/g, "");
        const target = drawings.find(d => {
          const sn = (d.sheet_number || "").toUpperCase().replace(/[-\s]/g, "");
          return sn === sheetRef || sn === sheetRef.replace("-", "");
        });
        if (target) {
          setActiveId(target.id);
          setCurrentPage(1);
          return;
        }
      }
    }
  }, [pdfDoc, totalPages, drawings]);

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
      } else if (e.key === "[" || e.key === "]") {
        setSidebarOpen(o => !o);
      } else if (e.key === "f" || e.key === "F") {
        setFilmstripOpen(o => !o);
      } else if (e.key === "i" || e.key === "I") {
        setContextOpen(o => !o);
      } else if (e.key === "r" || e.key === "R") {
        // r = rotate CW; Shift+R = rotate CCW
        setRotation(rot => (e.shiftKey ? (rot + 270) % 360 : (rot + 90) % 360));
      } else if (e.key === "?") {
        // `?` — Shift+/ on US keyboards. Only intercept when no modifiers
        // other than Shift are held so Ctrl+?/browser find still works.
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setShortcutsOpen(o => !o);
        }
      } else if (e.key === "v" || e.key === "V") {
        setActiveTool("select");
      } else if (e.key === "p" || e.key === "P") {
        setActiveTool("pen");
      } else if (e.key === "b" || e.key === "B") {
        setActiveTool("rect");
      } else if (e.key === "a" || e.key === "A") {
        setActiveTool("arrow");
      } else if (e.key === "t" || e.key === "T") {
        setActiveTool("note");
      } else if (e.key === "Escape") {
        // Esc snaps back to select so keyboard users can bail on a tool
        // without hunting for the toolbar.
        setActiveTool("select");
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

      {/* ── Sheet List Sidebar (collapsible) ──────────────────────────────── */}
      <div style={{
        width: sidebarOpen ? 260 : 0,
        flexShrink: 0,
        borderRight: sidebarOpen ? "1px solid var(--border-default)" : "none",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-surface)",
        overflow: "hidden",
        transition: "width 0.2s ease",
      }}>

        {/* Sidebar header */}
        <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--border-default)" }}>
          <button onClick={() => navigate("/Drawings")}
            style={{ ...mono, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, marginBottom: 10 }}>
            <ArrowLeft size={12} /> Back to Drawings
          </button>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search sheets…"
            style={{ width: "100%", padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, boxSizing: "border-box" }} />
          <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginTop: 8, letterSpacing: "0.10em", textTransform: "uppercase" }}>
            {filtered.length} / {drawings.length} Sheets
          </div>
        </div>

        {/* Sheet list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.map((d, i) => {
            const isActive = d.id === activeId;
            const stageColor = STAGES[d.stage]?.color || "#6B7280";
            return (
              <div key={d.id} onClick={() => setActiveId(d.id)}
                style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--hover-bg)", background: isActive ? "var(--accent-muted)" : "none", borderLeft: `3px solid ${isActive ? "var(--accent)" : "transparent"}`, transition: "background 0.1s" }}>
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
              style={{ display: "inline-flex", alignItems: "center", background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", color: "var(--text-secondary)", padding: "4px 10px", cursor: activeIndex <= 0 ? "not-allowed" : "pointer", opacity: activeIndex <= 0 ? 0.3 : 1 }}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em" }}>{activeIndex + 1} / {filtered.length}</span>
            <button onClick={() => { const n = filtered[activeIndex + 1]; if (n) setActiveId(n.id); }}
              disabled={activeIndex >= filtered.length - 1}
              style={{ display: "inline-flex", alignItems: "center", background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", color: "var(--text-secondary)", padding: "4px 10px", cursor: activeIndex >= filtered.length - 1 ? "not-allowed" : "pointer", opacity: activeIndex >= filtered.length - 1 ? 0.3 : 1 }}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Main Viewer ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Breadcrumb + stage pipeline */}
        <ViewerHeader projectName={activeProject?.name} activeDrawing={activeDrawing} />

        {/* Viewer toolbar */}
        <div style={{ height: 48, borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", gap: 10, padding: "0 16px", flexShrink: 0, background: "var(--bg-surface)" }}>
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? "Hide sheet list (more drawing space)" : "Show sheet list"}
            style={{
              ...toolBtn,
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 8px",
              color: sidebarOpen ? "var(--accent)" : "var(--text-muted)",
              background: sidebarOpen ? "var(--accent-muted)" : "var(--bg-surface-low)",
              border: sidebarOpen ? "1px solid var(--accent)" : "1px solid var(--border-default)",
              flexShrink: 0,
            }}
          >
            {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          </button>
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
          <button
            onClick={() => setRotation(r => (r + 90) % 360)}
            title={`Rotate (R) — currently ${rotation}°`}
            style={{
              ...toolBtn,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 8px",
              color: rotation !== 0 ? "var(--accent)" : "var(--text-muted)",
              background: rotation !== 0 ? "rgba(200,155,32,0.10)" : "none",
            }}
          >
            <RotateCw size={12} />
            {rotation !== 0 && <span style={{ ...mono, fontSize: 9, fontWeight: 700 }}>{rotation}°</span>}
          </button>
          <button
            onClick={() => setRenderMode(m => m === "iframe" ? "canvas" : "iframe")}
            title={renderMode === "iframe" ? "Switch to canvas (markups)" : "Switch to iframe (browser PDF)"}
            style={{
              ...toolBtn, ...mono, fontSize: 9,
              color: renderMode === "iframe" ? "var(--accent)" : "var(--text-muted)",
              background: renderMode === "iframe" ? "rgba(200,155,32,0.1)" : "none",
            }}
          >
            {renderMode === "iframe" ? "IFRAME" : "CANVAS"}
          </button>
          <button onClick={handleDownload} disabled={!activeDrawing?.file_url}
            style={{ ...toolBtn, ...mono, fontSize: 9, color: "var(--accent)", opacity: activeDrawing?.file_url ? 1 : 0.3 }}>
            ↓ PDF
          </button>
          <button
            onClick={() => setFilmstripOpen(o => !o)}
            title={filmstripOpen ? "Hide thumbnail filmstrip (F)" : "Show thumbnail filmstrip (F)"}
            style={{
              ...toolBtn,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 8px",
              color: filmstripOpen ? "var(--accent)" : "var(--text-muted)",
              background: filmstripOpen ? "rgba(200,155,32,0.10)" : "none",
            }}
          >
            <Film size={12} />
          </button>
          <button
            onClick={() => setContextOpen(o => !o)}
            title={contextOpen ? "Hide sheet context panel (I)" : "Show sheet context panel (I)"}
            style={{
              ...toolBtn,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 8px",
              color: contextOpen ? "var(--accent)" : "var(--text-muted)",
              background: contextOpen ? "rgba(200,155,32,0.10)" : "none",
            }}
          >
            {contextOpen ? <PanelRightClose size={12} /> : <PanelRightOpen size={12} />}
          </button>
          <button
            onClick={() => setShortcutsOpen(o => !o)}
            title="Keyboard shortcuts (?)"
            style={{
              ...toolBtn,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 8px",
              color: "var(--text-muted)",
            }}
          >
            <Keyboard size={12} />
            <span style={{ ...mono, fontSize: 9, fontWeight: 700 }}>?</span>
          </button>
        </div>

        {/* Viewer area — iframe (browser-native) or pdfjs canvas.
            Deep slate backdrop with a subtle radial vignette so the paper
            (drop-shadowed canvas) reads as a physical sheet on a layout
            table. Matches the "legit drawing viewer" look of Bluebeam /
            PlanGrid / Procore. */}
        <div style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          justifyContent: "center",
          alignItems: "stretch",
          background: "radial-gradient(ellipse at center, #121822 0%, #0A0E15 100%)",
        }}>
          {!activeDrawing ? (
            <div style={{ margin: "auto", textAlign: "center", padding: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }}>▦</div>
              <p style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.2em" }}>SELECT A SHEET FROM THE SIDEBAR</p>
              <p style={{ ...mono, fontSize: 9, color: "var(--border-strong)", marginTop: 8 }}>← → to navigate · + − to zoom · 0 to reset</p>
            </div>
          ) : !activeDrawing.file_url ? (
            <div style={{ margin: "auto", textAlign: "center", padding: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.15 }}>📄</div>
              <p style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.15em" }}>NO PDF ATTACHED</p>
              <p style={{ ...mono, fontSize: 9, color: "var(--border-strong)", marginTop: 6 }}>Edit this sheet to attach a PDF file URL</p>
            </div>
          ) : renderMode === "iframe" ? (
            !resolvedUrl ? (
              <div style={{ margin: "auto", ...mono, fontSize: 10, color: "var(--accent)", letterSpacing: "0.2em" }}>RESOLVING FILE…</div>
            ) : (
              <iframe
                key={resolvedUrl}
                src={resolvedUrl}
                title={activeDrawing.title || activeDrawing.sheet_number}
                style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
              />
            )
          ) : pdfError ? (
            <div style={{ margin: "auto", textAlign: "center", padding: 24 }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>⚠</div>
              <p style={{ ...mono, fontSize: 11, color: "var(--status-error)", letterSpacing: "0.1em" }}>{pdfError}</p>
              <button
                onClick={() => setRenderMode("iframe")}
                style={{ ...mono, fontSize: 10, color: "var(--accent)", marginTop: 12, padding: "6px 14px", background: "rgba(200,155,32,0.12)", border: "1px solid var(--accent)", borderRadius: 2, cursor: "pointer" }}
              >
                SWITCH TO IFRAME VIEW
              </button>
              {activeDrawing.file_url && (
                <button
                  onClick={async () => {
                    try {
                      const url = await resolveFileUrl(activeDrawing.file_url);
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                    } catch { /* silently fail */ }
                  }}
                  style={{ ...mono, fontSize: 10, color: "var(--accent)", marginTop: 8, display: "block", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  OPEN IN NEW TAB →
                </button>
              )}
            </div>
          ) : (
            <div style={{ position: "relative", padding: 32 }}>
              {rendering && (
                <RenderSkeleton label={`Rendering page ${currentPage}${totalPages > 1 ? ` of ${totalPages}` : ""}`} />
              )}
              {/* Markup toolbar — fixed to the viewer area, floats over the
                  canvas padding so it doesn't move as the canvas resizes. */}
              <AnnotationToolbar
                activeTool={activeTool}
                onToolChange={setActiveTool}
                activeColor={activeColor}
                onColorChange={setActiveColor}
                markupCount={markup.items.filter((m) => (m.pdf_page || 1) === currentPage).length}
                onClearPage={() => {
                  markup.items
                    .filter((m) => (m.pdf_page || 1) === currentPage)
                    .forEach((m) => markup.removeItem(m.id));
                }}
                saving={markup.saving}
                saveError={markup.saveError}
              />

              {/* Canvas + overlay wrapper. The wrapper is sized to the
                  canvas so absolutely-positioned overlay children line up
                  with the rendered PDF regardless of zoom or padding. It
                  hosts two layers: (1) the PDF link-annotation hotspots
                  harvested by pdfjs and (2) the regex-detected callouts
                  stored on the drawing record.

                  Paper-on-dark: the canvas gets a stronger drop shadow +
                  a thin light border so it reads like a real sheet of
                  vellum on a dark layout table. */}
              <div style={{ position: "relative", display: "inline-block" }}>
                <canvas
                  ref={canvasRef}
                  style={{
                    display: "block",
                    boxShadow: "0 12px 48px rgba(0,0,0,0.75), 0 2px 6px rgba(0,0,0,0.45)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    background: "#fff",
                  }}
                />

                {/* ── PDF link-hotspot layer (clickable internal/external links) ── */}
                {linkHotspots.length > 0 && (
                  <div ref={annotLayerRef} style={{ position: "absolute", top: 0, left: 0, width: canvasRef.current?.width || 0, height: canvasRef.current?.height || 0, pointerEvents: "none" }}>
                    {linkHotspots.map(a => (
                      <div
                        key={a.id}
                        onClick={() => handleAnnotationClick(a)}
                        title={a.title || a.url || "Link"}
                        style={{
                          position: "absolute",
                          left: a.left,
                          top: a.top,
                          width: a.width,
                          height: a.height,
                          cursor: "pointer",
                          pointerEvents: "auto",
                          border: "1px solid transparent",
                          borderRadius: 2,
                          transition: "border-color 0.15s, background 0.15s",
                          background: "transparent",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "rgba(200,155,32,0.12)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; }}
                      />
                    ))}
                  </div>
                )}

                {/* ── Markup layer (Tier 3: user-drawn redlines/shapes/notes) ──
                     Rendered ABOVE link hotspots + callouts so the user can
                     draw freely and selected items stay on top. */}
                <AnnotationLayer
                  viewport={currentViewport}
                  canvasWidth={canvasSize.width}
                  canvasHeight={canvasSize.height}
                  pdfPage={currentPage}
                  items={markup.items}
                  activeTool={activeTool}
                  activeColor={activeColor}
                  onAddItem={markup.addItem}
                  onRemoveItem={markup.removeItem}
                  onUpdateItem={markup.updateItem}
                />

                {/* ── Callout overlay layer — regex-detected cross-sheet refs ── */}
                {Array.isArray(activeDrawing?.callouts) && activeDrawing.callouts.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0, left: 0,
                      width:  pageSize.width  * zoom,
                      height: pageSize.height * zoom,
                      pointerEvents: "none",
                    }}
                  >
                    {activeDrawing.callouts.map((c, i) => {
                      if (!c?.coords) return null;
                      // Render-time resolution against the full project drawing
                      // list — a callout flagged `resolved: false` at upload
                      // time may still hit a sibling uploaded later.
                      const match = drawings.find(d =>
                        normalizeSN(d.sheet_number) === normalizeSN(c.targetSheetNumber)
                      );
                      const resolved = !!match;
                      return (
                        <button
                          key={i}
                          disabled={!resolved}
                          onClick={() => resolved && onCalloutClick(c)}
                          title={resolved
                            ? `${c.text} → ${match.sheet_number}${match.title ? ` · ${match.title}` : ""}`
                            : `${c.text} (no sibling sheet found)`
                          }
                          style={{
                            position: "absolute",
                            left:   Math.max(0, c.coords.x      * zoom - 2),
                            top:    Math.max(0, c.coords.y      * zoom - 2),
                            width:  Math.max(12, c.coords.width  * zoom + 4),
                            height: Math.max(12, c.coords.height * zoom + 4),
                            background: resolved ? "rgba(200,155,32,0.18)" : "rgba(255,200,0,0.05)",
                            border: resolved ? "2px solid var(--accent)" : "2px dashed rgba(200,155,32,0.35)",
                            borderRadius: 2,
                            cursor: resolved ? "pointer" : "not-allowed",
                            pointerEvents: "auto",
                            padding: 0,
                            zIndex: 5,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Thumbnail filmstrip */}
        {filmstripOpen && drawings.length > 0 && (
          <ThumbnailFilmstrip
            drawings={filtered.length > 0 ? filtered : drawings}
            activeId={activeId}
            onSelect={setActiveId}
            resolveUrl={resolveFileUrl}
            extractStoragePath={extractStoragePathFromSignedUrl}
          />
        )}

        {/* Keyboard shortcuts hint */}
        <div style={{ padding: "6px 16px", borderTop: "1px solid var(--hover-bg)", background: "var(--bg-surface)", display: "flex", gap: 16, alignItems: "center" }}>
          {[["← →", "Navigate sheets"], ["+ −", "Zoom"], ["0", "Reset zoom"], ["[ ]", "Toggle sidebar"], ["Page Up/Dn", "PDF pages"]].map(([key, desc]) => (
            <span key={key} style={{ ...mono, fontSize: 9, color: "var(--border-strong)" }}>
              <span style={{ color: "var(--text-muted)" }}>{key}</span> {desc}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            style={{
              marginLeft: "auto",
              ...mono,
              fontSize: 9,
              fontWeight: 700,
              color: "var(--accent)",
              background: "none",
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            All shortcuts (?)
          </button>
        </div>
      </div>

      {/* Right-rail context panel — linked RFIs, callouts, sibling sheets */}
      {contextOpen && activeDrawing && (
        <ContextPanel
          activeDrawing={activeDrawing}
          allDrawings={drawings}
          onSelect={setActiveId}
          onClose={() => setContextOpen(false)}
        />
      )}

      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
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
