/**
 * IfcModelViewer — three.js scene host for the Detailing Control Center 3D tab.
 * Supports pick/select and measureMode (vertex/edge-snapped point-to-point
 * distance, displayed to the nearest 1/16").
 *
 * Graphics: ACES tone-map, multi-light studio setup, soft ground disc.
 * Navigation: OrbitControls with "walk-zoom" so wheel zoom never stalls at
 * minDistance (the old "running out of gas" feel).
 *
 * Imperative API (via ref) for the host tab's piece-tracking controls:
 *   selectGuids(guids, { fly })  — replace the selection, optionally fly to it
 *   fitToGuids(guids)            — frame a set of parts
 *   fitView()                    — frame the whole model
 *   isolate(guids) / hide(guids) — ghost everything else / hide the given parts
 *   showAll()                    — clear isolation + hidden set
 *   setClipHeight(fraction|null) — horizontal level cut (0 = bottom, 1 = top)
 *   clearSelection()
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadIfcGeometry } from "@/lib/ifc/loadIfcGeometry";
import {
  snapMeasurePoint,
  distanceMeters,
  formatMeasureDistance,
} from "@/lib/ifc/viewerMeasure";

const HIGHLIGHT = new THREE.Color("#f5d90a");
const MEASURE_COLOR = 0xf5d90a;
/** Pointer travel (px) beyond which a mouseup is an orbit drag, not a click. */
const CLICK_SLOP_PX = 5;
/** Opacity for parts outside the isolated set (kept as context, not pickable). */
const GHOST_OPACITY = 0.07;

