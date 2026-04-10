// Compatibility shim for web-ifc-three.
//
// web-ifc-three@0.0.125 imports `mergeBufferGeometries` from
// `three/examples/jsm/utils/BufferGeometryUtils`, but in three@0.154+ that
// function was renamed to `mergeGeometries`. This shim re-exports the real
// module and adds the legacy name back as an alias, so web-ifc-three keeps
// working against the modern three we have installed.
//
// Wired up in vite.config.js via `resolve.alias`.
import * as Utils from "three/examples/jsm/utils/BufferGeometryUtils.js";

export * from "three/examples/jsm/utils/BufferGeometryUtils.js";
export const mergeBufferGeometries =
  Utils.mergeGeometries || Utils.mergeBufferGeometries;
export const mergeBufferAttributes =
  Utils.mergeAttributes || Utils.mergeBufferAttributes;
