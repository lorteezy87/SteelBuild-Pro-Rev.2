/**
 * viewerMeasure.js — pure helpers for 3D IFC point-to-point measure.
 *
 * web-ifc geometry with COORDINATE_TO_ORIGIN is in meters. Steel fab needs
 * feet-inches; format via lengthMath ticks so display matches the rest of
 * the app (Feet & Inches Calculator). Display is always rounded to the
 * nearest 1/16" (precisionDen = 16).
 */
import * as THREE from "three";
import { TICKS_PER_FOOT, TICKS_PER_INCH, formatLength } from "@/utils/lengthMath";

/** 1 meter → feet (exact international foot). */
export const METERS_TO_FEET = 3.280839895013123;

/** 1/16 inch in meters — used for snap tolerances and accuracy notes. */
export const SIXTEENTH_INCH_M = (1 / 16) / 12 / METERS_TO_FEET;

/** Default display precision: nearest 1/16". */
export const MEASURE_PRECISION_DEN = 16;

/** Convert meters → 32nd-inch ticks (lengthMath unit). */
export function metersToTicks(meters) {
  if (meters == null || !Number.isFinite(meters)) return null;
  return Math.round(Math.abs(meters) * METERS_TO_FEET * TICKS_PER_FOOT);
}

/**
 * Format a world-space distance (meters) for the measure readout.
 * Primary: ft-in to nearest 1/16". Secondary: decimal feet + meters.
 * Also reports the residual after rounding (always ≤ 1/32" at den=16).
 */
export function formatMeasureDistance(meters, precisionDen = MEASURE_PRECISION_DEN) {
  if (meters == null || !Number.isFinite(meters)) {
    return {
      ftIn: "—",
      decimalFeet: null,
      meters: null,
      ticks: null,
      precisionDen,
      residualInches: null,
    };
  }
  const abs = Math.abs(meters);
  const ticks = metersToTicks(abs);
  const ticksPerStep = TICKS_PER_INCH / precisionDen;
  const roundedTicks = Math.round(ticks / ticksPerStep) * ticksPerStep;
  const residualTicks = ticks - roundedTicks;
  return {
    ftIn: formatLength(ticks, precisionDen),
    decimalFeet: abs * METERS_TO_FEET,
    meters: abs,
    ticks: roundedTicks,
    precisionDen,
    residualInches: residualTicks / TICKS_PER_INCH,
  };
}

/** Closest point on segment AB to point P (all THREE.Vector3). */
export function closestPointOnSegment(p, a, b, out = new THREE.Vector3()) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  if (abLenSq < 1e-18) return out.copy(a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / abLenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return out.set(a.x + abx * t, a.y + aby * t, a.z + abz * t);
}

/**
 * Snap a world-space hit to the nearest vertex or triangle edge of the mesh.
 * Prefer vertices (member corners / end points); fall back to edges so
 * measurements land on real steel geometry rather than face mid-points.
 *
 * @param {THREE.Mesh} mesh
 * @param {THREE.Vector3} worldPoint
 * @param {object} [opts]
 * @param {number} [opts.maxVertexDistM=0.06] ~2.4" — vertex win radius
 * @param {number} [opts.maxEdgeDistM=0.05]   ~2.0" — edge snap radius
 * @returns {{ point: THREE.Vector3, snapped: boolean, snapKind: 'vertex'|'edge'|'face' }}
 */
export function snapMeasurePoint(mesh, worldPoint, opts = {}) {
  const maxVertexDistM = opts.maxVertexDistM ?? 0.06;
  const maxEdgeDistM = opts.maxEdgeDistM ?? 0.05;
  const geom = mesh?.geometry;
  const posAttr = geom?.attributes?.position;
  if (!posAttr || !worldPoint) {
    return {
      point: worldPoint?.clone?.() || new THREE.Vector3(),
      snapped: false,
      snapKind: "face",
    };
  }

  mesh.updateWorldMatrix(true, false);
  const mw = mesh.matrixWorld;
  const local = new THREE.Vector3();
  const world = new THREE.Vector3();
  const count = posAttr.count;

  // ── vertices ──────────────────────────────────────────────────────
  let bestV = null;
  let bestVDist = Infinity;
  for (let i = 0; i < count; i++) {
    local.fromBufferAttribute(posAttr, i);
    world.copy(local).applyMatrix4(mw);
    const d = world.distanceTo(worldPoint);
    if (d < bestVDist) {
      bestVDist = d;
      bestV = world.clone();
    }
  }
  if (bestV && bestVDist <= maxVertexDistM) {
    return { point: bestV, snapped: true, snapKind: "vertex" };
  }

  // ── edges (indexed triangles) ─────────────────────────────────────
  const index = geom.index;
  if (index && index.count >= 3) {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const onEdge = new THREE.Vector3();
    let bestE = null;
    let bestEDist = Infinity;

    const corner = (i, out) => {
      local.fromBufferAttribute(posAttr, i);
      return out.copy(local).applyMatrix4(mw);
    };

    for (let i = 0; i < index.count; i += 3) {
      const i0 = index.getX(i);
      const i1 = index.getX(i + 1);
      const i2 = index.getX(i + 2);
      corner(i0, a);
      corner(i1, b);
      corner(i2, c);
      for (const [p0, p1] of [[a, b], [b, c], [c, a]]) {
        closestPointOnSegment(worldPoint, p0, p1, onEdge);
        const d = onEdge.distanceTo(worldPoint);
        if (d < bestEDist) {
          bestEDist = d;
          bestE = onEdge.clone();
        }
      }
    }

    if (bestE && bestEDist <= maxEdgeDistM) {
      return { point: bestE, snapped: true, snapKind: "edge" };
    }
  }

  // Face hit (no nearby vertex/edge)
  if (bestV && bestVDist <= maxVertexDistM * 2) {
    // Prefer a slightly farther vertex over raw face hit for steel dims
    return { point: bestV, snapped: true, snapKind: "vertex" };
  }
  return { point: worldPoint.clone(), snapped: false, snapKind: "face" };
}

/**
 * Snap a world-space hit point to the nearest vertex of the hit mesh.
 * Kept for callers/tests; prefer snapMeasurePoint for measure UX.
 *
 * @param {THREE.Mesh} mesh
 * @param {THREE.Vector3} worldPoint
 * @param {number} [maxDistM=0.06]
 * @returns {{ point: THREE.Vector3, snapped: boolean }}
 */
export function snapToNearestVertex(mesh, worldPoint, maxDistM = 0.06) {
  const r = snapMeasurePoint(mesh, worldPoint, {
    maxVertexDistM: maxDistM,
    maxEdgeDistM: 0, // edges disabled — vertex-only legacy path
  });
  return { point: r.point, snapped: r.snapped && r.snapKind === "vertex" };
}

/** Euclidean distance between two THREE.Vector3-like points (meters). */
export function distanceMeters(a, b) {
  if (!a || !b) return null;
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
