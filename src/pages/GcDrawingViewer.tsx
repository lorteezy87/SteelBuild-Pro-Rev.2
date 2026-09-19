import React, { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileText, RotateCcw, RotateCw, Search, ZoomIn, ZoomOut } from "lucide-react";
import { useProjectId } from "@/hooks/useProjectId";
import { usePdfLoader } from "@/pages/drawingViewer/usePdfLoader";
import { usePdfRenderer } from "@/pages/drawingViewer/usePdfRenderer";
import { drawingViewerStyles } from "@/pages/drawingViewer/drawingViewerStyles";
import RenderSkeleton from "@/components/drawings/viewer/RenderSkeleton";
import { useGcDrawingsList, type GcViewerDrawing } from "@/pages/gcDrawingViewer/useGcDrawingsList";

/**
 * GcDrawingViewer — read-only viewer for GC-issued documents.
 *
 * Deliberately a separate route from /DrawingViewer rather than a mode on it.
 * That page is ~46 KB and carries markup, zones, the stage ladder and set
 * locking, none of which apply here: `drawing_markups` and the zone tables are
 * foreign-keyed to `drawings.id`, so a gc_drawings id would read back empty and
 * any write would violate the FK. Reusing the page would mean threading a
 * read-only mode through every one of those paths; reusing its *hooks* costs
 * nothing and cannot regress the shop-drawing workflow.
 *
 * What is shared is the part that actually matters: usePdfLoader (file_url ->
 * signed URL -> pdfjs document, plus pdf_page clamping) and usePdfRenderer
 * (the canvas render with its cancellation handling). Both only ever read
 * `file_url`, `id` and `pdf_page`, all of which gc_drawings carries, so
 * neither needed a change to serve this page.
 */

const PDF_PAGE_BACKGROUND = "#fff";
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

function sheetLabel(row: GcViewerDrawing | undefined): string {
  if (!row) return "No document selected";
  return row.drawing_number || row.title || "Untitled";
}

