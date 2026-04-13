import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { base44, resolveFileUrl } from "@/api/base44Client";
import { useProjectContext } from "@/components/shared/useProjectContext";
import * as pdfjsLib from "pdfjs-dist";
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

// ── Sheet Reference Patterns ────────────────────────────────────────────────
// Matches structural drawing callout patterns found on steel construction sheets
// Examples: "S2-003", "A560", "25531-011", "3/S5-001", "S-101", "A5.01"
const SHEET_REF_PATTERNS = [
  // "Detail/SheetRef" pattern: "3/S5-001" or "A/S2-003"
  /(\d+)\s*\/\s*([A-Z][\w]*[-.][\w.]+)/gi,
  // Standard sheet patterns: "S2-003", "A560", "S-101", "A5.01", "M1-001"
  /\b([A-Z]{1,2}\d{0,2}[-.]?\d{2,4})\b/g,
  // Long number patterns like "25531-011"
  /\b(\d{4,6}[-]\d{2,4})\b/g,
];

/**
 * Extract text items from a PDF page with their positions.
 * Returns items that match known sheet numbers in the project.
 */
async function extractSheetReferences(page, viewport, sheetNumberSet) {
  const textContent = await page.getTextContent();
  const links = [];
  const seen = new Set();

  for (const item of textContent.items) {
    const text = item.str?.trim();
    if (!text || text.length < 3) continue;

    // Check each pattern against the text
    for (const pattern of SHEET_REF_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // For detail/sheet pattern, the sheet ref is group 2
        const candidate = match[2] || match[1] || match[0];
        const normalized = candidate.toUpperCase().trim();

        // Check if this matches any sheet in the project
        if (sheetNumberSet.has(normalized)) {
          // Compute bounding box in canvas coordinates
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
          const x = tx[4];
          const y = tx[5] - item.height;
          const w = item.width || text.length * 6;
          const h = item.height || 12;

          const key = `${normalized}-${Math.round(x)}-${Math.round(y)}`;
          if (!seen.has(key)) {
            seen.add(key);
            links.push({
              sheetNumber: normalized,
              detailNumber: match[2] ? match[1] : null,
              x, y, w: w + 8, h: h + 4,
              text: match[0],
            });
          }
        }
      }
    }
  }
  return links;
}

