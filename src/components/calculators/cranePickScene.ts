/**
 * cranePickScene.ts
 *
 * Builds the Three.js scene for the Crane Pick Calculator's 3D view: a mobile
 * crane on outriggers, a luffed boom, hoist line, hook block, sling legs and
 * the steel piece. All dimensions are FEET, y is up, the crane's centre of
 * rotation is the origin and the boom points down +x.
 *
 * The layout (`computeCraneLayout`) is pure arithmetic so it can be tested
 * without WebGL; `buildCraneGroup` only turns that layout into meshes.
 *
 * The model is an ILLUSTRATION of the entered geometry, not a to-scale model
 * of any particular crane: carrier, cab and counterweight are generic, and the
 * boom is drawn straight (no deflection).
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type Status = "green" | "yellow" | "red" | null;

/** A pick point, relative to the hook plumb line, in feet (x along boom, z across). */
export interface PickPoint {
  x: number;
  z: number;
  status: Status;
}

export interface CraneSceneSpec {
  /** Boom length, ft. */
  boomLength: number;
  /** Working radius (centre of rotation → hook), ft. */
  radius: number;
  /** Vertical distance hook → pick points, ft. */
  legHeight: number;
  pickPoints: PickPoint[];
  /** Load footprint (ft) — the piece is drawn as a wide-flange along z (or a frame for 4 legs). */
  loadLength: number;
  loadWidth: number;
  /** Where the load's geometric centre sits along z relative to the CG / hook plumb line
   *  (non-zero only for an offset-CG pick, where the piece spans the pick points
   *  but its CG is not at its middle). Defaults to 0. */
  loadCenterZ?: number;
  /** Crane utilization status — tints the load. The hook is always drawn plumb over the CG. */
  capacityStatus: Status;
  /** True when boom / radius were not entered and defaults are drawn. */
  illustrative: boolean;
}

/** Defaults drawn when the user has not entered boom length / radius. */
export const ILLUSTRATIVE_BOOM_FT = 110;
export const ILLUSTRATIVE_RADIUS_FT = 45;

/** Height of the boom foot pin above grade (generic hydraulic crane). */
export const BOOM_FOOT_HEIGHT_FT = 9;
/** Bottom of the load above grade — "just off the ground" for the trial lift. */
export const LOAD_CLEARANCE_FT = 2;
export const LOAD_DEPTH_FT = 1.5;
/** Minimum hoist-line length drawn between boom tip and hook block. */
const MIN_HOIST_LINE_FT = 4;
const HOOK_BLOCK_HEIGHT_FT = 2.5;

export interface CraneLayout {
  boomAngleRad: number;
  footX: number;
  footY: number;
  tipX: number;
  tipY: number;
  hookX: number;
  hookY: number;
  /** y of the pick points (top of the load). */
  pickY: number;
  loadBottomY: number;
  /** True when the rigging would not fit under the tip and the load was drawn lower. */
  headroomLimited: boolean;
}

/**
 * Pure layout: where the boom tip, hook and load sit for a given spec.
 * Returns null if the radius can't be reached with the boom.
 */
export function computeCraneLayout(spec: CraneSceneSpec): CraneLayout | null {
  const { boomLength, radius, legHeight } = spec;
  if (!(boomLength > 0) || !(radius > 0) || radius >= boomLength) return null;
  const boomAngleRad = Math.acos(radius / boomLength);
  const footX = 0;
  const footY = BOOM_FOOT_HEIGHT_FT;
  const tipX = radius;
  const tipY = footY + boomLength * Math.sin(boomAngleRad);

  const H = legHeight > 0 ? legHeight : 0;
  let loadBottomY = LOAD_CLEARANCE_FT;
  let pickY = loadBottomY + LOAD_DEPTH_FT;
  let hookY = pickY + H;
  let headroomLimited = false;
  const maxHookY = tipY - MIN_HOIST_LINE_FT - HOOK_BLOCK_HEIGHT_FT;
  if (hookY > maxHookY) {
    // Rigging taller than the space under the tip: the picture would two-block.
    // Keep the geometry honest (same H) and let the load hang lower instead.
    headroomLimited = true;
    hookY = maxHookY;
    pickY = hookY - H;
    loadBottomY = pickY - LOAD_DEPTH_FT;
  }
  return { boomAngleRad, footX, footY, tipX, tipY, hookX: radius, hookY, pickY, loadBottomY, headroomLimited };
}

