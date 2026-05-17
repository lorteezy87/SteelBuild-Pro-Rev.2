// Polyfill WebSocket for Node < 22 (Supabase Realtime requires it)
import WebSocket from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket;
}

// Vitest setup — provide a minimal `window` stub so modules that read
// browser globals at import time (e.g. `window.self !== window.top` in
// src/lib/utils.js) can be loaded under Node's default test environment
// without pulling in jsdom.
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
  globalThis.window.self = globalThis;
  globalThis.window.top = globalThis;
  globalThis.window.location = { href: "http://localhost/", origin: "http://localhost" };
  globalThis.window.addEventListener = () => {};
  globalThis.window.removeEventListener = () => {};
  globalThis.window.requestIdleCallback = (fn) => setTimeout(fn, 0);
}

if (typeof globalThis.document === "undefined") {
  const stubElement = () => ({
    setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, removeChild() {},
    addEventListener() {}, removeEventListener() {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    querySelector: () => null, querySelectorAll: () => [],
  });
  globalThis.document = {
    title: "",
    documentElement: stubElement(),
    body: stubElement(),
    head: stubElement(),
    createElement: stubElement,
    createTextNode: () => ({ nodeValue: "" }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
  };
}

// react-dom probes navigator.userAgent during import; make sure it's defined.
if (typeof globalThis.navigator === "undefined") {
  globalThis.navigator = { userAgent: "node", platform: "node" };
}

if (typeof globalThis.localStorage === "undefined") {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
}
