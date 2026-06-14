/**
 * ifcEngine.js — one lazily-initialised web-ifc engine, shared by the viewer
 * (loadIfcGeometry) and the roster extractor (extractIfcRoster). Kept in its own
 * module so both pull web-ifc through the same singleton + the same lazy chunk.
 *
 * Single-threaded wasm served from /wasm/ (the copyWebIfcWasm vite plugin keeps
 * it version-matched) — no SharedArrayBuffer / cross-origin-isolation needed.
 */
let enginePromise = null;

export async function getEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const WebIFC = await import("web-ifc");
      const api = new WebIFC.IfcAPI();
      api.SetWasmPath("/wasm/");
      await api.Init();
      return { api, WebIFC };
    })();
  }
  return enginePromise;
}