export interface ScenePalette {
  boom: string;
  carrier: string;
  line: string;
  green: string;
  yellow: string;
  red: string;
  neutral: string;
  tire: string;
}

const statusColor = (p: ScenePalette, s: Status): string =>
  s === "red" ? p.red : s === "yellow" ? p.yellow : s === "green" ? p.green : p.neutral;

type Position = [number, number, number];

/** Small procedural parts are merged per assembly/material to bound draw calls.
 * No geometry/material cache survives a build; the caller owns the finished tree. */
class Assembly {
  readonly group = new THREE.Group();
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  constructor(name: string) { this.group.name = name; }

  add(geometry: THREE.BufferGeometry, material: THREE.Material, position: Position = [0, 0, 0], rotation = new THREE.Euler()): void {
    geometry.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1),
    ));
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
    if (nonIndexed !== geometry) geometry.dispose();
    const batch = this.parts.get(material) ?? [];
    batch.push(nonIndexed);
    this.parts.set(material, batch);
  }

  box(size: Position, at: Position, material: THREE.Material, rotation?: THREE.Euler): void {
    this.add(new THREE.BoxGeometry(...size), material, at, rotation);
  }

  cylinder(radius: number, length: number, at: Position, material: THREE.Material, across = false): void {
    this.add(new THREE.CylinderGeometry(radius, radius, length, 20), material, at, new THREE.Euler(across ? Math.PI / 2 : 0, 0, 0));
  }

  rod(from: Position, to: Position, radius: number, material: THREE.Material): void {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    if (direction.lengthSq() < 1e-12) return;
    const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()));
    this.add(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material, start.add(end).multiplyScalar(0.5).toArray() as Position, rotation);
  }

  finish(): THREE.Group {
    for (const [material, geometries] of this.parts) {
      const merged = mergeGeometries(geometries);
      geometries.forEach((geometry) => geometry.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.parts.clear();
    return this.group;
  }
}

/** Extrude a side profile across the vehicle, keeping its angular glazing/cab. */
function profile(points: [number, number][], width: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: 1 }).translate(0, 0, -width / 2);
}

/** Chamfered hydraulic boom section, longitudinal axis x. */
function boomSection(length: number, height: number, width: number): THREE.ExtrudeGeometry {
  const w = width / 2;
  const h = height / 2;
  const bevel = width * 0.18;
  return profile([
    [-w + bevel, -h], [w - bevel, -h], [w, -h + bevel], [w, h - bevel],
    [w - bevel, h], [-w + bevel, h], [-w, h - bevel], [-w, -h + bevel],
  ], length).rotateY(Math.PI / 2);
}

/** Wide-flange section along z, with the top of the flange exactly at y = 0. */
function wideFlange(assembly: Assembly, length: number, width: number, x: number, material: THREE.Material): void {
  const tf = LOAD_DEPTH_FT * 0.08;
  assembly.box([width, tf, length], [x, -tf / 2, 0], material);
  assembly.box([width, tf, length], [x, -LOAD_DEPTH_FT + tf / 2, 0], material);
  assembly.box([width * 0.07, LOAD_DEPTH_FT - 2 * tf, length], [x, -LOAD_DEPTH_FT / 2, 0], material);
}

/** Build the crane + rigging + load. Caller owns disposal of the whole tree.
 * Carrier details are generic; only boom/radius/rigging/load are entered geometry. */
