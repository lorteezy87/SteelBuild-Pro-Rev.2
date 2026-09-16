/**
 * ink — handwriting capture for pen and finger strokes.
 *
 * A raw pointer stream on an iPad arrives at display refresh rate: a two-second
 * scribble is several hundred points, most of which sit on a line between their
 * neighbours. Storing that raw is a board that grows megabytes a page and an SVG
 * the browser re-parses on every pan.
 *
 * So a stroke is simplified once, when the pointer lifts, and drawn through
 * midpoints so it stays smooth afterwards. Both steps are here rather than in
 * the component: the component sees a live stroke and a finished one, and should
 * not be the thing deciding what "finished" means.
 */

import { boundsOf, type Rect } from "./geometry";
import type { InkStroke } from "./types";

/**
 * Simplification tolerance in world units.
 *
 * Tuned to the point where a signature and a dimension scrawl survive but the
 * sampling jitter along a straight pen drag does not. Raising it visibly
 * corners handwriting; lowering it stops paying for itself.
 */
export const DEFAULT_SIMPLIFY_TOLERANCE = 1.2;

/** Perpendicular distance from `p` to the segment `a`→`b`. */
function perpendicularDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  // Project p onto the segment, clamped to its ends, then measure the gap.
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Ramer–Douglas–Peucker over a flat `[x0, y0, x1, y1, …]` array.
 *
 * Iterative rather than recursive: a long stroke on a slow tablet can run to
 * thousands of points, and the recursive form blows the stack on the pathological
 * input (a near-straight line with one spike) instead of merely being slow.
 */
export function simplifyStroke(points: readonly number[], tolerance = DEFAULT_SIMPLIFY_TOLERANCE): number[] {
  const count = Math.floor(points.length / 2);
  if (count < 3 || tolerance <= 0) return points.slice();

  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const stack: Array<[number, number]> = [[0, count - 1]];

  while (stack.length > 0) {
    const segment = stack.pop();
    if (!segment) break;
    const [first, last] = segment;
    if (last <= first + 1) continue;
    const ax = points[first * 2];
    const ay = points[first * 2 + 1];
    const bx = points[last * 2];
    const by = points[last * 2 + 1];
    let worst = -1;
    let worstIndex = -1;
    for (let i = first + 1; i < last; i += 1) {
      const d = perpendicularDistance(points[i * 2], points[i * 2 + 1], ax, ay, bx, by);
      if (d > worst) {
        worst = d;
        worstIndex = i;
      }
    }
    if (worst > tolerance && worstIndex > 0) {
      keep[worstIndex] = 1;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }

  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (keep[i]) out.push(points[i * 2], points[i * 2 + 1]);
  }
  return out;
}

/**
 * SVG path for a stroke, smoothed through segment midpoints.
 *
 * Quadratic curves whose control points are the sample points and whose
 * endpoints are the midpoints between them. This is the standard trick for
 * drawing freehand: it removes the visible corner at every sample without
 * needing tangents, and it degrades to a straight line when samples are dense.
 */
export function strokePath(points: readonly number[]): string {
  const count = Math.floor(points.length / 2);
  if (count === 0) return "";
  if (count === 1) {
    // A dot. Rendered as a zero-length line so the round line-cap draws it.
    return `M ${points[0]} ${points[1]} L ${points[0]} ${points[1]}`;
  }
  let d = `M ${points[0]} ${points[1]}`;
  for (let i = 1; i < count - 1; i += 1) {
    const cx = points[i * 2];
    const cy = points[i * 2 + 1];
    const mx = (cx + points[(i + 1) * 2]) / 2;
    const my = (cy + points[(i + 1) * 2 + 1]) / 2;
    d += ` Q ${cx} ${cy} ${mx} ${my}`;
  }
  d += ` L ${points[(count - 1) * 2]} ${points[(count - 1) * 2 + 1]}`;
  return d;
}

/** Bounding rect of a point list, or null when there are no points. */
export function pointsBounds(points: readonly number[]): Rect | null {
  const count = Math.floor(points.length / 2);
  if (count === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i += 1) {
    minX = Math.min(minX, points[i * 2]);
    maxX = Math.max(maxX, points[i * 2]);
    minY = Math.min(minY, points[i * 2 + 1]);
    maxY = Math.max(maxY, points[i * 2 + 1]);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Bounding rect of a set of strokes, grown by half of the widest stroke so the
 * rect contains the drawn line rather than its centreline — otherwise selecting
 * an ink node clips the outer half of every edge stroke.
 */
export function strokesBounds(strokes: readonly InkStroke[]): Rect | null {
  const rects: Rect[] = [];
  let widest = 0;
  for (const stroke of strokes) {
    const b = pointsBounds(stroke.points);
    if (b) rects.push(b);
    widest = Math.max(widest, stroke.width);
  }
  const bounds = boundsOf(rects);
  if (!bounds) return null;
  const pad = widest / 2;
  return { x: bounds.x - pad, y: bounds.y - pad, w: bounds.w + pad * 2, h: bounds.h + pad * 2 };
}

/**
 * Total drawn length of a stroke, used to reject accidental marks.
 *
 * A palm resting on the glass or a tap that slid two pixels while panning
 * produces a stroke; committing it leaves specks a user then has to hunt down at
 * high zoom.
 */
export function strokeLength(points: readonly number[]): number {
  const count = Math.floor(points.length / 2);
  let total = 0;
  for (let i = 1; i < count; i += 1) {
    total += Math.hypot(points[i * 2] - points[(i - 1) * 2], points[i * 2 + 1] - points[(i - 1) * 2 + 1]);
  }
  return total;
}

/** Minimum drawn length, in world units, for a stroke to be worth keeping. */
export const MIN_STROKE_LENGTH = 3;

/** True when a finished stroke should be committed to the document. */
export function isKeepableStroke(points: readonly number[]): boolean {
  return points.length >= 4 && strokeLength(points) >= MIN_STROKE_LENGTH;
}
