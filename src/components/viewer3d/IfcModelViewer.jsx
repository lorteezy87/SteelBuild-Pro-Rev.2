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

export default function IfcModelViewer({ buffer, colorForGuid, onPick, onLoaded }) {
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
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(1, 2, 1.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-1, -0.5, -1);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

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

    loadIfcGeometry(buffer, { colorForGuid })
      .then((model) => {
        if (cancelled) { model.dispose(); return; }
        scene.add(model.group);
        apiRef.current.model = model;

        // Fit camera to the model bounds.
        const box = new THREE.Box3().setFromObject(model.group);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const r = sphere.radius || 1;
        controls.target.copy(sphere.center);
        camera.position.set(sphere.center.x + r * 1.6, sphere.center.y + r * 1.2, sphere.center.z + r * 1.6);
        camera.near = r / 100; camera.far = r * 100; camera.updateProjectionMatrix();
        controls.update();

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
      apiRef.current?.model?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      apiRef.current = null;
      pickedRef.current = null;
    };
  // colorForGuid handled by the recolor effect; reloading on it would be wasteful.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer]);

  // Recolor in place when status data changes — no reload.
  useEffect(() => {
    apiRef.current?.model?.recolor?.(colorForGuid);
  }, [colorForGuid]);

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

    const el = ctx.renderer.domElement;
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
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
        <div style={{ position: "absolute", left: 12, bottom: 10, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", pointerEvents: "none" }}>
          {count.toLocaleString()} parts · drag to orbit · click a member
        </div>
      )}
    </div>
  );
}

const overlay = {
  position: "absolute", inset: 0, display: "flex", alignItems: "center",
  justifyContent: "center", background: "rgba(13,17,23,0.6)",
};
