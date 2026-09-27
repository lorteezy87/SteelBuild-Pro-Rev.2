/**
 * CranePick3D.tsx
 *
 * Interactive 3D view of the pick the calculator is describing: crane on
 * outriggers, boom at the angle implied by boom length + radius, hoist line,
 * hook block, sling legs (each coloured by its own angle status) and the load
 * (coloured by crane utilization status).
 *
 * Presentation only — it draws the numbers the page already computed and
 * derives no engineering values of its own. Loaded lazily so Three.js stays
 * out of the calculator's main chunk. If WebGL is unavailable (old tablet,
 * jsdom, a locked-down browser) it renders a plain notice instead of failing.
 */

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { disposeObjectResources } from "@/components/viewer3d/ifcViewerLifecycle";
import {
  buildCraneGroup,
  computeCraneLayout,
  type CraneLayout,
  type CraneSceneSpec,
  type ScenePalette,
} from "./cranePickScene";

type ViewPreset = "overview" | "rigging" | "side" | "plan";

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };

/**
 * Resolve a CSS custom property to a colour Three.js can parse. Theme tokens
 * may be var() chains, color-mix() or oklch(); a 2D canvas normalises any of
 * those to #rrggbb / rgba() for us.
 */
function resolveCssColor(el: Element, name: string, fallback: string, ctx: CanvasRenderingContext2D | null): string {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  if (!raw || !ctx) return fallback;
  ctx.fillStyle = fallback;
  ctx.fillStyle = raw;
  const out = String(ctx.fillStyle);
  return out.startsWith("rgba(") ? out.replace(/^rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)$/, "rgb($1,$2,$3)") : out;
}

function readPalette(el: Element): { palette: ScenePalette; background: string; grid: string } {
  const ctx = document.createElement("canvas").getContext("2d");
  const c = (name: string, fallback: string) => resolveCssColor(el, name, fallback, ctx);
  const carrier = c("--text-muted", "#6b7280");
  const tire = `#${new THREE.Color(carrier).multiplyScalar(0.3).getHexString()}`;
  return {
    palette: {
      boom: c("--accent", "#e0b030"),
      carrier,
      line: c("--text-secondary", "#9ca3af"),
      green: c("--status-success-bright", "#22c55e"),
      yellow: c("--status-warning-bright", "#f59e0b"),
      red: c("--status-error-bright", "#ef4444"),
      neutral: c("--text-secondary", "#9ca3af"),
      tire,
    },
    background: c("--bg-surface-low", "#111318"),
    grid: c("--border-default", "#2a2e36"),
  };
}

