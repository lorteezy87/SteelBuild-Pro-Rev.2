import { errorOverlayCode } from "./ErrorOverlay.js";
import type { Plugin } from "vite";

export function errorOverlayPlugin() {
  return {
    name: "error-overlay",
    apply: (config) => config.mode === "development",
    transform(code, id, opts = {}) {
      if (opts?.ssr) return;

      if (!id.includes("vite/dist/client/client.mjs")) return;

      return code.replace(
        "class ErrorOverlay",
        errorOverlayCode + "\nclass OldErrorOverlay"
      );
    },
  } as Plugin;
}
