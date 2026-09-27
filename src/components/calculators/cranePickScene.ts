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

function box(w: number, h: number, d: number, color: string, opts: { metalness?: number; roughness?: number } = {}): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color, metalness: opts.metalness ?? 0.2, roughness: opts.roughness ?? 0.6 });
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

/** A cylinder spanning two points — used for hoist line, sling legs, outrigger beams. */
function strut(a: THREE.Vector3, b: THREE.Vector3, radius: number, color: string): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, len, 10),
    new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 }),
  );
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

/** Wide-flange section extruded along z, top of flange at y = 0. */
function wideFlange(length: number, depth: number, flangeWidth: number, color: string): THREE.Group {
  const g = new THREE.Group();
  const tf = Math.max(0.08, depth * 0.08);
  const tw = Math.max(0.05, flangeWidth * 0.06);
  const top = box(flangeWidth, tf, length, color, { metalness: 0.5, roughness: 0.45 });
  top.position.y = -tf / 2;
  const bot = box(flangeWidth, tf, length, color, { metalness: 0.5, roughness: 0.45 });
  bot.position.y = -depth + tf / 2;
  const web = box(tw, depth - 2 * tf, length, color, { metalness: 0.5, roughness: 0.45 });
  web.position.y = -depth / 2;
  g.add(top, bot, web);
  return g;
}

/** Build the crane + rigging + load. Caller owns disposal. */
export function buildCraneGroup(spec: CraneSceneSpec, layout: CraneLayout, palette: ScenePalette): THREE.Group {
  const root = new THREE.Group();

  // ── Carrier on outriggers ────────────────────────────────────
  const carrier = box(34, 4, 9, palette.carrier);
  carrier.position.set(-4, 3.5, 0);
  root.add(carrier);
  for (const x of [-16, -10, 4, 10]) {
    for (const z of [-4.6, 4.6]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(1.8, 1.8, 1.2, 18),
        new THREE.MeshStandardMaterial({ color: palette.tire, roughness: 0.9 }),
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 2.2, z);
      root.add(wheel);
    }
  }
  for (const x of [-15, 9]) {
    for (const side of [-1, 1]) {
      const from = new THREE.Vector3(x, 2.5, side * 4);
      const to = new THREE.Vector3(x, 0.4, side * 12);
      root.add(strut(from, to, 0.45, palette.carrier));
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.6, 0.3, 20),
        new THREE.MeshStandardMaterial({ color: palette.neutral, roughness: 0.8 }),
      );
      pad.position.set(x, 0.15, side * 12);
      root.add(pad);
    }
  }

  // ── Superstructure: turntable, house, cab, counterweight ─────
  const turntable = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 1, 28),
    new THREE.MeshStandardMaterial({ color: palette.neutral, metalness: 0.4, roughness: 0.5 }),
  );
  turntable.position.set(0, 6, 0);
  root.add(turntable);
  const house = box(14, 4, 7.5, palette.boom);
  house.position.set(-3, 8.5, 0);
  root.add(house);
  const cab = box(4, 4.5, 3, palette.boom);
  cab.position.set(3, 8.7, 4.8);
  root.add(cab);
  const cw = box(4, 5, 8, palette.carrier, { metalness: 0.3 });
  cw.position.set(-11.5, 8.5, 0);
  root.add(cw);

  // ── Boom (straight, tapered by stepping section sizes) ───────
  const foot = new THREE.Vector3(layout.footX, layout.footY, 0);
  const tip = new THREE.Vector3(layout.tipX, layout.tipY, 0);
  const boomDir = new THREE.Vector3().subVectors(tip, foot);
  const boomLen = boomDir.length();
  const sections = 4;
  for (let i = 0; i < sections; i++) {
    const t0 = i / sections;
    const t1 = (i + 1) / sections + (i < sections - 1 ? 0.02 : 0); // small overlap reads as telescoping
    const size = 3 - i * 0.45;
    const seg = box(boomLen * (t1 - t0), size, size * 0.85, palette.boom, { metalness: 0.35, roughness: 0.45 });
    const mid = foot.clone().addScaledVector(boomDir, (t0 + t1) / 2);
    seg.position.copy(mid);
    seg.rotation.z = layout.boomAngleRad;
    root.add(seg);
  }
  const sheave = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 1.2, 20),
    new THREE.MeshStandardMaterial({ color: palette.neutral, metalness: 0.5 }),
  );
  sheave.rotation.x = Math.PI / 2;
  sheave.position.copy(tip);
  root.add(sheave);

  // ── Hoist line + hook block ──────────────────────────────────
  const hook = new THREE.Vector3(layout.hookX, layout.hookY, 0);
  const blockTop = hook.clone().setY(layout.hookY + HOOK_BLOCK_HEIGHT_FT);
  root.add(strut(tip, blockTop, 0.12, palette.line));
  const block = box(1.6, HOOK_BLOCK_HEIGHT_FT, 1.4, palette.yellow, { metalness: 0.4 });
  block.position.set(hook.x, layout.hookY + HOOK_BLOCK_HEIGHT_FT / 2, 0);
  root.add(block);

  // ── Sling legs, coloured by their own angle status ───────────
  for (const p of spec.pickPoints) {
    const at = new THREE.Vector3(layout.hookX + p.x, layout.pickY, p.z);
    root.add(strut(hook, at, 0.14, statusColor(palette, p.status)));
    const shackle = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 10),
      new THREE.MeshStandardMaterial({ color: palette.neutral, metalness: 0.6 }),
    );
    shackle.position.copy(at);
    root.add(shackle);
  }

  // ── Load: wide-flange (1–2 legs) or two beams + cross members (4 legs) ──
  const loadColor = statusColor(palette, spec.capacityStatus);
  const load = new THREE.Group();
  if (spec.loadWidth > 2) {
    for (const x of [-spec.loadWidth / 2 + 0.5, spec.loadWidth / 2 - 0.5]) {
      const b = wideFlange(spec.loadLength, LOAD_DEPTH_FT, 1, loadColor);
      b.position.x = x;
      load.add(b);
    }
    for (const z of [-spec.loadLength / 2 + 0.5, spec.loadLength / 2 - 0.5]) {
      const c = box(spec.loadWidth, LOAD_DEPTH_FT * 0.8, 0.8, loadColor, { metalness: 0.5, roughness: 0.45 });
      c.position.set(0, -LOAD_DEPTH_FT / 2, z);
      load.add(c);
    }
  } else {
    load.add(wideFlange(spec.loadLength, LOAD_DEPTH_FT, 1.1, loadColor));
  }
  load.position.set(layout.hookX, layout.pickY, spec.loadCenterZ ?? 0);
  root.add(load);

  // CG marker — a short plumb line from the hook through the load.
  const cgMat = new THREE.LineDashedMaterial({ color: palette.neutral, dashSize: 0.6, gapSize: 0.4 });
  const cgGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(layout.hookX, layout.hookY, 0),
    new THREE.Vector3(layout.hookX, Math.max(0, layout.loadBottomY - 1), 0),
  ]);
  const cgLine = new THREE.Line(cgGeom, cgMat);
  cgLine.computeLineDistances();
  root.add(cgLine);

  // Radius dimension on the ground: centre of rotation → hook plumb.
  const radGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.05, 0),
    new THREE.Vector3(layout.hookX, 0.05, 0),
  ]);
  root.add(new THREE.Line(radGeom, new THREE.LineBasicMaterial({ color: palette.boom })));

  return root;
}
