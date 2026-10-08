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
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Expand, Focus, Grid3X3, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { disposeObjectResources } from "@/components/viewer3d/ifcViewerLifecycle";
import {
  buildCraneGroup,
  computeCraneLayout,
  type CraneLayout,
  type CraneSceneSpec,
  type ScenePalette,
} from "./cranePickScene";
import "./cranePick3D.css";

type ViewPreset = "overview" | "crane" | "rigging" | "side" | "plan";

/**
 * Resolve a CSS custom property to a colour Three.js can parse. Theme tokens
 * may be var() chains, color-mix() or oklch(); a 2D canvas normalises any of
 * those to #rrggbb / rgba() for us.
 */
function resolveCssColor(el: Element, name: string, fallback: string, ctx: CanvasRenderingContext2D | null): string {
  if (!ctx) return fallback;
  // Resolve nested var()/color-mix tokens through the browser's style engine.
  const sample = document.createElement("span");
  sample.style.color = `var(${name}, ${fallback})`;
  sample.style.display = "none";
  el.appendChild(sample);
  const raw = getComputedStyle(sample).color;
  sample.remove();
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
    case "crane": {
      return place(new THREE.Vector3(-3, 5, 0), 23, new THREE.Vector3(0.8, 0.45, 1));
    }
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
  zoom: (factor: number) => void;
  setReferences: (visible: boolean) => void;
}

export interface CranePick3DProps {
  spec: CraneSceneSpec;
  /** One-line description for screen readers. */
  ariaLabel: string;
  height?: number;
}

