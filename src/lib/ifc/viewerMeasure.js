/**
 * viewerMeasure.js — pure helpers for 3D IFC point-to-point measure.
 *
 * web-ifc geometry with COORDINATE_TO_ORIGIN is in meters. Steel fab needs
 * feet-inches; format via lengthMath ticks so display matches the rest of
 * the app (Feet & Inches Calculator).
 */
import * as THREE from "three";
import { TICKS_PER_FOOT, formatLength } from "@/utils/lengthMath";

/** 1 meter → feet (exact international foot). */
export const METERS_TO_FEET = 3.280839895013123;

/** Convert meters → 32nd-inch ticks (lengthMath unit). */
export function metersToTicks(meters) {
  if (meters == null || !Number.isFinite(meters)) return null;
  return Math.round(Math.abs(meters) * METERS_TO_FEET * TICKS_PER_FOOT);
}

/**
 * Format a world-space distance (meters) for the measure readout.
 * Primary: ft-in to 1/16". Secondary: decimal feet + meters.
 */
export function formatMeasureDistance(meters, precisionDen = 16) {
  if (meters == null || !Number.isFinite(meters)) {
    return { ftIn: "—", decimalFeet: null, meters: null, ticks: null };
  }
  const abs = Math.abs(meters);
  const ticks = metersToTicks(abs);
  return {
    ftIn: formatLength(ticks, precisionDen),
    decimalFeet: abs * METERS_TO_FEET,
    meters: abs,
    ticks,
  };
}

/**
 * Snap a world-space hit point to the nearest vertex of the hit mesh.
 * Makes measure endpoints land on real model geometry instead of face
 * mid-points (more reliable for steel dimensions).
 *
 * @param {THREE.Mesh} mesh
 * @param {THREE.Vector3} worldPoint
 * @param {number} [maxDistM=0.08]  ~3" — beyond this, keep the face hit
 * @returns {{ point: THREE.Vector3, snapped: boolean }}
 */
export function snapToNearestVertex(mesh, worldPoint, maxDistM = 0.08) {
  const geom = mesh?.geometry;
  const posAttr = geom?.attributes?.position;
  if (!posAttr || !worldPoint) {
    return { point: worldPoint?.clone?.() || new THREE.Vector3(), snapped: false };
  }

  mesh.updateWorldMatrix(true, false);
  const local = new THREE.Vector3();
  const world = new THREE.Vector3();
  let best = null;
  let bestDist = Infinity;

  for (let i = 0; i < posAttr.count; i++) {
    local.fromBufferAttribute(posAttr, i);
    world.copy(local).applyMatrix4(mesh.matrixWorld);
    const d = world.distanceTo(worldPoint);
    if (d < bestDist) {
      bestDist = d;
      best = world.clone();
    }
  }

  if (best && bestDist <= maxDistM) {
    return { point: best, snapped: true };
  }
  return { point: worldPoint.clone(), snapped: false };
}

/** Euclidean distance between two THREE.Vector3-like points (meters). */
export function distanceMeters(a, b) {
  if (!a || !b) return null;
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
