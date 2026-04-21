/**
 * ThumbnailFilmstrip — horizontal strip of sheet thumbnails at the bottom
 * of the viewer.
 *
 * Renders one thumbnail per drawing in the current project list. Each
 * thumbnail is the first page of that drawing's PDF at a small scale
 * (sized to ~160px wide), rasterized with the shared pdfjs worker.
 * Thumbnails render one-at-a-time on a queue so a big set doesn't block
 * the main viewer's render task.
 *
 * State:
 * - A module-scoped LRU-ish cache keyed by drawing.id keeps thumbs across
 *   navigations. We keep it in memory (not disk) — regenerating is cheap
 *   enough on project switches that persisting to IndexedDB isn't worth
 *   the complexity.
 * - The URL resolver is shared with DrawingViewer via prop, so expired
 *   signed URLs get re-resolved in one place.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";

const mono = { fontFamily: "var(--font-mono)" };

// Shared in-memory cache. Keyed by drawing.id → dataUrl string.
const thumbCache = new Map();

const THUMB_WIDTH = 138;  // px at scale 1 (CSS pixels)
const THUMB_HEIGHT = 96;  // aspect ~ 1.44; most drawings are wider than tall

export default function ThumbnailFilmstrip({
  drawings,
  activeId,
  onSelect,
  resolveUrl,           // (storageOrUrl) => Promise<signedUrl>
  extractStoragePath,   // signedUrl → storagePath | null
}) {
  // Local state: { drawingId: dataUrl | "pending" | "error" }
  const [thumbs, setThumbs] = useState(() => {
    const init = {};
    for (const d of drawings) {
      if (thumbCache.has(d.id)) init[d.id] = thumbCache.get(d.id);
    }
    return init;
  });
  const queueRef = useRef([]);
  const workingRef = useRef(false);
  const cancelledRef = useRef(false);
  const scrollerRef = useRef(null);
  const activeCardRef = useRef(null);

  // Build the render queue whenever the drawing list changes. Put the
  // active sheet first so the user's current thumbnail appears ASAP, then
  // neighbors in ring order, then the rest.
  useEffect(() => {
    cancelledRef.current = false;
    const list = [...drawings];
    const activeIdx = Math.max(0, list.findIndex((d) => d.id === activeId));
    const ordered = [];
    const seen = new Set();
    const push = (i) => {
      if (i < 0 || i >= list.length) return;
      const d = list[i];
      if (seen.has(d.id)) return;
      seen.add(d.id);
      ordered.push(d);
    };
    // Ring outward from the active index
    for (let k = 0; k < list.length; k++) {
      push(activeIdx + k);
      if (k > 0) push(activeIdx - k);
    }
    // Drop anything already cached
    queueRef.current = ordered.filter((d) => {
      if (thumbCache.has(d.id)) return false;
      if (!d.file_url) return false;
      return true;
    });
    // Kick the worker
    pump();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, activeId]);

  // Pump one thumbnail at a time. pdfjs is heavy; serialising keeps the
  // main viewer's render snappy.
  const pump = useCallback(async () => {
    if (workingRef.current) return;
    workingRef.current = true;
    try {
      while (queueRef.current.length > 0 && !cancelledRef.current) {
        const next = queueRef.current.shift();
        if (!next) continue;
        if (thumbCache.has(next.id)) continue;
        setThumbs((t) => ({ ...t, [next.id]: "pending" }));
        try {
          const dataUrl = await renderThumb(next, { resolveUrl, extractStoragePath });
          if (cancelledRef.current) break;
          thumbCache.set(next.id, dataUrl);
          setThumbs((t) => ({ ...t, [next.id]: dataUrl }));
        } catch (err) {
          console.warn("[filmstrip] thumb failed:", next.sheet_number, err?.message);
          setThumbs((t) => ({ ...t, [next.id]: "error" }));
        }
      }
    } finally {
      workingRef.current = false;
    }
  }, [resolveUrl, extractStoragePath]);

  // Auto-scroll the active thumbnail into view when the user navigates.
  useEffect(() => {
    const el = activeCardRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeId]);

  if (!drawings || drawings.length === 0) return null;

  return (
    <div
      style={{
        flexShrink: 0,
        background: "linear-gradient(180deg, #0A0E15 0%, #141C28 100%)",
        borderTop: "1px solid var(--border-default)",
      }}
    >
      <div
        style={{
          padding: "4px 16px",
          ...mono,
          fontSize: 8,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>Sheet filmstrip</span>
        <span style={{ color: "var(--border-strong)" }}>
          {drawings.length} sheet{drawings.length === 1 ? "" : "s"}
        </span>
      </div>

      <div
        ref={scrollerRef}
        style={{
          display: "flex",
          gap: 8,
          padding: "4px 16px 14px",
          overflowX: "auto",
          overflowY: "hidden",
          scrollBehavior: "smooth",
        }}
      >
        {drawings.map((d) => {
          const isActive = d.id === activeId;
          const thumb = thumbs[d.id] || (thumbCache.has(d.id) ? thumbCache.get(d.id) : null);
          return (
            <div
              key={d.id}
              ref={isActive ? activeCardRef : null}
              onClick={() => onSelect(d.id)}
              title={`${d.sheet_number}${d.title ? ` — ${d.title}` : ""}`}
              style={{
                flexShrink: 0,
                width: THUMB_WIDTH,
                cursor: "pointer",
                userSelect: "none",
                transition: "transform 0.15s",
                transform: isActive ? "translateY(-2px)" : "none",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.transform = "none"; }}
            >
              <div
                style={{
                  width: THUMB_WIDTH,
                  height: THUMB_HEIGHT,
                  background: thumb && thumb !== "pending" && thumb !== "error" ? "#fff" : "rgba(255,255,255,0.04)",
                  border: isActive
                    ? "2px solid var(--accent)"
                    : "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 3,
                  overflow: "hidden",
                  position: "relative",
                  boxShadow: isActive
                    ? "0 6px 20px rgba(200,155,32,0.35)"
                    : "0 2px 8px rgba(0,0,0,0.4)",
                }}
              >
                {thumb && thumb !== "pending" && thumb !== "error" ? (
                  <img
                    src={thumb}
                    alt={d.sheet_number || "Sheet"}
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                  />
                ) : thumb === "error" ? (
                  <div style={{ ...mono, fontSize: 8, color: "var(--status-error)", position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: "0.10em" }}>
                    N/A
                  </div>
                ) : (
                  <div
                    className="sbp-thumb-shimmer"
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.04) 100%)",
                      backgroundSize: "200% 100%",
                    }}
                  />
                )}
              </div>
              <div
                style={{
                  ...mono,
                  fontSize: 9,
                  fontWeight: 700,
                  color: isActive ? "var(--accent)" : "var(--text-secondary)",
                  marginTop: 4,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.04em",
                }}
              >
                {d.sheet_number || "—"}
              </div>
            </div>
          );
        })}
      </div>

      <style>{SHIMMER_CSS}</style>
    </div>
  );
}

async function renderThumb(d, { resolveUrl, extractStoragePath }) {
  const raw = d.file_url;
  if (!raw) throw new Error("no file_url");
  const isHttp = raw.startsWith("http://") || raw.startsWith("https://");
  const storagePath = isHttp ? extractStoragePath(raw) : raw;
  const toResolve = storagePath || raw;
  const url = await resolveUrl(toResolve);

  const loadingTask = pdfjsLib.getDocument(url);
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(Number(d.pdf_page) || 1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(
      THUMB_WIDTH  / base.width,
      THUMB_HEIGHT / base.height
    );
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width  = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally {
    doc.destroy?.().catch(() => {});
  }
}

const SHIMMER_CSS = `
@keyframes sbp-thumb-shimmer {
  0%   { background-position: -100% 0; }
  100% { background-position:  200% 0; }
}
.sbp-thumb-shimmer { animation: sbp-thumb-shimmer 1.6s linear infinite; }
`;