const IfcModelViewer = forwardRef(function IfcModelViewer({
  buffer,
  colorFor,
  labelFor,
  onPick,
  onSelect,
  onLoaded,
  onColorStats,
  measureMode = false,
  onMeasure,
}, ref) {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const selectedRef = useRef(new Map());
  const measureRef = useRef({ a: null, b: null, group: null });
  const measureModeRef = useRef(measureMode);
  const onMeasureRef = useRef(onMeasure);
  const onPickRef = useRef(onPick);
  const onSelectRef = useRef(onSelect);
  const labelForRef = useRef(labelFor);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [count, setCount] = useState(0);
  const [measureLabel, setMeasureLabel] = useState(null);
  const [hover, setHover] = useState(null);
  const [visibility, setVisibility] = useState({ isolated: 0, hidden: 0 });

  measureModeRef.current = measureMode;
  onMeasureRef.current = onMeasure;
  onPickRef.current = onPick;
  onSelectRef.current = onSelect;
  labelForRef.current = labelFor;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !buffer) return undefined;
    let cancelled = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0d1117");
    // No scene fog — FogExp2 + ACES crushed large models to near-black after
    // the polish pass and looked like a failed load.

    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 1e6);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
        alpha: false,
      });
    } catch (e) {
      setError(e?.message || "WebGL unavailable");
      setStatus("error");
      return undefined;
    }
    // Cap DPR for GPU cost; 2 is enough for crisp edges without 3× fill-rate.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if ("outputColorSpace" in renderer && THREE.SRGBColorSpace != null) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    if (THREE.ACESFilmicToneMapping != null) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
    }
    // updateStyle=true (default) so the canvas CSS size tracks the mount.
    // updateStyle=false left a tiny/default canvas and looked like a blank load.
    const resize = () => {
      const w = Math.max(mount.clientWidth || 0, 1);
      const h = Math.max(mount.clientHeight || 0, 1);
      renderer.setSize(w, h, true);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.outline = "none";
    // Focusable so keyboard shortcuts (F / I / H / U / Esc) only fire while the
    // viewer is the active element — never while typing in the Find box.
    renderer.domElement.tabIndex = 0;
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // Studio lighting — cheap, no shadows (shadow maps × 12k meshes kills FPS).
    scene.add(new THREE.HemisphereLight(0xd5e2f5, 0x1c222b, 1.0));
    const key = new THREE.DirectionalLight(0xfff6ea, 1.25);
    key.position.set(1.4, 2.4, 1.1);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb8c8e0, 0.55);
    fill.position.set(-1.6, 0.9, -1.2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xe8f0ff, 0.4);
    rim.position.set(0.2, 1.0, -2.0);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.55;
    controls.panSpeed = 0.9;
    controls.zoomSpeed = 1.15;
    controls.zoomToCursor = true;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.05;
    controls.maxDistance = 1e7;

    let raf = 0;
    let tween = null;
    const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
    const flyTo = (toTgt, toPos, dur = 380) => {
      tween = {
        fromPos: camera.position.clone(), toPos: toPos.clone(),
        fromTgt: controls.target.clone(), toTgt: toTgt.clone(),
        start: performance.now(), dur,
      };
    };

    const updateClipPlanes = (rad) => {
      const dist = camera.position.distanceTo(controls.target);
      if (!Number.isFinite(dist) || dist <= 0) return;
      const r = (Number.isFinite(rad) && rad > 0) ? rad : (apiRef.current?.modelRadius || 10);
      const near = Math.max(dist * 0.0015, r * 0.00005, 0.01);
      const far = Math.max(dist + r * 12, r * 40, near * 100, 100);
      if (near >= far) return;
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    };

    const tick = () => {
      if (cancelled) return;
      if (tween) {
        const t = Math.min(1, (performance.now() - tween.start) / tween.dur);
        const e = easeInOut(t);
        camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
        controls.target.lerpVectors(tween.fromTgt, tween.toTgt, e);
        if (t >= 1) tween = null;
      }
      controls.update();
      updateClipPlanes(apiRef.current?.modelRadius);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
      if (apiRef.current) apiRef.current.raf = raf;
    };

    // Walk-zoom: when the user keeps scrolling in at minDistance, slide both
    // camera and target forward so zoom never "runs out of gas".
    const walkDir = new THREE.Vector3();
    const onWheelCapture = (e) => {
      const rad = apiRef.current?.modelRadius || 10;
      const dist = camera.position.distanceTo(controls.target);
      const zoomingIn = e.deltaY < 0;
      const nearFloor = Math.max(controls.minDistance * 1.25, rad * 0.004, 0.08);
      if (!zoomingIn || dist > nearFloor) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      walkDir.subVectors(controls.target, camera.position);
      const len = walkDir.length();
      if (len < 1e-8) return;
      walkDir.multiplyScalar(1 / len);
      const step = Math.max(dist * 0.12, rad * 0.002, 0.04);
      camera.position.addScaledVector(walkDir, step);
      controls.target.addScaledVector(walkDir, step);
      controls.update();
    };
    renderer.domElement.addEventListener("wheel", onWheelCapture, {
      capture: true,
      passive: false,
    });

    const measureGroup = new THREE.Group();
    measureGroup.name = "measure-overlay";
    scene.add(measureGroup);
    measureRef.current = { a: null, b: null, group: measureGroup };

    apiRef.current = {
      scene, camera, renderer, controls, model: null, raf: 0, ro, flyTo,
      focusDist: 1, measureGroup, modelRadius: 1,
      meshesByGuid: new Map(), isolated: null, hidden: new Set(), clipPlane: null,
      bounds: null,
    };

    // Kick a render loop immediately so the mount isn't a black void while
    // web-ifc parses (can take seconds on large IFCs).
    raf = requestAnimationFrame(tick);
    apiRef.current.raf = raf;

    loadIfcGeometry(buffer, { colorFor })
      .then((model) => {
        if (cancelled) {
          try { model.dispose(); } catch { /* ignore */ }
          return;
        }
        const api = apiRef.current;
        if (!api) {
          try { model.dispose(); } catch { /* ignore */ }
          return;
        }

        try {
          scene.add(model.group);
          api.model = model;

          // GUID → meshes index (an assembly part can be several placed
          // geometries) so select/isolate/fit by GUID never walks 10k children.
          const byGuid = new Map();
          for (const mesh of model.group.children) {
            const g = mesh.userData?.guid;
            if (!g) continue;
            if (!byGuid.has(g)) byGuid.set(g, []);
            byGuid.get(g).push(mesh);
          }
          api.meshesByGuid = byGuid;

          const box = new THREE.Box3().setFromObject(model.group);
          if (box.isEmpty()) {
            setCount(0);
            onLoaded?.(0);
            setStatus("ready");
            return;
          }
          api.bounds = box.clone();
          const sphere = box.getBoundingSphere(new THREE.Sphere());
          const r = Math.max(
            Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : 1,
            0.5,
          );
          api.modelRadius = r;
          controls.minDistance = Math.max(r * 0.0008, 0.02);
          controls.maxDistance = Math.max(r * 80, 50);
          api.focusDist = r * 0.18;

          // Soft ground disc under the model (cheap depth cue, no shadow map).
          const groundGeo = new THREE.CircleGeometry(r * 2.4, 64);
          groundGeo.rotateX(-Math.PI / 2);
          const groundMat = new THREE.MeshBasicMaterial({
            color: 0x12171e,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
          });
          const ground = new THREE.Mesh(groundGeo, groundMat);
          const minY = Number.isFinite(box.min.y) ? box.min.y : sphere.center.y - r * 0.1;
          ground.position.set(sphere.center.x, minY - r * 0.002, sphere.center.z);
          ground.renderOrder = -1;
          scene.add(ground);
          api.ground = ground;

          const grid = new THREE.GridHelper(r * 4, 40, 0x3d4654, 0x1a2028);
          grid.position.set(sphere.center.x, minY, sphere.center.z);
          if (Array.isArray(grid.material)) {
            grid.material.forEach((m) => { m.transparent = true; m.opacity = 0.45; });
          } else if (grid.material) {
            grid.material.transparent = true;
            grid.material.opacity = 0.45;
          }
          scene.add(grid);
          api.grid = grid;

          const fitPos = new THREE.Vector3(
            sphere.center.x + r * 1.55,
            sphere.center.y + r * 1.05,
            sphere.center.z + r * 1.55,
          );
          const fitView = (animate) => {
            if (!apiRef.current) return;
            if (animate) apiRef.current.flyTo(sphere.center.clone(), fitPos.clone());
            else {
              controls.target.copy(sphere.center);
              camera.position.copy(fitPos);
              controls.update();
            }
          };
          fitView(false);
          api.fitView = () => fitView(true);

          setCount(model.count);
          onLoaded?.(model.count);
          setStatus("ready");
        } catch (e) {
          console.error("[IfcModelViewer] post-load setup failed:", e);
          setError(e?.message || String(e));
          setStatus("error");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[IfcModelViewer] loadIfcGeometry failed:", e);
        setError(e?.message || String(e));
        setStatus("error");
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(apiRef.current?.raf || raf);
      renderer.domElement.removeEventListener("wheel", onWheelCapture, { capture: true });
      ro.disconnect();
      controls.dispose();
      apiRef.current?.grid?.geometry?.dispose();
      if (Array.isArray(apiRef.current?.grid?.material)) {
        apiRef.current.grid.material.forEach((m) => m.dispose?.());
      } else {
        apiRef.current?.grid?.material?.dispose?.();
      }
      apiRef.current?.ground?.geometry?.dispose();
      apiRef.current?.ground?.material?.dispose?.();
      apiRef.current?.model?.dispose();
      clearMeasureVisuals();
      renderer.clippingPlanes = [];
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      apiRef.current = null;
      selectedRef.current = new Map();
      measureRef.current = { a: null, b: null, group: null };
      setHover(null);
      setVisibility({ isolated: 0, hidden: 0 });
      setStatus("loading");
      setError(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer]);

  useEffect(() => {
    const stats = apiRef.current?.model?.recolor?.(colorFor);
    if (stats) onColorStats?.(stats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorFor, status]);

  useEffect(() => {
    if (!measureMode) {
      clearMeasureVisuals();
      measureRef.current.a = null;
      measureRef.current.b = null;
      setMeasureLabel(null);
      onMeasureRef.current?.(null);
    }
  }, [measureMode]);

  function clearMeasureVisuals() {
    const g = measureRef.current?.group;
    if (!g) return;
    while (g.children.length) {
      const c = g.children[0];
      g.remove(c);
      c.geometry?.dispose?.();
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose?.());
      else c.material?.dispose?.();
    }
  }

  function measureMarkerRadius() {
    const r = apiRef.current?.modelRadius || 1;
    return Math.min(Math.max(r * 0.004, 0.025), 0.18);
  }

  function drawMeasure(a, b) {
    clearMeasureVisuals();
    const g = measureRef.current?.group;
    if (!g || !a) return;
    const rad = measureMarkerRadius();
    const mkPoint = (p) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(rad, 18, 14),
        new THREE.MeshBasicMaterial({
          color: MEASURE_COLOR,
          depthTest: false,
          transparent: true,
          opacity: 0.95,
        }),
      );
      mesh.position.copy(p);
      mesh.renderOrder = 10;
      g.add(mesh);
    };
    mkPoint(a);
    if (!b) return;
    mkPoint(b);
    const positions = new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: MEASURE_COLOR,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      }),
    );
    line.renderOrder = 10;
    g.add(line);

    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const tick = new THREE.Mesh(
      new THREE.SphereGeometry(rad * 0.55, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff3a0, depthTest: false }),
    );
    tick.position.copy(mid);
    tick.renderOrder = 11;
    g.add(tick);
  }

  // ── Selection / visibility primitives (shared by clicks + the ref API) ──

  function setMeshHighlight(mesh, on) {
    if (!mesh.material?.emissive) return;
    if (on) mesh.material.emissive.copy(HIGHLIGHT).multiplyScalar(0.4);
    else mesh.material.emissive.set("#000000");
  }

  function emitSelection() {
    const sel = selectedRef.current;
    const guids = [...new Set([...sel.values()].map((m) => m.userData?.guid).filter(Boolean))];
    onSelectRef.current?.(guids);
    return guids;
  }

  function clearSelectionInternal({ emit = true } = {}) {
    const sel = selectedRef.current;
    for (const mesh of sel.values()) setMeshHighlight(mesh, false);
    sel.clear();
    if (emit) {
      onPickRef.current?.(null);
      onSelectRef.current?.([]);
    }
  }

  function selectGuidsInternal(guids, { additive = false } = {}) {
    const api = apiRef.current;
    if (!api?.model) return [];
    if (!additive) clearSelectionInternal({ emit: false });
    const sel = selectedRef.current;
    let firstMesh = null;
    for (const guid of guids || []) {
      for (const mesh of api.meshesByGuid.get(guid) || []) {
        if (api.hidden.has(guid) || (api.isolated && !api.isolated.has(guid))) continue;
        sel.set(mesh.userData.expressID, mesh);
        setMeshHighlight(mesh, true);
        if (!firstMesh) firstMesh = mesh;
      }
    }
    const out = emitSelection();
    if (out.length === 1 && firstMesh) {
      api.model.pickInfo(firstMesh.userData.expressID).then((info) => {
        if (apiRef.current && selectedRef.current.size) onPickRef.current?.(info);
      });
    } else {
      onPickRef.current?.(null);
    }
    return out;
  }

  /** Re-apply isolation / hidden state to every mesh (idempotent). */
  function applyVisibility() {
    const api = apiRef.current;
    if (!api?.model) return;
    const { isolated, hidden } = api;
    let ghosted = 0;
    for (const mesh of api.model.group.children) {
      const guid = mesh.userData?.guid;
      const isHidden = guid ? hidden.has(guid) : false;
      const isGhost = !isHidden && isolated ? !(guid && isolated.has(guid)) : false;
      mesh.visible = !isHidden;
      mesh.userData.ghost = isGhost;
      const mat = mesh.material;
      if (!mat) continue;
      if (mat.userData.baseOpacity == null) {
        mat.userData.baseOpacity = mat.opacity;
        mat.userData.baseTransparent = mat.transparent;
      }
      if (isGhost) {
        ghosted += 1;
        mat.transparent = true;
        mat.opacity = GHOST_OPACITY;
        mat.depthWrite = false;
      } else {
        mat.transparent = mat.userData.baseTransparent;
        mat.opacity = mat.userData.baseOpacity;
        mat.depthWrite = true;
      }
    }
    // Drop selection entries that are no longer visible / pickable.
    const sel = selectedRef.current;
    let changed = false;
    for (const [id, mesh] of [...sel.entries()]) {
      if (!mesh.visible || mesh.userData.ghost) {
        setMeshHighlight(mesh, false);
        sel.delete(id);
        changed = true;
      }
    }
    if (changed) emitSelection();
    setVisibility({ isolated: isolated ? isolated.size : 0, hidden: hidden.size, ghosted });
  }

  function boundsForGuids(guids) {
    const api = apiRef.current;
    if (!api?.model) return null;
    const box = new THREE.Box3();
    let any = false;
    for (const guid of guids || []) {
      for (const mesh of api.meshesByGuid.get(guid) || []) {
        if (!mesh.visible) continue;
        box.expandByObject(mesh);
        any = true;
      }
    }
    return any && !box.isEmpty() ? box : null;
  }

  function fitToBox(box) {
    const api = apiRef.current;
    if (!api || !box) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, api.modelRadius * 0.002, 0.05);
    // Keep the current viewing direction so the user doesn't lose orientation.
    const dir = api.camera.position.clone().sub(api.controls.target);
    if (dir.lengthSq() < 1e-10) dir.set(1, 0.7, 1);
    dir.normalize();
    const fovRad = (api.camera.fov * Math.PI) / 180;
    const dist = (r / Math.sin(fovRad / 2)) * 1.15;
    api.flyTo(sphere.center.clone(), sphere.center.clone().addScaledVector(dir, dist));
  }

  function setClipHeightInternal(fraction) {
    const api = apiRef.current;
    if (!api) return;
    if (fraction == null || !api.bounds) {
      api.clipPlane = null;
      api.renderer.clippingPlanes = [];
      return;
    }
    const f = Math.min(1, Math.max(0, Number(fraction)));
    const { min, max } = api.bounds;
    const y = min.y + (max.y - min.y) * f;
    // Keep everything at or below y: plane normal points down, constant = y.
    const plane = api.clipPlane || new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    plane.set(new THREE.Vector3(0, -1, 0), y);
    api.clipPlane = plane;
    api.renderer.clippingPlanes = [plane];
  }

  useImperativeHandle(ref, () => ({
    selectGuids: (guids, { fly = false, additive = false } = {}) => {
      const out = selectGuidsInternal(guids, { additive });
      if (fly && out.length) fitToBox(boundsForGuids(out));
      return out;
    },
    clearSelection: () => clearSelectionInternal(),
    fitToGuids: (guids) => fitToBox(boundsForGuids(guids)),
    fitView: () => apiRef.current?.fitView?.(),
    isolate: (guids) => {
      const api = apiRef.current;
      if (!api) return;
      api.isolated = guids && guids.length ? new Set(guids) : null;
      applyVisibility();
      if (api.isolated) fitToBox(boundsForGuids([...api.isolated]));
    },
    hide: (guids) => {
      const api = apiRef.current;
      if (!api) return;
      for (const g of guids || []) api.hidden.add(g);
      applyVisibility();
    },
    showAll: () => {
      const api = apiRef.current;
      if (!api) return;
      api.isolated = null;
      api.hidden = new Set();
      applyVisibility();
    },
    setClipHeight: (fraction) => setClipHeightInternal(fraction),
    getSelectedGuids: () => [...new Set([...selectedRef.current.values()].map((m) => m.userData?.guid).filter(Boolean))],
    getVisibility: () => ({ ...visibility }),
    /** Open web-ifc model handle (null until loaded) — lets the save path reuse this parse. */
    getModelHandle: () => apiRef.current?.model?.handle || null,
  // The *Internal helpers are stable per render (they only touch refs) — listing
  // them would recreate the handle every render for no benefit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [visibility]);

  useEffect(() => {
    const mount = mountRef.current;
    const ctx = apiRef.current;
    if (!mount || !ctx || status !== "ready") return undefined;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pickable = (m) => m.visible && !m.userData?.ghost;

    const hitMesh = (ev) => {
      const ctx2 = apiRef.current;
      const model = ctx2?.model;
      if (!model) return null;
      const rect = ctx2.renderer.domElement.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, ctx2.camera);
      const hits = raycaster.intersectObjects(model.group.children, false);
      // Respect the level cut: ignore hits above the clipping plane.
      const plane = ctx2.clipPlane;
      for (const h of hits) {
        if (!pickable(h.object)) continue;
        if (plane && plane.distanceToPoint(h.point) < 0) continue;
        return h;
      }
      return null;
    };

    // Distinguish an orbit drag from a click: OrbitControls' mouseup fires a
    // synthetic click, which used to clear the selection every time you rotated.
    let down = null;
    const onPointerDown = (ev) => {
      down = { x: ev.clientX, y: ev.clientY, button: ev.button };
      // Take keyboard focus so F / I / H / U / Esc work right after a click.
      try { ev.currentTarget?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
    };
    const wasDrag = (ev) => {
      if (!down) return true;
      const dx = ev.clientX - down.x;
      const dy = ev.clientY - down.y;
      return Math.hypot(dx, dy) > CLICK_SLOP_PX;
    };

    const onClick = (ev) => {
      const dragged = wasDrag(ev);
      down = null;
      if (dragged) return;
      const ctx2 = apiRef.current;
      const model = ctx2?.model;
      if (!model) return;

      if (measureModeRef.current) {
        const hit = hitMesh(ev);
        if (!hit) return;
        const { point, snapped, snapKind } = snapMeasurePoint(hit.object, hit.point);
        const m = measureRef.current;

        if (!m.a || m.b) {
          m.a = point;
          m.b = null;
          drawMeasure(m.a, null);
          setMeasureLabel({ phase: "a", snapped, snapKind, formatted: null });
          onMeasureRef.current?.({
            phase: "a", a: m.a, b: null, distanceM: null, snappedA: snapped, snapKindA: snapKind,
          });
          return;
        }

        m.b = point;
        drawMeasure(m.a, m.b);
        const dist = distanceMeters(m.a, m.b);
        const formatted = formatMeasureDistance(dist);
        setMeasureLabel({ phase: "done", snapped, snapKind, formatted, distanceM: dist });
        onMeasureRef.current?.({
          phase: "done",
          a: m.a,
          b: m.b,
          distanceM: dist,
          snappedB: snapped,
          snapKindB: snapKind,
          ...formatted,
        });
        return;
      }

      const hit = hitMesh(ev);
      const additive = ev.ctrlKey || ev.metaKey || ev.shiftKey;
      const sel = selectedRef.current;

      if (!hit) {
        if (!additive) clearSelectionInternal();
        return;
      }
      const mesh = hit.object;
      const { expressID, guid } = mesh.userData || {};
      // Alt-click selects every part of the same assembly mark (when the host
      // can resolve one) — the fast way to grab a whole beam with its clips.
      const sameMark = ev.altKey && guid && labelForRef.current?.(guid);
      let targetMeshes = [mesh];
      if (sameMark) {
        targetMeshes = [];
        for (const [g, list] of ctx2.meshesByGuid) {
          if (labelForRef.current?.(g) === sameMark) targetMeshes.push(...list.filter(pickable));
        }
      }

      if (additive && sel.has(expressID)) {
        for (const m of targetMeshes) { setMeshHighlight(m, false); sel.delete(m.userData.expressID); }
      } else {
        if (!additive) clearSelectionInternal({ emit: false });
        for (const m of targetMeshes) { sel.set(m.userData.expressID, m); setMeshHighlight(m, true); }
      }

      emitSelection();
      if (sel.has(expressID)) model.pickInfo(expressID).then((info) => onPickRef.current?.(info));
      else onPickRef.current?.(null);
    };

    const onDblClick = (ev) => {
      if (measureModeRef.current) return;
      const ctx2 = apiRef.current;
      const model = ctx2?.model;
      if (!model) return;
      const hit = hitMesh(ev);
      if (!hit) return;
      const p = hit.point;
      const dir = ctx2.camera.position.clone().sub(ctx2.controls.target).normalize();
      const toPos = p.clone().addScaledVector(dir, ctx2.focusDist || 1);
      ctx2.flyTo(p.clone(), toPos);
    };

    // Hover label: one raycast per animation frame at most, only while the
    // pointer actually moves, and only when the host can name the part.
    let hoverPending = null;
    let hoverRaf = 0;
    let lastHoverGuid = null;
    const onPointerMove = (ev) => {
      if (!labelForRef.current) return;
      if (down && wasDrag(ev)) { // orbiting — drop the label
        if (lastHoverGuid) { lastHoverGuid = null; setHover(null); }
        return;
      }
      hoverPending = { clientX: ev.clientX, clientY: ev.clientY };
      if (hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        const ev2 = hoverPending;
        hoverPending = null;
        if (!ev2 || !apiRef.current) return;
        const hit = hitMesh(ev2);
        const guid = hit?.object?.userData?.guid || null;
        if (guid === lastHoverGuid && guid) {
          setHover((h) => (h ? { ...h, x: ev2.clientX, y: ev2.clientY } : h));
          return;
        }
        lastHoverGuid = guid;
        if (!guid) { setHover(null); return; }
        const label = labelForRef.current?.(guid);
        if (!label) { setHover(null); return; }
        const rect = apiRef.current.renderer.domElement.getBoundingClientRect();
        setHover({ label, x: ev2.clientX - rect.left, y: ev2.clientY - rect.top });
      });
    };
    const onPointerLeave = () => { lastHoverGuid = null; setHover(null); };

    const onKeyDown = (ev) => {
      const api = apiRef.current;
      if (!api?.model) return;
      const k = ev.key;
      if (k === "Escape") {
        if (measureModeRef.current) {
          clearMeasureVisuals();
          measureRef.current.a = null; measureRef.current.b = null;
          setMeasureLabel(null);
          onMeasureRef.current?.(null);
        } else {
          clearSelectionInternal();
        }
        ev.preventDefault();
        return;
      }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const key = k.toLowerCase();
      const selGuids = [...new Set([...selectedRef.current.values()].map((m) => m.userData?.guid).filter(Boolean))];
      if (key === "f") {
        if (selGuids.length) fitToBox(boundsForGuids(selGuids)); else api.fitView?.();
      } else if (key === "i" && selGuids.length) {
        api.isolated = new Set(selGuids);
        applyVisibility();
        fitToBox(boundsForGuids(selGuids));
      } else if (key === "h" && selGuids.length) {
        for (const g of selGuids) api.hidden.add(g);
        applyVisibility();
      } else if (key === "u") {
        api.isolated = null; api.hidden = new Set();
        applyVisibility();
      } else {
        return;
      }
      ev.preventDefault();
    };

    const el = ctx.renderer.domElement;
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("click", onClick);
    el.addEventListener("dblclick", onDblClick);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("keydown", onKeyDown);
    return () => {
      if (hoverRaf) cancelAnimationFrame(hoverRaf);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("click", onClick);
      el.removeEventListener("dblclick", onDblClick);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("keydown", onKeyDown);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const filtered = visibility.isolated > 0 || visibility.hidden > 0;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 420 }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      {status === "loading" && (
        <div style={overlay}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>Loading model…</div>
        </div>
      )}
      {status === "error" && (
        <div style={overlay}>
          <div role="alert" style={{ maxWidth: 420, textAlign: "center", color: "var(--text-primary)", fontSize: 13 }}>
            Couldn't load the model: {error}
          </div>
        </div>
      )}
      {status === "ready" && count === 0 && (
        <div style={overlay}>
          <div role="alert" style={{ maxWidth: 440, textAlign: "center", color: "var(--text-primary)", fontSize: 13, lineHeight: 1.6 }}>
            No structural members to show — this IFC has no beams, columns, plates,
            or members. Re-export with structural members, then load again.
          </div>
        </div>
      )}
      {status === "ready" && count > 0 && (
        <>
          <button type="button" onClick={() => apiRef.current?.fitView?.()} title="Fit whole model in view (F)" style={fitBtn}>
            Fit view
          </button>
          {hover && !measureMode && (
            <div
              style={{
                ...hoverTip,
                left: Math.max(8, hover.x + 14),
                top: Math.max(8, hover.y - 30),
              }}
            >
              {hover.label}
            </div>
          )}
          {measureMode && measureLabel?.formatted?.ftIn && (
            <div style={measureHud} aria-live="polite">
              <span style={{ fontWeight: 800 }}>{measureLabel.formatted.ftIn}</span>
              <span style={{ opacity: 0.75, marginLeft: 10 }}>
                {measureLabel.formatted.decimalFeet?.toFixed(3)} ft · {measureLabel.formatted.meters?.toFixed(3)} m
              </span>
              <span style={{ opacity: 0.55, marginLeft: 10, fontSize: 11 }}>to 1/16″</span>
            </div>
          )}
          {measureMode && measureLabel?.phase === "a" && (
            <div style={measureHud}>
              Click second point…
              {measureLabel.snapKind ? (
                <span style={{ opacity: 0.7, marginLeft: 8, fontSize: 11 }}>
                  ({measureLabel.snapKind} snap)
                </span>
              ) : null}
            </div>
          )}
          <div style={{
            position: "absolute", left: 12, bottom: 10, right: 12,
            fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", pointerEvents: "none",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {measureMode
              ? `${count.toLocaleString()} parts · MEASURE · click two points (vertex/edge snap · nearest 1/16″) · Esc clears · toggle off to exit`
              : `${count.toLocaleString()} parts${filtered ? ` · ${visibility.isolated ? `isolating ${visibility.isolated.toLocaleString()}` : ""}${visibility.isolated && visibility.hidden ? " · " : ""}${visibility.hidden ? `${visibility.hidden.toLocaleString()} hidden` : ""} (U shows all)` : ""} · drag orbit · scroll zoom · click part · ctrl/shift add · alt whole mark · dbl-click fly · F fit · I isolate · H hide · Esc clear`}
          </div>
        </>
      )}
    </div>
  );
});

export default IfcModelViewer;

const overlay = {
  position: "absolute", inset: 0, display: "flex", alignItems: "center",
  justifyContent: "center", background: "rgba(13,17,23,0.6)",
};

const fitBtn = {
  position: "absolute", top: 10, right: 10, padding: "6px 12px", borderRadius: 8,
  border: "1px solid var(--border-default)", background: "rgba(13,17,23,0.72)",
  color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 11,
  fontWeight: 700, letterSpacing: "0.05em", cursor: "pointer", zIndex: 2,
};

const hoverTip = {
  position: "absolute", padding: "3px 8px", borderRadius: 6, zIndex: 3,
  background: "rgba(13,17,23,0.9)", border: "1px solid var(--border-default)",
  color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 11,
  fontWeight: 700, letterSpacing: "0.04em", whiteSpace: "nowrap", pointerEvents: "none",
};

const measureHud = {
  position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
  padding: "8px 16px", borderRadius: 999,
  background: "rgba(13,17,23,0.88)", border: "1px solid #f5d90a",
  color: "#f5d90a", fontFamily: "var(--font-mono)", fontSize: 13,
  fontWeight: 600, letterSpacing: "0.03em", whiteSpace: "nowrap",
  boxShadow: "0 6px 24px rgba(0,0,0,0.45)", pointerEvents: "none", zIndex: 3,
};
