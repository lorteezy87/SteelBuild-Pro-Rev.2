/**
 * IfcModelViewer — three.js scene host for the Detailing Control Center 3D tab.
 * Supports pick/select and measureMode (vertex-snapped point-to-point distance).
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadIfcGeometry } from "@/lib/ifc/loadIfcGeometry";
import {
  snapToNearestVertex,
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
    scene.background = new THREE.Color("#0d1117");
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1e6);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xdbe7ff, 0x2b2f36, 1.0);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(1, 2.2, 1.4);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.rotateSpeed = 0.6;
    controls.panSpeed = 0.8;
    controls.zoomSpeed = 1.0;
    controls.zoomToCursor = true;
    controls.screenSpacePanning = true;

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h);
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
    const tick = () => {
      if (tween) {
        const t = Math.min(1, (performance.now() - tween.start) / tween.dur);
        const e = easeInOut(t);
        camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
        controls.target.lerpVectors(tween.fromTgt, tween.toTgt, e);
        if (t >= 1) tween = null;
      }
      controls.update();
      const rad = apiRef.current?.modelRadius;
      if (rad) {
        const dist = camera.position.distanceTo(controls.target);
        camera.near = Math.max(dist * 0.02, rad / 5000);
        camera.far = dist + rad * 5;
        camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };

    const measureGroup = new THREE.Group();
    measureGroup.name = "measure-overlay";
    scene.add(measureGroup);
    measureRef.current = { a: null, b: null, group: measureGroup };

    apiRef.current = {
      scene, camera, renderer, controls, model: null, raf: 0, ro, flyTo, focusDist: 1, measureGroup,
    };

    loadIfcGeometry(buffer, { colorFor })
      .then((model) => {
        if (cancelled) { model.dispose(); return; }
        scene.add(model.group);
        apiRef.current.model = model;

        const box = new THREE.Box3().setFromObject(model.group);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const r = sphere.radius || 1;
        apiRef.current.modelRadius = r;
        controls.minDistance = r * 0.01;
        controls.maxDistance = r * 40;
        apiRef.current.focusDist = r * 0.18;
        const fitPos = new THREE.Vector3(
          sphere.center.x + r * 1.6,
          sphere.center.y + r * 1.2,
          sphere.center.z + r * 1.6,
        );
        const fitView = (animate) => {
          if (animate) apiRef.current.flyTo(sphere.center.clone(), fitPos.clone());
          else { controls.target.copy(sphere.center); camera.position.copy(fitPos); controls.update(); }
        };
        fitView(false);
        apiRef.current.fitView = () => fitView(true);

        const grid = new THREE.GridHelper(r * 4, 40, 0x3a4250, 0x1b2027);
        grid.position.set(sphere.center.x, box.min.y, sphere.center.z);
        scene.add(grid);
        apiRef.current.grid = grid;

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
      ro.disconnect();
      controls.dispose();
      apiRef.current?.grid?.geometry?.dispose();
      apiRef.current?.grid?.material?.dispose();
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

  function drawMeasure(a, b) {
    clearMeasureVisuals();
    const g = measureRef.current?.group;
    if (!g || !a) return;
    const mkPoint = (p) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 16, 12),
        new THREE.MeshBasicMaterial({ color: MEASURE_COLOR, depthTest: false }),
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
      new THREE.LineBasicMaterial({ color: MEASURE_COLOR, depthTest: false }),
    );
    line.renderOrder = 10;
    g.add(line);
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
        const { point, snapped } = snapToNearestVertex(hit.object, hit.point);
        const m = measureRef.current;

        if (!m.a || m.b) {
          m.a = point;
          m.b = null;
          drawMeasure(m.a, null);
          setMeasureLabel({ phase: "a", snapped, formatted: null });
          onMeasureRef.current?.({ phase: "a", a: m.a, b: null, distanceM: null, snappedA: snapped });
          return;
        }

        m.b = point;
        drawMeasure(m.a, m.b);
        const dist = distanceMeters(m.a, m.b);
        const formatted = formatMeasureDistance(dist);
        setMeasureLabel({ phase: "done", snapped, formatted, distanceM: dist });
        onMeasureRef.current?.({
          phase: "done",
          a: m.a,
          b: m.b,
          distanceM: dist,
          snappedB: snapped,
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
        mesh.material.emissive?.copy(HIGHLIGHT).multiplyScalar(0.45);
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
            </div>
          )}
          {measureMode && measureLabel?.phase === "a" && (
            <div style={measureHud}>Click second point…</div>
          )}
          <div style={{
            position: "absolute", left: 12, bottom: 10,
            fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", pointerEvents: "none",
          }}>
            {measureMode
              ? `${count.toLocaleString()} parts · MEASURE · click two points (vertex snap) · toggle off to clear`
              : `${count.toLocaleString()} parts · drag to orbit · click a member · ctrl/shift-click multi-select · double-click fly in`}
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
  fontWeight: 700, letterSpacing: "0.05em", cursor: "pointer",
};

const measureHud = {
  position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
  padding: "8px 16px", borderRadius: 999,
  background: "rgba(13,17,23,0.88)", border: "1px solid #f5d90a",
  color: "#f5d90a", fontFamily: "var(--font-mono)", fontSize: 13,
  fontWeight: 600, letterSpacing: "0.03em", whiteSpace: "nowrap",
  boxShadow: "0 6px 24px rgba(0,0,0,0.45)", pointerEvents: "none", zIndex: 3,
};
