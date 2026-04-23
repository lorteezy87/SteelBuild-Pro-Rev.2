import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";

// FragmentsManager.init() requires a worker URL. Without it, IFC loads
// silently produce zero geometry. We serve the worker from /public/thatopen/
// (a copy of node_modules/@thatopen/fragments/dist/Worker/worker.mjs) to
// avoid Vite's deep-import restrictions on the package's exports field.
const FRAGMENTS_WORKER_URL = "/thatopen/fragments-worker.mjs";

// ─── TYPE INFERENCE ───────────────────────────────────────────────
function inferType(name) {
  const n = (name || "").toUpperCase();
  if (/COL|COLUMN|PILLAR|POST/.test(n)) return "COLUMN";
  if (/GIR|GIRDER|MAINBEAM/.test(n)) return "GIRDER";
  if (/BM|BEAM|JOIST|PURLIN/.test(n)) return "BEAM";
  if (/SLAB|DECK|FLOOR|PLATE/.test(n)) return "SLAB";
  if (/BRAC|BRACE|DIAGONAL|HSS/.test(n)) return "BRACE";
  if (/STAIR|STEP|RISER/.test(n)) return "STAIR";
  if (/WALL|SHEAR/.test(n)) return "WALL";
  return "MEMBER";
}

const TYPE_COLORS = {
  COLUMN: "#9B59B6", GIRDER: "#2C3E50", BEAM: "#3498DB", SLAB: "#27AE60",
  BRACE: "#E67E22", STAIR: "#F1C40F", WALL: "#95A5A6", MEMBER: "#7F8C8D",
};

// ─── MATERIAL NORMALIZATION ──────────────────────────────────────
// IFC files frequently bake transparency into glass / cladding materials.
// On a white background that produces a "ghost" model. We force every
// material opaque (unless it's intentionally fully transparent — opacity 0),
// re-enable depth writes, and double-side so back-faces aren't dropped.
// We also run this on every tile streaming update because @thatopen/fragments
// builds new BIMMesh tiles asynchronously after load() resolves.
function normalizeMaterials(root) {
  if (!root) return;
  const seen = new WeakSet();
  root.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      if (m.transparent || (typeof m.opacity === "number" && m.opacity < 1)) {
        const op = typeof m.opacity === "number" ? m.opacity : 1;
        if (op >= 0.4) {
          m.transparent = false;
          m.opacity = 1;
          m.depthWrite = true;
        } else {
          m.transparent = true;
          m.opacity = Math.max(op, 0.55);
          m.depthWrite = false;
        }
      }
      m.side = THREE.DoubleSide;
      if (m.color && m.color.r > 0.97 && m.color.g > 0.97 && m.color.b > 0.97) {
        m.color.setHex(0xc8c8cc);
      }
      m.needsUpdate = true;
    }
  });
}

// Default steel-blue color applied to meshes that have no meaningful color
const DEFAULT_STEEL_COLOR = new THREE.Color(0.45, 0.52, 0.58); // blue-grey steel
const GREY_THRESHOLD = 0.08; // how close r/g/b must be to count as "grey"

function isUncoloredMaterial(mat) {
  if (!mat || !mat.color) return true;
  const { r, g, b } = mat.color;
  const avg = (r + g + b) / 3;
  if (avg < 0.05 || avg > 0.95) return true;
  const spread = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
  return spread < GREY_THRESHOLD;
}

function applyDefaultSteelColor(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (isUncoloredMaterial(mat)) {
        mat.color.copy(DEFAULT_STEEL_COLOR);
      }
      // PBR tuning — steel reads metallic with a touch of roughness. Apply
      // even to colored materials so shop drawings / colored cladding still
      // pick up the environment map reflections instead of looking matte.
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        if (mat.metalness === undefined || mat.metalness === 0) mat.metalness = 0.55;
        if (mat.roughness === undefined || mat.roughness === 1) mat.roughness = 0.45;
        mat.envMapIntensity = 0.9;
      }
    }
  });
}

