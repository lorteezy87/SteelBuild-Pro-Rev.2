import { errorOverlayCode } from "./ErrorOverlay.js";
export function errorOverlayPlugin() {
    return {
        name: "error-overlay",
        apply: (config) => config.mode === "development",
        transform(code, id, opts = {}) {
            if (opts?.ssr)
                return;
            if (!id.includes("vite/dist/client/client.mjs"))
                return;
            return code.replace("class ErrorOverlay", errorOverlayCode + "\nclass OldErrorOverlay");
        },
    };
}
//# sourceMappingURL=error-overlay-plugin.js.map