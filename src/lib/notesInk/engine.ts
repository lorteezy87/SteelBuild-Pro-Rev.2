/**
 * Apple Pencil / stylus ink math. Pure functions so the canvas can stay thin
 * and tests can pin pressure, palm rejection, and undo without a DOM.
 */
import type { InkDocument, InkPoint, InkStroke, InkTool, PaperStyle } from "./types";

export const emptyInk = (paper: PaperStyle = "ruled"): InkDocument => ({
  version: 1,
  paper,
  strokes: [],
});

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export function pointFromPointer(
  e: {
    clientX: number;
    clientY: number;
    pressure?: number;
    tiltX?: number;
    tiltY?: number;
    timeStamp?: number;
  },
  origin: { left: number; top: number },
): InkPoint {
  const raw = typeof e.pressure === "number" ? e.pressure : 0.5;
  // Some browsers report 0 for mouse / 0.5 idle pencil hover.
  const p = raw > 0 && raw < 1 ? raw : raw >= 1 ? 1 : 0.5;
  return {
    x: e.clientX - origin.left,
    y: e.clientY - origin.top,
    p: clamp01(p),
    t: typeof e.timeStamp === "number" ? e.timeStamp : Date.now(),
    tiltX: e.tiltX,
    tiltY: e.tiltY,
  };
}

/** Width in CSS px. Pressure + slight tilt so a laid-down pencil writes broader. */
export function strokeWidth(point: InkPoint, tool: InkTool, size: number): number {
  const tilt =
    (Math.abs(point.tiltX ?? 0) + Math.abs(point.tiltY ?? 0)) / 180;
  const press = 0.45 + point.p * 0.85 + tilt * 0.25;
  if (tool === "highlighter") return size * 3.4 * (0.85 + point.p * 0.3);
  if (tool === "eraser") return Math.max(14, size * 5.5);
  return Math.max(0.7, size * press);
}

export function shouldKeepPoint(prev: InkPoint | null, next: InkPoint, minDist = 0.7): boolean {
  if (!prev) return true;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  return dx * dx + dy * dy >= minDist * minDist;
}

export function appendPoint(stroke: InkStroke, point: InkPoint): InkStroke {
  const last = stroke.points[stroke.points.length - 1] ?? null;
  if (!shouldKeepPoint(last, point)) {
    if (!last) return { ...stroke, points: [...stroke.points, point] };
    const updated = stroke.points.slice(0, -1);
    updated.push({ ...last, p: point.p, t: point.t, tiltX: point.tiltX, tiltY: point.tiltY });
    return { ...stroke, points: updated };
  }
  return { ...stroke, points: [...stroke.points, point] };
}

export function newStroke(input: {
  tool: InkTool;
  color: string;
  size: number;
  point: InkPoint;
}): InkStroke {
  return {
    id: `s_${input.point.t.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    tool: input.tool,
    color: input.color,
    size: input.size,
    points: [input.point],
  };
}

export function mid(a: InkPoint, b: InkPoint): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/** Stroke eraser: drop any stroke that comes within radius of the sample points. */
export function eraseStrokesAt(
  doc: InkDocument,
  samples: readonly { x: number; y: number }[],
  radius: number,
): { next: InkDocument; removed: InkStroke[] } {
  if (samples.length === 0) return { next: doc, removed: [] };
  const removed: InkStroke[] = [];
  const kept = doc.strokes.filter((stroke) => {
    const hit = stroke.points.some((pt) => samples.some((s) => dist(pt, s) <= radius + stroke.size));
    if (hit) removed.push(stroke);
    return !hit;
  });
  return { next: { ...doc, strokes: kept }, removed };
}

export function pushStroke(doc: InkDocument, stroke: InkStroke): InkDocument {
  if (stroke.points.length === 0) return doc;
  return { ...doc, strokes: [...doc.strokes, stroke] };
}

export function undoStroke(doc: InkDocument): { next: InkDocument; popped: InkStroke | null } {
  if (doc.strokes.length === 0) return { next: doc, popped: null };
  const popped = doc.strokes[doc.strokes.length - 1];
  return { next: { ...doc, strokes: doc.strokes.slice(0, -1) }, popped };
}

export function parseInk(raw: unknown): InkDocument {
  if (!raw || typeof raw !== "object") return emptyInk();
  const value = raw as Partial<InkDocument>;
  const paper: PaperStyle =
    value.paper === "plain" || value.paper === "grid" || value.paper === "ruled"
      ? value.paper
      : "ruled";
  const strokes = Array.isArray(value.strokes)
    ? value.strokes.filter((s): s is InkStroke =>
        Boolean(s && typeof s === "object" && Array.isArray((s as InkStroke).points)),
      )
    : [];
  return { version: 1, paper, strokes };
}

/** Ignore finger/palm once a pencil has been seen recently. Mouse still works on desktop. */
export function acceptPointer(input: {
  pointerType: string;
  penSeenAt: number | null;
  now: number;
  palmReject: boolean;
}): boolean {
  const kind = (input.pointerType || "mouse").toLowerCase();
  if (kind === "pen") return true;
  if (!input.palmReject) return kind === "mouse" || kind === "touch";
  if (kind === "touch" && input.penSeenAt != null && input.now - input.penSeenAt < 4000) {
    return false;
  }
  return kind === "mouse" || kind === "touch";
}

export function isPencilDoubleTap(
  prev: { t: number; x: number; y: number } | null,
  next: { t: number; x: number; y: number },
): boolean {
  if (!prev) return false;
  return next.t - prev.t < 380 && dist(prev, next) < 28;
}

export function serializeInk(doc: InkDocument): string {
  return JSON.stringify(doc);
}

export function deserializeInk(raw: string | null | undefined): InkDocument {
  if (!raw) return emptyInk();
  try {
    return parseInk(JSON.parse(raw));
  } catch {
    return emptyInk();
  }
}
