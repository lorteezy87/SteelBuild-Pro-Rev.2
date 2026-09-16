import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIMPLIFY_TOLERANCE,
  MIN_STROKE_LENGTH,
  isKeepableStroke,
  pointsBounds,
  simplifyStroke,
  strokeLength,
  strokePath,
  strokesBounds,
} from "../ink";
import type { InkStroke } from "../types";

describe("simplifyStroke", () => {
  it("collapses a straight run to its endpoints", () => {
    const straight = [0, 0, 10, 0, 20, 0, 30, 0, 40, 0];
    expect(simplifyStroke(straight, 1)).toEqual([0, 0, 40, 0]);
  });

  it("never drops a point further from the chord than the tolerance", () => {
    // The spike at (20, 30) is the point the whole stroke is about. Its
    // neighbours survive too, and correctly so: once the spike is kept, they sit
    // far off the chords either side of it.
    const spiked = [0, 0, 10, 0, 20, 30, 30, 0, 40, 0];
    const simplified = simplifyStroke(spiked, 1);
    expect(simplified).toEqual(spiked);
  });

  it("drops the near-collinear samples around a gentle curve", () => {
    const gentle: number[] = [];
    for (let i = 0; i <= 40; i += 1) gentle.push(i, (i * i) / 400);
    const simplified = simplifyStroke(gentle, 1);
    expect(simplified.length).toBeLessThan(gentle.length / 2);
    // The extremes are never candidates for removal.
    expect(simplified.slice(0, 2)).toEqual([0, 0]);
    expect(simplified.slice(-2)).toEqual([40, 4]);
  });

  it("keeps everything when simplification is off", () => {
    const points = [0, 0, 10, 0, 20, 0];
    expect(simplifyStroke(points, 0)).toEqual(points);
  });

  it("leaves a one- or two-point stroke alone", () => {
    expect(simplifyStroke([1, 2])).toEqual([1, 2]);
    expect(simplifyStroke([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it("always keeps the first and last sample", () => {
    const wobble = Array.from({ length: 200 }, (_, i) => [i, Math.sin(i / 8) * 0.2]).flat();
    const simplified = simplifyStroke(wobble, DEFAULT_SIMPLIFY_TOLERANCE);
    expect(simplified.slice(0, 2)).toEqual(wobble.slice(0, 2));
    expect(simplified.slice(-2)).toEqual(wobble.slice(-2));
    expect(simplified.length).toBeLessThan(wobble.length);
  });

  it("survives a long near-straight stroke with one spike without blowing the stack", () => {
    const points: number[] = [];
    for (let i = 0; i < 20_000; i += 1) points.push(i, i === 10_000 ? 500 : 0);
    const simplified = simplifyStroke(points, 1);
    expect(simplified).toContain(500);
    expect(simplified.length).toBeLessThan(40);
  });
});

describe("strokePath", () => {
  it("is empty for no points", () => {
    expect(strokePath([])).toBe("");
  });

  it("draws a dot as a zero-length line so the round cap shows it", () => {
    expect(strokePath([5, 6])).toBe("M 5 6 L 5 6");
  });

  it("smooths through midpoints and ends on the last sample", () => {
    const d = strokePath([0, 0, 10, 10, 20, 0]);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d).toContain("Q 10 10");
    expect(d.endsWith("L 20 0")).toBe(true);
  });
});

describe("bounds", () => {
  it("wraps a point list", () => {
    expect(pointsBounds([0, 0, 10, 20, -5, 5])).toEqual({ x: -5, y: 0, w: 15, h: 20 });
  });

  it("is null with no points", () => {
    expect(pointsBounds([])).toBeNull();
    expect(strokesBounds([])).toBeNull();
  });

  it("grows by half the widest stroke, so selection does not clip the drawn line", () => {
    const strokes: InkStroke[] = [
      { points: [0, 0, 10, 10], width: 8, color: "neutral" },
      { points: [20, 20, 30, 30], width: 2, color: "neutral" },
    ];
    expect(strokesBounds(strokes)).toEqual({ x: -4, y: -4, w: 38, h: 38 });
  });
});

describe("keepable strokes", () => {
  it("measures the drawn length", () => {
    expect(strokeLength([0, 0, 3, 4])).toBe(5);
    expect(strokeLength([0, 0])).toBe(0);
  });

  it("rejects a tap that slid a pixel while panning", () => {
    expect(isKeepableStroke([0, 0])).toBe(false);
    expect(isKeepableStroke([0, 0, 1, 0])).toBe(false);
  });

  it("keeps a real mark", () => {
    expect(isKeepableStroke([0, 0, MIN_STROKE_LENGTH + 1, 0])).toBe(true);
  });
});
