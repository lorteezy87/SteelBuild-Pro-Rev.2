import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  metersToTicks,
  formatMeasureDistance,
  distanceMeters,
  METERS_TO_FEET,
  MEASURE_PRECISION_DEN,
  closestPointOnSegment,
  snapMeasurePoint,
  snapToNearestVertex,
} from "../viewerMeasure";

describe("viewerMeasure", () => {
  it("metersToTicks converts 1 foot exactly", () => {
    const oneFootM = 1 / METERS_TO_FEET;
    expect(metersToTicks(oneFootM)).toBe(384); // TICKS_PER_FOOT
  });

  it("formatMeasureDistance shows 10'-0\" for ~3.048 m", () => {
    const tenFeetM = 10 / METERS_TO_FEET;
    const f = formatMeasureDistance(tenFeetM);
    expect(f.ftIn).toMatch(/^10'-0"$/);
    expect(f.decimalFeet).toBeCloseTo(10, 4);
    expect(f.meters).toBeCloseTo(tenFeetM, 6);
    expect(f.precisionDen).toBe(MEASURE_PRECISION_DEN);
  });

  it("formatMeasureDistance rounds to nearest 1/16\"", () => {
    // 10'-0 1/32" should round to 10'-0" or 10'-0 1/16" depending on banker's...
    // 1/32" = half of 1/16 → Math.round half-up for positive → 1/16 in tick space
    const base = 10 / METERS_TO_FEET;
    const thirtySecondM = (1 / 32) / 12 / METERS_TO_FEET;
    const f = formatMeasureDistance(base + thirtySecondM);
    // residual after 1/16 rounding must be within ±1/32"
    expect(Math.abs(f.residualInches)).toBeLessThanOrEqual(1 / 32 + 1e-9);
    expect(f.ftIn).toMatch(/10'-0/);
  });

  it("distanceMeters is Euclidean", () => {
    expect(distanceMeters({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
  });

  it("handles null distance", () => {
    expect(formatMeasureDistance(null).ftIn).toBe("—");
    expect(distanceMeters(null, { x: 1, y: 0, z: 0 })).toBeNull();
  });

  it("closestPointOnSegment clamps to endpoints", () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(10, 0, 0);
    const mid = closestPointOnSegment(new THREE.Vector3(5, 2, 0), a, b);
    expect(mid.x).toBeCloseTo(5);
    expect(mid.y).toBeCloseTo(0);
    const before = closestPointOnSegment(new THREE.Vector3(-3, 1, 0), a, b);
    expect(before.x).toBeCloseTo(0);
    const after = closestPointOnSegment(new THREE.Vector3(15, 1, 0), a, b);
    expect(after.x).toBeCloseTo(10);
  });

  it("snapMeasurePoint prefers a nearby vertex", () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ]), 3),
    );
    geom.setIndex([0, 1, 2]);
    const mesh = new THREE.Mesh(geom);
    mesh.updateMatrixWorld(true);
    const hit = new THREE.Vector3(0.01, 0.01, 0.01);
    const r = snapMeasurePoint(mesh, hit);
    expect(r.snapped).toBe(true);
    expect(r.snapKind).toBe("vertex");
    expect(r.point.x).toBeCloseTo(0);
    expect(r.point.y).toBeCloseTo(0);
    expect(r.point.z).toBeCloseTo(0);
  });

  it("snapMeasurePoint snaps to an edge mid-point", () => {
    const geom = new THREE.BufferGeometry();
    // Unit triangle in XY; hit near midpoint of edge (0,0)-(1,0)
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0.5, 1, 0,
      ]), 3),
    );
    geom.setIndex([0, 1, 2]);
    const mesh = new THREE.Mesh(geom);
    mesh.updateMatrixWorld(true);
    // Point above the edge mid, outside vertex radius of either end
    const hit = new THREE.Vector3(0.5, 0.02, 0);
    const r = snapMeasurePoint(mesh, hit, { maxVertexDistM: 0.05, maxEdgeDistM: 0.05 });
    expect(r.snapped).toBe(true);
    expect(r.snapKind).toBe("edge");
    expect(r.point.x).toBeCloseTo(0.5, 3);
    expect(r.point.y).toBeCloseTo(0, 3);
  });

  it("snapToNearestVertex remains vertex-only", () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([
        0, 0, 0,
        2, 0, 0,
        1, 2, 0,
      ]), 3),
    );
    geom.setIndex([0, 1, 2]);
    const mesh = new THREE.Mesh(geom);
    mesh.updateMatrixWorld(true);
    const hit = new THREE.Vector3(1, 0.02, 0); // edge mid, far from verts
    const r = snapToNearestVertex(mesh, hit, 0.05);
    expect(r.snapped).toBe(false);
  });
});