/** Distance at which a sphere of `radius` fills the camera's narrower field of view. */
function fitDistance(radius: number, camera: THREE.PerspectiveCamera): number {
  const vfov = (camera.fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  return (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.05;
}

// Extent of the generic carrier/counterweight behind the centre of rotation, ft.
const CRANE_TAIL_FT = 22;
const CRANE_HALF_WIDTH_FT = 13;

/** Camera position/target for each preset, framed to fit the current layout. */
function presetView(
  preset: ViewPreset,
  layout: CraneLayout,
  spec: CraneSceneSpec,
  camera: THREE.PerspectiveCamera,
): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const place = (target: THREE.Vector3, radius: number, dir: THREE.Vector3) => ({
    target,
    pos: target.clone().addScaledVector(dir.normalize(), fitDistance(radius, camera)),
  });
  const minX = -CRANE_TAIL_FT;
  const maxX = Math.max(layout.tipX, layout.hookX + spec.loadWidth / 2) + 4;
  const topY = layout.tipY + 2;
  switch (preset) {
    case "rigging": {
      const target = new THREE.Vector3(layout.hookX, (layout.hookY + layout.loadBottomY) / 2, 0);
      const radius = Math.max(layout.hookY - layout.loadBottomY, spec.loadLength, spec.loadWidth) * 0.6 + 2;
      return place(target, radius, new THREE.Vector3(0.6, 0.3, 0.9));
    }
    case "side": {
      const target = new THREE.Vector3((minX + maxX) / 2, topY / 2, 0);
      return place(target, Math.max(maxX - minX, topY) / 2, new THREE.Vector3(0, 0.05, 1));
    }
    case "plan": {
      const halfZ = Math.max(CRANE_HALF_WIDTH_FT, spec.loadLength / 2);
      const target = new THREE.Vector3((minX + maxX) / 2, 0, 0);
      return place(target, Math.hypot(maxX - minX, 2 * halfZ) / 2, new THREE.Vector3(0.001, 1, 0));
    }
    default: {
      const target = new THREE.Vector3((minX + maxX) / 2, topY * 0.45, 0);
      return place(target, Math.hypot(maxX - minX, topY) / 2, new THREE.Vector3(0.45, 0.35, 1));
    }
  }
}

interface Api {
  setView: (preset: ViewPreset) => void;
}

export interface CranePick3DProps {
  spec: CraneSceneSpec;
  /** One-line description for screen readers. */
  ariaLabel: string;
  height?: number;
}

export default function CranePick3D({ spec, ariaLabel, height = 360 }: CranePick3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<Api | null>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    render: () => void;
    group: THREE.Group | null;
    grid: THREE.GridHelper | null;
    layout: CraneLayout | null;
    fitKey: string;
    spec: CraneSceneSpec | null;
  } | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [themeTick, setThemeTick] = useState(0);
  const layout = computeCraneLayout(spec);
  const specKey = JSON.stringify(spec);

  // ── One-time renderer / camera / controls setup ──────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglFailed(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
    scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x20242b, 1.1));
    const key = new THREE.DirectionalLight(0xfff4e6, 1.4);
    key.position.set(60, 120, 80);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc0d0e8, 0.5);
    fill.position.set(-80, 40, -60);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.01; // stay above grade
    controls.minDistance = 4;
    controls.maxDistance = 2000;

    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(host);
    resize();

    apiRef.current = {
      setView: (preset) => {
        const s = sceneRef.current;
        if (!s?.layout || !s.spec) return;
        const v = presetView(preset, s.layout, s.spec, camera);
        camera.position.copy(v.pos);
        controls.target.copy(v.target);
        controls.update();
        render();
      },
    };
    sceneRef.current = { scene, render, group: null, grid: null, layout: null, fitKey: "", spec: null };

    // Re-read the palette when the app theme flips.
    const mo = new MutationObserver(() => setThemeTick((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "data-skin"] });

    return () => {
      mo.disconnect();
      ro?.disconnect();
      controls.removeEventListener("change", render);
      controls.dispose();
      const s = sceneRef.current;
      if (s?.group) disposeObjectResources(s.group);
      if (s?.grid) disposeObjectResources(s.grid);
      sceneRef.current = null;
      apiRef.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // ── Rebuild the crane whenever the pick changes ──────────────
  useEffect(() => {
    const s = sceneRef.current;
    const host = hostRef.current;
    if (!s || !host) return;
    const { palette, background, grid: rawGrid } = readPalette(host);
    // Theme border tokens are tuned for 1px lines on a flat surface; across a
    // 200 ft ground plane they read as a white sheet. Pull them toward the
    // background so the grid stays a quiet reference.
    const gridColor = `#${new THREE.Color(background).lerp(new THREE.Color(rawGrid), 0.35).getHexString()}`;
    s.scene.background = new THREE.Color(background);

    if (!s.grid) {
      s.grid = new THREE.GridHelper(300, 30, gridColor, gridColor);
      s.scene.add(s.grid);
    } else {
      (s.grid.material as THREE.Material & { color?: THREE.Color }).color?.set(gridColor);
    }

    if (s.group) {
      s.scene.remove(s.group);
      disposeObjectResources(s.group);
      s.group = null;
    }
    s.layout = layout;
    s.spec = spec;
    if (layout) {
      s.group = buildCraneGroup(spec, layout, palette);
      s.scene.add(s.group);
    }
    // Re-frame only when the crane's scale changes, so orbiting the view and
    // then editing a weight doesn't throw the camera back to the start.
    const fitKey = `${Math.round(spec.boomLength)}|${Math.round(spec.radius)}`;
    if (layout && fitKey !== s.fitKey) {
      s.fitKey = fitKey;
      apiRef.current?.setView("overview");
    } else {
      s.render();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spec is a fresh object each render; specKey is its content
  }, [specKey, themeTick]);

  const viewButton = (preset: ViewPreset, label: string) => (
    <button
      key={preset}
      type="button"
      onClick={() => apiRef.current?.setView(preset)}
      style={{
        ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase",
        padding: "6px 10px", minHeight: 30, borderRadius: 6, cursor: "pointer",
        background: "var(--bg-surface)", color: "var(--text-secondary)",
        border: "1px solid var(--border-strong)",
      }}
    >
      {label}
    </button>
  );

  if (webglFailed) {
    return (
      <div role="note" style={{ ...mono, fontSize: 11, color: "var(--text-muted)", padding: 16, background: "var(--bg-surface-low)", borderRadius: 6 }}>
        3D view unavailable — this browser could not start WebGL. All calculations above are unaffected.
      </div>
    );
  }

  return (
    <div>
      <div
        ref={hostRef}
        role="img"
        aria-label={ariaLabel}
        style={{ position: "relative", width: "100%", height, borderRadius: 6, overflow: "hidden", background: "var(--bg-surface-low)", cursor: "grab" }}
      >
        {!layout && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            ...mono, fontSize: 11, color: "var(--status-error-bright)", padding: 16, textAlign: "center",
          }}>
            Working radius must be shorter than the boom length to draw the crane.
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        {viewButton("overview", "Overview")}
        {viewButton("rigging", "Rigging")}
        {viewButton("side", "Side")}
        {viewButton("plan", "Plan")}
        <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>
          Drag to orbit · scroll to zoom · right-drag to pan
        </span>
      </div>
      {layout?.headroomLimited && (
        <div style={{ ...mono, fontSize: 10, color: "var(--status-warning-bright)", marginTop: 6 }}>
          Rigging height leaves little room under the boom tip at this radius — load drawn lower to fit. Check two-block clearance.
        </div>
      )}
    </div>
  );
}
