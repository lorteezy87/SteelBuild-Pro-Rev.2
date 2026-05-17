/**
 * drawingHub/zoneGeometry.js — Pure geometry helpers for drawing zones.
 *
 * Extracted from src/lib/drawingHub.js. No I/O; safe to unit-test
 * directly. Values + behavior are byte-identical to the original.
 */

/**
 * Compute the axis-aligned bounding box of a polygon-points array.
 * Points are [x,y] pairs in normalized [0,1] viewer space. Returns
 * null if the input is empty or malformed — callers should guard on
 * that before relying on the result.
 */
export function bboxFromPolygonPoints(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let xMin =  Infinity, yMin =  Infinity;
  let xMax = -Infinity, yMax = -Infinity;
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
  }
  return { xMin, yMin, xMax, yMax };
}
