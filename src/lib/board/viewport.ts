/**
 * viewport — the world↔screen mapping for the infinite canvas.
 *
 * The board plane is unbounded. What the user sees is a window onto it,
 * described by three numbers: where the window's top-left corner sits in world
 * space (`x`, `y`) and how many screen pixels one world unit occupies (`scale`).
 *
 *     screen = (world - viewport.origin) * scale
 *     world  = screen / scale + viewport.origin
 *
 * Every gesture on the canvas reduces to producing a new Viewport from an old
 * one. Keeping that in a pure module — rather than mutating a transform inside a
 * pointer handler — is what makes the minimap, the spatial bookmarks and the
 * "fit to content" button share one definition of where the board is.
 *
 * ## Zoom is anchored, never centred
 *
 * {@link zoomAt} takes the screen point the gesture is centred on and keeps the
 * world point under it fixed. That is the whole reason a pinch feels like it is
 * moving paper rather than a slider: the sheet stays under your fingers. Zooming
 * about the viewport centre instead — the obvious implementation — makes the
 * spot you are pinching drift away as you scale, which on a large drawing means
 * you lose the detail you were zooming into.
 */

import { clamp, type Rect, type Vec2 } from "./geometry";

export interface Viewport {
  /** World coordinate displayed at the window's left edge. */
  x: number;
  /** World coordinate displayed at the window's top edge. */
  y: number;
  /** Screen pixels per world unit. Always within [MIN_SCALE, MAX_SCALE]. */
  scale: number;
}

/** Pixel size of the visible canvas element. */
export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * Zoom limits. The floor is set so a full high-rise erection sequence laid out
 * across the board still resolves; the ceiling is set for pinning a note to a
 * single connection detail on a blueprint overlay without the card outrunning
 * the sheet.
 */
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 6;

export const DEFAULT_VIEWPORT: Viewport = Object.freeze({ x: 0, y: 0, scale: 1 });

/** Clamp a proposed scale into the supported range, rejecting NaN/Infinity. */
export function clampScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return clamp(scale, MIN_SCALE, MAX_SCALE);
}

/** Screen point (relative to the canvas element) for a world point. */
export function worldToScreen(vp: Viewport, p: Vec2): Vec2 {
  return { x: (p.x - vp.x) * vp.scale, y: (p.y - vp.y) * vp.scale };
}

/** World point for a screen point (relative to the canvas element). */
export function screenToWorld(vp: Viewport, p: Vec2): Vec2 {
  return { x: p.x / vp.scale + vp.x, y: p.y / vp.scale + vp.y };
}

/** Screen-space rectangle for a world-space rectangle. */
export function worldRectToScreen(vp: Viewport, r: Rect): Rect {
  const tl = worldToScreen(vp, { x: r.x, y: r.y });
  return { x: tl.x, y: tl.y, w: r.w * vp.scale, h: r.h * vp.scale };
}

/**
 * Pan by a **screen-space** delta — what a one-finger drag or a trackpad scroll
 * produces. The delta is divided by the scale so a 100px drag moves the same
 * distance on screen whether the board is zoomed in or out.
 *
 * Sign convention: dragging the canvas right (`dx > 0`) moves the world under
 * the finger right, which means the viewport origin moves *left*.
 */
export function panByScreen(vp: Viewport, dx: number, dy: number): Viewport {
  return { x: vp.x - dx / vp.scale, y: vp.y - dy / vp.scale, scale: vp.scale };
}

/**
 * Zoom about a fixed screen point.
 *
 * `factor` is multiplicative: 1.1 zooms in 10%, 0.9 zooms out. The world point
 * under `anchor` before the change is the world point under it afterwards, so a
 * pinch or a wheel-zoom tracks the gesture centre exactly.
 *
 * When the requested scale is already at a limit the anchor still resolves
 * correctly — the returned viewport is simply unchanged, rather than drifting by
 * the clamped remainder.
 */
export function zoomAt(vp: Viewport, anchor: Vec2, factor: number): Viewport {
  const next = clampScale(vp.scale * factor);
  if (next === vp.scale) return vp;
  const world = screenToWorld(vp, anchor);
  return {
    x: world.x - anchor.x / next,
    y: world.y - anchor.y / next,
    scale: next,
  };
}

/** Zoom to an absolute scale about a fixed screen point. */
export function zoomToAt(vp: Viewport, anchor: Vec2, scale: number): Viewport {
  const next = clampScale(scale);
  if (next === vp.scale) return vp;
  return zoomAt(vp, anchor, next / vp.scale);
}

/**
 * A two-finger pinch, in one call: the viewport is scaled by the ratio of the
 * finger spread and panned by the movement of the pinch centre.
 *
 * Both halves matter. Handling only the spread makes a pinch that also slides
 * feel stuck; handling only the centre makes it a pan. Doing them in this order
 * — scale about the *previous* centre, then translate by the centre delta — is
 * what keeps a two-finger gesture that simultaneously rotates the wrist from
 * jumping.
 */
export function pinch(
  vp: Viewport,
  prev: { center: Vec2; distance: number },
  next: { center: Vec2; distance: number },
): Viewport {
  // A pinch that starts with the fingers already together has no meaningful
  // ratio; treat it as a two-finger pan rather than dividing by ~0.
  const ratio = prev.distance > 0.5 && next.distance > 0.5 ? next.distance / prev.distance : 1;
  const zoomed = zoomAt(vp, prev.center, ratio);
  return panByScreen(zoomed, next.center.x - prev.center.x, next.center.y - prev.center.y);
}

/**
 * The world rectangle currently visible. Used by the minimap to draw the
 * viewport box, and by the canvas to cull nodes it does not need to render.
 */
export function visibleWorldRect(vp: Viewport, size: ViewportSize): Rect {
  return {
    x: vp.x,
    y: vp.y,
    w: size.width / vp.scale,
    h: size.height / vp.scale,
  };
}

/**
 * The viewport that frames `target` inside `size`, with `padding` screen pixels
 * of margin on every side.
 *
 * Returns a centred, unit-scale viewport when the target has no area — a single
 * pinned note has a rect, but a degenerate 0×0 bound (or an empty board) would
 * otherwise divide by zero and produce a NaN transform that blanks the canvas.
 */
export function fitToRect(target: Rect, size: ViewportSize, padding = 48): Viewport {
  const availW = Math.max(1, size.width - padding * 2);
  const availH = Math.max(1, size.height - padding * 2);
  if (!(target.w > 0) || !(target.h > 0)) {
    return {
      x: target.x - size.width / 2,
      y: target.y - size.height / 2,
      scale: 1,
    };
  }
  const scale = clampScale(Math.min(availW / target.w, availH / target.h));
  // Centre the target: the leftover screen space is split evenly, then converted
  // back to world units so it can be subtracted from the origin.
  const slackX = (size.width - target.w * scale) / 2 / scale;
  const slackY = (size.height - target.h * scale) / 2 / scale;
  return { x: target.x - slackX, y: target.y - slackY, scale };
}

/** Centre the viewport on a world point without changing the zoom. */
export function centerOn(vp: Viewport, p: Vec2, size: ViewportSize): Viewport {
  return {
    x: p.x - size.width / 2 / vp.scale,
    y: p.y - size.height / 2 / vp.scale,
    scale: vp.scale,
  };
}

/** True when two viewports describe the same view, within floating-point noise. */
export function viewportsEqual(a: Viewport, b: Viewport, epsilon = 1e-6): boolean {
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.scale - b.scale) < epsilon
  );
}
