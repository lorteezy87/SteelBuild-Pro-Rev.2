/**
 * TitleblockMarkerModal — drag two rectangles on a sheet PDF to teach the
 * ingest pipeline where the title and sheet-number live in this set's
 * titleblock.
 *
 * Coordinates are stored normalised (0..1 of page width/height) on the
 * drawing_sets row, so they survive any zoom level and apply uniformly
 * across every sheet in the set. Schema lives in migration 057; the
 * shape is enforced at the DB layer with a CHECK constraint.
 *
 * Two-step flow:
 *   1. User picks a page (defaults to page 1 of the set PDF).
 *   2. User clicks "Draw title rect" → drags a box → that snapshot is
 *      saved client-side as the title rect.
 *   3. User clicks "Draw number rect" → drags a box → same.
 *   4. "Save" writes both rects to drawing_sets.titleblock_*_rect.
 *
 * Either rect can be null on save (DB allows it) but the ingest pipeline
 * (slice 3) only treats a set as templated when both are present, so the
 * Save button stays disabled until both have been drawn.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { base44, resolveFileUrl } from "@/api/base44Client";
import { parseTitleblockRect } from "@/lib/titleblock";
import { extractTextFromRect } from "@/lib/pdfTitleblockText";
import { toast } from "sonner";

// Set the worker once, idempotently. Same pattern as pdfSheetExtractor.js.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ─── Local style helpers ────────────────────────────────────────────────
const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
  zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
};

const dialogStyle = {
  background: "var(--bg-surface-secondary)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  width: "min(1100px, 95vw)",
  height: "min(800px, 92vh)",
  display: "flex", flexDirection: "column",
  overflow: "hidden",
};

const headerStyle = {
  padding: "14px 18px",
  borderBottom: "1px solid var(--border-default)",
  display: "flex", alignItems: "center", justifyContent: "space-between",
  flexShrink: 0,
};

const toolbarStyle = {
  padding: "10px 18px",
  borderBottom: "1px solid var(--border-default)",
  display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
  flexShrink: 0,
  background: "var(--bg-surface-low)",
};

const canvasWrapStyle = {
  flex: 1,
  overflow: "auto",
  background: "rgba(0,0,0,0.4)",
  position: "relative",
  display: "flex",
  // `safe` alignment: center the sheet when it fits, but fall back to
  // start-alignment when it's larger than the viewport. Plain `center` makes
  // the leading (left/top) overflow unreachable by scrolling, which clips the
  // sheet edges — exactly where titleblocks live — so the corners can't be
  // marked. `safe` keeps every edge scroll-reachable (and degrades to a
  // reachable flex-start on browsers that don't support the keyword).
  alignItems: "safe center",
  justifyContent: "safe center",
  padding: 16,
};

const footerStyle = {
  padding: "12px 18px",
  borderTop: "1px solid var(--border-default)",
  display: "flex", alignItems: "center", justifyContent: "space-between",
  gap: 12, flexShrink: 0,
};

const btn = (variant = "secondary") => ({
  padding: "8px 14px",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
  border: variant === "primary"
    ? "1px solid var(--accent)"
    : "1px solid var(--border-default)",
  background: variant === "primary" ? "var(--accent)" : "transparent",
  color: variant === "primary" ? "var(--bg-base)" : "var(--text-primary)",
  transition: "background 0.12s, opacity 0.12s",
});

// ─── Component ──────────────────────────────────────────────────────────
export default function TitleblockMarkerModal({ set, onClose, onSaved }) {
  // The set may have multiple sheets; we render set.file_url which is the
  // full set PDF (every page is one sheet). When set.file_url is missing
  // we fall back to the first sheet's file_url.
  const sourceUrl = set?.file_url || set?.sheets?.[0]?.file_url || null;

  // Render state.
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const pdfDocRef = useRef(null);
  const [pdfReady, setPdfReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  // The viewport size at the rendered scale — we need this to convert
  // mouse coords to normalised PDF coords on save.
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  // Marker state. Rects are stored in NORMALISED coords (0..1) regardless
  // of zoom, so changing the page or zoom doesn't invalidate them.
  const [titleRect, setTitleRect] = useState(() => parseTitleblockRect(set?.titleblock_title_rect));
  const [numberRect, setNumberRect] = useState(() => parseTitleblockRect(set?.titleblock_number_rect));
  // Which rect we're currently drawing: 'title' | 'number' | null.
  const [drawing, setDrawing] = useState(null);
  // In-progress drag (also normalised coords) so the preview rectangle
  // tracks the mouse as the user is dragging.
  const [dragRect, setDragRect] = useState(null);
  const [saving, setSaving] = useState(false);
  // Progress while we re-extract the existing sheets in the set after
  // the rectangles save. Shape: null = not running; { done, total }
  // = X of Y completed.
  const [reExtractProgress, setReExtractProgress] = useState(null);

  // ── Load + render ───────────────────────────────────────────────────
  useEffect(() => {
    if (!sourceUrl) {
      setLoadError("No file is attached to this set yet.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Storage paths come back as private object keys; resolveFileUrl()
        // signs them. http(s) URLs pass straight through.
        const signed = await resolveFileUrl(sourceUrl);
        if (cancelled) return;
        const resp = await fetch(signed);
        const buf = await resp.arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setPdfReady(true);
      } catch (err) {
        if (!cancelled) setLoadError(err?.message || "Failed to load PDF");
      }
    })();
    return () => { cancelled = true; };
  }, [sourceUrl]);

  // Render the current page whenever the page changes or the PDF loads.
  useEffect(() => {
    if (!pdfReady || !pdfDocRef.current || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDocRef.current.getPage(pageNum);
        if (cancelled) return;
        // Fit-to-width inside the canvas wrap. We render at a moderate
        // scale (1.5×) to keep the canvas crisp without exploding GPU
        // memory on large architectural drawings.
        const renderScale = 1.5;
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;
        setViewportSize({ width: viewport.width, height: viewport.height });
      } catch (err) {
        if (!cancelled) setLoadError(err?.message || "Failed to render page");
      }
    })();
    return () => { cancelled = true; };
  }, [pageNum, pdfReady]);

  // ── Mouse → normalised coord helpers ────────────────────────────────
  const mouseToNormalised = useCallback((e) => {
    const overlay = overlayRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }, []);

  const dragStartRef = useRef(null);

  const handleMouseDown = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const start = mouseToNormalised(e);
    if (!start) return;
    dragStartRef.current = start;
    setDragRect({ x: start.x, y: start.y, width: 0, height: 0 });
  };

  const handleMouseMove = (e) => {
    if (!drawing || !dragStartRef.current) return;
    const cur = mouseToNormalised(e);
    if (!cur) return;
    const start = dragStartRef.current;
    const x = Math.min(start.x, cur.x);
    const y = Math.min(start.y, cur.y);
    const width = Math.abs(cur.x - start.x);
    const height = Math.abs(cur.y - start.y);
    setDragRect({ x, y, width, height });
  };

  const handleMouseUp = () => {
    if (!drawing || !dragStartRef.current || !dragRect) {
      dragStartRef.current = null;
      setDragRect(null);
      return;
    }
    // Reject zero-area drags (just a click) so we don't save 0×0 rects.
    if (dragRect.width < 0.005 || dragRect.height < 0.005) {
      dragStartRef.current = null;
      setDragRect(null);
      return;
    }
    if (drawing === "title") setTitleRect(dragRect);
    if (drawing === "number") setNumberRect(dragRect);
    dragStartRef.current = null;
    setDragRect(null);
    setDrawing(null);
  };

  // ── Save ────────────────────────────────────────────────────────────

  /**
   * Load a pdfjs document, caching by storage path so multi-sheet sets
   * that share a single PDF file don't re-download it for every sheet.
   */
  const loadPdfCached = async (fileUrl, cache) => {
    if (cache.has(fileUrl)) return cache.get(fileUrl);
    const signed = await resolveFileUrl(fileUrl);
    if (!signed) return null;
    const resp = await fetch(signed);
    const buf = await resp.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    cache.set(fileUrl, pdf);
    return pdf;
  };

  /**
   * Re-extract title + sheet number for an existing drawing using the
   * just-saved rectangles. Uses `pdfCache` so sheets sharing the same
   * PDF file (multi-page upload) don't re-download it.
   *
   * Returns the patch object (only fields that actually have a value)
   * or `null` when the OCR captured nothing usable.
   */
  const reextractOne = async (drawing, pdfCache) => {
    if (!drawing?.file_url) return null;
    if (!titleRect && !numberRect) return null;
    let pdf;
    try {
      pdf = await loadPdfCached(drawing.file_url, pdfCache);
    } catch (err) {
      console.warn(`[TitleblockMarker] PDF load failed for ${drawing.file_url}:`, err?.message);
      return null;
    }
    if (!pdf) return null;
    let bestTitle = "";
    let bestNumber = "";
    try {
      // Multi-sheet PDFs (one master PDF, N sheet rows pointing to it)
      // require us to render the SPECIFIC page each row owns. Without
      // honoring pdf_page, every sheet walks pages 1..5 starting from
      // page 1 — so they all read the cover sheet's title/sheet_number,
      // collide on uq_drawings_set_sheet_revision, and only the first
      // update succeeds. (Bug observed in production logs: 2026-05-04.)
      const targetPage =
        Number.isFinite(drawing.pdf_page) && drawing.pdf_page >= 1
          ? Math.min(drawing.pdf_page, pdf.numPages)
          : null;

      if (targetPage) {
        // Specific page mapping — read only that page, no fallback walk.
        const page = await pdf.getPage(targetPage);
        if (titleRect) bestTitle = (await extractTextFromRect(page, titleRect)) || "";
        if (numberRect) bestNumber = (await extractTextFromRect(page, numberRect)) || "";
      } else {
        // Legacy fallback: pdf_page missing or zero → walk the first few
        // pages until we find content. Single-page PDFs land on page 1.
        const maxPages = Math.min(pdf.numPages, 5);
        for (let p = 1; p <= maxPages; p++) {
          const page = await pdf.getPage(p);
          if (titleRect && !bestTitle) {
            bestTitle = (await extractTextFromRect(page, titleRect)) || "";
          }
          if (numberRect && !bestNumber) {
            bestNumber = (await extractTextFromRect(page, numberRect)) || "";
          }
          if (bestTitle && bestNumber) break;
        }
      }

      // Diagnostic: surface what OCR captured so DevTools shows whether
      // the rects are landing on the right area of the page.
      if (bestTitle || bestNumber) {
        console.info(
          `[TitleblockMarker] OCR sheet=${drawing.sheet_number} page=${targetPage ?? "walk"}: ` +
          `title="${bestTitle}" number="${bestNumber}"`,
        );
      }
    } catch (err) {
      console.warn(`[TitleblockMarker] OCR failed for sheet ${drawing.id}:`, err?.message);
      return null;
    }
    const patch = {};
    if (bestTitle) patch.title = bestTitle;
    if (bestNumber) patch.sheet_number = bestNumber.toUpperCase().replace(/\s+/g, "");
    return Object.keys(patch).length ? patch : null;
  };

  const handleSave = async () => {
    if (!set?.id) {
      toast.error("This set has no ID — cannot save template.");
      return;
    }
    setSaving(true);
    setReExtractProgress(null);
    try {
      // 1. Persist the rectangles on the drawing_sets row.
      await base44.entities.DrawingSet.update(set.id, {
        titleblock_title_rect: titleRect,
        titleblock_number_rect: numberRect,
      });

      // 2. Apply the just-saved rectangles to every existing sheet in
      //    the set so titles and sheet numbers extracted by the LLM
      //    (which may be wrong, e.g. "For field use") get overwritten
      //    with the deterministic OCR values from the marked regions.
      //    This is the difference between "I marked the titleblock and
      //    nothing happened" and the user-expected outcome.
      let updated = 0;
      let unchanged = 0;
      let failed = 0;
      let total = 0;
      try {
        const sheets = await base44.entities.Drawing.filter({
          project_id: set.project_id,
          drawing_set_id: set.id,
        });
        total = sheets.length;
        if (total > 0) {
          setReExtractProgress({ done: 0, total });
          // Cache loaded PDFs across sheets so multi-page sets sharing
          // a single master PDF don't re-download it for every sheet.
          const pdfCache = new Map();
          try {
            for (let i = 0; i < sheets.length; i++) {
              const sheet = sheets[i];
              try {
                const patch = await reextractOne(sheet, pdfCache);
                if (patch) {
                  // Skip the write if the extracted values are byte-identical
                  // to what's already on the row — saves a round trip and
                  // avoids touching updated_at unnecessarily.
                  const titleSame =
                    !patch.title || patch.title === (sheet.title || "");
                  const numberSame =
                    !patch.sheet_number ||
                    patch.sheet_number === (sheet.sheet_number || "");
                  if (titleSame && numberSame) {
                    unchanged++;
                  } else {
                    await base44.entities.Drawing.update(sheet.id, patch);
                    updated++;
                  }
                } else {
                  unchanged++;
                }
              } catch (err) {
                failed++;
                // Detect the most-common failure: the master PDF has the
                // wrong pdf_page assignment so multiple sheets land on the
                // same titleblock and collide on uq_drawings_set_sheet_revision.
                // Surface a clearer message so users know to re-upload the
                // set or hand-edit pdf_page values.
                const msg = String(err?.message || err || "");
                const isUniqueConflict =
                  msg.includes("uq_drawings_set_sheet_revision") ||
                  msg.includes("duplicate key value");

                console.warn(
                  `[TitleblockMarker] re-extract failed for sheet ${sheet?.id}` +
                    (isUniqueConflict
                      ? ` (sheet_number collision — pdf_page=${sheet?.pdf_page} likely points at the wrong page; re-upload the set or fix pdf_page in Edit Sheet)`
                      : ""),
                  err,
                );
              }
              setReExtractProgress({ done: i + 1, total });
            }
          } finally {
            // Release cached pdfjs documents to free memory.
            for (const pdf of pdfCache.values()) {
              try { await pdf.destroy(); } catch { /* ignore */ }
            }
            pdfCache.clear();
          }
        }
      } catch (err) {
         
        console.warn("[TitleblockMarker] could not list sheets to re-extract:", err);
      }

      if (total === 0) {
        toast.success("Titleblock template saved");
      } else if (updated === total && failed === 0) {
        toast.success(
          `Titleblock saved + ${updated} sheet${updated === 1 ? "" : "s"} updated`,
        );
      } else {
        toast.success(
          `Titleblock saved · ${updated} updated, ${unchanged} unchanged${failed ? `, ${failed} failed` : ""}`,
        );
      }

      onSaved?.({ titleblock_title_rect: titleRect, titleblock_number_rect: numberRect });
      onClose?.();
    } catch (err) {
      toast.error(`Save failed: ${err?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
      setReExtractProgress(null);
    }
  };

  const handleClear = () => {
    setTitleRect(null);
    setNumberRect(null);
    setDrawing(null);
    setDragRect(null);
  };

  // ── Render ──────────────────────────────────────────────────────────
  const canSave = !saving && titleRect != null && numberRect != null;

  // Compute pixel-space rectangles to paint over the canvas.
  const rectStyle = (rect, color) => {
    if (!rect) return null;
    return {
      position: "absolute",
      left: `${rect.x * 100}%`,
      top: `${rect.y * 100}%`,
      width: `${rect.width * 100}%`,
      height: `${rect.height * 100}%`,
      border: `2px solid ${color}`,
      background: `${color}22`,
      pointerEvents: "none",
      boxSizing: "border-box",
    };
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Mark titleblock rectangles">
      <div style={dialogStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Drawing Set Titleblock Template
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
              {set?.set_name || set?.name || "Set"}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ ...btn("secondary"), padding: "6px 10px" }}>
            ×
          </button>
        </div>

        {/* Toolbar */}
        <div style={toolbarStyle}>
          <button
            onClick={() => setDrawing(drawing === "title" ? null : "title")}
            disabled={!pdfReady || saving}
            style={{
              ...btn(drawing === "title" ? "primary" : "secondary"),
              borderColor: titleRect ? "var(--status-success)" : undefined,
            }}
          >
            {titleRect ? "↻ Redraw Title" : drawing === "title" ? "Click & Drag…" : "1 · Mark Title"}
          </button>
          <button
            onClick={() => setDrawing(drawing === "number" ? null : "number")}
            disabled={!pdfReady || saving}
            style={{
              ...btn(drawing === "number" ? "primary" : "secondary"),
              borderColor: numberRect ? "var(--status-success)" : undefined,
            }}
          >
            {numberRect ? "↻ Redraw Number" : drawing === "number" ? "Click & Drag…" : "2 · Mark Sheet #"}
          </button>

          <div style={{ width: 1, height: 22, background: "var(--border-default)", margin: "0 4px" }} />

          {/* Page navigator */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setPageNum((n) => Math.max(1, n - 1))}
              disabled={!pdfReady || pageNum <= 1}
              style={{ ...btn("secondary"), padding: "6px 10px" }}
              aria-label="Previous page"
            >‹</button>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", minWidth: 60, textAlign: "center" }}>
              {pdfReady ? `${pageNum} / ${totalPages}` : "—"}
            </span>
            <button
              onClick={() => setPageNum((n) => Math.min(totalPages, n + 1))}
              disabled={!pdfReady || pageNum >= totalPages}
              style={{ ...btn("secondary"), padding: "6px 10px" }}
              aria-label="Next page"
            >›</button>
          </div>

          <div style={{ flex: 1 }} />

          {/* Hint */}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
            {drawing
              ? `Click & drag the ${drawing === "title" ? "title" : "sheet-number"} region`
              : "Pick a step above to draw"}
          </div>
        </div>

        {/* Canvas + overlay */}
        <div style={canvasWrapStyle}>
          {loadError && (
            <div style={{ color: "var(--status-error)", fontFamily: "var(--font-body)", fontSize: 13, padding: 24, textAlign: "center" }}>
              {loadError}
            </div>
          )}
          {!loadError && (
            <div style={{ position: "relative", display: "inline-block" }}>
              <canvas ref={canvasRef} style={{ display: "block", boxShadow: "0 0 0 1px rgba(255,255,255,0.1)" }} />
              {/* Mouse-tracking overlay sized to the canvas (which is sized
                  by the render effect). Uses absolute coords matching the
                  canvas's pixel size so getBoundingClientRect → normalised
                  coords stays consistent. */}
              <div
                ref={overlayRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: viewportSize.width,
                  height: viewportSize.height,
                  cursor: drawing ? "crosshair" : "default",
                  // Don't intercept hover when not drawing — lets the user
                  // copy text from the canvas via their browser's PDF
                  // selection (well, they can't on a canvas, but at least
                  // the cursor stays normal).
                  pointerEvents: drawing ? "auto" : "none",
                }}
              >
                {/* Persisted rects */}
                {titleRect  && <div style={rectStyle(titleRect,  "var(--accent)")} />}
                {numberRect && <div style={rectStyle(numberRect, "var(--status-success-bright)")} />}
                {/* In-progress drag */}
                {dragRect && (
                  <div style={rectStyle(
                    dragRect,
                    drawing === "title" ? "var(--accent)" : "var(--status-success-bright)"
                  )} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <div style={{ display: "flex", gap: 14, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
            <span>
              <span style={{ display: "inline-block", width: 10, height: 10, background: "var(--accent)", marginRight: 6, verticalAlign: "middle" }} />
              Title {titleRect ? "✓" : "—"}
            </span>
            <span>
              <span style={{ display: "inline-block", width: 10, height: 10, background: "var(--status-success-bright)", marginRight: 6, verticalAlign: "middle" }} />
              Sheet # {numberRect ? "✓" : "—"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleClear} disabled={saving || (!titleRect && !numberRect)} style={btn("secondary")}>
              Clear
            </button>
            <button onClick={onClose} disabled={saving} style={btn("secondary")}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              style={{
                ...btn("primary"),
                opacity: canSave ? 1 : 0.5,
                cursor: canSave ? "pointer" : "not-allowed",
              }}
              title={canSave ? "Save template to drawing set" : "Draw both rectangles first"}
            >
              {saving
                ? (reExtractProgress
                    ? `Updating sheets… ${reExtractProgress.done}/${reExtractProgress.total}`
                    : "Saving…")
                : "Save Template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
