import { useCallback, useEffect, useRef, useState } from "react";
import { rasterizePage } from "@/lib/pdfRasterize";
import {
  composeCompare,
  drawRaster,
  type CompareMode,
  type CompareOffset,
  type Raster,
} from "@/lib/rasterCompare";

/**
 * useRasterCompare — the orchestration half of revision compare: rasterize a
 * pair of PDF pages once, then re-composite them cheaply on every view change.
 *
 * Extracted from RevisionCompareModal alongside `rasterCompare` so the GC
 * document viewer inherits the same behaviour rather than a second
 * implementation of it. What is deliberately NOT here: where the pair came
 * from. Shop drawings resolve a pair out of `drawing_revisions`; GC issuances
 * have no such table and resolve theirs from the supersession chain. Those stay
 * with their callers — only the canvas work is shared.
 *
 * The two-phase split is the point. Rasterizing is a network fetch plus a pdfjs
 * render; compositing is a handful of drawImage calls. Mode, wipe, nudge and
 * zoom must never re-fetch, so rasters are cached in a ref and the compose
 * effect reads them without re-running the expensive one.
 */

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3];

export interface ComparePage {
  fileUrl?: string | null;
  pdfPage?: number | null;
}

export interface UseRasterCompareArgs {
  /** Rasterizing is skipped entirely while closed, and caches are freed on close. */
  open: boolean;
  oldPage: ComparePage | null;
  newPage: ComparePage | null;
}

export interface UseRasterCompareResult {
  mode: CompareMode;
  setMode: (mode: CompareMode) => void;
  wipePct: number;
  setWipePct: (pct: number) => void;
  offset: CompareOffset;
  nudge: (dx: number, dy: number) => void;
  resetOffset: () => void;
  zoom: number;
  zoomBy: (direction: 1 | -1) => void;
  rendering: boolean;
  renderError: string;
  displayRef: React.RefObject<HTMLCanvasElement>;
  sideOldRef: React.RefObject<HTMLCanvasElement>;
  sideNewRef: React.RefObject<HTMLCanvasElement>;
  /** The cached pair, for callers that need the pixels (e.g. an AI diff payload). */
  rastersRef: React.MutableRefObject<{ old: Raster | null; new: Raster | null }>;
}

export function useRasterCompare({
  open,
  oldPage,
  newPage,
}: UseRasterCompareArgs): UseRasterCompareResult {
  const [mode, setMode] = useState<CompareMode>("overlay");
  const [wipePct, setWipePct] = useState(50);
  const [offset, setOffset] = useState<CompareOffset>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState("");

  const bufferCacheRef = useRef<Map<string, ArrayBuffer>>(new Map());
  const rastersRef = useRef<{ old: Raster | null; new: Raster | null }>({ old: null, new: null });
  // useRef<T>(null) — not useRef<T | null>(null) — so these are RefObject<T>,
  // the shape JSX `ref` accepts. The `| null` form widens `current` and makes
  // every <canvas ref={...}> a type error.
  const displayRef = useRef<HTMLCanvasElement>(null);
  const sideOldRef = useRef<HTMLCanvasElement>(null);
  const sideNewRef = useRef<HTMLCanvasElement>(null);
  const renderSeqRef = useRef(0);

  // Free the cached PDF bytes when the modal closes. A drawing set is one
  // multi-megabyte PDF per file_url; holding those across an entire session
  // costs more than re-fetching them on the next compare.
  useEffect(() => {
    if (!open) {
      bufferCacheRef.current = new Map();
      rastersRef.current = { old: null, new: null };
      setOffset({ x: 0, y: 0 });
      setRenderError("");
    }
  }, [open]);

  const compose = useCallback(() => {
    const { old: oldRaster, new: newRaster } = rastersRef.current;
    if (!oldRaster || !newRaster) return;
    if (mode === "side") {
      drawRaster(sideOldRef.current, oldRaster);
      drawRaster(sideNewRef.current, newRaster);
      return;
    }
    composeCompare({
      canvas: displayRef.current,
      oldRaster,
      newRaster,
      mode,
      offset,
      wipePct,
    });
  }, [mode, offset, wipePct]);

  const oldFileUrl = oldPage?.fileUrl;
  const oldPdfPage = oldPage?.pdfPage;
  const newFileUrl = newPage?.fileUrl;
  const newPdfPage = newPage?.pdfPage;

  // Rasterize when the selected pair changes.
  useEffect(() => {
    if (!open || !oldFileUrl || !newFileUrl) return;
    const seq = ++renderSeqRef.current;
    setRendering(true);
    setRenderError("");
    (async () => {
      const cache = bufferCacheRef.current;
      const [oldRaster, newRaster] = await Promise.all([
        rasterizePage({ fileUrl: oldFileUrl, page: oldPdfPage, bufferCache: cache }),
        rasterizePage({ fileUrl: newFileUrl, page: newPdfPage, bufferCache: cache }),
      ]);
      // A stale pair must not overwrite the current one: the user can change
      // the selection while a large sheet is still rendering.
      if (renderSeqRef.current !== seq) return;
      rastersRef.current = { old: oldRaster, new: newRaster };
      compose();
    })()
      .catch((err: unknown) => {
        if (renderSeqRef.current !== seq) return;
        console.error("[useRasterCompare] render failed:", err);
        const message = err instanceof Error ? err.message : "";
        setRenderError(message || "Failed to render one of the revisions.");
      })
      .finally(() => {
        if (renderSeqRef.current === seq) setRendering(false);
      });
    // `compose` is intentionally omitted — a pair change always re-composes via
    // the rasters it just stored, and including it would re-fetch on every
    // mode/offset change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, oldFileUrl, oldPdfPage, newFileUrl, newPdfPage]);

  // Re-compose (no re-raster) on mode / offset / wipe changes.
  useEffect(() => {
    compose();
  }, [compose]);

  const nudge = useCallback(
    (dx: number, dy: number) => setOffset((o) => ({ x: o.x + dx, y: o.y + dy })),
    [],
  );
  const resetOffset = useCallback(() => setOffset({ x: 0, y: 0 }), []);
  const zoomBy = useCallback((direction: 1 | -1) => {
    setZoom((z) => {
      const i = ZOOM_STEPS.indexOf(z);
      const next = ZOOM_STEPS[Math.min(Math.max(0, i + direction), ZOOM_STEPS.length - 1)];
      return next ?? 1;
    });
  }, []);

  return {
    mode,
    setMode,
    wipePct,
    setWipePct,
    offset,
    nudge,
    resetOffset,
    zoom,
    zoomBy,
    rendering,
    renderError,
    displayRef,
    sideOldRef,
    sideNewRef,
    rastersRef,
  };
}
