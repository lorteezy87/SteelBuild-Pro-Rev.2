import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildCraneGroup, computeCraneLayout, BOOM_FOOT_HEIGHT_FT, LOAD_CLEARANCE_FT, LOAD_DEPTH_FT, type CraneSceneSpec, type ScenePalette } from "../cranePickScene";
import { boomGeometry } from "@/utils/cranePickMath";
import { disposeObjectResources } from "@/components/viewer3d/ifcViewerLifecycle";

const spec = (over: Partial<CraneSceneSpec> = {}): CraneSceneSpec => ({
  boomLength: 100, radius: 50, legHeight: 8, pickPoints: [], loadLength: 20, loadWidth: 1,
  capacityStatus: null, illustrative: false, ...over,
});

const palette: ScenePalette = {
  boom: "#e0b030", carrier: "#6b7280", line: "#9ca3af", green: "#22c55e",
  yellow: "#f59e0b", red: "#ef4444", neutral: "#9ca3af", tire: "#20242b",
};

describe("buildCraneGroup", () => {
  it.each([
    { loadWidth: 1, loadLength: 30, loadCenterZ: 4, pickPoints: [{ x: 0, z: -11, status: null }, { x: 0, z: 19, status: null }] },
    { loadWidth: 12, loadLength: 24, loadCenterZ: -3, pickPoints: [{ x: -6, z: -15, status: null }, { x: 6, z: 9, status: null }] },
  ])("preserves the entered load footprint and offset CG in detailed geometry: %j", (dimensions) => {
    const input = spec(dimensions);
    const layout = computeCraneLayout(input)!;
    const crane = buildCraneGroup(input, layout, palette);
    const load = crane.getObjectByName("steel-load");
    expect(load).toBeDefined();
    const bounds = new THREE.Box3().setFromObject(load!);
    expect(bounds.min.y).toBeCloseTo(layout.loadBottomY, 5);
    expect(bounds.max.y).toBeCloseTo(layout.pickY, 5);
    expect(bounds.getSize(new THREE.Vector3()).z).toBeCloseTo(input.loadLength, 5);
    expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(input.loadCenterZ!, 5);
    expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(layout.hookX, 5);
    if (input.loadWidth > 2) expect(bounds.getSize(new THREE.Vector3()).x).toBeCloseTo(input.loadWidth, 5);
    for (const [index, pick] of input.pickPoints.entries()) {
      const shackle = crane.getObjectByName(`pick-shackle-${index}`)!;
      expect(shackle).toBeDefined();
      expect(shackle.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([layout.hookX + pick.x, layout.pickY, pick.z]);
    }
    disposeObjectResources(crane);
  });

  it("does not lift an impossible rigging arrangement above grade to make the picture look safe", () => {
    const input = spec({ boomLength: 100, radius: 98, legHeight: 40 });
    const layout = computeCraneLayout(input)!;
    const crane = buildCraneGroup(input, layout, palette);
    const load = crane.getObjectByName("steel-load")!;
    expect(load).toBeDefined();
    const bounds = new THREE.Box3().setFromObject(load);
    expect(bounds.min.y).toBeCloseTo(layout.loadBottomY, 5);
    expect(bounds.max.y).toBeCloseTo(layout.pickY, 5);
    expect(bounds.min.y).toBeLessThan(0);
    disposeObjectResources(crane);
  });

  it("keeps procedural detail bounded and all rendered geometry finite", () => {
    const input = spec({ pickPoints: [{ x: -4, z: -10, status: "green" }, { x: 4, z: 10, status: "yellow" }] });
    const crane = buildCraneGroup(input, computeCraneLayout(input)!, palette);
    let drawCalls = 0;
    let vertices = 0;
    const materials = new Set<THREE.Material>();
    crane.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
      drawCalls += 1;
      const position = object.geometry.getAttribute("position");
      vertices += position.count;
      expect([...position.array].every(Number.isFinite)).toBe(true);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    expect(drawCalls).toBeLessThanOrEqual(65);
    expect(vertices).toBeLessThan(70000);
    expect(materials.size).toBeLessThanOrEqual(18);
    disposeObjectResources(crane);
  });
});

describe("computeCraneLayout", () => {
  it("draws the boom at the same angle the calculator reports", () => {
    const l = computeCraneLayout(spec())!;
    expect((l.boomAngleRad * 180) / Math.PI).toBeCloseTo(boomGeometry(100, 50)!.boomAngle, 9);
    expect(l.tipY - BOOM_FOOT_HEIGHT_FT).toBeCloseTo(boomGeometry(100, 50)!.tipHeightAboveFoot, 9);
    expect(l.hookX).toBe(50);
  });

  it("hangs the load just off grade with the hook H above the pick points", () => {
    const l = computeCraneLayout(spec())!;
    expect(l.loadBottomY).toBe(LOAD_CLEARANCE_FT);
    expect(l.pickY).toBe(LOAD_CLEARANCE_FT + LOAD_DEPTH_FT);
    expect(l.hookY - l.pickY).toBeCloseTo(8, 9);
    expect(l.headroomLimited).toBe(false);
  });

  it("keeps H honest and flags headroom when the rigging won't fit under the tip", () => {
    const l = computeCraneLayout(spec({ boomLength: 100, radius: 98, legHeight: 40 }))!;
    expect(l.headroomLimited).toBe(true);
    expect(l.hookY - l.pickY).toBeCloseTo(40, 9);
    expect(l.hookY).toBeLessThan(l.tipY);
  });

  it("returns null when the radius is out of reach", () => {
    expect(computeCraneLayout(spec({ radius: 120 }))).toBeNull();
    expect(computeCraneLayout(spec({ boomLength: 0 }))).toBeNull();
  });
});
