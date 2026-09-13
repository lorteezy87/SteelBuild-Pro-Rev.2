import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  clipHeight,
  deriveCameraClipRange,
  deriveMaterialVisibility,
  deriveMeshVisibility,
  indexMeshesByGuid,
  measureMarkerRadius,
  selectedGuids,
  shouldUpdateCameraClipRange,
} from "../ifcViewerScene";
import {
  clearDisposableGroup,
  disposeViewerResources,
} from "../ifcViewerLifecycle";

describe("IFC viewer scene derivations", () => {
  it("indexes every placed mesh by GUID without indexing unrelated objects", () => {
    const a1 = new THREE.Mesh();
    const a2 = new THREE.Mesh();
    const b = new THREE.Mesh();
    a1.userData.guid = "A";
    a2.userData.guid = "A";
    b.userData.guid = "B";

    const index = indexMeshesByGuid([a1, new THREE.Group(), a2, b]);

    expect(index.get("A")).toEqual([a1, a2]);
    expect(index.get("B")).toEqual([b]);
  });

  it("preserves clip-range thresholds and ignores invalid camera distances", () => {
    expect(deriveCameraClipRange(Number.NaN, 10)).toBeNull();
    expect(deriveCameraClipRange(20, 5)).toEqual({ near: 0.03, far: 200 });
    expect(
      shouldUpdateCameraClipRange(
        { near: 0.03, far: 200 },
        { near: 0.031, far: 205 },
      ),
    ).toBe(false);
    expect(
      shouldUpdateCameraClipRange(
        { near: 0.03, far: 200 },
        { near: 0.04, far: 240 },
      ),
    ).toBe(true);
  });

  it("derives hidden and isolated ghost states without conflating them", () => {
    const hidden = new Set(["hidden"]);
    const isolated = new Set(["kept"]);
    expect(deriveMeshVisibility("hidden", hidden, isolated)).toEqual({
      hidden: true,
      ghosted: false,
    });
    expect(deriveMeshVisibility("kept", hidden, isolated)).toEqual({
      hidden: false,
      ghosted: false,
    });
    expect(deriveMeshVisibility("context", hidden, isolated)).toEqual({
      hidden: false,
      ghosted: true,
    });
    expect(deriveMaterialVisibility(0.6, true, false)).toEqual({
      transparent: true,
      opacity: 0.6,
      depthWrite: true,
    });
    expect(deriveMaterialVisibility(1, false, true)).toEqual({
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
    });
  });

  it("deduplicates selected GUIDs and clamps level cuts to model bounds", () => {
    const first = new THREE.Object3D();
    const duplicate = new THREE.Object3D();
    const second = new THREE.Object3D();
    first.userData.guid = "A";
    duplicate.userData.guid = "A";
    second.userData.guid = "B";
    expect(selectedGuids([first, duplicate, second])).toEqual(["A", "B"]);

    const bounds = new THREE.Box3(
      new THREE.Vector3(0, -10, 0),
      new THREE.Vector3(1, 30, 1),
    );
    expect(clipHeight(bounds, -1)).toBe(-10);
    expect(clipHeight(bounds, 0.25)).toBe(0);
    expect(clipHeight(bounds, 2)).toBe(30);
    expect(measureMarkerRadius(1)).toBe(0.025);
    expect(measureMarkerRadius(100)).toBe(0.18);
  });
});

describe("IFC viewer resource lifecycle", () => {
  it("disposes all measure children and removes them from the overlay", () => {
    const group = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    const first = new THREE.MeshBasicMaterial();
    const second = new THREE.MeshBasicMaterial();
    vi.spyOn(geometry, "dispose");
    vi.spyOn(first, "dispose");
    vi.spyOn(second, "dispose");
    group.add(new THREE.Mesh(geometry, [first, second]));

    clearDisposableGroup(group);

    expect(group.children).toHaveLength(0);
    expect(geometry.dispose).toHaveBeenCalledOnce();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  it("disposes auxiliary geometry, materials, and the loaded model once", () => {
    const grid = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial(),
    );
    const ground = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    const model = { dispose: vi.fn() };
    vi.spyOn(grid.geometry, "dispose");
    vi.spyOn(grid.material, "dispose");
    vi.spyOn(ground.geometry, "dispose");
    vi.spyOn(ground.material, "dispose");

    disposeViewerResources({ grid, ground, model });

    expect(grid.geometry.dispose).toHaveBeenCalledOnce();
    expect(grid.material.dispose).toHaveBeenCalledOnce();
    expect(ground.geometry.dispose).toHaveBeenCalledOnce();
    expect(ground.material.dispose).toHaveBeenCalledOnce();
    expect(model.dispose).toHaveBeenCalledOnce();
  });
});
