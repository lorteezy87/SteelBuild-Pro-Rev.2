/**
 * IfcModelViewer — three.js scene host for the Detailing Control Center 3D tab.
 * Supports pick/select and measureMode (vertex/edge-snapped point-to-point
 * distance, displayed to the nearest 1/16").
 *
 * Graphics: ACES tone-map, multi-light studio setup, soft ground disc.
 * Navigation: OrbitControls with "walk-zoom" so wheel zoom never stalls at
 * minDistance (the old "running out of gas" feel).
 */
import { useEffect, useRef, useState } from "react";
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

export default function IfcModelViewer({
  buffer,
  colorFor,
  onPick,
  onSelect,
  onLoaded,
  onColorStats,
  measureMode = false,
  onMeasure,
}) {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const selectedRef = useRef(new Map());
  const measureRef = useRef({ a: null, b: null, group: null });
  const measureModeRef = useRef(measureMode);
  const onMeasureRef = useRef(onMeasure);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [count, setCount] = useState(0);
  const [measureLabel, setMeasureLabel] = useState(null);

  measureModeRef.current = measureMode;
  onMeasureRef.current = onMeasure;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !buffer) return undefined;
    let cancelled = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b0f14");
    scene.fog = new THREE.FogExp2(0x0b0f14, 0.0008);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 1e6);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    // Cap DPR for GPU cost; 2 is enough for crisp edges without 3× fill-rate.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    // Avoid auto-clear thrash; single pass is enough.
    mount.appendChild(renderer.domElement);

    // Studio lighting — cheap, no shadows (shadow maps × 12k meshes kills FPS).
    const hemi = new THREE.HemisphereLight(0xc9d6ea, 0x1a1e24, 0.85);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff4e5, 1.15);
    key.position.set(1.4, 2.4, 1.1);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb8c8e0, 0.45);
    fill.position.set(-1.6, 0.8, -1.2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xdde8ff, 0.35);
    rim.position.set(0.2, 1.0, -2.0);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0xffffff, 0.22));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.55;
    controls.panSpeed = 0.9;
    controls.zoomSpeed = 1.15;
    controls.zoomToCursor = true;
    controls.screenSpacePanning = true;
    // Very low floor so walk-zoom (below) can take over before a hard stop.
    controls.minDistance = 0.05;
    controls.maxDistance = 1e7;

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

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
      // Near plane tracks distance so close inspections don't clip, and far
      // plane always covers the model + orbit range (no pop-in black void).
      const r = rad || apiRef.current?.modelRadius || 10;
      camera.near = Math.max(dist * 0.0015, r * 0.00005, 0.01);
      camera.far = Math.max(dist + r * 12, r * 40, 100);
      camera.updateProjectionMatrix();
    };

    const tick = () => {
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
      // Stop OrbitControls from no-op-ing at minDistance.
      e.preventDefault();
      e.stopImmediatePropagation();
      walkDir.subVectors(controls.target, camera.position);
      const len = walkDir.length();
      if (len < 1e-8) return;
      walkDir.multiplyScalar(1 / len);
      // Step scales with current framing so it feels continuous.
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
    };

    loadIfcGeometry(buffer, { colorFor })
      .then((model) => {
        if (cancelled) { model.dispose(); return; }
        scene.add(model.group);
        apiRef.current.model = model;

        const box = new THREE.Box3().setFromObject(model.group);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const r = Math.max(sphere.radius || 1, 0.5);
        apiRef.current.modelRadius = r;
        // Soft limits — walk-zoom handles the real close-up path.
        controls.minDistance = Math.max(r * 0.0008, 0.02);
        controls.maxDistance = r * 80;
        apiRef.current.focusDist = r * 0.18;
        // Fog density scales so large models don't wash out immediately.
        scene.fog.density = Math.min(0.12 / r, 0.0025);

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
        ground.position.set(sphere.center.x, box.min.y - r * 0.002, sphere.center.z);
        ground.renderOrder = -1;
        scene.add(ground);
        apiRef.current.ground = ground;

        const grid = new THREE.GridHelper(r * 4, 40, 0x3d4654, 0x1a2028);
        grid.position.set(sphere.center.x, box.min.y, sphere.center.z);
        // Soften grid so members read first.
        if (Array.isArray(grid.material)) {
          grid.material.forEach((m) => { m.transparent = true; m.opacity = 0.45; });
        } else if (grid.material) {
          grid.material.transparent = true;
          grid.material.opacity = 0.45;
        }
        scene.add(grid);
        apiRef.current.grid = grid;

        const fitPos = new THREE.Vector3(
          sphere.center.x + r * 1.55,
          sphere.center.y + r * 1.05,
          sphere.center.z + r * 1.55,
        );
        const fitView = (animate) => {
          if (animate) apiRef.current.flyTo(sphere.center.clone(), fitPos.clone());
          else {
            controls.target.copy(sphere.center);
            camera.position.copy(fitPos);
            controls.update();
          }
        };
        fitView(false);
        apiRef.current.fitView = () => fitView(true);

        setCount(model.count);
        onLoaded?.(model.count);
        setStatus("ready");
        raf = requestAnimationFrame(tick);
        apiRef.current.raf = raf;
      })
      .catch((e) => {
        if (cancelled) return;
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
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      apiRef.current = null;
      selectedRef.current = new Map();
      measureRef.current = { a: null, b: null, group: null };
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
    // ~0.4% of model radius, clamped so markers stay readable on small models.
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
        linewidth: 1,
        transparent: true,
        opacity: 0.95,
      }),
    );
    line.renderOrder = 10;
    g.add(line);

    // Mid-point tick so the dimension reads even without the HUD.
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const tick = new THREE.Mesh(
      new THREE.SphereGeometry(rad * 0.55, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff3a0, depthTest: false }),
    );
    tick.position.copy(mid);
    tick.renderOrder = 11;
    g.add(tick);
  }

  useEffect(() => {
    const mount = mountRef.current;
    const ctx = apiRef.current;
    if (!mount || !ctx || status !== "ready") return undefined;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const hitMesh = (ev) => {
      const ctx2 = apiRef.current;
      const model = ctx2?.model;
      if (!model) return null;
      const rect = ctx2.renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, ctx2.camera);
      const hits = raycaster.intersectObjects(model.group.children, false);
      return hits[0] || null;
    };

    const onClick = (ev) => {
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
      const clearAll = () => {
        for (const mesh of sel.values()) mesh.material.emissive?.set("#000000");
        sel.clear();
      };

      if (!hit) {
        if (!additive) { clearAll(); onPick?.(null); onSelect?.([]); }
        return;
      }
      const mesh = hit.object;
      const { expressID } = mesh.userData || {};

      if (additive && sel.has(expressID)) {
        mesh.material.emissive?.set("#000000");
        sel.delete(expressID);
      } else {
        if (!additive) clearAll();
        sel.set(expressID, mesh);
        if (mesh.material.emissive) {
          mesh.material.emissive.copy(HIGHLIGHT).multiplyScalar(0.4);
        }
      }

      onSelect?.([...sel.values()].map((x) => x.userData?.guid).filter(Boolean));
      if (sel.has(expressID)) model.pickInfo(expressID).then((info) => onPick?.(info));
      else onPick?.(null);
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

    const el = ctx.renderer.domElement;
    el.addEventListener("click", onClick);
    el.addEventListener("dblclick", onDblClick);
    return () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("dblclick", onDblClick);
    };
  }, [status, onPick, onSelect]);

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
          <button type="button" onClick={() => apiRef.current?.fitView?.()} title="Fit whole model in view" style={fitBtn}>
            Fit view
          </button>
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
            position: "absolute", left: 12, bottom: 10,
            fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", pointerEvents: "none",
          }}>
            {measureMode
              ? `${count.toLocaleString()} parts · MEASURE · click two points (vertex/edge snap · nearest 1/16″) · toggle off to clear`
              : `${count.toLocaleString()} parts · drag orbit · scroll zoom (no limit) · click member · ctrl/shift multi · double-click fly in`}
          </div>
        </>
      )}
    </div>
  );
}

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

const measureHud = {
  position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
  padding: "8px 16px", borderRadius: 999,
  background: "rgba(13,17,23,0.88)", border: "1px solid #f5d90a",
  color: "#f5d90a", fontFamily: "var(--font-mono)", fontSize: 13,
  fontWeight: 600, letterSpacing: "0.03em", whiteSpace: "nowrap",
  boxShadow: "0 6px 24px rgba(0,0,0,0.45)", pointerEvents: "none", zIndex: 3,
};