export function buildCraneGroup(spec: CraneSceneSpec, layout: CraneLayout, palette: ScenePalette): THREE.Group {
  const root = new THREE.Group();
  root.name = "crane-pick";
  const material = (color: THREE.ColorRepresentation, metalness = 0.35, roughness = 0.48) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const paint = material(palette.boom);
  const body = material(palette.carrier);
  const dark = material(new THREE.Color(palette.carrier).multiplyScalar(0.3));
  const rubber = material(palette.tire, 0, 0.9);
  const metal = material(palette.neutral, 0.72, 0.28);
  const glass = material(new THREE.Color(palette.tire).lerp(new THREE.Color(palette.line), 0.23), 0.6, 0.16);
  const wire = material(palette.line, 0.65, 0.38);
  const warning = material(palette.yellow, 0.25, 0.48);
  const loadMaterial = material(statusColor(palette, spec.capacityStatus), 0.55, 0.5);
  const slingMaterials = new Map<Status, THREE.Material>();
  const slingMaterial = (status: Status) => {
    if (!slingMaterials.has(status)) slingMaterials.set(status, material(statusColor(palette, status), 0.25, 0.6));
    return slingMaterials.get(status)!;
  };

  // Long, low carrier with visible undercarriage, four axles and machined hubs.
  const carrier = new Assembly("carrier");
  carrier.box([33, 1.15, 7.8], [-3.5, 3.6, 0], body);
  carrier.box([30, 0.55, 8.6], [-4, 4.4, 0], dark);
  for (const z of [-2.8, 2.8]) carrier.box([30, 0.65, 0.45], [-4, 2.85, z], dark);
  for (const x of [-15, -9.5, 2, 7.5]) {
    carrier.cylinder(0.34, 8.8, [x, 1.95, 0], dark, true);
    for (const side of [-1, 1]) {
      const z = side * 4.4;
      carrier.cylinder(1.7, 1.05, [x, 1.95, z], rubber, true);
      carrier.cylinder(1.15, 1.09, [x, 1.95, z], dark, true);
      carrier.cylinder(0.98, 0.18, [x, 1.95, z + side * 0.57], metal, true);
      carrier.cylinder(0.44, 0.26, [x, 1.95, z + side * 0.69], body, true);
      for (let bolt = 0; bolt < 8; bolt++) {
        const angle = (bolt / 8) * Math.PI * 2;
        carrier.cylinder(0.07, 0.07, [x + Math.cos(angle) * 0.72, 1.95 + Math.sin(angle) * 0.72, z + side * 0.7], dark, true);
      }
      carrier.box([3.9, 0.25, 1.35], [x, 3.8, z], body);
    }
  }
  // Transport cab, raked windshield, side glazing and mirrors.
  carrier.add(profile([[9.3, 4.2], [14.1, 4.2], [14.1, 5.6], [13.2, 8.0], [9.3, 8.0]], 8.2), paint);
  carrier.add(profile([[9.6, 5.5], [13.9, 5.5], [13.1, 7.7], [9.6, 7.7]], 8.24), glass);
  carrier.box([0.09, 2.26, 7.6], [13.72, 6.59, 0], glass, new THREE.Euler(0, 0, 0.36));
  carrier.box([0.14, 2.3, 0.11], [13.76, 6.58, 0], dark, new THREE.Euler(0, 0, 0.36));
  carrier.box([4.3, 0.15, 8.35], [11.4, 8.05, 0], body);
  carrier.box([0.3, 0.6, 8.6], [14.2, 4.1, 0], dark);
  carrier.box([0.12, 0.7, 3.1], [14.28, 4.9, 0], dark);
  for (const side of [-1, 1]) {
    carrier.box([0.16, 0.45, 1.05], [14.32, 4.83, side * 3.0], metal);
    carrier.box([2.8, 0.15, 0.6], [10.8, 3.65, side * 4.25], metal);
    carrier.box([0.14, 2.45, 0.11], [10.2, 6.5, side * 4.18], paint);
    carrier.rod([13.1, 6.8, side * 4.2], [13.1, 6.8, side * 5], 0.08, dark);
    carrier.box([0.6, 0.85, 0.16], [13.1, 6.6, side * 5], dark);
  }
  carrier.box([6.3, 1.7, 7.1], [-15.8, 5.5, 0], body);
  for (let vent = 0; vent < 9; vent++) carrier.box([0.12, 0.95, 7.12], [-18.2 + vent * 0.55, 5.6, 0], dark);
  for (const side of [-1, 1]) {
    carrier.box([7, 0.16, 1.05], [-5.5, 4.85, side * 4.1], metal);
    for (let step = 0; step < 3; step++) carrier.box([2.2, 0.12, 0.65], [-6, 2.1 + step * 0.9, side * (4.7 - step * 0.15)], metal);
  }
  root.add(carrier.finish());

  // Horizontal telescoping outriggers, vertical hydraulic jacks and bearing mats.
  const supports = new Assembly("outriggers");
  for (const x of [-17.5, 6]) {
    supports.box([1.75, 1.25, 10.5], [x, 3.05, 0], body);
    for (const side of [-1, 1]) {
      supports.box([1.05, 0.86, 6.8], [x, 3.05, side * 8.35], paint);
      supports.box([1.26, 1.04, 0.35], [x, 3.05, side * 5.25], dark);
      supports.cylinder(0.57, 2.2, [x, 2.65, side * 11.55], body);
      supports.cylinder(0.26, 1.6, [x, 1.4, side * 11.55], metal);
      supports.cylinder(0.95, 0.25, [x, 0.6, side * 11.55], dark);
      supports.box([3.8, 0.43, 2.9], [x, 0.235, side * 11.55], body);
      for (const offset of [-1.05, 0, 1.05]) supports.box([0.07, 0.06, 2.75], [x + offset, 0.48, side * 11.55], dark);
      for (let stripe = 0; stripe < 3; stripe++) supports.box([0.08, 0.73, 0.4], [x + 0.54, 3.06, side * (9.3 + stripe * 0.8)], dark, new THREE.Euler(Math.PI / 5, 0, 0));
    }
  }
  root.add(supports.finish());

  // Slewing ring, machinery house, stacked counterweight plates and operator cab.
  const upper = new Assembly("superstructure");
  upper.cylinder(3.7, 0.6, [0, 5.1, 0], dark);
  upper.cylinder(3.2, 0.55, [0, 5.62, 0], metal);
  upper.box([12.5, 1.7, 7.5], [-2.8, 6.8, 0], paint);
  upper.box([7.2, 2.9, 6.3], [-5.1, 8.8, 0], paint);
  upper.box([6.4, 0.15, 6.5], [-5.1, 10.3, 0], dark);
  for (let slot = 0; slot < 8; slot++) upper.box([0.18, 1.45, 0.08], [-7.5 + slot * 0.55, 8.7, 3.2], dark);
  for (let plate = 0; plate < 4; plate++) {
    upper.box([3.0, 0.82, 8.8], [-10.1, 7.1 + plate * 0.9, 0], body);
    for (const side of [-1, 1]) upper.box([0.7, 0.26, 0.1], [-10.1, 7.15 + plate * 0.9, side * 4.44], dark);
  }
  for (const z of [-1.8, 1.8]) upper.box([2.4, 3.0, 0.55], [0, 7.9, z], body);
  upper.cylinder(0.58, 4.5, [0, BOOM_FOOT_HEIGHT_FT, 0], metal, true);
  upper.cylinder(1.15, 3.2, [-5.4, 10.9, 0], dark, true);
  for (const z of [-1.75, 1.75]) upper.cylinder(1.4, 0.18, [-5.4, 10.9, z], metal, true);
  upper.add(profile([[0.4, 6.2], [5.1, 6.2], [5.1, 9.4], [4.25, 11.1], [0.4, 11.1]], 3.0), paint, [0, 0, 4.85]);
  upper.add(profile([[0.65, 7.9], [4.88, 7.9], [4.88, 9.35], [4.05, 10.8], [0.65, 10.8]], 3.04), glass, [0, 0, 4.85]);
  upper.box([0.13, 2.9, 0.08], [1.65, 9.35, 6.42], paint);
  upper.box([4.2, 0.18, 3.35], [2.5, 11.16, 4.85], body);
  upper.box([1.15, 0.1, 1.0], [3.6, 5.9, 6.05], metal);
  upper.box([0.38, 0.45, 0.38], [-7.5, 10.64, 2.6], warning);
  for (const side of [-1, 1]) {
    upper.rod([-8.5, 10.5, side * 3.25], [-1.8, 10.5, side * 3.25], 0.065, metal);
    for (const x of [-8.5, -1.8]) upper.rod([x, 8.7, side * 3.25], [x, 10.5, side * 3.25], 0.065, metal);
  }
  root.add(upper.finish());

  // Four chamfered telescoping sections share the exact entered centreline.
  const boom = new Assembly("telescoping-boom");
  for (let section = 0; section < 4; section++) {
    const start = (spec.boomLength * section) / 4;
    const end = Math.min(spec.boomLength, (spec.boomLength * (section + 1)) / 4 + 0.7);
    const height = 3.05 - section * 0.43;
    const width = 2.55 - section * 0.35;
    boom.add(boomSection(end - start, height, width), paint, [(start + end) / 2, 0, 0]);
    if (section < 3) {
      boom.add(boomSection(0.8, height + 0.2, width + 0.2), body, [end - 0.4, 0, 0]);
      boom.box([0.9, 0.14, width + 0.1], [end - 0.4, height / 2 + 0.17, 0], dark);
    }
    boom.box([Math.max(0.1, end - start - 0.5), 0.08, 0.09], [(start + end) / 2, height * 0.32, width / 2 + 0.01], metal);
  }
  boom.cylinder(1.03, 1.72, [spec.boomLength, 0, 0], metal, true);
  for (const side of [-1, 1]) {
    boom.box([1.95, 1.85, 0.15], [spec.boomLength - 0.35, 0, side * 0.99], body);
    boom.cylinder(0.31, 0.17, [spec.boomLength, 0, side * 1.12], metal, true);
    boom.rod([0, 1.7, side * 0.42], [spec.boomLength - 0.2, 0.75, side * 0.42], 0.055, wire);
  }
  const boomGroup = boom.finish();
  boomGroup.position.set(layout.footX, layout.footY, 0);
  boomGroup.rotation.z = layout.boomAngleRad;
  root.add(boomGroup);

  // Luffing ram lands along the boom, not on a fixed point unrelated to its angle.
  const hydraulics = new Assembly("luffing-cylinder");
  const ramBase = new THREE.Vector3(1.8, 6.5, 0);
  const attachmentLength = Math.min(18, spec.boomLength * 0.32);
  const ramEnd = new THREE.Vector3(Math.cos(layout.boomAngleRad) * attachmentLength, layout.footY + Math.sin(layout.boomAngleRad) * attachmentLength - 1.35, 0);
  const barrelEnd = ramBase.clone().lerp(ramEnd, 0.58);
  hydraulics.rod(ramBase.toArray() as Position, barrelEnd.toArray() as Position, 0.58, body);
  hydraulics.rod(barrelEnd.toArray() as Position, ramEnd.toArray() as Position, 0.31, metal);
  hydraulics.cylinder(0.55, 2.7, ramEnd.toArray() as Position, dark, true);
  root.add(hydraulics.finish());

  // Parallel hoist falls, sheaves, cheek plates and an open hook. Hook datum is
  // unchanged: every coloured sling starts exactly at (hookX, hookY, 0).
  const rigging = new Assembly("hoist-and-slings");
  for (const z of [-0.45, 0.45]) {
    rigging.rod([layout.tipX, layout.tipY, z], [layout.hookX, layout.hookY + HOOK_BLOCK_HEIGHT_FT - 0.35, z], 0.07, wire);
  }
  for (const z of [-0.59, 0.59]) rigging.box([1.35, 1.35, 0.14], [layout.hookX, layout.hookY + 1.72, z], warning);
  rigging.cylinder(0.53, 1.1, [layout.hookX, layout.hookY + 1.75, 0], metal, true);
  rigging.cylinder(0.2, 0.5, [layout.hookX, layout.hookY + 0.83, 0], metal);
  rigging.add(new THREE.TorusGeometry(0.4, 0.13, 8, 20, Math.PI * 1.65), metal, [layout.hookX, layout.hookY + 0.4, 0], new THREE.Euler(0, 0, 0.4));
  for (const [index, p] of spec.pickPoints.entries()) {
    rigging.rod([layout.hookX, layout.hookY, 0], [layout.hookX + p.x, layout.pickY, p.z], 0.115, slingMaterial(p.status));
    const shackle = new Assembly(`pick-shackle-${index}`);
    shackle.add(new THREE.TorusGeometry(0.27, 0.08, 8, 16), metal, [0, 0.23, 0]);
    shackle.cylinder(0.095, 0.66, [0, 0.04, 0], dark, true);
    const attachment = shackle.finish();
    attachment.position.set(layout.hookX + p.x, layout.pickY, p.z);
    root.add(attachment);
  }
  root.add(rigging.finish());

  // Steel is a real I-section silhouette; stiffeners stay inside its envelope.
  const load = new Assembly("steel-load");
  const beamOffsets = spec.loadWidth > 2 ? [-spec.loadWidth / 2 + 0.5, spec.loadWidth / 2 - 0.5] : [0];
  for (const x of beamOffsets) {
    const width = spec.loadWidth > 2 ? 1 : 1.1;
    wideFlange(load, spec.loadLength, width, x, loadMaterial);
    for (const z of [-spec.loadLength * 0.36, spec.loadLength * 0.36]) {
      load.box([width * 0.9, LOAD_DEPTH_FT * 0.8, 0.08], [x, -LOAD_DEPTH_FT / 2, z], loadMaterial);
    }
  }
  if (spec.loadWidth > 2) {
    for (const z of [-spec.loadLength / 2 + 0.45, spec.loadLength / 2 - 0.45]) {
      load.box([spec.loadWidth - 1, 0.11, 0.8], [0, -0.06, z], loadMaterial);
      load.box([spec.loadWidth - 1, 0.11, 0.8], [0, -LOAD_DEPTH_FT + 0.06, z], loadMaterial);
      load.box([spec.loadWidth - 1, LOAD_DEPTH_FT - 0.22, 0.07], [0, -LOAD_DEPTH_FT / 2, z], loadMaterial);
    }
  }
  const loadGroup = load.finish();
  loadGroup.position.set(layout.hookX, layout.pickY, spec.loadCenterZ ?? 0);
  root.add(loadGroup);

  const cg = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(layout.hookX, layout.hookY, 0),
      new THREE.Vector3(layout.hookX, Math.min(0.05, layout.loadBottomY - 1), 0),
    ]),
    new THREE.LineDashedMaterial({ color: palette.neutral, dashSize: 0.6, gapSize: 0.4 }),
  );
  cg.name = "cg-plumb-line";
  cg.computeLineDistances();
  root.add(cg);

  // Technical reference: working radius dimension and a centre-of-rotation cross.
  const dimensionPoints = [
    0, 0.055, 0, layout.hookX, 0.055, 0,
    0, 0.055, -1.4, 0, 0.055, 1.4,
    layout.hookX, 0.055, -1.4, layout.hookX, 0.055, 1.4,
    -1.5, 0.055, 0, 1.5, 0.055, 0,
    0, 0.055, 0, 1.1, 0.055, 0.6,
    0, 0.055, 0, 1.1, 0.055, -0.6,
    layout.hookX, 0.055, 0, layout.hookX - 1.1, 0.055, 0.6,
    layout.hookX, 0.055, 0, layout.hookX - 1.1, 0.055, -0.6,
  ];
  const dimensionGeometry = new THREE.BufferGeometry();
  dimensionGeometry.setAttribute("position", new THREE.Float32BufferAttribute(dimensionPoints, 3));
  root.add(new THREE.LineSegments(dimensionGeometry, new THREE.LineBasicMaterial({ color: palette.boom })));
  return root;
}
