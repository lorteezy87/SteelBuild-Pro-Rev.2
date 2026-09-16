import { describe, expect, it } from "vitest";
import {
  MIN_NODE_SIZE,
  boundsOf,
  clamp,
  distance,
  fromNormalized,
  midpoint,
  padRect,
  rect,
  rectContains,
  rectIntersects,
  resizeRect,
  snap,
  snapRect,
  toNormalized,
  translateRect,
} from "../geometry";

describe("clamp", () => {
  it("bounds a value", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("returns the minimum for a non-finite input rather than propagating NaN", () => {
    expect(clamp(Number.NaN, 2, 8)).toBe(2);
    expect(clamp(Number.POSITIVE_INFINITY, 2, 8)).toBe(8);
  });

  it("returns the minimum when the bounds are inverted", () => {
    expect(clamp(5, 10, 0)).toBe(10);
  });
});

describe("rectContains", () => {
  const r = rect(10, 10, 100, 50);

  it("includes the edges — a tap on a card's border selects the card", () => {
    expect(rectContains(r, { x: 10, y: 10 })).toBe(true);
    expect(rectContains(r, { x: 110, y: 60 })).toBe(true);
  });

  it("excludes points outside", () => {
    expect(rectContains(r, { x: 9.9, y: 30 })).toBe(false);
    expect(rectContains(r, { x: 60, y: 60.1 })).toBe(false);
  });
});

describe("rectIntersects", () => {
  it("counts touching edges as intersecting", () => {
    expect(rectIntersects(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(true);
  });

  it("is false for separated rectangles", () => {
    expect(rectIntersects(rect(0, 0, 10, 10), rect(10.5, 0, 10, 10))).toBe(false);
  });
});

describe("resizeRect", () => {
  it("floors each axis independently at MIN_NODE_SIZE", () => {
    const resized = resizeRect(rect(0, 0, 200, 200), -500, -10);
    expect(resized.w).toBe(MIN_NODE_SIZE);
    // The height shrank normally even though the width hit the floor.
    expect(resized.h).toBe(190);
  });

  it("leaves the origin alone", () => {
    const resized = resizeRect(rect(7, 9, 100, 100), 10, 10);
    expect(resized.x).toBe(7);
    expect(resized.y).toBe(9);
  });
});

describe("boundsOf", () => {
  it("returns null for an empty list — an empty board has no bounds", () => {
    expect(boundsOf([])).toBeNull();
  });

  it("wraps every rectangle", () => {
    expect(boundsOf([rect(0, 0, 10, 10), rect(50, -20, 10, 10)])).toEqual({
      x: 0,
      y: -20,
      w: 60,
      h: 30,
    });
  });
});

describe("snap", () => {
  it("rounds to the grid", () => {
    expect(snap(23, 10)).toBe(20);
    expect(snap(26, 10)).toBe(30);
  });

  it("is a pass-through when the grid is off", () => {
    expect(snap(23.7, 0)).toBe(23.7);
    expect(snap(23.7, -5)).toBe(23.7);
  });

  it("snaps only the origin of a rect, never its size", () => {
    expect(snapRect(rect(23, 26, 101, 57), 10)).toEqual({ x: 20, y: 30, w: 101, h: 57 });
  });
});

describe("normalized coordinates", () => {
  const sheet = rect(100, 200, 400, 300);

  it("round-trips a point", () => {
    const p = { x: 340, y: 275 };
    expect(fromNormalized(sheet, toNormalized(sheet, p))).toEqual(p);
  });

  it("keeps values outside 0..1 for margin callouts", () => {
    const n = toNormalized(sheet, { x: 60, y: 200 });
    expect(n.x).toBeLessThan(0);
    expect(n.y).toBe(0);
  });

  it("does not divide by zero on a degenerate sheet", () => {
    expect(toNormalized(rect(0, 0, 0, 0), { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
  });
});

describe("misc helpers", () => {
  it("translates without resizing", () => {
    expect(translateRect(rect(1, 2, 3, 4), 10, 20)).toEqual({ x: 11, y: 22, w: 3, h: 4 });
  });

  it("pads on every side", () => {
    expect(padRect(rect(10, 10, 10, 10), 5)).toEqual({ x: 5, y: 5, w: 20, h: 20 });
  });

  it("measures distance and midpoint", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
});