// Flip on shadow casting/receiving across the whole model tree.
function enableShadows(root) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────
export default function ModelViewer() {
  const containerRef = useRef(null);
  const componentsRef = useRef(null);
  const worldRef = useRef(null);
  const loadedModelRef = useRef(null);
  const gltfSceneRef = useRef(null); // For GLTF models (non-IFC)
  const fragmentsManagerRef = useRef(null);
  const rafHandleRef = useRef(0);

  // Visual-polish / tool refs
  const envMapRef = useRef(null);
  const keyShadowLightRef = useRef(null);
  const shadowPlaneRef = useRef(null);
  const selectionOutlineRef = useRef(null);          // THREE.Group parented to selected mesh
  const viewHelperRef = useRef(null);                // three ViewHelper (corner gizmo)
  const viewHelperElRef = useRef(null);              // DOM node mounted for the helper
  const clippingPlaneRef = useRef(null);             // horizontal section plane
  const measurementStateRef = useRef({               // 2-click measurement
    active: false, firstPoint: null, markerObjs: [],
  });
  const raycasterRef = useRef(new THREE.Raycaster());

  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [loadingModel, setLoadingModel] = useState({ active: false, progress: 0, status: "", fileName: "" });
  const [modelLoaded, setModelLoaded] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [memberSearch, setMemberSearch] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [engineReady, setEngineReady] = useState(false);

  // Tool mode + section state
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [sectionHeight, setSectionHeight] = useState(50); // percent through model
  const [modelBounds, setModelBounds] = useState(null);    // {min, max, diagonal}
  const [measureMode, setMeasureMode] = useState(false);
  const [measureReading, setMeasureReading] = useState(null); // { distanceFt, ftIn }
  const [isolateActive, setIsolateActive] = useState(false); // elements hidden via isolate

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages"],
    queryFn: () => base44.entities.WorkPackage.list(),
  });

  // ─── @thatopen/components INITIALIZATION ────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || componentsRef.current) return;

    let disposed = false;

    const initEngine = async () => {
      try {
        // 1. Create the Components instance
        const components = new OBC.Components();
        if (disposed) { components.dispose(); return; }
        componentsRef.current = components;

        // 2. Create a world with Scene, Camera, Renderer
        const worlds = components.get(OBC.Worlds);
        const world = worlds.create();

        world.scene = new OBC.SimpleScene(components);
        world.renderer = new OBC.SimpleRenderer(components, container);
        world.camera = new OBC.SimpleCamera(components);

        worldRef.current = world;

        // 3. Initialize rendering loop
        components.init();

        // 4. Setup scene (adds default lighting)
        world.scene.setup();

        // 5. Scene appearance — studio backdrop, PBR environment,
        // shadow-casting key light. Previously a flat white background with
        // matte lights made steel look like plastic; the upgrades:
        //   - Gradient sky (CSS on parent div, renderer is alpha-transparent)
        //     gives a horizon line so the model feels grounded.
        //   - RoomEnvironment PMREM produces a plausible indoor reflection
        //     map — bolts + flanges pick up specular highlights and actually
        //     read as steel, not matte plastic.
        //   - Contact shadow plane under the model anchors it in space.
        //   - Brighter key light casts a real shadow via shadowMap.
        const threeScene = world.scene.three;
        threeScene.background = null; // transparent — CSS gradient shows through

        const renderer3 = world.renderer.three;
        renderer3.setClearColor(0x000000, 0);     // transparent clear
        renderer3.shadowMap.enabled = true;
        renderer3.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer3.toneMapping = THREE.ACESFilmicToneMapping;
        renderer3.toneMappingExposure = 1.05;
        renderer3.outputColorSpace = THREE.SRGBColorSpace;

        // PBR environment — makes metallic materials look right.
        try {
          const pmrem = new THREE.PMREMGenerator(renderer3);
          const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
          threeScene.environment = envTex;
          envMapRef.current = { pmrem, envTex };
        } catch (e) { console.warn("env map generation failed", e); }

        const hemiLight = new THREE.HemisphereLight(0xffffff, 0xa8a8b0, 0.35);
        threeScene.add(hemiLight);
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
        keyLight.position.set(80, 160, 80);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(2048, 2048);
        keyLight.shadow.camera.left = -200;
        keyLight.shadow.camera.right = 200;
        keyLight.shadow.camera.top = 200;
        keyLight.shadow.camera.bottom = -200;
        keyLight.shadow.camera.near = 10;
        keyLight.shadow.camera.far = 600;
        keyLight.shadow.bias = -0.0005;
        keyLight.shadow.normalBias = 0.05;
        keyShadowLightRef.current = keyLight;
        threeScene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xb0c4de, 0.35);
        fillLight.position.set(-80, 60, -60);
        threeScene.add(fillLight);
        const rimLight = new THREE.DirectionalLight(0xffe0b0, 0.25);
        rimLight.position.set(0, -20, -120);
        threeScene.add(rimLight);

        // Shadow-receiving ground plane. The plane itself is invisible
        // (ShadowMaterial) so only the darkening of the contact shadow
        // shows — the CSS gradient keeps reading through it.
        const shadowPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(1000, 1000),
          new THREE.ShadowMaterial({ opacity: 0.35 }),
        );
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = -0.01;
        shadowPlane.receiveShadow = true;
        shadowPlaneRef.current = shadowPlane;
        threeScene.add(shadowPlane);

        // CAD-style grid with two line weights so major axes stand out.
        const grid = new THREE.GridHelper(400, 80, 0x9aa3b4, 0xcdd2dc);
        grid.material.opacity = 0.55;
        grid.material.transparent = true;
        grid.material.depthWrite = false;
        threeScene.add(grid);

        // 6. Tune camera controls for a tight, direct CAD-viewport feel.
        const ctrl = world.camera.controls;
        ctrl.smoothTime = 0.05;
        ctrl.draggingSmoothTime = 0.02;
        ctrl.azimuthRotateSpeed = 1.1;
        ctrl.polarRotateSpeed = 1.1;
        ctrl.dollySpeed = 0.35; // slower scroll zoom — deliberate without being sluggish
        ctrl.truckSpeed = 2.5;
        ctrl.dollyToCursor = true;
        try { ctrl.infinityDolly = true; } catch { /* ignore if unsupported */ }
        ctrl.minDistance = 0.1;
        ctrl.maxDistance = 5000;
        ctrl.setLookAt(80, 60, 80, 0, 0, 0);

        // Middle mouse button = pan (truck), not rotate
        ctrl.mouseButtons.middle = 2; // CameraControls.ACTION.TRUCK

        // 7. Initialize FragmentsManager with the worker URL.
        // FragmentsManager.init() REQUIRES a worker URL — without it, the
        // FragmentsModel produced by IfcLoader.load() has no tiles streamed
        // into its scene object, so the model appears empty.
        const fragmentsManager = components.get(OBC.FragmentsManager);
        fragmentsManager.init(FRAGMENTS_WORKER_URL);
        fragmentsManagerRef.current = fragmentsManager;

        // 7a. Drive tile streaming continuously via requestAnimationFrame.
        //
        // Background: FragmentsModel only adds/keeps BIMMesh tiles when
        // fragmentsManager.core.update() is called. If it stops being called,
        // tiles get evicted from the cache and the model visually disappears.
        //
        // We originally hooked world.onAfterUpdate which sounds right, but
        // OBC's SimpleRenderer only ticks onAfterUpdate when the camera is
        // actually moving (dirty-flag optimisation). Once the user stops
        // dragging, the event loop goes quiet and tile streaming halts — which
        // is exactly why the model appeared for ~10s (the polling window) and
        // then vanished.
        //
        // A plain RAF loop guarantees a steady heartbeat regardless of camera
        // idleness. Also wire camera-controls "control"/"rest" events so any
        // user interaction forces a sync update — important on first render
        // before the RAF loop has settled.
        const tick = () => {
          rafHandleRef.current = requestAnimationFrame(tick);
          try {
            if (fragmentsManager.initialized) {
              fragmentsManager.core.update();
            }
          } catch { /* swallow per-frame errors */ }
        };
        rafHandleRef.current = requestAnimationFrame(tick);

        const onCtrlChange = () => {
          try { fragmentsManager.initialized && fragmentsManager.core.update(); } catch { /* ignore */ }
        };
        const onCtrlRest = () => {
          try { fragmentsManager.initialized && fragmentsManager.core.update(true); } catch { /* ignore */ }
        };
        try {
          ctrl.addEventListener("control", onCtrlChange);
          ctrl.addEventListener("update",  onCtrlChange);
          ctrl.addEventListener("rest",    onCtrlRest);
        } catch { /* camera-controls API drift guard */ }

        // 8. Setup IFC loader
        const ifcLoader = components.get(OBC.IfcLoader);

        // Use CDN for WASM to avoid Vite bundling issues
        await ifcLoader.setup({
          autoSetWasm: false,
        });
        // Set WASM path to CDN
        ifcLoader.settings.wasm.path = "https://unpkg.com/web-ifc@0.0.77/";
        ifcLoader.settings.wasm.absolute = true;

        if (!disposed) {
          setEngineReady(true);
        }
      } catch (err) {
        console.error("Engine init error:", err);
        if (!disposed) {
          setUploadError("Failed to initialize 3D engine: " + err.message);
        }
      }
    };

    initEngine();

    return () => {
      disposed = true;
      if (rafHandleRef.current) {
        cancelAnimationFrame(rafHandleRef.current);
        rafHandleRef.current = 0;
      }
      if (envMapRef.current) {
        try {
          envMapRef.current.envTex?.dispose?.();
          envMapRef.current.pmrem?.dispose?.();
        } catch { /* ignore */ }
        envMapRef.current = null;
      }
      if (viewHelperRef.current) {
        try { viewHelperRef.current.dispose?.(); } catch { /* ignore */ }
        viewHelperRef.current = null;
      }
      if (componentsRef.current) {
        try { componentsRef.current.dispose(); } catch { /* ignore cleanup errors */ }
      }
      componentsRef.current = null;
      worldRef.current = null;
      loadedModelRef.current = null;
      gltfSceneRef.current = null;
      fragmentsManagerRef.current = null;
      keyShadowLightRef.current = null;
      shadowPlaneRef.current = null;
      selectionOutlineRef.current = null;
      clippingPlaneRef.current = null;
    };
  }, []);

  // ─── FIT CAMERA ────────────────────────────────────────────────
  const fitCamera = useCallback((target) => {
    const world = worldRef.current;
    if (!world?.camera?.controls || !target) return;

    const box = new THREE.Box3().setFromObject(target);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const diagonal = Math.sqrt(size.x ** 2 + size.y ** 2 + size.z ** 2);

    // Calculate distance needed to see the full model
    const cam = world.camera.three;
    const fov = (cam.fov || 45) * (Math.PI / 180);
    const dist = (diagonal / 2) / Math.tan(fov / 2) * 2.8;

    // Adapt control bounds + step sizes to model scale so zoom/pan feel
    // right regardless of whether the model is a 2m bracket or a 200m
    // building. The previous clamps (min 0.8, cap 8) made big models still
    // feel molasses — we raise both so pan/dolly cover real distance.
    const ctrl = world.camera.controls;
    ctrl.minDistance = Math.max(0.05, diagonal * 0.002);
    ctrl.maxDistance = Math.max(1000, diagonal * 25);
    ctrl.truckSpeed  = Math.max(1.5, Math.min(20, diagonal / 12));
    ctrl.dollySpeed  = Math.max(1.0, Math.min(3.0, diagonal / 60));

    // Isometric offset
    const offset = new THREE.Vector3(1, 0.7, 1).normalize().multiplyScalar(dist);
    const pos = center.clone().add(offset);

    ctrl.setLookAt(pos.x, pos.y, pos.z, center.x, center.y, center.z, true);
  }, []);

  // ─── MODEL BOUNDS (drives section slider + shadow plane position) ──
  const captureModelBounds = useCallback((target) => {
    if (!target) return;
    const box = new THREE.Box3().setFromObject(target);
    if (box.isEmpty()) return;
    const min = box.min.clone();
    const max = box.max.clone();
    const size = max.clone().sub(min);
    const diagonal = size.length();
    setModelBounds({ min, max, size, diagonal });

    // Pin the shadow plane just below the model's footprint so the contact
    // shadow feels anchored instead of floating.
    if (shadowPlaneRef.current) {
      shadowPlaneRef.current.position.y = min.y - 0.01;
    }
    // Aim the key light at the model so the shadow camera frustum covers it.
    if (keyShadowLightRef.current) {
      const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
      const span = Math.max(diagonal * 0.75, 50);
      keyShadowLightRef.current.target.position.copy(center);
      keyShadowLightRef.current.target.updateMatrixWorld();
      keyShadowLightRef.current.position.set(
        center.x + span,
        center.y + span * 1.6,
        center.z + span,
      );
      const s = keyShadowLightRef.current.shadow.camera;
      const half = Math.max(span, 50);
      s.left = -half; s.right = half; s.top = half; s.bottom = -half;
      s.near = 1; s.far = span * 6;
      s.updateProjectionMatrix();
    }
  }, []);

  // ─── SELECTION OUTLINE ──────────────────────────────────────────
  // Build a bright yellow edge-line overlay as a sibling of the selected
  // mesh. Cheaper than post-processing OutlinePass, looks great, survives
  // tile streaming because we rebuild it on every selection change.
  const clearSelectionOutline = useCallback(() => {
    if (!selectionOutlineRef.current) return;
    const o = selectionOutlineRef.current;
    o.parent?.remove(o);
    o.traverse?.((c) => {
      try { c.geometry?.dispose?.(); } catch { /* ignore */ }
      try { c.material?.dispose?.(); } catch { /* ignore */ }
    });
    selectionOutlineRef.current = null;
  }, []);

  const attachSelectionOutline = useCallback((mesh) => {
    clearSelectionOutline();
    if (!mesh || !mesh.geometry) return;
    const edges = new THREE.EdgesGeometry(mesh.geometry, 25); // angle in deg
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: 0xffcc00,
        linewidth: 2,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      }),
    );
    line.renderOrder = 9999; // draw on top
    mesh.add(line);
    selectionOutlineRef.current = line;
  }, [clearSelectionOutline]);

  // ─── SECTION (CLIPPING) PLANE ───────────────────────────────────
  useEffect(() => {
    const world = worldRef.current;
    if (!world?.renderer?.three) return;
    const renderer3 = world.renderer.three;
    if (!sectionEnabled || !modelBounds) {
      renderer3.localClippingEnabled = false;
      renderer3.clippingPlanes = [];
      clippingPlaneRef.current = null;
      return;
    }
    renderer3.localClippingEnabled = true;
    const { min, max } = modelBounds;
    const y = min.y + (max.y - min.y) * (sectionHeight / 100);
    if (!clippingPlaneRef.current) {
      // Plane points DOWN, so everything above `y` is clipped.
      clippingPlaneRef.current = new THREE.Plane(new THREE.Vector3(0, -1, 0), y);
    } else {
      clippingPlaneRef.current.constant = y;
    }
    renderer3.clippingPlanes = [clippingPlaneRef.current];
  }, [sectionEnabled, sectionHeight, modelBounds]);

  // ─── ISOLATE / HIDE ─────────────────────────────────────────────
  // Isolate = hide everything except the selected mesh. Toggles off to
  // restore visibility. Per-mesh `_isoHidden` flag lets us avoid storing
  // a Map and skips already-hidden elements on repeated toggles.
  const isolateSelection = useCallback(() => {
    const world = worldRef.current;
    const selected = selectedMember?.mesh;
    if (!world || !selected) return;

    if (isolateActive) {
      // Restore
      (loadedModelRef.current || world.scene.three).traverse((c) => {
        if (c.isMesh && c._isoHidden) {
          c.visible = true;
          c._isoHidden = false;
        }
      });
      setIsolateActive(false);
      return;
    }
    (loadedModelRef.current || world.scene.three).traverse((c) => {
      if (c.isMesh && c !== selected) {
        c.visible = false;
        c._isoHidden = true;
      }
    });
    setIsolateActive(true);
  }, [selectedMember, isolateActive]);

  const hideSelection = useCallback(() => {
    const selected = selectedMember?.mesh;
    if (!selected) return;
    selected.visible = false;
  }, [selectedMember]);

  const showAll = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    (loadedModelRef.current || world.scene.three).traverse((c) => {
      if (c.isMesh) {
        c.visible = true;
        c._isoHidden = false;
      }
    });
    setIsolateActive(false);
  }, []);

  // ─── MEASUREMENT TOOL ───────────────────────────────────────────
  // Format a distance (in the model's native units — usually meters for
  // IFC, unknown for GLTF) into feet-inches for a steel PM audience.
  // We assume meters unless the number looks like it's already in feet
  // (diagonal > 1000 suggests millimeters, which we downconvert).
  const formatDistance = useCallback((meters, diagonal) => {
    let m = meters;
    // Guess units from model scale: diagonal > 5000 → file was in mm.
    if (diagonal > 5000) m = meters / 1000;
    const totalInches = m * 39.3701;
    const ft = Math.floor(totalInches / 12);
    const inch = totalInches - ft * 12;
    return {
      meters: m,
      ftIn: `${ft}'-${inch.toFixed(1)}"`,
    };
  }, []);

  const clearMeasurementMarkers = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    for (const obj of measurementStateRef.current.markerObjs) {
      world.scene?.three?.remove(obj);
      try { obj.geometry?.dispose?.(); } catch { /* ignore */ }
      try { obj.material?.dispose?.(); } catch { /* ignore */ }
    }
    measurementStateRef.current.markerObjs = [];
    measurementStateRef.current.firstPoint = null;
  }, []);

  const toggleMeasureMode = useCallback(() => {
    setMeasureMode((on) => {
      if (on) {
        // Turning OFF — clear markers + reading
        clearMeasurementMarkers();
        setMeasureReading(null);
      }
      return !on;
    });
  }, [clearMeasurementMarkers]);

  const addMeasureMarker = useCallback((point) => {
    const world = worldRef.current;
    if (!world?.scene?.three) return;
    const diag = modelBounds?.diagonal || 50;
    const size = Math.max(0.15, diag * 0.004);
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(size, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff4747, depthTest: false, transparent: true, opacity: 0.95 }),
    );
    sphere.renderOrder = 9999;
    sphere.position.copy(point);
    world.scene.three.add(sphere);
    measurementStateRef.current.markerObjs.push(sphere);
    return sphere;
  }, [modelBounds]);

  const addMeasureLine = useCallback((a, b) => {
    const world = worldRef.current;
    if (!world?.scene?.three) return;
    const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(
      geom,
      new THREE.LineBasicMaterial({ color: 0xff4747, depthTest: false, linewidth: 2, transparent: true, opacity: 0.95 }),
    );
    line.renderOrder = 9999;
    world.scene.three.add(line);
    measurementStateRef.current.markerObjs.push(line);
  }, []);

  // ─── SCREENSHOT ─────────────────────────────────────────────────
  const takeScreenshot = useCallback(() => {
    const world = worldRef.current;
    if (!world?.renderer?.three) return;
    const renderer3 = world.renderer.three;
    // Force a fresh render so the captured buffer isn't stale.
    try { renderer3.render(world.scene.three, world.camera.three); } catch { /* ignore */ }
    const dataUrl = renderer3.domElement.toDataURL("image/png");
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = modelLoaded?.name
      ? `${modelLoaded.name.replace(/\.[^.]+$/, "")}-${stamp}.png`
      : `model-${stamp}.png`;
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }, [modelLoaded]);

  // ─── CLEAR MODEL ────────────────────────────────────────────────
  // Async because FragmentsModels.disposeModel() is async — without awaiting
  // it, the worker still holds a reference to the previous model when the
  // next IFC starts streaming, causing duplicate tile updates and material
  // bleed-through (the "first model loads fine, second one is transparent"
  // bug we were chasing).
  const clearCurrentModel = useCallback(async () => {
    const world = worldRef.current;
    const components = componentsRef.current;
    if (!world || !components) return;

    // Remove GLTF model if loaded
    if (gltfSceneRef.current && world.scene?.three) {
      world.scene.three.remove(gltfSceneRef.current);
      // Free GLTF GPU resources
      gltfSceneRef.current.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose?.();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => m?.dispose?.());
        }
      });
      gltfSceneRef.current = null;
    }

    // Dispose every model the FragmentsManager knows about. We can't iterate
    // and mutate the map at the same time, so snapshot ids first.
    try {
      const fragmentsManager = components.get(OBC.FragmentsManager);
      if (fragmentsManager?.initialized) {
        const ids = [];
        for (const [id, model] of fragmentsManager.list) {
          ids.push(id);
          try {
            if (model.object && world?.scene?.three) {
              world.scene.three.remove(model.object);
            }
          } catch { /* ignore remove errors */ }
        }
        for (const id of ids) {
          try { await fragmentsManager.core.disposeModel(id); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }

    loadedModelRef.current = null;
    setMembers([]);
    setSelectedMember(null);
    setModelBounds(null);
    setSectionEnabled(false);
    setIsolateActive(false);
    setMeasureReading(null);
    clearMeasurementMarkers();
    // Remove any outline attached to prior selection
    if (selectionOutlineRef.current) {
      selectionOutlineRef.current.parent?.remove(selectionOutlineRef.current);
      selectionOutlineRef.current.traverse?.((o) => o?.geometry?.dispose?.());
      selectionOutlineRef.current = null;
    }
  }, []);

  // ─── LOAD GLTF/GLB ────────────────────────────────────────────
  const handleGLTFUpload = useCallback(async (file) => {
    const world = worldRef.current;
    if (!world?.scene?.three) return;

    setLoadingModel({ active: true, progress: 10, status: "Parsing GLTF...", fileName: file.name });
    setUploadError(null);

    try {
      await clearCurrentModel();

      const url = URL.createObjectURL(file);
      const loader = new GLTFLoader();

      const gltf = await new Promise((resolve, reject) => {
        loader.load(
          url,
          (result) => resolve(result),
          (progress) => {
            if (progress.total > 0) {
              setLoadingModel((prev) => ({ ...prev, progress: Math.round((progress.loaded / progress.total) * 80) }));
            }
          },
          reject
        );
      });

      URL.revokeObjectURL(url);
      setLoadingModel((prev) => ({ ...prev, progress: 85, status: "Processing meshes..." }));

      const model = gltf.scene;
      // Normalize first (fix transparency, double-side, near-white), then
      // apply steel color to whatever remains uncolored.
      normalizeMaterials(model);
      applyDefaultSteelColor(model);
      enableShadows(model);
      world.scene.three.add(model);
      gltfSceneRef.current = model;

      // Extract members
      const extracted = [];
      let idx = 0;
      model.traverse((child) => {
        if (child.isMesh) {
          const name = child.name || `Element ${idx + 1}`;
          const type = inferType(name);
          extracted.push({ id: idx, name, type, color: TYPE_COLORS[type], mesh: child });
          idx++;
        }
      });

      setMembers(extracted);
      setLoadingModel((prev) => ({ ...prev, progress: 95, status: "Fitting view..." }));

      loadedModelRef.current = model;
      fitCamera(model);
      captureModelBounds(model);

      setModelLoaded({ name: file.name, memberCount: extracted.length, format: "GLTF" });
      setLoadingModel({ active: false, progress: 100, status: "", fileName: "" });
    } catch (err) {
      console.error("GLTF load error:", err);
      setUploadError("Failed to load model: " + err.message);
      setLoadingModel({ active: false, progress: 0, status: "", fileName: "" });
    }
  }, [fitCamera, clearCurrentModel]);

  // ─── LOAD IFC via @thatopen/components ─────────────────────────
  const handleIFCUpload = useCallback(async (file) => {
    const components = componentsRef.current;
    const world = worldRef.current;
    if (!components || !world?.scene?.three) return;

    setLoadingModel({ active: true, progress: 5, status: "Initializing IFC engine...", fileName: file.name });
    setUploadError(null);

    try {
      await clearCurrentModel();

      setLoadingModel((prev) => ({ ...prev, progress: 15, status: "Reading file..." }));
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      setLoadingModel((prev) => ({ ...prev, progress: 30, status: "Parsing IFC structure..." }));

      const ifcLoader = components.get(OBC.IfcLoader);
      const fragmentsManager = components.get(OBC.FragmentsManager);

      // Load using @thatopen/components IfcLoader
      const model = await ifcLoader.load(uint8Array, true, file.name.replace(/\.ifc$/i, ""));

      setLoadingModel((prev) => ({ ...prev, progress: 70, status: "Wiring camera..." }));

      // Wire the model to the camera so tile streaming knows what to load.
      try { model.useCamera(world.camera.three); } catch (e) { console.warn("useCamera failed", e); }

      // The model.object is the THREE.Object3D for the scene
      const modelObject = model.object;
      if (modelObject) {
        normalizeMaterials(modelObject);
        applyDefaultSteelColor(modelObject);
        enableShadows(modelObject);
        world.scene.three.add(modelObject);
      }

      loadedModelRef.current = modelObject || model;

      // Re-normalize materials every time the model streams in new tiles.
      // FragmentsModel builds BIMMesh tiles asynchronously after load(), so
      // a single normalize pass at load time misses anything that arrives
      // later. onViewUpdated fires once per refreshView cycle.
      try {
        model.onViewUpdated?.add?.(() => {
          if (modelObject) {
            normalizeMaterials(modelObject);
            applyDefaultSteelColor(modelObject);
            enableShadows(modelObject);
          }
        });
      } catch (e) { console.warn("onViewUpdated hook failed", e); }

      // Force the FragmentsModels system to flush a full update so geometry
      // tiles are streamed in immediately rather than waiting for view changes.
      setLoadingModel((prev) => ({ ...prev, progress: 80, status: "Streaming geometry..." }));
      try { await fragmentsManager.core.update(true); } catch (e) { console.warn("core.update failed", e); }
      if (modelObject) {
        normalizeMaterials(modelObject);
        applyDefaultSteelColor(modelObject);
      }

      // Extract mesh members for the sidebar list
      setLoadingModel((prev) => ({ ...prev, progress: 85, status: "Extracting elements..." }));
      const extracted = [];
      let idx = 0;

      const traverseTarget = modelObject || world.scene.three;
      traverseTarget.traverse((child) => {
        if (child.isMesh) {
          const name = child.name || `Element ${idx + 1}`;
          const type = inferType(name);
          extracted.push({ id: idx, name, type, color: TYPE_COLORS[type], mesh: child });
          idx++;
        }
      });

      setMembers(extracted);
      setLoadingModel((prev) => ({ ...prev, progress: 95, status: "Streaming tiles..." }));

      // FragmentsModel streams tile geometry in via the worker AFTER load()
      // resolves, so the bounding box is empty for the first few view updates.
      // We listen for onViewUpdated and refit/re-extract until tiles arrive.
      const tryFit = () => {
        if (!modelObject) return false;
        const box = new THREE.Box3().setFromObject(modelObject);
        if (box.isEmpty()) return false;
        normalizeMaterials(modelObject);
        applyDefaultSteelColor(modelObject);
        enableShadows(modelObject);
        fitCamera(modelObject);
        captureModelBounds(modelObject);
        // Re-extract members now that real meshes exist
        const fresh = [];
        let i = 0;
        modelObject.traverse((child) => {
          if (child.isMesh) {
            const name = child.name || `Element ${i + 1}`;
            const type = inferType(name);
            fresh.push({ id: i, name, type, color: TYPE_COLORS[type], mesh: child });
            i++;
          }
        });
        if (fresh.length > 0) setMembers(fresh);
        return true;
      };

      if (!tryFit()) {
        let attempts = 0;
        const off = model.onViewUpdated?.add?.(() => {
          attempts++;
          if (tryFit() || attempts > 30) {
            try { off?.(); } catch { /* ignore */ }
          }
        });
        // Safety net: poll for ~10s, forcing tile updates each tick in case
        // the per-frame onAfterUpdate hook hasn't streamed everything yet.
        let polled = 0;
        const poll = setInterval(async () => {
          polled++;
          try { await fragmentsManager.core.update(true); } catch { /* ignore */ }
          if (tryFit() || polled > 50) clearInterval(poll);
        }, 200);
      }

      setModelLoaded({ name: file.name, memberCount: extracted.length, format: "IFC" });
      setLoadingModel({ active: false, progress: 100, status: "", fileName: "" });
    } catch (err) {
      console.error("IFC load error:", err);
      let msg = "Failed to load IFC: " + (err.message || "Unknown error");
      if (/wasm/i.test(err.message)) {
        msg += "\n\nTip: This may be a WASM loading issue. Check your network connection.";
      }
      setUploadError(msg);
      setLoadingModel({ active: false, progress: 0, status: "", fileName: "" });
    }
  }, [fitCamera, clearCurrentModel]);

  // ─── FILE HANDLING ──────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!engineReady) {
      setUploadError("3D engine is still initializing. Please wait a moment and try again.");
      return;
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (["gltf", "glb"].includes(ext)) handleGLTFUpload(file);
    else if (ext === "ifc") handleIFCUpload(file);
    else setUploadError("Unsupported format. Use .gltf, .glb, or .ifc");
  }, [handleGLTFUpload, handleIFCUpload, engineReady]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFile(e.dataTransfer?.files?.[0]);
  }, [handleFile]);

  // ─── CAMERA PRESETS ────────────────────────────────────────────
  const setView = useCallback((preset) => {
    const world = worldRef.current;
    const model = loadedModelRef.current;
    if (!world?.camera?.controls || !model) return;

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const diagonal = Math.sqrt(size.x ** 2 + size.y ** 2 + size.z ** 2);
    const cam = world.camera.three;
    const fov = (cam.fov || 45) * (Math.PI / 180);
    const dist = (diagonal / 2) / Math.tan(fov / 2) * 2.8;

    const dir = new THREE.Vector3();
    switch (preset) {
      case "front": dir.set(0, 0, 1); break;
      case "back": dir.set(0, 0, -1); break;
      case "top": dir.set(0, 1, 0.001); break;
      case "right": dir.set(1, 0, 0); break;
      case "left": dir.set(-1, 0, 0); break;
      case "iso": default: dir.set(1, 0.7, 1); break;
    }
    dir.normalize();
    const pos = center.clone().addScaledVector(dir, dist);
    world.camera.controls.setLookAt(pos.x, pos.y, pos.z, center.x, center.y, center.z, true);
  }, []);

  // ─── KEYBOARD SHORTCUTS ────────────────────────────────────────
  // f       Fit all
  // [       Toggle element list
  // 1..6    View presets (iso/front/top/right/left/back)
  // i       Isolate selected
  // h       Hide selected
  // a       Show all
  // m       Toggle measure mode
  // c       Toggle section plane
  // p       Screenshot
  // Esc     Cancel measure / clear selection
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (k === "f") {
        const model = loadedModelRef.current;
        if (model) fitCamera(model);
      } else if (k === "[") {
        setLeftPanelOpen((p) => !p);
      } else if (k === "1") { setView("iso");  }
      else   if (k === "2") { setView("front"); }
      else   if (k === "3") { setView("top");   }
      else   if (k === "4") { setView("right"); }
      else   if (k === "5") { setView("left");  }
      else   if (k === "6") { setView("back");  }
      else   if (k === "i") { isolateSelection(); }
      else   if (k === "h") { hideSelection(); }
      else   if (k === "a") { showAll(); }
      else   if (k === "m") { toggleMeasureMode(); }
      else   if (k === "c") { setSectionEnabled((v) => !v); }
      else   if (k === "p") { takeScreenshot(); }
      else   if (e.key === "Escape") {
        if (measureMode) { toggleMeasureMode(); }
        else if (selectedMember) { setSelectedMember(null); clearSelectionOutline(); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fitCamera, setView, isolateSelection, hideSelection, showAll, toggleMeasureMode, takeScreenshot, measureMode, selectedMember, clearSelectionOutline]);

  // ─── MEMBER SELECTION ──────────────────────────────────────────
  const selectMember = useCallback((member) => {
    setSelectedMember(member);
    if (member?.mesh) {
      attachSelectionOutline(member.mesh);
      const world = worldRef.current;
      if (world?.camera?.controls) {
        const box = new THREE.Box3().setFromObject(member.mesh);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const cam = world.camera.three;
        const fov = (cam.fov || 45) * (Math.PI / 180);
        const dist = (maxDim / 2) / Math.tan(fov / 2) * 2.5;
        const offset = new THREE.Vector3(1, 0.5, 1).normalize().multiplyScalar(dist);
        const pos = center.clone().add(offset);
        world.camera.controls.setLookAt(pos.x, pos.y, pos.z, center.x, center.y, center.z, true);
      }
    } else {
      clearSelectionOutline();
    }
  }, [attachSelectionOutline, clearSelectionOutline]);

  // ─── CANVAS PICKING (click-to-select + measure-mode pickpoints) ──
  // Declared AFTER selectMember so the useEffect can reference it
  // without hitting the TDZ on first render.
  useEffect(() => {
    const container = containerRef.current;
    const world = worldRef.current;
    if (!container || !world?.camera?.three || !world?.scene?.three) return;

    const onClick = (ev) => {
      if (ev.button !== 0) return;
      const rect = container.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -(((ev.clientY - rect.top) / rect.height) * 2 - 1),
      );
      const caster = raycasterRef.current;
      caster.setFromCamera(ndc, world.camera.three);

      const root = loadedModelRef.current || world.scene.three;
      const hits = caster.intersectObject(root, true).filter((h) => h.object.isMesh && h.object.visible);
      if (hits.length === 0) return;
      const hit = hits[0];

      if (measureMode) {
        const pt = hit.point.clone();
        addMeasureMarker(pt);
        if (measurementStateRef.current.firstPoint) {
          const a = measurementStateRef.current.firstPoint;
          addMeasureLine(a, pt);
          const dist = a.distanceTo(pt);
          const diag = modelBounds?.diagonal || 0;
          setMeasureReading(formatDistance(dist, diag));
          measurementStateRef.current.firstPoint = null;
        } else {
          measurementStateRef.current.firstPoint = pt;
          setMeasureReading({ meters: null, ftIn: "Click second point…" });
        }
        return;
      }

      const mesh = hit.object;
      const matching = members.find((m) => m.mesh === mesh);
      if (matching) selectMember(matching);
    };

    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [members, measureMode, modelBounds, selectMember, addMeasureMarker, addMeasureLine, formatDistance]);

  // ─── AXIS GIZMO (corner widget) ─────────────────────────────────
  useEffect(() => {
    const world = worldRef.current;
    const el = viewHelperElRef.current;
    if (!world?.camera?.three || !world?.renderer?.three || !el) return;
    const helper = new ViewHelper(world.camera.three, world.renderer.three.domElement);
    helper.controls = world.camera.controls;
    viewHelperRef.current = helper;

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      try { helper.render(world.renderer.three); } catch { /* ignore */ }
    };
    raf = requestAnimationFrame(draw);

    const onClick = (ev) => {
      try { helper.handleClick(ev); } catch { /* ignore */ }
    };
    el.addEventListener("pointerup", onClick);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerup", onClick);
      try { helper.dispose?.(); } catch { /* ignore */ }
      viewHelperRef.current = null;
    };
  }, [engineReady]);

  // ─── FILTERED MEMBERS ──────────────────────────────────────────
  const filteredMembers = useMemo(() => {
    let list = members;
    if (filterType !== "all") list = list.filter((m) => m.type === filterType);
    if (memberSearch) {
      const q = memberSearch.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(q));
    }
    return list;
  }, [members, filterType, memberSearch]);

  // ─── RENDER ────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", flex: 1, minHeight: 0, background: "var(--bg-page)" }}>
      {/* TOOLBAR */}
      <div style={{
        height: 44, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 14px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.12em" }}>
            3D MODEL VIEWER
          </span>
          {!engineReady && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--nc-accent-cyan)", background: "rgba(0,200,255,0.08)", border: "1px solid rgba(0,200,255,0.2)", borderRadius: 4, padding: "2px 6px" }}>
              INITIALIZING...
            </span>
          )}
          {modelLoaded && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-success)", background: "var(--success-muted)", border: "1px solid var(--success-border)", borderRadius: 4, padding: "2px 6px" }}>
              {modelLoaded.format} · {modelLoaded.memberCount} elements
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* View presets */}
          {modelLoaded && (
            <>
              <button onClick={() => fitCamera(loadedModelRef.current)} title="Fit all (F)" style={tbBtn}>
                ⊞ FIT
              </button>
              {["Iso", "Front", "Top", "Right"].map((v) => (
                <button key={v} onClick={() => setView(v.toLowerCase())} style={{ ...tbBtn, fontSize: 8 }}>
                  {v.toUpperCase()}
                </button>
              ))}
            </>
          )}

          {modelLoaded && <div style={{ width: 1, height: 16, background: "var(--divider)" }} />}

          {/* Section toggle + slider live below, this is just the switch */}
          {modelLoaded && (
            <button
              onClick={() => setSectionEnabled((v) => !v)}
              title="Section plane (C)"
              style={{
                ...tbBtn,
                color: sectionEnabled ? "var(--accent)" : "var(--text-muted)",
                background: sectionEnabled ? "rgba(200,155,32,0.12)" : "transparent",
              }}
            >
              ⬓ SECTION
            </button>
          )}

          {/* Measure */}
          {modelLoaded && (
            <button
              onClick={toggleMeasureMode}
              title="Measure (M)"
              style={{
                ...tbBtn,
                color: measureMode ? "#ff7a7a" : "var(--text-muted)",
                background: measureMode ? "rgba(255,71,71,0.12)" : "transparent",
                borderColor: measureMode ? "rgba(255,71,71,0.45)" : "var(--border-default)",
              }}
            >
              📏 MEASURE
            </button>
          )}

          {/* Isolate */}
          {modelLoaded && (
            <button
              onClick={isolateSelection}
              title="Isolate selected (I)"
              disabled={!selectedMember && !isolateActive}
              style={{
                ...tbBtn,
                color: isolateActive ? "var(--accent)" : "var(--text-muted)",
                background: isolateActive ? "rgba(200,155,32,0.12)" : "transparent",
                opacity: !selectedMember && !isolateActive ? 0.5 : 1,
              }}
            >
              ◉ ISOLATE
            </button>
          )}

          {/* Show all */}
          {modelLoaded && (
            <button onClick={showAll} title="Show all (A)" style={tbBtn}>
              ◎ SHOW ALL
            </button>
          )}

          {/* Screenshot */}
          {modelLoaded && (
            <button onClick={takeScreenshot} title="Screenshot (P)" style={tbBtn}>
              📷 SNAP
            </button>
          )}

          {modelLoaded && <div style={{ width: 1, height: 16, background: "var(--divider)" }} />}

          {/* List toggle */}
          {members.length > 0 && (
            <button onClick={() => setLeftPanelOpen((p) => !p)} title="Toggle element list ([)" style={{
              ...tbBtn, color: leftPanelOpen ? "var(--accent)" : "var(--text-muted)",
              background: leftPanelOpen ? "rgba(200,155,32,0.12)" : "transparent",
            }}>
              {leftPanelOpen ? "◁ LIST" : "LIST ▷"}
            </button>
          )}

          {/* Upload */}
          <input id="model-upload" type="file" accept=".gltf,.glb,.ifc" style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files?.[0])} />
          <label htmlFor="model-upload" style={{
            padding: "5px 12px", borderRadius: 6, background: engineReady ? "var(--accent)" : "rgba(128,128,128,0.5)", color: "#fff",
            fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, cursor: engineReady ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: 4,
            opacity: engineReady ? 1 : 0.6,
          }}>
            ↑ Upload Model
          </label>
        </div>
      </div>

      {/* Control hints bar */}
      {modelLoaded && (
        <div style={{
          height: 24, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
          background: "var(--bg-surface-low)", borderBottom: "1px solid var(--border-default)",
          fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em",
        }}>
          <span>LMB: Rotate</span>
          <span>RMB: Pan</span>
          <span>Scroll: Zoom</span>
          <span>1-6: Views</span>
          <span>F: Fit</span>
          <span>I: Isolate</span>
          <span>H: Hide</span>
          <span>A: Show All</span>
          <span>M: Measure</span>
          <span>C: Section</span>
          <span>P: Snap</span>
          <span>[: List</span>
        </div>
      )}

      {/* MAIN: Left Panel + Canvas */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Left panel — element list */}
        {members.length > 0 && (
          <div style={{
            width: leftPanelOpen ? 220 : 0, minWidth: leftPanelOpen ? 220 : 0,
            background: "var(--bg-surface-low)", borderRight: leftPanelOpen ? "1px solid var(--border-default)" : "none",
            display: "flex", flexDirection: "column", overflow: "hidden", transition: "width 0.2s, min-width 0.2s",
          }}>
            <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.14em", textTransform: "uppercase", borderBottom: "1px solid var(--divider)" }}>
              ELEMENTS ({filteredMembers.length})
            </div>
            <input
              type="text" placeholder="Search..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
              style={{ margin: "8px", padding: "6px 10px", background: "var(--bg-sidebar)", border: "1px solid var(--border-default)", borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", outline: "none" }}
            />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ margin: "0 8px 8px", padding: "6px 10px", background: "var(--bg-sidebar)", border: "1px solid var(--border-default)", borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)" }}>
              <option value="all">All Types</option>
              {["COLUMN", "BEAM", "GIRDER", "SLAB", "BRACE", "STAIR", "WALL", "MEMBER"].map((t) => (
                <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase() + "s"}</option>
              ))}
            </select>
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
              {filteredMembers.map((m) => (
                <div
                  key={m.id}
                  onClick={() => selectMember(m)}
                  style={{
                    padding: "6px 10px", marginBottom: 2, borderRadius: 6, cursor: "pointer",
                    background: selectedMember?.id === m.id ? "rgba(245,158,11,0.12)" : "transparent",
                    borderLeft: selectedMember?.id === m.id ? "2px solid var(--accent)" : "2px solid transparent",
                    display: "flex", alignItems: "center", gap: 8, transition: "all 0.1s",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.name}>
                    {m.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3D Canvas — gradient backdrop shows through the transparent
            renderer clear. Subtle horizon line (darker ground, lighter sky)
            grounds the model visually instead of the old flat white. */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            cursor: measureMode ? "crosshair" : "default",
            background: "linear-gradient(180deg, #dbe2ec 0%, #c4cdd9 48%, #9fa8b8 52%, #b4bcca 100%)",
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={handleDrop}
        >
          {/* Upload zone — shown when no model loaded */}
          {!modelLoaded && !loadingModel.active && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10,
              pointerEvents: "none",
            }}>
              <div style={{
                background: "rgba(20,20,22,0.85)", border: `2px dashed ${isDragging ? "var(--accent)" : "rgba(245,158,11,0.4)"}`,
                borderRadius: 16, padding: 40, textAlign: "center", maxWidth: 400,
                transform: isDragging ? "scale(1.02)" : "scale(1)", transition: "all 0.2s",
                pointerEvents: "auto",
              }}>
                <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.6 }}>&#11014;</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#F2F4F8", marginBottom: 8 }}>
                  Drop GLTF / GLB / IFC here
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                  or click to browse
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 16 }}>
                  Supported: .gltf .glb .ifc
                </div>
                <label htmlFor="model-upload" style={{
                  padding: "6px 14px", borderRadius: 8, background: engineReady ? "var(--accent)" : "rgba(128,128,128,0.5)", color: "#fff",
                  fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, cursor: engineReady ? "pointer" : "not-allowed",
                }}>
                  {engineReady ? "Browse Files" : "Engine Loading..."}
                </label>
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {loadingModel.active && (
            <div style={{
              position: "absolute", inset: 0, background: "rgba(8,11,18,0.95)", backdropFilter: "blur(8px)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, zIndex: 100,
            }}>
              <div style={{ width: 60, height: 60, border: "2px solid rgba(245,158,11,0.2)", borderTop: "3px solid var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-primary)" }}>{loadingModel.status}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{loadingModel.fileName}</div>
              <div style={{ width: 360, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${loadingModel.progress}%`, height: "100%", background: "var(--accent)", borderRadius: 3, transition: "width 0.3s ease" }} />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>{loadingModel.progress}%</div>
            </div>
          )}

          {/* Section plane slider — shows only when toggled on + model loaded */}
          {sectionEnabled && modelBounds && (
            <div style={{
              position: "absolute", top: 14, left: 14, zIndex: 20,
              background: "rgba(20,24,32,0.82)", backdropFilter: "blur(6px)",
              border: "1px solid rgba(245,158,11,0.35)", borderRadius: 8,
              padding: "10px 12px", color: "#F2F4F8", minWidth: 180,
              fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "var(--accent)", fontWeight: 700 }}>SECTION</span>
                <span>{sectionHeight}%</span>
              </div>
              <input
                type="range" min={0} max={100} value={sectionHeight}
                onChange={(e) => setSectionHeight(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--accent)" }}
              />
              <div style={{ fontSize: 8, color: "rgba(242,244,248,0.6)", marginTop: 4 }}>
                Slice horizontal · C to toggle
              </div>
            </div>
          )}

          {/* Measure reading — shows first/second point prompts + final distance */}
          {measureMode && (
            <div style={{
              position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 20,
              background: "rgba(255,71,71,0.12)", backdropFilter: "blur(6px)",
              border: "1px solid rgba(255,71,71,0.55)", borderRadius: 8,
              padding: "8px 14px", color: "#F2F4F8",
              fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.06em",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ color: "#ff7a7a", fontWeight: 700 }}>📏 MEASURE</span>
              <span>
                {measureReading?.ftIn
                  ? (measureReading.meters == null
                      ? measureReading.ftIn
                      : `${measureReading.ftIn} (${measureReading.meters.toFixed(2)} m)`)
                  : "Click first point on model"}
              </span>
              <button
                onClick={toggleMeasureMode}
                style={{
                  marginLeft: 8, padding: "2px 8px", background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.18)", borderRadius: 4,
                  color: "#F2F4F8", fontFamily: "var(--font-mono)", fontSize: 9, cursor: "pointer",
                }}
              >DONE (M)</button>
            </div>
          )}

          {/* Axis gizmo mount — bottom-right corner. ViewHelper draws into
              the main WebGL canvas; this div intercepts clicks. */}
          <div
            ref={viewHelperElRef}
            style={{
              position: "absolute", bottom: 12, right: 12, width: 120, height: 120, zIndex: 15,
              pointerEvents: "auto", cursor: "pointer",
            }}
          />

          {/* Error overlay */}
          {uploadError && (
            <div style={{
              position: "absolute", inset: 0, background: "rgba(13,17,23,0.95)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
            }}>
              <div style={{ background: "var(--bg-surface-low)", border: "1px solid rgba(255,61,61,0.3)", borderRadius: 12, padding: 20, maxWidth: 400, textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--status-error)", fontWeight: 700, marginBottom: 8 }}>Load Error</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "rgba(220,225,240,0.72)", marginBottom: 16, whiteSpace: "pre-wrap" }}>{uploadError}</div>
                <button onClick={() => setUploadError(null)} style={{
                  padding: "6px 12px", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)",
                  borderRadius: 6, color: "var(--accent)", fontFamily: "var(--font-body)", fontSize: 11, cursor: "pointer",
                }}>
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right panel — selected element detail */}
        {selectedMember && (
          <div style={{
            width: 280, minWidth: 280, background: "var(--bg-surface-low)", borderLeft: "3px solid var(--accent)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <div style={{ padding: "12px 14px", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", borderBottom: "1px solid var(--divider)" }}>
              {selectedMember.name}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.14em", marginBottom: 8, textTransform: "uppercase" }}>Properties</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 2 }}>
                <div><span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Type: </span>{selectedMember.type}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Color: </span>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: selectedMember.color, display: "inline-block" }} />
                  <span>{selectedMember.color}</span>
                </div>
              </div>
            </div>
            <button onClick={() => setSelectedMember(null)} style={{
              margin: "8px 12px", padding: "8px 12px", background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-muted)",
              fontFamily: "var(--font-body)", fontSize: 11, cursor: "pointer",
            }}>
              Close
            </button>
          </div>
        )}
      </div>

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const tbBtn = {
  padding: "4px 8px", borderRadius: 4, background: "transparent", border: "1px solid var(--border-default)",
  color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, cursor: "pointer",
  letterSpacing: "0.06em", textTransform: "uppercase",
};
