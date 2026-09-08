import { useCallback, useEffect, useRef } from "react";
import {
  appendPoint,
  eraseStrokesAt,
  mid,
  newStroke,
  pointFromPointer,
  pushStroke,
  smoothPressure,
  strokeWidth,
} from "@/lib/notesInk/engine";
import type { InkDocument, InkPoint, InkStroke, InkTool, PaperStyle } from "@/lib/notesInk/types";

interface InkCanvasProps {
  doc: InkDocument;
  onChange: (doc: InkDocument) => void;
  tool: InkTool;
  color: string;
  size: number;
  mode: "text" | "ink";
  acceptEvent: (e: PointerEvent) => boolean;
  onPenSeen?: () => void;
  /** Fired once per committed stroke — powers the double-tap gesture upstream. */
  onStrokeCommit?: (stroke: InkStroke) => void;
  /** When true, one-finger touch scrolls the page instead of being swallowed. */
  allowTouchScroll?: boolean;
  themeInk?: string;
}

function cssColor(color: string, themeInk?: string): string {
  if (color === "#1A1C1E" && themeInk) return themeInk;
  return color;
}

function drawPaper(ctx: CanvasRenderingContext2D, w: number, h: number, paper: PaperStyle) {
  if (paper === "plain") return;
  ctx.save();
  ctx.strokeStyle = "rgba(127,127,127,0.18)";
  ctx.lineWidth = 1;
  if (paper === "ruled") {
    for (let y = 36; y < h; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else {
    for (let x = 28; x < w; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 28; y < h; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: InkStroke,
  themeInk: string | undefined,
  predicted: InkPoint[] = [],
) {
  // The eraser is a gesture, not ink — it is previewed as a ring by the caller.
  if (stroke.tool === "eraser") return;
  const pts = predicted.length ? [...stroke.points, ...predicted] : stroke.points;
  if (pts.length === 0) return;
  const highlighter = stroke.tool === "highlighter";
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = highlighter ? 0.35 : 1;
  ctx.strokeStyle = cssColor(stroke.color, themeInk);

  if (pts.length === 1) {
    const w = strokeWidth(pts[0], stroke.tool, stroke.size);
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, w / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.restore();
    return;
  }

  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const start = i === 1 ? a : { ...mid(pts[i - 2], a), p: a.p, t: a.t, tiltX: a.tiltX, tiltY: a.tiltY };
    const end = i === pts.length - 1 ? b : { ...mid(a, b), p: b.p, t: b.t, tiltX: b.tiltX, tiltY: b.tiltY };
    ctx.lineWidth = strokeWidth(b, stroke.tool, stroke.size, a);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(a.x, a.y, end.x, end.y);
    ctx.stroke();
  }
  ctx.restore();
}

export function InkCanvas({
  doc,
  onChange,
  tool,
  color,
  size,
  mode,
  acceptEvent,
  onPenSeen,
  onStrokeCommit,
  allowTouchScroll = false,
  themeInk,
}: InkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<InkStroke | null>(null);
  const predicted = useRef<InkPoint[]>([]);
  const hover = useRef<{ x: number; y: number; w: number } | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  /**
   * The pointer that owns the current stroke. Every event from any other
   * pointerId is ignored until this one lifts. Without this, a palm landing
   * mid-word starts a second "stroke" that overwrites the pen's in-flight one
   * and steals pointer capture.
   */
  const activePointerId = useRef<number | null>(null);
  const activePointerType = useRef<string | null>(null);
  const lastPressure = useRef<number | null>(null);

  /**
   * Committed strokes are rasterised once into an offscreen layer and blitted;
   * only the in-flight stroke is redrawn per frame. Repainting every stroke on
   * every pointermove is what made a full page of notes feel laggy.
   */
  const layer = useRef<HTMLCanvasElement | null>(null);
  const layerDirty = useRef(true);
  const rafId = useRef<number | null>(null);

  const sizeCanvas = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      layerDirty.current = true;
    }
    return { rect, dpr };
  };

  const rebuildLayer = useCallback(
    (rect: DOMRect, dpr: number) => {
      if (!layer.current) layer.current = document.createElement("canvas");
      const off = layer.current;
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (off.width !== w || off.height !== h) {
        off.width = w;
        off.height = h;
      }
      const octx = off.getContext("2d");
      if (!octx) return;
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, off.width, off.height);
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPaper(octx, rect.width, rect.height, docRef.current.paper);
      for (const stroke of docRef.current.strokes) drawStroke(octx, stroke, themeInk);
      layerDirty.current = false;
    },
    [themeInk],
  );

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { rect, dpr } = sizeCanvas(canvas);
    if (layerDirty.current || !layer.current) rebuildLayer(rect, dpr);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (layer.current) ctx.drawImage(layer.current, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (live.current) drawStroke(ctx, live.current, themeInk, predicted.current);

    // Eraser + hover share one affordance: a ring showing the affected radius.
    const ring =
      live.current && live.current.tool === "eraser"
        ? (() => {
            const p = live.current.points[live.current.points.length - 1];
            return p ? { x: p.x, y: p.y, w: Math.max(14, size * 5) * 2 } : null;
          })()
        : mode === "ink"
          ? hover.current
          : null;
    if (ring) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.w / 2, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(200,155,32,0.85)";
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.restore();
    }
  }, [mode, themeInk, rebuildLayer, size]);

  /** Coalesce repaints to one per animation frame. */
  const schedulePaint = useCallback(() => {
    if (rafId.current != null) return;
    if (typeof requestAnimationFrame !== "function") {
      paint();
      return;
    }
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      paint();
    });
  }, [paint]);

  useEffect(() => {
    layerDirty.current = true;
    schedulePaint();
  }, [doc, themeInk, schedulePaint]);

  useEffect(
    () => () => {
      if (rafId.current != null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId.current);
      }
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      layerDirty.current = true;
      schedulePaint();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [schedulePaint]);

  const origin = () => {
    const canvas = canvasRef.current;
    if (!canvas) return { left: 0, top: 0 };
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  };

  const smoothed = (raw: InkPoint): InkPoint => {
    const p = smoothPressure(lastPressure.current, raw.p);
    lastPressure.current = p;
    return { ...raw, p };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== "ink") return;
    // One stroke at a time: ignore every extra contact until this one lifts.
    if (activePointerId.current != null) return;
    if (e.pointerType === "pen") onPenSeen?.();
    if (!acceptEvent(e.nativeEvent)) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture unavailable (jsdom / detached node) */
    }
    activePointerId.current = e.pointerId;
    activePointerType.current = e.pointerType;
    lastPressure.current = null;
    predicted.current = [];
    live.current = newStroke({ tool, color, size, point: smoothed(pointFromPointer(e.nativeEvent, origin())) });
    hover.current = null;
    schedulePaint();
  };

  const collect = (e: React.PointerEvent<HTMLCanvasElement>): InkPoint[] => {
    const box = origin();
    const native = e.nativeEvent as PointerEvent & {
      getCoalescedEvents?: () => PointerEvent[];
      getPredictedEvents?: () => PointerEvent[];
    };
    let coalesced: PointerEvent[] = [native];
    if (typeof native.getCoalescedEvents === "function") {
      const list = native.getCoalescedEvents();
      if (list.length) coalesced = list;
    }
    const points = coalesced.map((ev) => smoothed(pointFromPointer(ev, box)));
    predicted.current =
      typeof native.getPredictedEvents === "function"
        ? native.getPredictedEvents().map((ev) => pointFromPointer(ev, box))
        : [];
    return points;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "pen") onPenSeen?.();

    // Pencil hover preview (iPad hover). Only when nothing is being drawn.
    if (mode === "ink" && activePointerId.current == null && e.pointerType === "pen" && e.buttons === 0) {
      const p = pointFromPointer(e.nativeEvent, origin());
      hover.current = { x: p.x, y: p.y, w: strokeWidth(p, tool, size) };
      schedulePaint();
      return;
    }

    if (activePointerId.current !== e.pointerId) return;
    if (mode !== "ink" || !live.current) return;
    e.preventDefault();

    let stroke = live.current;
    for (const point of collect(e)) stroke = appendPoint(stroke, point);
    live.current = stroke;

    // Erase progressively so the page clears under the nib, rather than all at
    // once on lift.
    if (stroke.tool === "eraser") {
      const tail = stroke.points.slice(-6);
      const { next, removed } = eraseStrokesAt(docRef.current, tail, Math.max(14, size * 5));
      if (removed.length) {
        docRef.current = next;
        layerDirty.current = true;
        onChange(next);
      }
    }
    schedulePaint();
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerId.current !== e.pointerId) return;
    activePointerId.current = null;
    activePointerType.current = null;
    lastPressure.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const finished = live.current;
    live.current = null;
    predicted.current = [];
    hover.current = null;
    layerDirty.current = true;
    if (!finished) {
      schedulePaint();
      return;
    }
    if (finished.tool !== "eraser") onChange(pushStroke(docRef.current, finished));
    onStrokeCommit?.(finished);
    schedulePaint();
  };

  return (
    <canvas
      ref={canvasRef}
      aria-label="Ink canvas"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        // With palm rejection on, fingers are not drawing anyway — let them
        // scroll the note instead of being swallowed. The pen path calls
        // preventDefault itself, so it never scrolls.
        touchAction: allowTouchScroll ? "pan-y" : "none",
        cursor: mode === "ink" ? "crosshair" : "default",
        zIndex: 2,
        pointerEvents: mode === "ink" ? "auto" : "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onPointerLeave={() => {
        if (activePointerId.current != null) return;
        hover.current = null;
        schedulePaint();
      }}
    />
  );
}

export function setInkPaper(doc: InkDocument, paper: PaperStyle): InkDocument {
  return { ...doc, paper };
}
