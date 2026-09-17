import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// REGRESSION GUARD — the viewer's ctrl/pinch zoom must stay on a NATIVE wheel
// listener registered with { passive: false }.
//
// React attaches `onWheel` as a passive root listener, where preventDefault()
// silently does nothing. The browser then runs its own ctrl+wheel page zoom at
// the same moment the app updates `zoom`, and the viewer visibly shakes. A
// touchpad/touchscreen pinch IS a ctrl+wheel event, so this fires constantly
// for field users on tablets.
//
// This is a source-level assertion on purpose: the failure mode is a listener
// REGISTRATION detail that a rendered-component test cannot observe, and the
// pattern has been reintroduced before by "simplifying" back to onWheel.

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(here, "../../DrawingViewer.jsx"),
  "utf-8",
);

// Strip comments so the guard reasons about code, not the warnings that
// explain it (both mention onWheel by name).
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("DrawingViewer wheel zoom registration", () => {
  it("does not hand zoom to React's passive onWheel prop", () => {
    expect(code).not.toMatch(/onWheel\s*=/);
  });

  it("registers a native wheel listener", () => {
    expect(code).toMatch(/addEventListener\(\s*["']wheel["']/);
  });

  it("registers that wheel listener as non-passive", () => {
    const wheelIndex = code.search(/addEventListener\(\s*["']wheel["']/);
    expect(wheelIndex).toBeGreaterThan(-1);
    // The options object follows the handler in the same call.
    const call = code.slice(wheelIndex, wheelIndex + 400);
    expect(call).toMatch(/passive\s*:\s*false/);
  });

  it("still calls preventDefault in the zoom handler", () => {
    expect(code).toMatch(/preventDefault\(\)/);
  });
});
