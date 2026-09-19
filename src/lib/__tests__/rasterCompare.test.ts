// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { composeCompare, drawRaster, tintCanvas, NEW_TINT, OLD_TINT } from "../rasterCompare";

/**
 * jsdom has no 2D rendering backend, so `getContext("2d")` returns null and no
 * pixels exist to inspect. What these tests pin instead is the thing that
 * actually decides whether the overlay is readable: the sequence of canvas
 * operations, and the rule that the output is sized to the larger of the two
 * pages.
 *
 * That is the part worth guarding. The compositing order is not arbitrary —
 * "lighten" turns ink into the tint while leaving paper white, and the
 * subsequent "multiply" is what makes shared linework read dark instead of
 * one revision simply painting over the other.
 */

interface Op {
  op: string;
  args: unknown[];
}

function stubContexts(): { ops: Op[]; canvases: HTMLCanvasElement[] } {
  const ops: Op[] = [];
  const canvases: HTMLCanvasElement[] = [];

  const record =
    (op: string) =>
    (...args: unknown[]) => {
      ops.push({ op, args });
    };

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    canvases.push(this);
    const ctx: Record<string, unknown> = {
      drawImage: record("drawImage"),
      fillRect: record("fillRect"),
      beginPath: record("beginPath"),
      rect: record("rect"),
      clip: record("clip"),
      save: record("save"),
      restore: record("restore"),
    };
    // Track assignments to the two properties that carry the compositing
    // intent, so the order of "lighten" / "multiply" is observable.
    return new Proxy(ctx, {
      set(target, prop, value) {
        ops.push({ op: `set:${String(prop)}`, args: [value] });
        target[String(prop)] = value;
        return true;
      },
      get: (target, prop) => target[String(prop)],
    }) as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);

  return { ops, canvases };
}

function raster(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

afterEach(() => vi.restoreAllMocks());

describe("tintCanvas", () => {
  it("tints with lighten so ink takes the colour and paper stays white", () => {
    const { ops } = stubContexts();

    const out = tintCanvas(raster(120, 90), OLD_TINT);

    expect(out.width).toBe(120);
    expect(out.height).toBe(90);
    expect(ops.map((o) => o.op)).toEqual([
      "drawImage",
      "set:globalCompositeOperation",
      "set:fillStyle",
      "fillRect",
    ]);
    expect(ops[1].args[0]).toBe("lighten");
    expect(ops[2].args[0]).toBe(OLD_TINT);
  });

  it("returns a new canvas rather than mutating the source", () => {
    stubContexts();
    const src = raster(10, 10);
    expect(tintCanvas(src, NEW_TINT)).not.toBe(src);
  });
});

describe("composeCompare overlay", () => {
  it("tints old red and new blue, then multiplies them together", () => {
    const { ops } = stubContexts();

    composeCompare({
      canvas: raster(1, 1),
      oldRaster: raster(100, 80),
      newRaster: raster(100, 80),
      mode: "overlay",
      offset: { x: 0, y: 0 },
      wipePct: 50,
    });

    // Paper first, then the old tint, then the new tint — in that order.
    const tints = ops.filter((o) => o.op === "set:fillStyle").map((o) => o.args[0]);
    expect(tints).toEqual(["#FFFFFF", OLD_TINT, NEW_TINT]);

    const composites = ops.filter((o) => o.op === "set:globalCompositeOperation").map((o) => o.args[0]);
    expect(composites).toEqual(["lighten", "multiply", "lighten", "source-over"]);
  });

  it("applies the alignment nudge to the NEW layer only", () => {
    const { ops } = stubContexts();

    composeCompare({
      canvas: raster(1, 1),
      oldRaster: raster(100, 80),
      newRaster: raster(100, 80),
      mode: "overlay",
      offset: { x: 7, y: -3 },
      wipePct: 50,
    });

    const draws = ops.filter((o) => o.op === "drawImage");
    // Each tintCanvas draws its source at 0,0; the two composite draws are the
    // last one from each tint plus the two into the output canvas.
    const intoOutput = draws.slice(-2);
    expect(intoOutput[0].args.slice(1)).toEqual([0, 0]);
    expect(intoOutput[1].args.slice(1)).toEqual([7, -3]);
  });

  // A reissued sheet printed at a different scale must not be cropped to the
  // older print's extents — that hides a change instead of showing it.
  it("sizes the output to the larger of the two pages on each axis", () => {
    stubContexts();
    const out = raster(1, 1);

    composeCompare({
      canvas: out,
      oldRaster: raster(1800, 1200),
      newRaster: raster(1600, 1400),
      mode: "overlay",
      offset: { x: 0, y: 0 },
      wipePct: 50,
    });

    expect(out.width).toBe(1800);
    expect(out.height).toBe(1400);
  });
});

describe("composeCompare wipe", () => {
  it("clips the NEW layer to the left of the split and draws a divider", () => {
    const { ops } = stubContexts();

    composeCompare({
      canvas: raster(1, 1),
      oldRaster: raster(1000, 500),
      newRaster: raster(1000, 500),
      mode: "wipe",
      offset: { x: 0, y: 0 },
      wipePct: 40,
    });

    const clipRect = ops.find((o) => o.op === "rect");
    expect(clipRect?.args).toEqual([0, 0, 400, 500]);

    // Divider sits on the split, 2px wide, full height.
    const fills = ops.filter((o) => o.op === "fillRect");
    expect(fills[fills.length - 1].args).toEqual([399, 0, 2, 500]);

    expect(ops.some((o) => o.op === "save")).toBe(true);
    expect(ops.some((o) => o.op === "restore")).toBe(true);
  });

  it("never composites in wipe mode — the layers must stay opaque", () => {
    const { ops } = stubContexts();

    composeCompare({
      canvas: raster(1, 1),
      oldRaster: raster(200, 100),
      newRaster: raster(200, 100),
      mode: "wipe",
      offset: { x: 0, y: 0 },
      wipePct: 50,
    });

    expect(ops.filter((o) => o.op === "set:globalCompositeOperation")).toEqual([]);
  });
});

describe("guards", () => {
  it("does nothing when either raster is missing", () => {
    const { ops } = stubContexts();

    composeCompare({
      canvas: raster(1, 1),
      oldRaster: raster(10, 10),
      newRaster: null,
      mode: "overlay",
      offset: { x: 0, y: 0 },
      wipePct: 50,
    });

    expect(ops).toEqual([]);
  });

  it("drawRaster sizes the target to the source", () => {
    stubContexts();
    const target = raster(1, 1);

    drawRaster(target, raster(640, 480));

    expect(target.width).toBe(640);
    expect(target.height).toBe(480);
  });

  it("drawRaster tolerates a canvas that is not mounted yet", () => {
    stubContexts();
    expect(() => drawRaster(null, raster(10, 10))).not.toThrow();
  });
});
