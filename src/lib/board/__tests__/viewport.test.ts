import { describe, expect, it } from "vitest";
import { rect } from "../geometry";
import {
  DEFAULT_VIEWPORT,
  MAX_SCALE,
  MIN_SCALE,
  centerOn,
  clampScale,
  fitToRect,
  panByScreen,
  pinch,
  screenToWorld,
  viewportsEqual,
  visibleWorldRect,
  worldRectToScreen,
  worldToScreen,
  zoomAt,
  zoomToAt,
} from "../viewport";

const SIZE = { width: 1000, height: 800 };

describe("world/screen conversion", () => {
  it("round-trips a point at any scale", () => {
    const vp = { x: -120, y: 40, scale: 2.5 };
    const world = { x: 33.25, y: -8.5 };
    const back = screenToWorld(vp, worldToScreen(vp, world));
    expect(back.x).toBeCloseTo(world.x, 10);
    expect(back.y).toBeCloseTo(world.y, 10);
  });

  it("puts the viewport origin at the element's top-left", () => {
    expect(worldToScreen({ x: 50, y: 60, scale: 2 }, { x: 50, y: 60 })).toEqual({ x: 0, y: 0 });
  });

  it("scales a rectangle's size but not its shape", () => {
    const screen = worldRectToScreen({ x: 0, y: 0, scale: 0.5 }, rect(100, 200, 40, 80));
    expect(screen).toEqual({ x: 50, y: 100, w: 20, h: 40 });
  });
});

describe("clampScale", () => {
  it("holds the supported range", () => {
    expect(clampScale(999)).toBe(MAX_SCALE);
    expect(clampScale(0.0001)).toBe(MIN_SCALE);
  });

  it("falls back to 1:1 for a nonsense scale rather than producing a NaN transform", () => {
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(0)).toBe(1);
    expect(clampScale(-2)).toBe(1);
  });
});

describe("panByScreen", () => {
  it("moves the world under the finger by the screen delta", () => {
    const vp = { x: 0, y: 0, scale: 1 };
    const panned = panByScreen(vp, 100, 50);
    // Dragging right shows content further left, so the origin moves left.
    expect(panned).toEqual({ x: -100, y: -50, scale: 1 });
  });

  it("covers the same screen distance whatever the zoom", () => {
    const zoomedIn = panByScreen({ x: 0, y: 0, scale: 4 }, 100, 0);
    expect(zoomedIn.x).toBe(-25);
    // 25 world units at 4x is the same 100 screen pixels the finger travelled.
    expect(worldToScreen(zoomedIn, { x: 0, y: 0 }).x).toBe(100);
  });
});

describe("zoomAt", () => {
  it("keeps the world point under the anchor fixed", () => {
    const vp = { x: 10, y: 20, scale: 1 };
    const anchor = { x: 300, y: 400 };
    const before = screenToWorld(vp, anchor);
    const after = screenToWorld(zoomAt(vp, anchor, 2.5), anchor);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it("returns the same viewport at a limit rather than drifting by the clamped remainder", () => {
    const atMax = { x: 5, y: 5, scale: MAX_SCALE };
    expect(zoomAt(atMax, { x: 100, y: 100 }, 2)).toBe(atMax);
  });

  it("zooms to an absolute scale about the anchor", () => {
    const vp = { x: 0, y: 0, scale: 1 };
    const anchor = { x: 200, y: 100 };
    const zoomed = zoomToAt(vp, anchor, 3);
    expect(zoomed.scale).toBe(3);
    expect(screenToWorld(zoomed, anchor).x).toBeCloseTo(200, 10);
  });
});

describe("pinch", () => {
  it("applies the spread ratio and the centre movement together", () => {
    const vp = { x: 0, y: 0, scale: 1 };
    const next = pinch(
      vp,
      { center: { x: 400, y: 300 }, distance: 100 },
      { center: { x: 440, y: 300 }, distance: 200 },
    );
    expect(next.scale).toBe(2);
    // The world point that was under the first centre is now under the second.
    const moved = worldToScreen(next, screenToWorld(vp, { x: 400, y: 300 }));
    expect(moved.x).toBeCloseTo(440, 6);
    expect(moved.y).toBeCloseTo(300, 6);
  });

  it("degrades to a two-finger pan when the fingers start together", () => {
    const vp = { x: 0, y: 0, scale: 1 };
    const next = pinch(
      vp,
      { center: { x: 10, y: 10 }, distance: 0 },
      { center: { x: 30, y: 10 }, distance: 0 },
    );
    expect(next.scale).toBe(1);
    expect(next.x).toBe(-20);
  });
});

describe("fitToRect", () => {
  it("frames the target with padding and centres it", () => {
    const target = rect(0, 0, 400, 400);
    const vp = fitToRect(target, SIZE, 50);
    const screen = worldRectToScreen(vp, target);
    expect(screen.w).toBeLessThanOrEqual(SIZE.width - 100 + 0.001);
    expect(screen.h).toBeLessThanOrEqual(SIZE.height - 100 + 0.001);
    // Equal slack left and right means it is centred.
    expect(screen.x).toBeCloseTo(SIZE.width - (screen.x + screen.w), 6);
    expect(screen.y).toBeCloseTo(SIZE.height - (screen.y + screen.h), 6);
  });

  it("never exceeds the zoom limits on a tiny target", () => {
    expect(fitToRect(rect(0, 0, 1, 1), SIZE).scale).toBe(MAX_SCALE);
  });

  it("centres at 1:1 on a zero-area target instead of producing a NaN transform", () => {
    const vp = fitToRect(rect(500, 500, 0, 0), SIZE);
    expect(vp.scale).toBe(1);
    expect(Number.isFinite(vp.x)).toBe(true);
    expect(worldToScreen(vp, { x: 500, y: 500 })).toEqual({ x: 500, y: 400 });
  });
});

describe("visibleWorldRect", () => {
  it("reports the world window, which grows as you zoom out", () => {
    expect(visibleWorldRect({ x: 10, y: 20, scale: 2 }, SIZE)).toEqual({
      x: 10,
      y: 20,
      w: 500,
      h: 400,
    });
  });
});

describe("centerOn", () => {
  it("puts the point at the middle of the element without changing zoom", () => {
    const vp = centerOn({ x: 0, y: 0, scale: 2 }, { x: 100, y: 100 }, SIZE);
    expect(vp.scale).toBe(2);
    expect(worldToScreen(vp, { x: 100, y: 100 })).toEqual({ x: 500, y: 400 });
  });
});

describe("viewportsEqual", () => {
  it("tolerates floating-point noise", () => {
    expect(viewportsEqual(DEFAULT_VIEWPORT, { x: 1e-9, y: 0, scale: 1 })).toBe(true);
    expect(viewportsEqual(DEFAULT_VIEWPORT, { x: 0.5, y: 0, scale: 1 })).toBe(false);
  });
});
