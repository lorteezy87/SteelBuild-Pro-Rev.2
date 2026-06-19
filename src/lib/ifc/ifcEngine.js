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
      // Silence web-ifc's wasm console logging. Tekla exports routinely carry
      // self-intersecting composite curves (bolts/plates/complex profiles) that
      // web-ifc logs at [error] level once per referencing element — hundreds of
      // non-fatal lines that flood the console and bury real diagnostics. The app
      // detects genuine parse failures by part count (empty-state overlay +
      // persistModel guard) and Sentry captures real JS exceptions, so nothing
      // depends on this firehose. LOG_LEVEL_OFF (6) silences it.
      try { api.SetLogLevel(WebIFC.LogLevel.LOG_LEVEL_OFF); } catch { /* older web-ifc w/o SetLogLevel */ }
      return { api, WebIFC };
    })();
  }
  return enginePromise;
}
