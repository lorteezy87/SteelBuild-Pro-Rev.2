/**
 * pdfRasterize.js — shared pdfjs page rasterizer.
 *
 * Extracted from RevisionCompareModal so both the per-sheet compare overlay and
 * the headless package-level Revision Impact Report render PDF pages the same
 * way: one page of a PDF (resolved from a Storage URL/path) to a white-backed
 * canvas at a fixed target width.
 */
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { resolveFileUrl } from "@/api/supabaseClient";

// Idempotent — pdfSheetExtractor sets the same worker; whichever loads first wins.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const RASTER_TARGET_WIDTH = 1800; // px — detail vs. memory tradeoff

/**
 * Render one page of a PDF to a canvas. `bufferCache` (a Map) lets repeated
 * renders of the same file (e.g. FROM + TO drawn from one master PDF) skip
 * re-fetching; pass a fresh Map per logical run, or omit it.
 */
export async function rasterizePage({ fileUrl, page, bufferCache }) {
  const cache = bufferCache || new Map();
  let buf = cache.get(fileUrl);
  if (!buf) {
    const resolved = await resolveFileUrl(fileUrl);
    if (!resolved) throw new Error("Could not resolve the revision file URL");
    const res = await fetch(resolved);
    if (!res.ok) throw new Error(`Failed to download PDF (${res.status})`);
    buf = await res.arrayBuffer();
    cache.set(fileUrl, buf);
  }
  // pdfjs transfers (detaches) the buffer it is given — hand it a copy so the
  // cache survives for the next page that reuses this file.
  const doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
  try {
    const pageNum = Math.min(Math.max(1, Number(page) || 1), doc.numPages);
    const pdfPage = await doc.getPage(pageNum);
    const base = pdfPage.getViewport({ scale: 1 });
    const scale = RASTER_TARGET_WIDTH / base.width;
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  } finally {
    doc.destroy();
  }
}

/** Canvas → base64 PNG payload (strips the `data:image/png;base64,` prefix). */
export function canvasToPngBase64(canvas) {
  if (!canvas) return null;
  try {
    const url = canvas.toDataURL("image/png");
    const comma = url.indexOf(",");
    return comma >= 0 ? url.slice(comma + 1) : null;
  } catch {
    return null;
  }
}

/** Convenience: render a PDF page straight to a base64 PNG. */
export async function rasterizePageToPngBase64({ fileUrl, page, bufferCache }) {
  const canvas = await rasterizePage({ fileUrl, page, bufferCache });
  return canvasToPngBase64(canvas);
}
