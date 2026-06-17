/**
 * IfcModelViewer — the three.js scene host for the Detailing Control Center 3D
 * tab. Lazy-loaded (so web-ifc + three never touch the main bundle): given an
 * IFC ArrayBuffer, it renders the model, colors each member via `colorForGuid`,
 * fits the camera, and reports clicks through `onPick`.
 *
 * Owns no app data — it's a pure renderer over { buffer, colorForGuid, onPick }.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadIfcGeometry } from "@/lib/ifc/loadIfcGeometry";

const HIGHLIGHT = new THREE.Color("#f5d90a");

export default function IfcModelViewer({ buffer, colorFor, onPick, onSelect, onLoaded }) {
  const mountRef = useRef(null);
  const apiRef = useRef(null); // { scene, camera, renderer, controls, model, raf, ro }
  const selectedRef = useRef(new Map()); // expressID -> mesh (multi-select highlight)
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [count, setCount] = useState(0);

  // Scene setup + model load (once per buffer).
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !buffer) return undefined;
    let cancelled = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0d1117");
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1e6);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // fewer pixels to shade → smoother
    mount.appendChild(renderer.domElement);

    // Lighting tuned for the cheap Lambert material (no env map): sky/ground
    // hemisphere fill + a key directional for form + soft ambient.
    const hemi = new THREE.HemisphereLight(0xdbe7ff, 0x2b2f36, 1.0);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(1, 2.2, 1.4);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;      // stop dead on release — no inertia drift
    controls.rotateSpeed = 0.6;          // calmer orbit when looking through members
    controls.panSpeed = 0.8;
    controls.zoomSpeed = 1.0;            // steady zoom; double-click smoothly flies you in
    controls.zoomToCursor = true;        // zoom toward the cursor, not scene center
    controls.screenSpacePanning = true;  // pan in screen space (intuitive)

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      // updateStyle defaults true on purpose: with setPixelRatio(1.5) the draw
      // buffer is 1.5x, and WITHOUT updating the canvas CSS the element displays
      // at buffer size (1.5x its column) — overflowing onto the side panel so
      // the fab controls can't be clicked. Letting three set the CSS keeps the
      // canvas the container's size (sharp via pixelRatio, no overflow).
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    let tween = null; // smooth camera move { fromPos, toPos, fromTgt, toTgt, start, dur }
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
      // Dynamic near/far around the current view → crisp z-precision at any zoom
      // without the cost of a logarithmic depth buffer.
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

    apiRef.current = { scene, camera, renderer, controls, model: null, raf: 0, ro, flyTo, focusDist: 1 };

    loadIfcGeometry(buffer, { colorFor })
      .then((model) => {
        if (cancelled) { model.dispose(); return; }
        scene.add(model.group);
        apiRef.current.model = model;

        // Fit camera to the model bounds (reusable — also drives the Fit button).
        const box = new THREE.Box3().setFromObject(model.group);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const r = sphere.radius || 1;
        apiRef.current.modelRadius = r;    // drives the dynamic near/far in tick
        controls.minDistance = r * 0.01;   // close enough to inspect a member
        controls.maxDistance = r * 40;
        apiRef.current.focusDist = r * 0.18; // double-click framing distance
        const fitPos = new THREE.Vector3(sphere.center.x + r * 1.6, sphere.center.y + r * 1.2, sphere.center.z + r * 1.6);
        const fitView = (animate) => {
          if (animate) { apiRef.current.flyTo(sphere.center.clone(), fitPos.clone()); }
          else { controls.target.copy(sphere.center); camera.position.copy(fitPos); controls.update(); }
        };
        fitView(false);                     // initial: instant
        apiRef.current.fitView = () => fitView(true); // button: smooth

        // Ground grid at the model's base for spatial reference.
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
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      apiRef.current = null;
      selectedRef.current = new Map();
    };
  // colorForGuid handled by the recolor effect; reloading on it would be wasteful.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer]);

  // Recolor in place when the color mode / status data changes — no reload.
  // `status` is in the deps on purpose: the model loads ASYNC, so a colorFor
  // change that lands while the geometry is still parsing (e.g. the fab roster
  // arriving from the DB during a big-model parse on reload) hits a null
  // apiRef.current.model and no-ops. Without re-running when status flips to
  // "ready", the model stays painted with the stale colorFor captured at load
  // and the saved fab colors never appear — they only showed on a live assign
  // (model already loaded). Re-running on "ready" repaints with the latest.
  useEffect(() => {
    apiRef.current?.model?.recolor?.(colorFor);
  }, [colorFor, status]);

  // Click picking.
  useEffect(() => {
    const mount = mountRef.current;
    const ctx = apiRef.current;
    if (!mount || !ctx || status !== "ready") return undefined;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const onClick = (ev) => {
      const ctx2 = apiRef.current;
      const model = ctx2?.model;
      if (!model) return;
      const rect = ctx2.renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, ctx2.camera);
      const hits = raycaster.intersectObjects(model.group.children, false);

      // Ctrl / Cmd / Shift add-to-selection; a plain click replaces it.
      const additive = ev.ctrlKey || ev.metaKey || ev.shiftKey;
      const sel = selectedRef.current;
      const clearAll = () => { for (const m of sel.values()) m.material.emissive?.set("#000000"); sel.clear(); };

      if (!hits.length) {
        if (!additive) { clearAll(); onPick?.(null); onSelect?.([]); }
        return;
      }
      const mesh = hits[0].object;
      const { expressID } = mesh.userData || {};

      if (additive && sel.has(expressID)) {
        mesh.material.emissive?.set("#000000");   // toggle off
        sel.delete(expressID);
      } else {
        if (!additive) clearAll();
        sel.set(expressID, mesh);
        mesh.material.emissive?.copy(HIGHLIGHT).multiplyScalar(0.45);
      }

      onSelect?.([...sel.values()].map((m) => m.userData?.guid).filter(Boolean));
      if (sel.has(expressID)) model.pickInfo(expressID).then((info) => onPick?.(info));
      else onPick?.(null);
    };

    // Double-click flies the orbit pivot to the clicked point and steps the
    // camera halfway in — so you can keep moving deeper instead of stalling at
    // the model's center (the cause of "zoom slows then stops").
    const onDblClick = (ev) => {
      const ctx2 = apiRef.current;
      const model = ctx2?.model;
      if (!model) return;
      const rect = ctx2.renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, ctx2.camera);
      const hits = raycaster.intersectObjects(model.group.children, false);
      if (!hits.length) return;
      const p = hits[0].point;
      // Smoothly fly to frame the clicked point + re-pivot there (the instant
      // half-jump was the disorienting part). Keeps the current view direction.
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
  }, [status, onPick]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 420 }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      {status === "loading" && (
        <div style={overlay}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
            Loading model…
          </div>
        </div>
      )}
      {status === "error" && (
        <div style={overlay}>
          <div role="alert" style={{ maxWidth: 420, textAlign: "center", color: "var(--text-primary)", fontSize: 13 }}>
            Couldn't load the model: {error}
          </div>
        </div>
      )}
      {status === "ready" && (
        <>
          <button type="button" onClick={() => apiRef.current?.fitView?.()} title="Fit whole model in view" style={fitBtn}>
            Fit view
          </button>
          <div style={{ position: "absolute", left: 12, bottom: 10, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", pointerEvents: "none" }}>
            {count.toLocaleString()} parts · drag to orbit · click a member · ctrl/shift-click to multi-select · double-click to fly in
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
