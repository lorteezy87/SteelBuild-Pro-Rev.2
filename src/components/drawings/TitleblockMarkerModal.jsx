/**
 * TitleblockMarkerModal — drag three rectangles on a sheet PDF to teach the
 * ingest pipeline where the title, sheet-number, and revision live in this
 * set's titleblock.
 *
 * Coordinates are stored normalised (0..1 of page width/height) on the
 * drawing_sets row, so they survive any zoom level and apply uniformly
 * across every sheet in the set. Schema lives in migration 057 (title +
 * number) and 20260818240000 (revision); the shape is enforced at the DB
 * layer with a CHECK constraint.
 *
 * Flow:
 *   1. User picks a page (defaults to page 1 of the set PDF).
 *   2. User clicks "Mark Title" → drags a box.
 *   3. User clicks "Mark Sheet #" → drags a box.
 *   4. User clicks "Mark Rev" → drags a box.
 *   5. "Save" writes all three rects to drawing_sets.titleblock_*_rect.
 *
 * Title + sheet # are required to save (ingest treats those as the template).
 * Revision is optional so existing 2-box templates keep working.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { entities, resolveFileUrl } from "@/api/supabaseClient";
import { normalizeTitleblockRevision, parseTitleblockRect } from "@/lib/titleblock";
import { extractTextFromRect } from "@/lib/pdfTitleblockText";
import { toast } from "sonner";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const RECT_COLOR = {
  title: "var(--accent)",
  number: "var(--status-success-bright)",
  revision: "var(--status-warning, #d97706)",
};

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
  minHeight: 0,
  minWidth: 0,
  overflow: "auto",
  background: "rgba(0,0,0,0.4)",
  position: "relative",
  display: "flex",
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

function drawingLabel(kind) {
  if (kind === "title") return "title";
  if (kind === "number") return "sheet-number";
  if (kind === "revision") return "revision";
  return "";
}

export default function TitleblockMarkerModal({ set, onClose, onSaved }) {
  const sourceUrl = set?.file_url || set?.sheets?.[0]?.file_url || null;

  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const pdfDocRef = useRef(null);
  const wrapRef = useRef(null);
  const [pdfReady, setPdfReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [wrapSize, setWrapSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);

  const [titleRect, setTitleRect] = useState(() => parseTitleblockRect(set?.titleblock_title_rect));
  const [numberRect, setNumberRect] = useState(() => parseTitleblockRect(set?.titleblock_number_rect));
  const [revisionRect, setRevisionRect] = useState(() => parseTitleblockRect(set?.titleblock_revision_rect));
  const [drawing, setDrawing] = useState(null);
  const [dragRect, setDragRect] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reExtractProgress, setReExtractProgress] = useState(null);
  // Live read-back per box: null = not tested yet, { text } = what the box
  // reads on the DISPLAYED page ("" = no extractable text there). This is the
  // user's instant answer to "is my box right / can the PDF be read at all"
  // — without it, a wrong box or an outlined-text PDF fails silently at save.
  const [rectPreview, setRectPreview] = useState({ title: null, number: null, revision: null });

  useEffect(() => {
    if (!sourceUrl) {
      setLoadError("No file is attached to this set yet.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
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

  useEffect(() => {
    if (!pdfReady || !pdfDocRef.current || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDocRef.current.getPage(pageNum);
        if (cancelled) return;

        const base = page.getViewport({ scale: 1 });
        const availW = Math.max(200, wrapSize.width || 1000);
        const availH = Math.max(200, wrapSize.height || 700);
        const fitScale = Math.min(availW / base.width, availH / base.height, 1);
        const scale = fitScale * zoom;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const display = page.getViewport({ scale });
        const render = page.getViewport({ scale: scale * dpr });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.round(render.width);
        canvas.height = Math.round(render.height);
        canvas.style.width = `${Math.round(display.width)}px`;
        canvas.style.height = `${Math.round(display.height)}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport: render }).promise;
        if (cancelled) return;
        setViewportSize({ width: Math.round(display.width), height: Math.round(display.height) });
      } catch (err) {
        if (!cancelled) setLoadError(err?.message || "Failed to render page");
      }
    })();
    return () => { cancelled = true; };
  }, [pageNum, pdfReady, wrapSize, zoom]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr && cr.width && cr.height) {
        setWrapSize((prev) =>
          prev.width === Math.round(cr.width) && prev.height === Math.round(cr.height)
            ? prev
            : { width: Math.round(cr.width), height: Math.round(cr.height) },
        );
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const previewRect = useCallback(async (kind, rect) => {
    if (!pdfDocRef.current || !rect) return;
    try {
      const page = await pdfDocRef.current.getPage(pageNum);
      const raw = await extractTextFromRect(page, rect);
      const text = kind === "revision"
        ? normalizeTitleblockRevision(raw)
        : String(raw || "").trim();
      setRectPreview((p) => ({ ...p, [kind]: { text } }));
    } catch {
      setRectPreview((p) => ({ ...p, [kind]: { text: "" } }));
    }
  }, [pageNum]);

  // Read back all placed boxes against the displayed page — on load (existing
  // template) and whenever the user changes pages.
  useEffect(() => {
    if (!pdfReady) return;
    if (titleRect) void previewRect("title", titleRect);
    if (numberRect) void previewRect("number", numberRect);
    if (revisionRect) void previewRect("revision", revisionRect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfReady, pageNum]);

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
    if (dragRect.width < 0.005 || dragRect.height < 0.005) {
      dragStartRef.current = null;
      setDragRect(null);
      return;
    }
    if (drawing === "title") setTitleRect(dragRect);
    if (drawing === "number") setNumberRect(dragRect);
    if (drawing === "revision") setRevisionRect(dragRect);
    void previewRect(drawing, dragRect);
    dragStartRef.current = null;
    setDragRect(null);
    setDrawing(null);
  };

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

  const reextractOne = async (drawingRow, pdfCache) => {
    if (!drawingRow?.file_url) return null;
    if (!titleRect && !numberRect && !revisionRect) return null;
    let pdf;
    try {
      pdf = await loadPdfCached(drawingRow.file_url, pdfCache);
    } catch (err) {
      console.warn(`[TitleblockMarker] PDF load failed for ${drawingRow.file_url}:`, err?.message);
      return null;
    }
    if (!pdf) return null;
    let bestTitle = "";
    let bestNumber = "";
    let bestRevision = "";
    try {
      const targetPage =
        Number.isFinite(drawingRow.pdf_page) && drawingRow.pdf_page >= 1
          ? Math.min(drawingRow.pdf_page, pdf.numPages)
          : null;

      const readPage = async (page) => {
        if (titleRect && !bestTitle) {
          bestTitle = (await extractTextFromRect(page, titleRect)) || "";
        }
        if (numberRect && !bestNumber) {
          bestNumber = (await extractTextFromRect(page, numberRect)) || "";
        }
        if (revisionRect && !bestRevision) {
          bestRevision = normalizeTitleblockRevision(await extractTextFromRect(page, revisionRect));
        }
      };

      if (targetPage) {
        const page = await pdf.getPage(targetPage);
        await readPage(page);
      } else {
        const maxPages = Math.min(pdf.numPages, 5);
        for (let p = 1; p <= maxPages; p++) {
          const page = await pdf.getPage(p);
          await readPage(page);
          if (bestTitle && bestNumber && (!revisionRect || bestRevision)) break;
        }
      }

      if (bestTitle || bestNumber || bestRevision) {
        console.info(
          `[TitleblockMarker] OCR sheet=${drawingRow.sheet_number} page=${targetPage ?? "walk"}: ` +
          `title="${bestTitle}" number="${bestNumber}" rev="${bestRevision}"`,
        );
      }
    } catch (err) {
      console.warn(`[TitleblockMarker] OCR failed for sheet ${drawingRow.id}:`, err?.message);
      return null;
    }
    const patch = {};
    if (bestTitle) patch.title = bestTitle;
    if (bestNumber) patch.sheet_number = bestNumber.toUpperCase().replace(/\s+/g, "");
    if (bestRevision) patch.revision_number = bestRevision;
    return { patch: Object.keys(patch).length ? patch : null, revText: bestRevision };
  };

  const handleSave = async () => {
    if (!set?.id) {
      toast.error("This set has no ID — cannot save template.");
      return;
    }
    setSaving(true);
    setReExtractProgress(null);
    try {
      await entities.DrawingSet.update(set.id, {
        titleblock_title_rect: titleRect,
        titleblock_number_rect: numberRect,
        titleblock_revision_rect: revisionRect,
      });

      let updated = 0;
      let unchanged = 0;
      let failed = 0;
      let total = 0;
      let revReadable = 0; // sheets where the Rev box produced any text
      try {
        const sheets = await entities.Drawing.filter({
          project_id: set.project_id,
          drawing_set_id: set.id,
        });
        total = sheets.length;
        if (total > 0) {
          setReExtractProgress({ done: 0, total });
          const pdfCache = new Map();
          try {
            for (let i = 0; i < sheets.length; i++) {
              const sheet = sheets[i];
              try {
                const { patch, revText } = (await reextractOne(sheet, pdfCache)) || {};
                if (revText) revReadable++;
                if (patch) {
                  const titleSame = !patch.title || patch.title === (sheet.title || "");
                  const numberSame = !patch.sheet_number || patch.sheet_number === (sheet.sheet_number || "");
                  const revSame = !patch.revision_number || patch.revision_number === (sheet.revision_number || "");
                  if (titleSame && numberSame && revSame) {
                    unchanged++;
                  } else {
                    await entities.Drawing.update(sheet.id, patch);
                    updated++;
                  }
                } else {
                  unchanged++;
                }
              } catch (err) {
                failed++;
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
      } else if (revisionRect && revReadable === 0) {
        // The Rev box read NOTHING on any sheet. Say so explicitly — a green
        // "N unchanged" here hides the real situation from the user.
        toast.warning(
          `Template saved, but the Rev box read no text on any of the ${total} sheet${total === 1 ? "" : "s"}. ` +
          `Either the box misses the REV cell, or these PDFs have outlined/scanned text that can't be read. ` +
          `If the drawings were revised, upload the revised PDF via New Revision — that sets the revision and replaces the sheet files.`,
          { duration: 12000 },
        );
      } else if (updated === total && failed === 0) {
        toast.success(
          `Titleblock saved + ${updated} sheet${updated === 1 ? "" : "s"} updated`,
        );
      } else if (revisionRect && updated === 0 && failed === 0 && revReadable > 0) {
        // Rev was readable but matched what's already stored — the attached
        // PDFs still carry these revision values.
        toast.message(
          `Template saved · all ${total} sheet${total === 1 ? "" : "s"} already match what the PDFs say. ` +
          `If the drawings were revised since, the revised files haven't been uploaded — use New Revision.`,
          { duration: 10000 },
        );
      } else {
        toast.success(
          `Titleblock saved · ${updated} updated, ${unchanged} unchanged${failed ? `, ${failed} failed` : ""}`,
        );
      }

      onSaved?.({
        titleblock_title_rect: titleRect,
        titleblock_number_rect: numberRect,
        titleblock_revision_rect: revisionRect,
      });
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
    setRevisionRect(null);
    setDrawing(null);
    setDragRect(null);
    setRectPreview({ title: null, number: null, revision: null });
  };

  /** Footer read-back: what a placed box reads on the displayed page. */
  const previewLabel = (rect, preview) => {
    if (!rect) return "—";
    if (!preview) return "✓ reading…";
    if (!preview.text) return "⚠ reads nothing";
    const text = preview.text.length > 18 ? `${preview.text.slice(0, 18)}…` : preview.text;
    return `✓ “${text}”`;
  };

  const canSave = !saving && titleRect != null && numberRect != null;

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

  const markButton = (kind, drawn, idleLabel, redrawLabel) => (
    <button
      onClick={() => setDrawing(drawing === kind ? null : kind)}
      disabled={!pdfReady || saving}
      style={{
        ...btn(drawing === kind ? "primary" : "secondary"),
        borderColor: drawn ? "var(--status-success)" : undefined,
      }}
    >
      {drawn ? redrawLabel : drawing === kind ? "Click & Drag…" : idleLabel}
    </button>
  );

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Mark titleblock rectangles">
      <div style={dialogStyle}>
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

        <div style={toolbarStyle}>
          {markButton("title", titleRect, "1 · Mark Title", "↻ Redraw Title")}
          {markButton("number", numberRect, "2 · Mark Sheet #", "↻ Redraw Number")}
          {markButton("revision", revisionRect, "3 · Mark Rev", "↻ Redraw Rev")}

          <div style={{ width: 1, height: 22, background: "var(--border-default)", margin: "0 4px" }} />

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

          <div style={{ width: 1, height: 22, background: "var(--border-default)", margin: "0 4px" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setZoom((z) => Math.max(0.2, +(z / 1.25).toFixed(3)))}
              disabled={!pdfReady}
              style={{ ...btn("secondary"), padding: "6px 11px" }}
              aria-label="Zoom out"
            >−</button>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", minWidth: 52, textAlign: "center" }}>
              {zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(8, +(z * 1.25).toFixed(3)))}
              disabled={!pdfReady}
              style={{ ...btn("secondary"), padding: "6px 11px" }}
              aria-label="Zoom in"
            >+</button>
            <button
              onClick={() => setZoom(1)}
              disabled={!pdfReady || zoom === 1}
              style={{ ...btn("secondary"), padding: "6px 10px" }}
              title="Fit the whole sheet in view"
            >Fit</button>
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
            {drawing
              ? `Click & drag the ${drawingLabel(drawing)} region`
              : "Pick a step above to draw"}
          </div>
        </div>

        <div ref={wrapRef} style={canvasWrapStyle}>
          {loadError && (
            <div style={{ color: "var(--status-error)", fontFamily: "var(--font-body)", fontSize: 13, padding: 24, textAlign: "center" }}>
              {loadError}
            </div>
          )}
          {!loadError && (
            <div style={{ position: "relative", display: "inline-block" }}>
              <canvas ref={canvasRef} style={{ display: "block", boxShadow: "0 0 0 1px rgba(255,255,255,0.1)" }} />
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
                  pointerEvents: drawing ? "auto" : "none",
                }}
              >
                {titleRect && <div style={rectStyle(titleRect, RECT_COLOR.title)} />}
                {numberRect && <div style={rectStyle(numberRect, RECT_COLOR.number)} />}
                {revisionRect && <div style={rectStyle(revisionRect, RECT_COLOR.revision)} />}
                {dragRect && (
                  <div style={rectStyle(dragRect, RECT_COLOR[drawing] || RECT_COLOR.title)} />
                )}
              </div>
            </div>
          )}
        </div>

        <div style={footerStyle}>
          <div style={{ display: "flex", gap: 14, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
            <span style={{ color: titleRect && rectPreview.title && !rectPreview.title.text ? "var(--status-warning)" : undefined }}>
              <span style={{ display: "inline-block", width: 10, height: 10, background: RECT_COLOR.title, marginRight: 6, verticalAlign: "middle" }} />
              Title {previewLabel(titleRect, rectPreview.title)}
            </span>
            <span style={{ color: numberRect && rectPreview.number && !rectPreview.number.text ? "var(--status-warning)" : undefined }}>
              <span style={{ display: "inline-block", width: 10, height: 10, background: RECT_COLOR.number, marginRight: 6, verticalAlign: "middle" }} />
              Sheet # {previewLabel(numberRect, rectPreview.number)}
            </span>
            <span style={{ color: revisionRect && rectPreview.revision && !rectPreview.revision.text ? "var(--status-warning)" : undefined }}>
              <span style={{ display: "inline-block", width: 10, height: 10, background: RECT_COLOR.revision, marginRight: 6, verticalAlign: "middle" }} />
              Rev {previewLabel(revisionRect, rectPreview.revision)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleClear} disabled={saving || (!titleRect && !numberRect && !revisionRect)} style={btn("secondary")}>
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
              title={canSave ? "Save template to drawing set" : "Draw title and sheet # first"}
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