export default function CranePick3D({ spec, ariaLabel, height }: CranePick3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<Api | null>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    render: () => void;
    group: THREE.Group | null;
    references: THREE.Group | null;
    ground: THREE.Mesh;
    camera: THREE.PerspectiveCamera;
    key: THREE.DirectionalLight;
    layout: CraneLayout | null;
    fitKey: string;
    spec: CraneSceneSpec | null;
  } | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [themeTick, setThemeTick] = useState(0);
  const [activeView, setActiveView] = useState<ViewPreset>("overview");
  const [expanded, setExpanded] = useState(false);
  const [showReferences, setShowReferences] = useState(true);
  const referencesVisible = useRef(true);
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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const studio = new RoomEnvironment();
    const environment = pmrem.fromScene(studio, 0.04);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.5;
    studio.dispose();
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x20242b, 1.1));
    const key = new THREE.DirectionalLight(0xfff4e6, 1.4);
    key.position.set(60, 120, 80);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.08;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 800;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc0d0e8, 0.5);
    fill.position.set(-80, 40, -60);
    scene.add(fill);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.04;
    ground.receiveShadow = true;
    scene.add(ground);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.01; // stay above grade
    controls.minDistance = 4;
    controls.maxDistance = 2000;
    controls.zoomToCursor = true;

    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      const previousAspect = camera.aspect;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Preserve the current view while keeping it visible after resizing.
      if (previousAspect > 0 && sceneRef.current?.layout && controls.target) {
        const oldFov = Math.min(camera.fov * Math.PI / 180, 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * previousAspect));
        const newFov = Math.min(camera.fov * Math.PI / 180, 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect));
        camera.position.sub(controls.target).multiplyScalar(Math.sin(oldFov / 2) / Math.sin(newFov / 2)).add(controls.target);
        controls.update();
      }
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
      zoom: (factor) => {
        const offset = camera.position.clone().sub(controls.target);
        offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
        camera.position.copy(controls.target).add(offset);
        controls.update();
        render();
      },
      setReferences: (visible) => {
        if (sceneRef.current?.references) sceneRef.current.references.visible = visible;
        render();
      },
    };
    sceneRef.current = { scene, render, group: null, references: null, ground, camera, key, layout: null, fitKey: "", spec: null };

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
      if (s?.references) disposeObjectResources(s.references);
      disposeObjectResources(ground);
      environment.dispose();
      key.shadow.dispose();
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

    const groundMaterial = s.ground.material as THREE.MeshStandardMaterial;
    groundMaterial.color.set(background);
    // Keep an impossible below-grade load visible instead of concealing it.
    groundMaterial.transparent = Boolean(layout && layout.loadBottomY < 0);
    groundMaterial.opacity = groundMaterial.transparent ? 0.16 : 1;
    groundMaterial.depthWrite = !groundMaterial.transparent;
    if (s.references) {
      s.scene.remove(s.references);
      disposeObjectResources(s.references);
    }
    const references = new THREE.Group();
    const grid = new THREE.GridHelper(600, 60, gridColor, gridColor);
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => { material.transparent = true; material.opacity = 0.3; material.depthWrite = false; });
    grid.position.y = 0.01;
    references.add(grid);
    if (layout) {
      // This is a geometric radius guide, not a clearance or exclusion zone.
      const arcPoints = Array.from({ length: 129 }, (_, i) => {
        const angle = i / 128 * Math.PI * 2;
        return new THREE.Vector3(Math.cos(angle) * spec.radius, 0.08, Math.sin(angle) * spec.radius);
      });
      const radiusGuide = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(arcPoints),
        new THREE.LineDashedMaterial({ color: palette.boom, dashSize: 1.4, gapSize: 1.2, transparent: true, opacity: 0.45 }),
      );
      radiusGuide.computeLineDistances();
      references.add(radiusGuide);
      const dimension = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(layout.hookX, 0.1, 0),
        ]),
        new THREE.LineDashedMaterial({ color: palette.line, dashSize: 1, gapSize: 0.6, transparent: true, opacity: 0.5 }),
      );
      dimension.computeLineDistances();
      references.add(dimension);
      const extent = Math.max(spec.boomLength, spec.radius + 30, spec.loadLength, 80);
      s.key.position.set(extent * 0.6, extent * 1.3, extent * 0.8);
      s.key.shadow.camera.left = -extent;
      s.key.shadow.camera.right = extent;
      s.key.shadow.camera.top = extent;
      s.key.shadow.camera.bottom = -extent;
      s.key.shadow.camera.far = extent * 4;
      s.key.shadow.camera.updateProjectionMatrix();
      s.scene.fog = new THREE.Fog(background, extent * 2.5, extent * 8);
    }
    references.visible = referencesVisible.current;
    s.references = references;
    s.scene.add(references);

    if (s.group) {
      s.scene.remove(s.group);
      disposeObjectResources(s.group);
      s.group = null;
    }
    s.layout = layout;
    s.spec = spec;
    if (layout) {
      s.group = buildCraneGroup(spec, layout, palette);
      s.group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      s.scene.add(s.group);
    }
    // Re-frame only when the crane's scale changes, so orbiting the view and
    // then editing a weight doesn't throw the camera back to the start.
    const fitKey = `${Math.round(spec.boomLength)}|${Math.round(spec.radius)}`;
    if (layout && fitKey !== s.fitKey) {
      s.fitKey = fitKey;
      setActiveView("overview");
      apiRef.current?.setView("overview");
    } else {
      s.render();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spec is a fresh object each render; specKey is its content
  }, [specKey, themeTick]);

  const changeView = (preset: ViewPreset) => {
    setActiveView(preset);
    apiRef.current?.setView(preset);
  };
  const viewButton = (preset: ViewPreset, label: string) => (
    <button
      key={preset}
      type="button"
      onClick={() => changeView(preset)}
      disabled={!layout}
      aria-pressed={activeView === preset}
      className="crane-scene__view"
    >
      {label}
    </button>
  );

  if (webglFailed) {
    return (
      <div role="note" className="crane-scene__fallback">
        3D view unavailable — this browser could not start WebGL. All calculations above are unaffected.
      </div>
    );
  }

  return (
    <section className={`crane-scene${expanded ? " crane-scene--expanded" : ""}`} aria-label="Interactive crane pick visualization" style={{ "--crane-stage-height": height ? `${height}px` : "520px" } as React.CSSProperties}>
      <div className="crane-scene__topbar">
        <div className="crane-scene__heading"><span className="crane-scene__live" aria-hidden="true" />Pick visualization <span>{spec.illustrative ? "Illustrative dimensions" : "Entered geometry"}</span></div>
        <button type="button" className="crane-scene__action" aria-pressed={expanded} onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Reduce crane view" : "Expand crane view"}>
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />} <span>{expanded ? "Reduce" : "Expand"}</span>
        </button>
      </div>
      <div className="crane-scene__stage">
      <div
        ref={hostRef}
        role="img"
        aria-label={ariaLabel}
        className="crane-scene__canvas"
      >
        {!layout && (
          <div className="crane-scene__invalid" role="status">
            Working radius must be shorter than the boom length to draw the crane.
          </div>
        )}
      </div>
      {layout && <div className="crane-scene__dimensions" aria-label="Visualized dimensions">
        <div><span>Boom</span><strong>{spec.boomLength.toLocaleString(undefined, { maximumFractionDigits: 1 })}<small> ft</small></strong></div>
        <div><span>Radius</span><strong>{spec.radius.toLocaleString(undefined, { maximumFractionDigits: 1 })}<small> ft</small></strong></div>
        <div><span>Rigging height</span><strong>{spec.legHeight.toLocaleString(undefined, { maximumFractionDigits: 1 })}<small> ft</small></strong></div>
      </div>}
      <div className="crane-scene__tools" role="group" aria-label="Crane view controls">
        <button type="button" className="crane-scene__tool" aria-label="Zoom in" title="Zoom in" disabled={!layout} onClick={() => apiRef.current?.zoom(0.8)}><ZoomIn size={19} /></button>
        <button type="button" className="crane-scene__tool" aria-label="Zoom out" title="Zoom out" disabled={!layout} onClick={() => apiRef.current?.zoom(1.25)}><ZoomOut size={19} /></button>
        <button type="button" className="crane-scene__tool" aria-label="Fit entire pick" title="Fit entire pick" disabled={!layout} onClick={() => changeView("overview")}><Focus size={19} /></button>
        <button type="button" className="crane-scene__tool" aria-label="Show ground references" title="Ground grid and working-radius reference" aria-pressed={showReferences} onClick={() => { referencesVisible.current = !showReferences; setShowReferences(!showReferences); apiRef.current?.setReferences(!showReferences); }}><Grid3X3 size={18} /></button>
      </div>
      <span className="crane-scene__scale-note">{showReferences ? "10 ft grid · dashed ring = working radius" : "Ground references hidden"}</span>
      </div>
      <div className="crane-scene__footer">
        <div className="crane-scene__views" role="group" aria-label="Camera presets">
          {viewButton("overview", "Overview")}
          {viewButton("crane", "Crane")}
          {viewButton("rigging", "Rigging")}
          {viewButton("side", "Elevation")}
          {viewButton("plan", "Plan")}
        </div>
        <span className="crane-scene__gestures"><RotateCcw size={13} aria-hidden="true" />Drag to orbit <Expand size={13} aria-hidden="true" />Pinch or scroll to zoom</span>
      </div>
      {layout?.headroomLimited && (
        <div className="crane-scene__warning" role="status">
          {layout.loadBottomY < 0
            ? "These dimensions put the load below grade. Ground is translucent to show the conflict; revise the geometry and check two-block clearance."
            : "Rigging height leaves little room under the boom tip at this radius — load drawn lower to fit. Check two-block clearance."}
        </div>
      )}
    </section>
  );
}