export default function DrawingViewer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id;

  const initialId = searchParams.get("id") || searchParams.get("drawingId") || searchParams.get("docId");

  const [activeId, setActiveId] = useState(initialId || null);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [zoom, setZoom] = useState(1.0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [resolvedUrl, setResolvedUrl] = useState(null);

  // ── Callout Hyperlinking State ──────────────────────────────────────────────
  const [linkMode, setLinkMode] = useState(true);
  const [calloutLinks, setCalloutLinks] = useState([]);
  const [hoveredLink, setHoveredLink] = useState(null);
  const [navHistory, setNavHistory] = useState([]); // stack of sheet IDs for back nav
  const [scanningLinks, setScanningLinks] = useState(false);

  // ── Compare Mode State ──────────────────────────────────────────────────────
  const [compareMode, setCompareMode] = useState(false);
  const [compareDrawingId, setCompareDrawingId] = useState(null);
  const [comparePdfDoc, setComparePdfDoc] = useState(null);
  const [compareRendering, setCompareRendering] = useState(false);
  const [compareResolvedUrl, setCompareResolvedUrl] = useState(null);
  const [comparePdfError, setComparePdfError] = useState(null);

  const canvasRef = useRef(null);
  const compareCanvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const compareRenderTaskRef = useRef(null);

  // ── Load all drawings for this project ──────────────────────────────────────
  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => projectId ? base44.entities.Drawing.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 30000,
  });

  // Build lookup maps for sheet matching
  const sheetNumberSet = useMemo(() => {
    const set = new Set();
    drawings.forEach(d => {
      if (d.sheet_number) set.add(d.sheet_number.toUpperCase().trim());
    });
    return set;
  }, [drawings]);

  const sheetToDrawing = useMemo(() => {
    const map = new Map();
    drawings.forEach(d => {
      if (d.sheet_number) map.set(d.sheet_number.toUpperCase().trim(), d);
    });
    return map;
  }, [drawings]);

  // ── Compare revision candidates: other revisions of the same sheet ─────────
  const compareRevisionCandidates = useMemo(() => {
    if (!activeDrawing) return [];
    const sheetNum = activeDrawing.sheet_number?.toUpperCase().trim();
    if (!sheetNum) return [];

    // Collect sibling revisions from drawings list (different id, same sheet_number)
    const siblings = drawings.filter(d =>
      d.id !== activeDrawing.id &&
      d.sheet_number?.toUpperCase().trim() === sheetNum
    );

    // Also collect entries from the active drawing's revision_history JSON
    const historyEntries = [];
    if (activeDrawing.revision_history) {
      try {
        const history = typeof activeDrawing.revision_history === "string"
          ? JSON.parse(activeDrawing.revision_history)
          : activeDrawing.revision_history;
        if (Array.isArray(history)) {
          history.forEach((entry, idx) => {
            if (entry.file_url) {
              historyEntries.push({
                id: `history-${idx}`,
                sheet_number: sheetNum,
                title: activeDrawing.title,
                revision_number: entry.revision_number ?? entry.rev ?? idx,
                file_url: entry.file_url,
                stage: entry.stage || "—",
                _isHistory: true,
              });
            }
          });
        }
      } catch (e) {
        // ignore malformed revision_history
      }
    }

    // Combine and sort by revision number descending
    return [...siblings, ...historyEntries].sort((a, b) =>
      (Number(b.revision_number) || 0) - (Number(a.revision_number) || 0)
    );
  }, [activeDrawing, drawings]);

  const compareDrawing = useMemo(() => {
    if (!compareDrawingId) return null;
    // Check real drawings first, then revision candidates
    return drawings.find(d => d.id === compareDrawingId) ||
      compareRevisionCandidates.find(d => d.id === compareDrawingId) ||
      null;
  }, [compareDrawingId, drawings, compareRevisionCandidates]);

  const filtered = search.trim()
    ? drawings.filter(d =>
        d.sheet_number?.toLowerCase().includes(search.toLowerCase()) ||
        d.title?.toLowerCase().includes(search.toLowerCase())
      )
    : drawings;

  const activeDrawing = drawings.find(d => d.id === activeId);
  const activeIndex = filtered.findIndex(d => d.id === activeId);

  // ── Navigate to a sheet via callout link ─────────────────────────────────────
  const navigateToSheet = useCallback((sheetNumber) => {
    const target = sheetToDrawing.get(sheetNumber.toUpperCase().trim());
    if (!target) return;
    // Push current sheet to history stack
    if (activeId) {
      setNavHistory(prev => [...prev, activeId]);
    }
    setActiveId(target.id);
  }, [sheetToDrawing, activeId]);

  const navigateBack = useCallback(() => {
    if (navHistory.length === 0) return;
    const prev = navHistory[navHistory.length - 1];
    setNavHistory(h => h.slice(0, -1));
    setActiveId(prev);
  }, [navHistory]);

  // Resolve file_url (storage path) to a signed URL
  useEffect(() => {
    let cancelled = false;
    setResolvedUrl(null);
    setPdfDoc(null);
    setPdfError(null);
    setCurrentPage(1);
    setTotalPages(0);
    setCalloutLinks([]);
    setCompareDrawingId(null);
    setComparePdfDoc(prev => { if (prev) prev.destroy().catch(() => {}); return null; });
    setComparePdfError(null);
    setCompareResolvedUrl(null);

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

  // ── Resolve compare drawing file URL ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setCompareResolvedUrl(null);
    setComparePdfDoc(prev => { if (prev) prev.destroy().catch(() => {}); return null; });
    setComparePdfError(null);

    const rawUrl = compareDrawing?.file_url;
    if (!rawUrl || !compareMode) return;

    resolveFileUrl(rawUrl)
      .then(url => { if (!cancelled) setCompareResolvedUrl(url); })
      .catch(err => { if (!cancelled) setComparePdfError(`Failed to resolve compare URL: ${err.message}`); });

    return () => { cancelled = true; };
  }, [compareDrawing?.file_url, compareMode]);

  // ── Load comparison PDF from resolved URL ──────────────────────────────────
  useEffect(() => {
    if (!compareResolvedUrl || !compareMode) return;

    let cancelled = false;
    let loadingTask = null;

    loadingTask = pdfjsLib.getDocument(compareResolvedUrl);
    loadingTask.promise
      .then(doc => {
        if (cancelled) { doc.destroy(); return; }
        setComparePdfDoc(doc);
        setComparePdfError(null);
      })
      .catch(err => {
        if (!cancelled) setComparePdfError(`Compare PDF load failed: ${err.message}`);
      });

    return () => {
      cancelled = true;
      if (loadingTask) loadingTask.destroy?.();
    };
  }, [compareResolvedUrl, compareMode]);

  // ── Clean up comparePdfDoc on unmount or when compare mode turns off ───────
  useEffect(() => {
    if (!compareMode && comparePdfDoc) {
      comparePdfDoc.destroy().catch(() => {});
      setComparePdfDoc(null);
    }
  }, [compareMode]);

  useEffect(() => {
    return () => {
      if (comparePdfDoc) comparePdfDoc.destroy().catch(() => {});
    };
  }, [comparePdfDoc]);

  // ── Render page when doc, page, or zoom changes ────────────────────────────
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    // Cancel any in-flight render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    setRendering(true);
    setCalloutLinks([]);
    try {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");

      renderTaskRef.current = page.render({ canvasContext: ctx, viewport });
      await renderTaskRef.current.promise;

      // After render, scan for sheet references if link mode is on
      if (linkMode && sheetNumberSet.size > 0) {
        setScanningLinks(true);
        try {
          const links = await extractSheetReferences(page, viewport, sheetNumberSet);
          // Filter out self-references
          const selfSheet = activeDrawing?.sheet_number?.toUpperCase().trim();
          const filtered = links.filter(l => l.sheetNumber !== selfSheet);
          setCalloutLinks(filtered);
        } catch (err) {
          console.warn("Callout scan failed:", err);
        } finally {
          setScanningLinks(false);
        }
      }
    } catch (err) {
      if (err?.name !== "RenderingCancelledException") {
        console.error("Render error:", err);
      }
    } finally {
      setRendering(false);
      renderTaskRef.current = null;
    }
  }, [pdfDoc, currentPage, zoom, linkMode, sheetNumberSet, activeDrawing?.sheet_number]);

  useEffect(() => { renderPage(); }, [renderPage]);

  // ── Render comparison canvas ───────────────────────────────────────────────
  const renderComparePage = useCallback(async () => {
    if (!comparePdfDoc || !compareCanvasRef.current || !compareMode) return;

    if (compareRenderTaskRef.current) {
      compareRenderTaskRef.current.cancel();
      compareRenderTaskRef.current = null;
    }

    setCompareRendering(true);
    try {
      const pageNum = Math.min(currentPage, comparePdfDoc.numPages);
      const page = await comparePdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: zoom });
      const canvas = compareCanvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");

      compareRenderTaskRef.current = page.render({ canvasContext: ctx, viewport });
      await compareRenderTaskRef.current.promise;
    } catch (err) {
      if (err?.name !== "RenderingCancelledException") {
        console.error("Compare render error:", err);
      }
    } finally {
      setCompareRendering(false);
      compareRenderTaskRef.current = null;
    }
  }, [comparePdfDoc, currentPage, zoom, compareMode]);

  useEffect(() => { renderComparePage(); }, [renderComparePage]);

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
      } else if (e.key === "l" || e.key === "L") {
        setLinkMode(m => !m);
      } else if (e.key === "Backspace" && navHistory.length > 0) {
        e.preventDefault();
        navigateBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, activeIndex, totalPages, navHistory, navigateBack]);

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
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = activeDrawing?.file_name || activeDrawing?.title || "drawing.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Get the previous sheet title for the back button
  const prevSheetTitle = useMemo(() => {
    if (navHistory.length === 0) return null;
    const prevId = navHistory[navHistory.length - 1];
    const d = drawings.find(dr => dr.id === prevId);
    return d ? d.sheet_number : null;
  }, [navHistory, drawings]);

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
          {filtered.map((d) => {
            const isActive = d.id === activeId;
            const stageColor = STAGES[d.stage]?.color || "#6B7280";
            return (
              <div key={d.id} onClick={() => setActiveId(d.id)}
                style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--hover-bg)", background: isActive ? "rgba(200,155,32,0.12)" : "none", borderLeft: `3px solid ${isActive ? "var(--accent)" : "transparent"}`, transition: "background 0.1s" }}>
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

        {/* Breadcrumb back bar (when navigated via callout) */}
        {navHistory.length > 0 && (
          <div style={{
            padding: "6px 16px",
            background: "rgba(59,130,246,0.08)",
            borderBottom: "1px solid rgba(59,130,246,0.2)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}>
            <button
              onClick={navigateBack}
              style={{
                ...mono, fontSize: 10, fontWeight: 700,
                background: "rgba(59,130,246,0.15)",
                border: "1px solid rgba(59,130,246,0.3)",
                borderRadius: 4,
                color: "#3B82F6",
                padding: "3px 10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              ← Back to {prevSheetTitle}
            </button>
            <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
              {navHistory.length} sheet{navHistory.length > 1 ? "s" : ""} deep
            </span>
            {navHistory.length > 1 && (
              <button
                onClick={() => { setActiveId(navHistory[0]); setNavHistory([]); }}
                style={{ ...mono, fontSize: 9, background: "none", border: "none", color: "#3B82F6", cursor: "pointer", padding: 0, textDecoration: "underline" }}
              >
                Return to start
              </button>
            )}
          </div>
        )}

        {/* Viewer toolbar */}
        <div style={{ height: 48, borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", gap: 10, padding: "0 16px", flexShrink: 0, background: "var(--bg-surface)" }}>
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? "Hide sheet list (more drawing space)" : "Show sheet list"}
            style={{
              ...toolBtn,
              fontSize: 14,
              padding: "4px 8px",
              color: sidebarOpen ? "var(--accent)" : "var(--text-muted)",
              background: sidebarOpen ? "var(--accent-muted)" : "none",
              border: sidebarOpen ? "1px solid var(--accent-border)" : "1px solid var(--border-default)",
              flexShrink: 0,
            }}
          >
            {sidebarOpen ? "◁" : "▷"}
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

          {/* Link Mode Toggle */}
          <button
            onClick={() => setLinkMode(m => !m)}
            title={linkMode ? "Disable callout links (L)" : "Enable callout links (L)"}
            style={{
              ...toolBtn,
              ...mono,
              fontSize: 9,
              color: linkMode ? "#3B82F6" : "var(--text-muted)",
              background: linkMode ? "rgba(59,130,246,0.12)" : "none",
              border: linkMode ? "1px solid rgba(59,130,246,0.4)" : "1px solid var(--border-default)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            LINKS
            {calloutLinks.length > 0 && (
              <span style={{
                background: "#3B82F6",
                color: "white",
                borderRadius: 8,
                padding: "0 5px",
                fontSize: 8,
                fontWeight: 700,
                minWidth: 14,
                textAlign: "center",
              }}>
                {calloutLinks.length}
              </span>
            )}
          </button>

          {/* Compare Mode Toggle */}
          <button
            onClick={() => {
              if (compareMode) {
                setCompareMode(false);
                setCompareDrawingId(null);
                if (comparePdfDoc) { comparePdfDoc.destroy().catch(() => {}); setComparePdfDoc(null); }
              } else {
                setCompareMode(true);
              }
            }}
            disabled={!activeDrawing}
            title="Side-by-side revision comparison"
            style={{
              ...toolBtn,
              ...mono,
              fontSize: 9,
              color: compareMode ? "#A855F7" : "var(--text-muted)",
              background: compareMode ? "rgba(168,85,247,0.12)" : "none",
              border: compareMode ? "1px solid rgba(168,85,247,0.4)" : "1px solid var(--border-default)",
              opacity: activeDrawing ? 1 : 0.3,
            }}
          >
            ⇔ COMPARE
          </button>

          <button onClick={handleDownload} disabled={!activeDrawing?.file_url}
            style={{ ...toolBtn, ...mono, fontSize: 9, color: "var(--accent)", opacity: activeDrawing?.file_url ? 1 : 0.3 }}>
            ↓ PDF
          </button>
        </div>

        {/* Canvas area */}
        <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: compareMode ? 12 : 24, background: "#1a1a2e" }}>
          {!activeDrawing ? (
            <div style={{ margin: "auto", textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }}>▦</div>
              <p style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.2em" }}>SELECT A SHEET FROM THE SIDEBAR</p>
              <p style={{ ...mono, fontSize: 9, color: "var(--border-strong)", marginTop: 8 }}>← → to navigate · + − to zoom · 0 to reset</p>
            </div>
          ) : pdfError ? (
            <div style={{ margin: "auto", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>⚠</div>
              <p style={{ ...mono, fontSize: 11, color: "var(--status-error)", letterSpacing: "0.1em" }}>{pdfError}</p>
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
          ) : !activeDrawing.file_url ? (
            <div style={{ margin: "auto", textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.15 }}>📄</div>
              <p style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.15em" }}>NO PDF ATTACHED</p>
              <p style={{ ...mono, fontSize: 9, color: "var(--border-strong)", marginTop: 6 }}>Edit this sheet to attach a PDF file URL</p>
            </div>
          ) : compareMode ? (
            /* ── Split Comparison View ─────────────────────────────────────────── */
            <div style={{ display: "flex", gap: 0, width: "100%", height: "100%", minHeight: 0 }}>

              {/* LEFT PANEL: Current Revision */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
                {/* Left panel header */}
                <div style={{
                  padding: "8px 12px",
                  background: "rgba(16,185,129,0.08)",
                  borderBottom: "2px solid rgba(16,185,129,0.3)",
                  borderRadius: "4px 4px 0 0",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexShrink: 0,
                }}>
                  <span style={{
                    ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.15em",
                    color: "#10B981", textTransform: "uppercase",
                  }}>
                    CURRENT
                  </span>
                  <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>
                    {activeDrawing.sheet_number}
                  </span>
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
                    R{activeDrawing.revision_number ?? "0"}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {activeDrawing.title}
                  </span>
                </div>

                {/* Left canvas area */}
                <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 12 }}>
                  <div style={{ position: "relative" }}>
                    {rendering && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", zIndex: 10, ...mono, fontSize: 10, color: "var(--accent)", letterSpacing: "0.2em" }}>
                        RENDERING…
                      </div>
                    )}
                    <canvas ref={canvasRef} style={{ display: "block", boxShadow: "0 4px 32px rgba(0,0,0,0.6)", maxWidth: "100%" }} />

                    {/* Callout Link Overlay (left panel) */}
                    {linkMode && calloutLinks.length > 0 && !rendering && (
                      <div style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: canvasRef.current?.width || 0,
                        height: canvasRef.current?.height || 0,
                        pointerEvents: "none",
                      }}>
                        {calloutLinks.map((link, i) => {
                          const isHovered = hoveredLink === i;
                          const target = sheetToDrawing.get(link.sheetNumber);
                          return (
                            <div
                              key={i}
                              onClick={() => navigateToSheet(link.sheetNumber)}
                              onMouseEnter={() => setHoveredLink(i)}
                              onMouseLeave={() => setHoveredLink(null)}
                              style={{
                                position: "absolute",
                                left: link.x - 4,
                                top: link.y - 2,
                                width: link.w,
                                height: link.h,
                                border: isHovered
                                  ? "2px solid #3B82F6"
                                  : "1.5px solid rgba(59,130,246,0.45)",
                                borderRadius: 3,
                                background: isHovered
                                  ? "rgba(59,130,246,0.18)"
                                  : "rgba(59,130,246,0.06)",
                                cursor: "pointer",
                                pointerEvents: "auto",
                                transition: "all 0.12s ease",
                                boxShadow: isHovered ? "0 0 8px rgba(59,130,246,0.4)" : "none",
                              }}
                              title={`Go to ${link.sheetNumber}${target ? ` — ${target.title}` : ""}`}
                            >
                              {isHovered && (
                                <div style={{
                                  position: "absolute",
                                  bottom: "calc(100% + 6px)",
                                  left: "50%",
                                  transform: "translateX(-50%)",
                                  background: "rgba(15,17,23,0.95)",
                                  border: "1px solid rgba(59,130,246,0.4)",
                                  borderRadius: 6,
                                  padding: "6px 10px",
                                  whiteSpace: "nowrap",
                                  zIndex: 20,
                                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                                }}>
                                  <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "#3B82F6", marginBottom: 2 }}>
                                    → {link.sheetNumber}
                                  </div>
                                  {target && (
                                    <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
                                      {target.title}
                                      {target.stage && ` · ${target.stage === "Released" ? "IFC" : target.stage}`}
                                    </div>
                                  )}
                                  <div style={{ ...mono, fontSize: 8, color: "rgba(59,130,246,0.6)", marginTop: 2 }}>
                                    Click to navigate
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {scanningLinks && (
                      <div style={{
                        position: "absolute", top: 8, right: 8,
                        ...mono, fontSize: 9, color: "#3B82F6",
                        background: "rgba(15,17,23,0.85)", padding: "4px 8px",
                        borderRadius: 4, border: "1px solid rgba(59,130,246,0.3)",
                        animation: "gentlePulse 1s ease infinite",
                      }}>
                        Scanning for links…
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* CENTER DIVIDER */}
              <div style={{
                width: 3,
                background: "linear-gradient(180deg, rgba(168,85,247,0.4) 0%, rgba(168,85,247,0.15) 50%, rgba(168,85,247,0.4) 100%)",
                flexShrink: 0,
                position: "relative",
              }}>
                <div style={{
                  position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                  width: 20, height: 20, borderRadius: "50%",
                  background: "#1a1a2e", border: "2px solid rgba(168,85,247,0.5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  ...mono, fontSize: 8, color: "#A855F7",
                }}>
                  ⇔
                </div>
              </div>

              {/* RIGHT PANEL: Comparison Revision */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
                {/* Right panel header with revision selector */}
                <div style={{
                  padding: "8px 12px",
                  background: "rgba(168,85,247,0.08)",
                  borderBottom: "2px solid rgba(168,85,247,0.3)",
                  borderRadius: "4px 4px 0 0",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexShrink: 0,
                  flexWrap: "wrap",
                }}>
                  <span style={{
                    ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.15em",
                    color: "#A855F7", textTransform: "uppercase",
                  }}>
                    COMPARE
                  </span>

                  {/* Revision selector dropdown */}
                  {compareRevisionCandidates.length > 0 ? (
                    <select
                      value={compareDrawingId || ""}
                      onChange={e => setCompareDrawingId(e.target.value || null)}
                      style={{
                        ...mono,
                        fontSize: 10,
                        background: "rgba(168,85,247,0.1)",
                        border: "1px solid rgba(168,85,247,0.35)",
                        borderRadius: 3,
                        color: "var(--text-primary)",
                        padding: "3px 8px",
                        cursor: "pointer",
                        maxWidth: 260,
                      }}
                    >
                      <option value="" style={{ background: "#1a1a2e" }}>Select revision…</option>
                      {compareRevisionCandidates.map(d => (
                        <option key={d.id} value={d.id} style={{ background: "#1a1a2e" }}>
                          R{d.revision_number ?? "?"} — {d.sheet_number}{d.is_superseded ? " (superseded)" : ""}{d._isHistory ? " (history)" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", fontStyle: "italic" }}>
                      No other revisions available
                    </span>
                  )}

                  {compareDrawing && (
                    <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
                      R{compareDrawing.revision_number ?? "0"} · {compareDrawing.stage || "—"}
                    </span>
                  )}
                </div>

                {/* Right canvas area */}
                <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 12 }}>
                  {!compareDrawingId ? (
                    <div style={{ margin: "auto", textAlign: "center" }}>
                      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.15 }}>⇔</div>
                      <p style={{ ...mono, fontSize: 11, color: "rgba(168,85,247,0.5)", letterSpacing: "0.15em" }}>
                        SELECT A REVISION
                      </p>
                      <p style={{ ...mono, fontSize: 9, color: "var(--border-strong)", marginTop: 6 }}>
                        Choose an older revision above to compare side by side
                      </p>
                    </div>
                  ) : comparePdfError ? (
                    <div style={{ margin: "auto", textAlign: "center" }}>
                      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>⚠</div>
                      <p style={{ ...mono, fontSize: 11, color: "var(--status-error)", letterSpacing: "0.1em" }}>{comparePdfError}</p>
                    </div>
                  ) : (
                    <div style={{ position: "relative" }}>
                      {compareRendering && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", zIndex: 10, ...mono, fontSize: 10, color: "#A855F7", letterSpacing: "0.2em" }}>
                          RENDERING…
                        </div>
                      )}
                      <canvas ref={compareCanvasRef} style={{ display: "block", boxShadow: "0 4px 32px rgba(0,0,0,0.6)", maxWidth: "100%" }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ── Single Canvas View (original) ────────────────────────────────── */
            <div style={{ position: "relative" }}>
              {rendering && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", zIndex: 10, ...mono, fontSize: 10, color: "var(--accent)", letterSpacing: "0.2em" }}>
                  RENDERING…
                </div>
              )}
              <canvas ref={canvasRef} style={{ display: "block", boxShadow: "0 4px 32px rgba(0,0,0,0.6)" }} />

              {/* ── Callout Link Overlay ──────────────────────────────────────── */}
              {linkMode && calloutLinks.length > 0 && !rendering && (
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: canvasRef.current?.width || 0,
                  height: canvasRef.current?.height || 0,
                  pointerEvents: "none",
                }}>
                  {calloutLinks.map((link, i) => {
                    const isHovered = hoveredLink === i;
                    const target = sheetToDrawing.get(link.sheetNumber);
                    return (
                      <div
                        key={i}
                        onClick={() => navigateToSheet(link.sheetNumber)}
                        onMouseEnter={() => setHoveredLink(i)}
                        onMouseLeave={() => setHoveredLink(null)}
                        style={{
                          position: "absolute",
                          left: link.x - 4,
                          top: link.y - 2,
                          width: link.w,
                          height: link.h,
                          border: isHovered
                            ? "2px solid #3B82F6"
                            : "1.5px solid rgba(59,130,246,0.45)",
                          borderRadius: 3,
                          background: isHovered
                            ? "rgba(59,130,246,0.18)"
                            : "rgba(59,130,246,0.06)",
                          cursor: "pointer",
                          pointerEvents: "auto",
                          transition: "all 0.12s ease",
                          boxShadow: isHovered ? "0 0 8px rgba(59,130,246,0.4)" : "none",
                        }}
                        title={`Go to ${link.sheetNumber}${target ? ` — ${target.title}` : ""}`}
                      >
                        {/* Hover tooltip */}
                        {isHovered && (
                          <div style={{
                            position: "absolute",
                            bottom: "calc(100% + 6px)",
                            left: "50%",
                            transform: "translateX(-50%)",
                            background: "rgba(15,17,23,0.95)",
                            border: "1px solid rgba(59,130,246,0.4)",
                            borderRadius: 6,
                            padding: "6px 10px",
                            whiteSpace: "nowrap",
                            zIndex: 20,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                            animation: "fadeIn 0.1s ease",
                          }}>
                            <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "#3B82F6", marginBottom: 2 }}>
                              → {link.sheetNumber}
                            </div>
                            {target && (
                              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
                                {target.title}
                                {target.stage && ` · ${target.stage === "Released" ? "IFC" : target.stage}`}
                              </div>
                            )}
                            <div style={{ ...mono, fontSize: 8, color: "rgba(59,130,246,0.6)", marginTop: 2 }}>
                              Click to navigate
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Scanning indicator */}
              {scanningLinks && (
                <div style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  ...mono,
                  fontSize: 9,
                  color: "#3B82F6",
                  background: "rgba(15,17,23,0.85)",
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid rgba(59,130,246,0.3)",
                  animation: "gentlePulse 1s ease infinite",
                }}>
                  Scanning for links…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Keyboard shortcuts hint */}
        <div style={{ padding: "6px 16px", borderTop: "1px solid var(--hover-bg)", background: "var(--bg-surface)", display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            ["← →", "Sheets"],
            ["+ −", "Zoom"],
            ["0", "Reset"],
            ["[ ]", "Sidebar"],
            ["L", "Links"],
            ...(navHistory.length > 0 ? [["⌫", "Back"]] : []),
            ...(totalPages > 1 ? [["PgUp/Dn", "Pages"]] : []),
          ].map(([key, desc]) => (
            <span key={key} style={{ ...mono, fontSize: 9, color: "var(--border-strong)" }}>
              <span style={{ color: "var(--text-muted)" }}>{key}</span> {desc}
            </span>
          ))}
          {compareMode && (
            <span style={{ ...mono, fontSize: 9, color: "rgba(168,85,247,0.7)", marginLeft: linkMode && calloutLinks.length > 0 ? 0 : "auto" }}>
              COMPARE MODE
            </span>
          )}
          {linkMode && calloutLinks.length > 0 && (
            <span style={{ ...mono, fontSize: 9, color: "rgba(59,130,246,0.7)", marginLeft: compareMode ? 0 : "auto" }}>
              {calloutLinks.length} link{calloutLinks.length !== 1 ? "s" : ""} detected
            </span>
          )}
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
