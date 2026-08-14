import { useCallback, useEffect, useRef } from "react";
import {
  appendPoint,
  eraseStrokesAt,
  mid,
  newStroke,
  pointFromPointer,
  pushStroke,
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
  themeInk?: string;
}

function cssColor(color: string, themeInk?: string): string {
  if (color === "#1A1C1E" && themeInk) return themeInk;
  return color;
}

function drawPaper(ctx: CanvasRenderingContext2D, w: number, h: number, paper: PaperStyle) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
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
    const w = strokeWidth(pts[0], stroke.tool === "eraser" ? "pen" : stroke.tool, stroke.size);
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
    ctx.lineWidth = strokeWidth(b, stroke.tool === "eraser" ? "pen" : stroke.tool, stroke.size);
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
  themeInk,
}: InkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<InkStroke | null>(null);
  const predicted = useRef<InkPoint[]>([]);
  const drawing = useRef(false);
  const docRef = useRef(doc);
  const hover = useRef<{ x: number; y: number; w: number } | null>(null);
  docRef.current = doc;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPaper(ctx, rect.width, rect.height, docRef.current.paper);
    for (const stroke of docRef.current.strokes) {
      drawStroke(ctx, stroke, themeInk);
    }
    if (live.current) {
      drawStroke(ctx, live.current, themeInk, predicted.current);
    }
    if (hover.current && mode === "ink") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(hover.current.x, hover.current.y, hover.current.w / 2, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(200,155,32,0.85)";
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.restore();
    }
  }, [mode, themeInk]);

  useEffect(() => {
    paint();
  }, [doc, paint]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [paint]);

  const origin = () => {
    const canvas = canvasRef.current;
    if (!canvas) return { left: 0, top: 0 };
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== "ink") return;
    if (!acceptEvent(e.nativeEvent)) return;
    if (e.pointerType === "pen") onPenSeen?.();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    predicted.current = [];
    const point = pointFromPointer(e.nativeEvent, origin());
    live.current = newStroke({ tool, color, size, point });
    hover.current = null;
    paint();
  };

  const collect = (e: React.PointerEvent<HTMLCanvasElement>): InkPoint[] => {
    const box = origin();
    const native = e.nativeEvent as PointerEvent & {
      getCoalescedEvents?: () => PointerEvent[];
      getPredictedEvents?: () => PointerEvent[];
    };
    const coalesced =
      typeof native.getCoalescedEvents === "function" && native.getCoalescedEvents().length
        ? native.getCoalescedEvents()
        : [native];
    const points = coalesced.map((ev) => pointFromPointer(ev, box));
    predicted.current =
      typeof native.getPredictedEvents === "function"
        ? native.getPredictedEvents().map((ev) => pointFromPointer(ev, box))
        : [];
    return points;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "pen") onPenSeen?.();
    if (mode === "ink" && !drawing.current && e.pointerType === "pen" && e.buttons === 0) {
      const p = pointFromPointer(e.nativeEvent, origin());
      hover.current = { x: p.x, y: p.y, w: strokeWidth(p, tool, size) };
      paint();
      return;
    }
    if (!drawing.current || mode !== "ink" || !live.current) return;
    if (!acceptEvent(e.nativeEvent)) return;
    e.preventDefault();
    let stroke = live.current;
    for (const point of collect(e)) {
      stroke = appendPoint(stroke, point);
    }
    live.current = stroke;
    paint();
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const finished = live.current;
    live.current = null;
    predicted.current = [];
    hover.current = null;
    if (!finished) return;
    if (tool === "eraser") {
      const { next } = eraseStrokesAt(docRef.current, finished.points, Math.max(14, size * 5));
      onChange(next);
    } else {
      onChange(pushStroke(docRef.current, finished));
    }
    paint();
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
        touchAction: "none",
        cursor: mode === "ink" ? "crosshair" : "default",
        zIndex: 2,
        pointerEvents: mode === "ink" ? "auto" : "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onPointerLeave={() => {
        hover.current = null;
        paint();
      }}
    />
  );
}

export function setInkPaper(doc: InkDocument, paper: PaperStyle): InkDocument {
  return { ...doc, paper };
}
