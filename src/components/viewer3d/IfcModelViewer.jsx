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
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadIfcGeometry } from "@/lib/ifc/loadIfcGeometry";

const HIGHLIGHT = new THREE.Color("#f5d90a");

export default function IfcModelViewer({ buffer, colorFor, onPick, onLoaded }) {
  const mountRef = useRef(null);
  const apiRef = useRef(null); // { scene, camera, renderer, controls, model, raf, ro }
  const pickedRef = useRef(null); // { mesh, color }
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
    // logarithmicDepthBuffer: large mm-scale models span a huge depth range; this
    // keeps z-precision when zoomed right up to a member (no flicker/clipping).
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    // Neutral studio environment → soft, even reflections on the steel material
    // (PBR Standard material reads as flat gray without one). Generated, no asset.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // Sky/ground hemisphere for fill + a key directional for form + soft ambient.
    const hemi = new THREE.HemisphereLight(0xdbe7ff, 0x2b2f36, 0.85);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1, 2.2, 1.4);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;        // settles fast — tighter, less floaty glide
    controls.rotateSpeed = 0.6;          // calmer orbit when looking through members
    controls.panSpeed = 0.8;
    controls.zoomSpeed = 1.5;            // brisk zoom; double-click flies the pivot in
    controls.zoomToCursor = true;        // zoom toward the cursor, not scene center
    controls.screenSpacePanning = true;  // pan in screen space (intuitive)

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
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };

    apiRef.current = { scene, camera, renderer, controls, model: null, raf: 0, ro };

    loadIfcGeometry(buffer, { colorFor })
      .then((model) => {
        if (cancelled) { model.dispose(); return; }
        scene.add(model.group);
        apiRef.current.model = model;

        // Fit camera to the model bounds (reusable — also drives the Fit button).
        const box = new THREE.Box3().setFromObject(model.group);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const r = sphere.radius || 1;
        camera.near = r / 1000; camera.far = r * 100; camera.updateProjectionMatrix();
        controls.minDistance = r * 0.002;  // lets you zoom right up to a single member
        controls.maxDistance = r * 60;
        const fitView = () => {
          controls.target.copy(sphere.center);
          camera.position.set(sphere.center.x + r * 1.6, sphere.center.y + r * 1.2, sphere.center.z + r * 1.6);
          controls.update();
        };
        fitView();
        apiRef.current.fitView = fitView;

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
      scene.environment?.dispose?.();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      apiRef.current = null;
      pickedRef.current = null;
    };
  // colorForGuid handled by the recolor effect; reloading on it would be wasteful.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer]);

  // Recolor in place when the color mode / status data changes — no reload.
  useEffect(() => {
    apiRef.current?.model?.recolor?.(colorFor);
  }, [colorFor]);

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

      // restore previous highlight
      if (pickedRef.current) {
        pickedRef.current.mesh.material.emissive?.set("#000000");
        pickedRef.current = null;
      }
      if (!hits.length) { onPick?.(null); return; }
      const mesh = hits[0].object;
      mesh.material.emissive?.copy(HIGHLIGHT).multiplyScalar(0.45);
      pickedRef.current = { mesh };
      const { expressID } = mesh.userData || {};
      model.pickInfo(expressID).then((info) => onPick?.(info));
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
      ctx2.controls.target.copy(p);
      ctx2.camera.position.lerp(p, 0.5);
      ctx2.controls.update();
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
            {count.toLocaleString()} parts · drag to orbit · scroll to zoom · double-click to fly in
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