export default function GcDrawingViewer() {
  const projectId = useProjectId();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeId = searchParams.get("doc");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const { filtered, activeDrawing, isLoading } = useGcDrawingsList({
    projectId,
    activeId,
    search,
  });

  const setActiveId = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("doc", id);
      // replace: paging through sheets should not stack history entries.
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const { pdfDoc, totalPages, pdfError, currentPage, setCurrentPage } = usePdfLoader({
    activeDrawing,
    renderMode: "canvas",
  });

  const { canvasRef, rendering } = usePdfRenderer({
    pdfDoc,
    currentPage,
    zoom,
    rotation,
    onRenderError: undefined,
  });

  const revisionLabel = useMemo(() => {
    const rev = activeDrawing?.revision;
    // A GC issuance carries the GC's own revision string, which is free text.
    // Absent is unknown, not "revision 0" -- do not invent one.
    return rev && String(rev).trim() ? String(rev) : "—";
  }, [activeDrawing?.revision]);

  return (
    <div className="drawing-viewer-redesign">
      <style>{drawingViewerStyles}</style>

      <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
        {/* ── Document list ─────────────────────────────────────────── */}
        <aside
          className="drawing-viewer-pane"
          style={{
            width: 280,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid var(--border-default)",
            minHeight: 0,
          }}
        >
          <div style={{ padding: 10, borderBottom: "1px solid var(--border-default)" }}>
            <div style={{ position: "relative" }}>
              <Search
                size={13}
                style={{
                  position: "absolute",
                  left: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
                aria-hidden="true"
              />
              <input
                className="sbd-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search number or title"
                aria-label="Search GC documents"
                style={{ width: "100%", paddingLeft: 26, fontSize: 12 }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {isLoading && (
              <p style={{ padding: 12, fontSize: 12, color: "var(--text-muted)" }}>Loading…</p>
            )}

            {!isLoading && filtered.length === 0 && (
              <p style={{ padding: 12, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                {search.trim()
                  ? "No GC document matches that search."
                  : "No GC documents uploaded for this project yet. Add one from GC Documents."}
              </p>
            )}

            {filtered.map((row) => {
              const isActive = row.id === activeId;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setActiveId(row.id)}
                  aria-current={isActive ? "true" : undefined}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    border: "none",
                    borderLeft: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                    background: isActive ? "var(--bg-raised)" : "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 800,
                      color: isActive ? "var(--accent)" : "var(--text-primary)",
                    }}
                  >
                    {row.drawing_number || "—"}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.title || "Untitled"}
                  </span>
                  {/* Superseded is load-bearing on a GC set: an ASI can reissue
                      a sheet, and reading the stale one is how field work goes
                      wrong. Mark it on the row, not just in the register. */}
                  {row.is_superseded ? (
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: 3,
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: "0.06em",
                        color: "var(--status-warning)",
                      }}
                    >
                      SUPERSEDED
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Sheet ─────────────────────────────────────────────────── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          <header
            className="drawing-viewer-toolbar"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 12px",
              borderBottom: "1px solid var(--border-default)",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 800,
                color: "var(--accent)",
              }}
            >
              {sheetLabel(activeDrawing)}
            </span>
            {activeDrawing?.title ? (
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{activeDrawing.title}</span>
            ) : null}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
              REV {revisionLabel}
            </span>

            <span style={{ flex: 1 }} />

            <button type="button" className="sbd-btn-ghost" title="Zoom out"
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}>
              <ZoomOut size={14} />
            </button>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, minWidth: 42, textAlign: "center" }}>
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" className="sbd-btn-ghost" title="Zoom in"
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}>
              <ZoomIn size={14} />
            </button>
            <button type="button" className="sbd-btn-ghost" title="Rotate counter-clockwise"
              onClick={() => setRotation((r) => (r + 270) % 360)}>
              <RotateCcw size={14} />
            </button>
            <button type="button" className="sbd-btn-ghost" title="Rotate clockwise"
              onClick={() => setRotation((r) => (r + 90) % 360)}>
              <RotateCw size={14} />
            </button>

            {totalPages > 1 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <button type="button" className="sbd-btn-ghost" title="Previous page"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}>
                  ‹
                </button>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  {currentPage} / {totalPages}
                </span>
                <button type="button" className="sbd-btn-ghost" title="Next page"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}>
                  ›
                </button>
              </span>
            )}
          </header>

          <div className="drawing-viewer-canvas-scroll" style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
            {!activeDrawing && (
              <div className="drawing-viewer-empty-state">
                <FileText className="drawing-viewer-empty-icon" size={30} aria-hidden="true" />
                <p className="drawing-viewer-empty-title">No document open</p>
                <p className="drawing-viewer-empty-copy">
                  Pick a GC drawing, ASI or addendum from the list to view it.
                </p>
              </div>
            )}

            {/* An upload with no file is a real state -- the register row can
                exist before the PDF lands -- and it is not the same as a load
                failure. Say which one it is. */}
            {activeDrawing && !activeDrawing.file_url && (
              <div className="drawing-viewer-empty-state">
                <FileText className="drawing-viewer-empty-icon" size={30} aria-hidden="true" />
                <p className="drawing-viewer-empty-title">No file attached</p>
                <p className="drawing-viewer-empty-copy">
                  This document is logged in the register but has no PDF uploaded against it yet.
                </p>
              </div>
            )}

            {activeDrawing && activeDrawing.file_url && pdfError && (
              <div className="drawing-viewer-empty-state">
                <FileText className="drawing-viewer-empty-icon" size={30} aria-hidden="true" />
                <p className="drawing-viewer-empty-title">Could not open this PDF</p>
                <p className="drawing-viewer-empty-copy">{String(pdfError)}</p>
              </div>
            )}

            {activeDrawing && activeDrawing.file_url && !pdfError && (
              <div className="drawing-viewer-paper-wrap">
                {rendering && (
                  <RenderSkeleton
                    label={`Rendering page ${currentPage}${totalPages > 1 ? ` of ${totalPages}` : ""}`}
                  />
                )}
                <div style={{ position: "relative", display: "inline-block" }}>
                  <canvas ref={canvasRef} style={{ display: "block", background: PDF_PAGE_BACKGROUND }} />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
