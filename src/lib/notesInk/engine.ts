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

/**
 * Width in CSS px. Pressure + slight tilt so a laid-down pencil writes broader.
 *
 * Passing `prev` adds a mild speed taper: a fast flick thins out the way a real
 * nib does, while slow deliberate strokes keep full width. The effect is capped
 * so quick handwriting never turns spindly.
 */
export function strokeWidth(
  point: InkPoint,
  tool: InkTool,
  size: number,
  prev?: InkPoint | null,
): number {
  const tilt =
    (Math.abs(point.tiltX ?? 0) + Math.abs(point.tiltY ?? 0)) / 180;
  const press = 0.45 + point.p * 0.85 + tilt * 0.25;
  if (tool === "highlighter") return size * 3.4 * (0.85 + point.p * 0.3);
  if (tool === "eraser") return Math.max(14, size * 5.5);
  return Math.max(0.7, size * press * speedFactor(prev, point));
}

/**
 * 1.0 when still, easing to ~0.82 at speed. Returns exactly 1 without a
 * previous point or a usable timestamp delta, so the taper can never make a
 * stroke jump in width just because timing data was missing.
 */
export function speedFactor(prev: InkPoint | null | undefined, next: InkPoint): number {
  if (!prev) return 1;
  const dt = next.t - prev.t;
  if (!Number.isFinite(dt) || dt <= 0) return 1;
  const pxPerMs = dist(prev, next) / dt;
  // ~2 px/ms is a brisk flick; clamp so the taper stays subtle.
  return 1 - Math.min(0.18, pxPerMs * 0.09);
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

/**
 * Contact width (CSS px) at or above which a touch is treated as a palm/heel
 * rather than a fingertip. A Pencil tip reports ~1; a fingertip is roughly
 * 8-16; the side of a hand is far wider. Safari does not always populate
 * width/height, so this is one signal among several — never the only one.
 */
export const PALM_CONTACT_PX = 24;

/** True when a touch contact is broad enough to be a resting hand. */
export function isLikelyPalm(input: {
  pointerType: string;
  width?: number;
  height?: number;
}): boolean {
  if ((input.pointerType || "").toLowerCase() !== "touch") return false;
  const w = Number.isFinite(input.width) ? (input.width as number) : 0;
  const h = Number.isFinite(input.height) ? (input.height as number) : 0;
  return Math.max(w, h) >= PALM_CONTACT_PX;
}

/**
 * Decide whether a pointer may draw.
 *
 * The pen always draws and the mouse always draws (desktop). Everything here
 * is about which *touches* to swallow, in order of how reliable the signal is:
 *
 *  1. A touch that arrives while a pen stroke is in flight is ALWAYS rejected,
 *     even with palm rejection off. That is a hand landing mid-word; there is
 *     no interpretation where it should draw.
 *  2. `penCapable` — this device has produced a pen event at some point, so the
 *     user writes with a Pencil and fingers are for scrolling. This replaces
 *     the old "pen seen in the last 4s" window, which let the palm draw again
 *     after a short pause and let it draw before the very first pen contact.
 *  3. Contact geometry (`isLikelyPalm`).
 *  4. The legacy recency window, kept as a fallback for the case where we have
 *     not yet learned `penCapable` and get no geometry.
 */
export function acceptPointer(input: {
  pointerType: string;
  penSeenAt: number | null;
  now: number;
  palmReject: boolean;
  /** Device has produced at least one pen event (sticky, per session). */
  penCapable?: boolean;
  /** pointerType of the stroke currently being drawn, if any. */
  activeStrokePointerType?: string | null;
  width?: number;
  height?: number;
}): boolean {
  const kind = (input.pointerType || "mouse").toLowerCase();
  if (kind === "pen") return true;

  // (1) Never let a second contact interrupt a live pen stroke.
  if (kind === "touch" && (input.activeStrokePointerType || "").toLowerCase() === "pen") {
    return false;
  }

  if (!input.palmReject) return kind === "mouse" || kind === "touch";
  if (kind === "mouse") return true;
  if (kind !== "touch") return false;

  // (2) Pencil user → fingers never draw.
  if (input.penCapable) return false;
  // (3) Broad contact → resting hand.
  if (isLikelyPalm(input)) return false;
  // (4) Fallback recency window.
  if (input.penSeenAt != null && input.now - input.penSeenAt < 4000) return false;
  return true;
}

/**
 * A committed stroke that was really a tap: no meaningful travel, over almost
 * no time. Used to qualify the double-tap gesture so that dotting an `i`,
 * writing a colon, or hatching cannot be mistaken for it.
 */
export function isTapStroke(
  stroke: { points: readonly InkPoint[] },
  maxMs = 220,
  maxDist = 6,
): boolean {
  const pts = stroke.points;
  if (pts.length === 0) return false;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (last.t - first.t > maxMs) return false;
  return pts.every((p) => dist(p, first) <= maxDist);
}

/**
 * Two taps close in time and space.
 *
 * Deliberately stricter than a plain double-click: callers must ALSO have
 * established that both contacts were tap strokes (see `isTapStroke`). Web
 * Safari does not expose the Pencil's hardware double-tap, so this is a
 * screen gesture, and the previous 380ms/28px thresholds fired constantly
 * during normal handwriting.
 */
export function isPencilDoubleTap(
  prev: { t: number; x: number; y: number } | null,
  next: { t: number; x: number; y: number },
): boolean {
  if (!prev) return false;
  return next.t - prev.t < 380 && dist(prev, next) < 28;
}

/**
 * Exponential smoothing for pressure. Raw Pencil pressure is noisy enough that
 * feeding it straight into line width makes strokes look ropey; averaging it
 * against the previous sample keeps the taper but removes the wobble.
 */
export function smoothPressure(prev: number | null, raw: number, alpha = 0.4): number {
  const next = clamp01(raw);
  if (prev == null || !Number.isFinite(prev)) return next;
  return clamp01(prev + (next - prev) * alpha);
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
