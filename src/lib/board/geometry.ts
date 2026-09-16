/**
 * geometry — the rectangle / point primitives the board canvas is built on.
 *
 * Everything here works in **world space**: an unbounded coordinate plane whose
 * units are board units, with +y pointing down (screen convention, so a node
 * dragged "down" gains y). The viewport module owns the world→screen mapping;
 * nothing in this file knows about pixels, the DOM, or zoom.
 *
 * Keeping the two apart is deliberate. A hit test written against screen
 * coordinates silently changes meaning at a different zoom level — the same tap
 * lands on a different node once the board is scaled — which is the class of bug
 * that makes a canvas feel unreliable on a tablet.
 */

/** A point on the world plane. */
export interface Vec2 {
  x: number;
  y: number;
}

/** An axis-aligned rectangle. `x`/`y` is the top-left corner; `w`/`h` are non-negative. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The smallest a node may be dragged to. Below this a card cannot be tapped on a touch screen. */
export const MIN_NODE_SIZE = 64;

export function vec(x: number, y: number): Vec2 {
  return { x, y };
}

export function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

/**
 * Clamp `n` into `[min, max]`.
 *
 * NaN clamps to `min` rather than propagating: it reaches here from a pointer
 * event on a zero-sized element, and one NaN in a transform blanks the whole
 * canvas. An infinity needs no special case — it clamps to the bound it exceeds.
 * Inverted bounds return `min`.
 */
export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  if (max < min) return min;
  return Math.min(Math.max(n, min), max);
}

export function rectRight(r: Rect): number {
  return r.x + r.w;
}

export function rectBottom(r: Rect): number {
  return r.y + r.h;
}

export function rectCenter(r: Rect): Vec2 {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/**
 * True when `p` is inside `r`. Edges count as inside — a tap exactly on a card's
 * border should select the card, not the canvas behind it.
 */
export function rectContains(r: Rect, p: Vec2): boolean {
  return p.x >= r.x && p.x <= rectRight(r) && p.y >= r.y && p.y <= rectBottom(r);
}

/** True when two rectangles share any area. Touching edges count as intersecting. */
export function rectIntersects(a: Rect, b: Rect): boolean {
  return !(rectRight(a) < b.x || rectRight(b) < a.x || rectBottom(a) < b.y || rectBottom(b) < a.y);
}

/** Move a rectangle by a delta, leaving its size untouched. */
export function translateRect(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
}

/**
 * Resize by dragging the bottom-right corner, floored at {@link MIN_NODE_SIZE}.
 *
 * The floor is applied per-axis rather than by rejecting the whole gesture, so
 * dragging a card narrow still lets it get shorter.
 */
export function resizeRect(r: Rect, dw: number, dh: number, min = MIN_NODE_SIZE): Rect {
  return {
    x: r.x,
    y: r.y,
    w: Math.max(min, r.w + dw),
    h: Math.max(min, r.h + dh),
  };
}

/**
 * The smallest rectangle containing every input. Returns `null` for an empty
 * list — an empty board has no bounds, and returning a 0×0 rect at the origin
 * would make "fit to content" jump to a corner of nothing.
 */
export function boundsOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, rectRight(r));
    maxY = Math.max(maxY, rectBottom(r));
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Grow a rectangle by `pad` on every side. Negative padding shrinks it. */
export function padRect(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

/**
 * Snap a coordinate to a grid. `size <= 0` disables snapping, which is how the
 * UI's "free placement" toggle is expressed without a second code path.
 */
export function snap(n: number, size: number): number {
  if (!(size > 0)) return n;
  return Math.round(n / size) * size;
}

export function snapRect(r: Rect, size: number): Rect {
  if (!(size > 0)) return r;
  return { x: snap(r.x, size), y: snap(r.y, size), w: r.w, h: r.h };
}

/**
 * Normalized position of `p` within `r`, as a `0..1` pair.
 *
 * This is how a blueprint pin remembers where it sits: "62% across, 31% down
 * sheet S-301" survives the overlay being moved, rescaled, or replaced with a
 * re-issued sheet at a different size, where a stored world coordinate would
 * not. Values outside `0..1` are preserved rather than clamped so a pin placed
 * just off the sheet edge (a callout in the margin) keeps its offset.
 */
export function toNormalized(r: Rect, p: Vec2): Vec2 {
  return {
    x: r.w === 0 ? 0 : (p.x - r.x) / r.w,
    y: r.h === 0 ? 0 : (p.y - r.y) / r.h,
  };
}

/** Inverse of {@link toNormalized}. */
export function fromNormalized(r: Rect, n: Vec2): Vec2 {
  return { x: r.x + n.x * r.w, y: r.y + n.y * r.h };
}

/** Euclidean distance between two points. */
export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Midpoint of two points — the pinch centre, and a connector's label anchor. */
export function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
