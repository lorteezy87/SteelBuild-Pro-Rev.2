/**
 * connectors — the elastic lines between cards.
 *
 * A connector has no stored geometry. It stores two node ids, and its shape is
 * recomputed from wherever those nodes currently are. That is what "elastic"
 * means here: drag a card and the line follows, with no second record to keep in
 * step and no chance of a line that remembers where a card used to be.
 *
 * ## Why edge midpoints rather than centres
 *
 * Drawing centre-to-centre is one line of code and looks wrong the moment cards
 * overlap or sit at an angle — the line disappears under both cards and the
 * arrowhead lands inside the target instead of at its edge. Choosing the facing
 * sides and leaving from their midpoints keeps the whole line visible, keeps the
 * arrow readable, and gives the curve a natural direction to bulge in.
 */

import { midpoint, rectBottom, rectCenter, rectRight, type Rect, type Vec2 } from "./geometry";
import type { BoardEdgeKind } from "./types";

export type ConnectorSide = "left" | "right" | "top" | "bottom";

/** How far the curve bows out from each card, in world units. */
const CURVE_TENSION = 48;

/** Midpoint of one side of a rectangle. */
export function anchorPoint(r: Rect, side: ConnectorSide): Vec2 {
  const c = rectCenter(r);
  switch (side) {
    case "left":
      return { x: r.x, y: c.y };
    case "right":
      return { x: rectRight(r), y: c.y };
    case "top":
      return { x: c.x, y: r.y };
    case "bottom":
    default:
      return { x: c.x, y: rectBottom(r) };
  }
}

/** Outward unit normal of a side — the direction the curve leaves the card in. */
function normal(side: ConnectorSide): Vec2 {
  switch (side) {
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
    default:
      return { x: 0, y: 1 };
  }
}

/**
 * Which sides face each other.
 *
 * Decided by the dominant axis of the centre-to-centre offset, so two cards side
 * by side connect left↔right and two stacked cards connect top↔bottom. The tie
 * at exactly equal offsets resolves to the horizontal pair, which reads better
 * for the left-to-right flow a planning board tends to grow in.
 */
export function chooseSides(from: Rect, to: Rect): { from: ConnectorSide; to: ConnectorSide } {
  const a = rectCenter(from);
  const b = rectCenter(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { from: "right", to: "left" } : { from: "left", to: "right" };
  }
  return dy >= 0 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
}

export interface ConnectorPath {
  start: Vec2;
  end: Vec2;
  control1: Vec2;
  control2: Vec2;
  /** SVG `d` attribute for the curve. */
  d: string;
  /** Where the relationship label sits — the curve's midpoint, not the chord's. */
  label: Vec2;
  /** Direction the arrowhead points, as a unit vector. */
  direction: Vec2;
}

/** Point at parameter `t` on a cubic Bézier. */
export function pointOnCubic(t: number, p0: Vec2, c1: Vec2, c2: Vec2, p1: Vec2): Vec2 {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

/**
 * The curve between two cards, in world coordinates.
 *
 * Tension scales with separation but is capped, so a connector across a whole
 * board does not balloon into a half-circle while two adjacent cards still get
 * a visible bow rather than a straight segment through the gap.
 */
export function connectorPath(from: Rect, to: Rect): ConnectorPath {
  const sides = chooseSides(from, to);
  const start = anchorPoint(from, sides.from);
  const end = anchorPoint(to, sides.to);
  const span = Math.hypot(end.x - start.x, end.y - start.y);
  const tension = Math.min(CURVE_TENSION, Math.max(12, span / 3));
  const n1 = normal(sides.from);
  const n2 = normal(sides.to);
  const control1 = { x: start.x + n1.x * tension, y: start.y + n1.y * tension };
  const control2 = { x: end.x + n2.x * tension, y: end.y + n2.y * tension };
  const label = pointOnCubic(0.5, start, control1, control2, end);
  // The arrow points along the tangent at the target end, which for a cubic is
  // the direction from the second control point to the endpoint. Using the
  // chord instead makes the head visibly askew on a strongly bowed connector.
  const tangent = { x: end.x - control2.x, y: end.y - control2.y };
  const len = Math.hypot(tangent.x, tangent.y) || 1;
  return {
    start,
    end,
    control1,
    control2,
    d: `M ${round(start.x)} ${round(start.y)} C ${round(control1.x)} ${round(control1.y)}, ${round(control2.x)} ${round(control2.y)}, ${round(end.x)} ${round(end.y)}`,
    label,
    direction: { x: tangent.x / len, y: tangent.y / len },
  };
}

/** A straight connector to a loose point — the rubber band while drawing one. */
export function draftConnectorPath(from: Rect, to: Vec2): ConnectorPath {
  const sides = chooseSides(from, { x: to.x, y: to.y, w: 0, h: 0 });
  const start = anchorPoint(from, sides.from);
  const mid = midpoint(start, to);
  const dx = to.x - start.x;
  const dy = to.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    start,
    end: to,
    control1: mid,
    control2: mid,
    d: `M ${round(start.x)} ${round(start.y)} L ${round(to.x)} ${round(to.y)}`,
    label: mid,
    direction: { x: dx / len, y: dy / len },
  };
}

/**
 * Arrowhead polygon points for an SVG `<polygon>`, in world coordinates.
 *
 * Drawn as a triangle whose tip is at the connector's end and whose base is
 * `size` back along the tangent, `size / 2` to each side.
 */
export function arrowHeadPoints(tip: Vec2, direction: Vec2, size = 12): string {
  const backX = tip.x - direction.x * size;
  const backY = tip.y - direction.y * size;
  // Perpendicular to the direction, both ways.
  const px = -direction.y * (size / 2);
  const py = direction.x * (size / 2);
  return [
    `${round(tip.x)},${round(tip.y)}`,
    `${round(backX + px)},${round(backY + py)}`,
    `${round(backX - px)},${round(backY - py)}`,
  ].join(" ");
}

/**
 * Dash pattern per relationship, so the kinds are distinguishable without
 * reading a label at board zoom — and without relying on colour alone, which
 * the user is free to set to anything.
 */
export function edgeDash(kind: BoardEdgeKind): string | undefined {
  switch (kind) {
    case "precedes":
      return undefined; // solid: the only kind with scheduling meaning
    case "blocks":
      return "2 6";
    case "supplies":
      return "10 6";
    case "relates":
    default:
      return "6 6";
  }
}

/** Human label used when a connector has no free-text label of its own. */
export function edgeKindLabel(kind: BoardEdgeKind): string {
  switch (kind) {
    case "precedes":
      return "then";
    case "blocks":
      return "blocks";
    case "supplies":
      return "supplies";
    case "relates":
    default:
      return "relates to";
  }
}

/** Two decimal places, and never `-0` — which SVG renders but diffs badly. */
function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}
