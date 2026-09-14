import { describe, expect, it } from "vitest";
import {
  acceptPointer,
  appendPoint,
  deserializeInk,
  emptyInk,
  eraseStrokesAt,
  isLikelyPalm,
  isPencilDoubleTap,
  isTapStroke,
  parseInk,
  pointFromPointer,
  pushStroke,
  shouldKeepPoint,
  smoothPressure,
  speedFactor,
  strokeWidth,
  undoStroke,
} from "../engine";
import type { InkStroke } from "../types";

const pt = (x: number, y: number, p = 0.5): ReturnType<typeof pointFromPointer> =>
  pointFromPointer({ clientX: x, clientY: y, pressure: p, timeStamp: 1 }, { left: 0, top: 0 });

const stroke = (points: Array<[number, number]>, tool: InkStroke["tool"] = "pen"): InkStroke => ({
  id: "s1",
  tool,
  color: "#111",
  size: 3,
  points: points.map(([x, y]) => pt(x, y)),
});

describe("pointFromPointer", () => {
  it("maps client coords into canvas space and keeps pressure", () => {
    const p = pointFromPointer(
      { clientX: 120, clientY: 80, pressure: 0.8, tiltX: 12, timeStamp: 9 },
      { left: 20, top: 10 },
    );
    expect(p.x).toBe(100);
    expect(p.y).toBe(70);
    expect(p.p).toBeCloseTo(0.8);
    expect(p.tiltX).toBe(12);
  });

  it("treats zero pressure as a mid default so mouse still draws", () => {
    expect(pointFromPointer({ clientX: 1, clientY: 1, pressure: 0 }, { left: 0, top: 0 }).p).toBe(0.5);
  });
});

describe("strokeWidth", () => {
  it("grows with pressure and is broader for highlighter / eraser", () => {
    const light = strokeWidth(pt(0, 0, 0.1), "pen", 3);
    const hard = strokeWidth(pt(0, 0, 1), "pen", 3);
    expect(hard).toBeGreaterThan(light);
    expect(strokeWidth(pt(0, 0, 0.5), "highlighter", 3)).toBeGreaterThan(
      strokeWidth(pt(0, 0, 0.5), "pen", 3),
    );
    expect(strokeWidth(pt(0, 0, 0.5), "eraser", 3)).toBeGreaterThan(10);
  });
});

describe("appendPoint", () => {
  it("drops micro-moves so a 240Hz pencil does not explode the stroke", () => {
    let s = stroke([[0, 0]]);
    s = appendPoint(s, pt(0.2, 0.1));
    expect(s.points).toHaveLength(1);
    s = appendPoint(s, pt(8, 0));
    expect(s.points).toHaveLength(2);
  });

  it("keeps the first point always", () => {
    expect(shouldKeepPoint(null, pt(0, 0))).toBe(true);
  });
});

describe("erase + undo", () => {
  it("removes only strokes near the eraser samples", () => {
    const doc = {
      ...emptyInk(),
      strokes: [stroke([[10, 10], [20, 10]]), stroke([[200, 200], [210, 200]])],
    };
    const { next, removed } = eraseStrokesAt(doc, [{ x: 12, y: 10 }], 8);
    expect(removed).toHaveLength(1);
    expect(next.strokes).toHaveLength(1);
    expect(next.strokes[0].points[0].x).toBe(200);
  });

  it("undo pops the last stroke and is a no-op on empty ink", () => {
    const one = pushStroke(emptyInk(), stroke([[1, 1]]));
    const undone = undoStroke(one);
    expect(undone.popped?.id).toBe("s1");
    expect(undone.next.strokes).toHaveLength(0);
    expect(undoStroke(emptyInk()).popped).toBeNull();
  });
});

describe("palm rejection + double tap", () => {
  it("lets the pencil through and blocks a palm after a recent pen", () => {
    expect(acceptPointer({ pointerType: "pen", penSeenAt: 1, now: 10, palmReject: true })).toBe(true);
    expect(
      acceptPointer({ pointerType: "touch", penSeenAt: 1000, now: 1500, palmReject: true }),
    ).toBe(false);
    expect(
      acceptPointer({ pointerType: "touch", penSeenAt: 1000, now: 9000, palmReject: true }),
    ).toBe(true);
    expect(
      acceptPointer({ pointerType: "mouse", penSeenAt: 1, now: 10, palmReject: true }),
    ).toBe(true);
  });

  it("detects a Pencil double-tap (quick tap, little movement)", () => {
    expect(isPencilDoubleTap({ t: 100, x: 10, y: 10 }, { t: 280, x: 14, y: 11 })).toBe(true);
    expect(isPencilDoubleTap({ t: 100, x: 10, y: 10 }, { t: 900, x: 14, y: 11 })).toBe(false);
    expect(isPencilDoubleTap({ t: 100, x: 10, y: 10 }, { t: 200, x: 80, y: 80 })).toBe(false);
  });

  it("never lets a touch interrupt a live pen stroke — even with palm rejection OFF", () => {
    // The palm landing mid-word. There is no reading where this should draw.
    expect(
      acceptPointer({
        pointerType: "touch",
        penSeenAt: null,
        now: 0,
        palmReject: false,
        activeStrokePointerType: "pen",
      }),
    ).toBe(false);
  });

  it("blocks the palm that lands BEFORE the first pen contact", () => {
    // penSeenAt is null on the very first stroke, so the old recency window
    // accepted this — the palm drew before the pencil ever touched down.
    expect(
      acceptPointer({
        pointerType: "touch",
        penSeenAt: null,
        now: 0,
        palmReject: true,
        width: 42,
        height: 50,
      }),
    ).toBe(false);
  });

  it("keeps rejecting the palm after a long pause once a pencil is known", () => {
    // Old behaviour: touch became drawable again 4s after the last pen event,
    // so pausing to think re-enabled palm drawing mid-page.
    expect(
      acceptPointer({
        pointerType: "touch",
        penSeenAt: 1000,
        now: 60_000,
        palmReject: true,
        penCapable: true,
      }),
    ).toBe(false);
  });

  it("still lets a finger draw on a device that has never seen a pencil", () => {
    expect(
      acceptPointer({ pointerType: "touch", penSeenAt: null, now: 0, palmReject: true, width: 12 }),
    ).toBe(true);
  });

  it("keeps the mouse drawing on desktop regardless", () => {
    expect(
      acceptPointer({ pointerType: "mouse", penSeenAt: 1, now: 10, palmReject: true, penCapable: true }),
    ).toBe(true);
  });

  it("isLikelyPalm keys off contact size, and never fires for pen", () => {
    expect(isLikelyPalm({ pointerType: "touch", width: 40, height: 30 })).toBe(true);
    expect(isLikelyPalm({ pointerType: "touch", width: 10, height: 10 })).toBe(false);
    expect(isLikelyPalm({ pointerType: "pen", width: 99, height: 99 })).toBe(false);
    // Safari does not always populate geometry — absent values must not reject.
    expect(isLikelyPalm({ pointerType: "touch" })).toBe(false);
  });
});

describe("isTapStroke — guards the double-tap gesture", () => {
  const at = (x: number, y: number, t: number) => ({
    ...pointFromPointer({ clientX: x, clientY: y, pressure: 0.5, timeStamp: t }, { left: 0, top: 0 }),
  });

  it("accepts a real tap", () => {
    expect(isTapStroke({ points: [at(10, 10, 0), at(11, 10, 40)] })).toBe(true);
  });

  it("rejects the stem of an 'i' — the case that used to toggle the eraser", () => {
    expect(isTapStroke({ points: [at(10, 10, 0), at(10, 40, 120)] })).toBe(false);
  });

  it("rejects a slow press-and-hold", () => {
    expect(isTapStroke({ points: [at(10, 10, 0), at(10, 11, 900)] })).toBe(false);
  });

  it("rejects an empty stroke", () => {
    expect(isTapStroke({ points: [] })).toBe(false);
  });
});

describe("pressure + speed shaping", () => {
  it("smoothPressure eases toward the new value instead of jumping", () => {
    expect(smoothPressure(null, 0.9)).toBeCloseTo(0.9);
    const eased = smoothPressure(0.2, 1);
    expect(eased).toBeGreaterThan(0.2);
    expect(eased).toBeLessThan(1);
  });

  it("smoothPressure stays in range for junk input", () => {
    expect(smoothPressure(0.5, Number.NaN)).toBeGreaterThanOrEqual(0);
    expect(smoothPressure(0.5, 5)).toBeLessThanOrEqual(1);
  });

  it("a fast stroke tapers thinner than a slow one, but never vanishes", () => {
    const a = pt(0, 0);
    const slow = { ...pt(2, 0), t: a.t + 100 };
    const fast = { ...pt(200, 0), t: a.t + 8 };
    expect(strokeWidth(fast, "pen", 3, a)).toBeLessThan(strokeWidth(slow, "pen", 3, a));
    expect(strokeWidth(fast, "pen", 3, a)).toBeGreaterThan(0);
  });

  it("width is unchanged when there is no previous point or no time delta", () => {
    const base = strokeWidth(pt(5, 5), "pen", 3);
    expect(strokeWidth(pt(5, 5), "pen", 3, null)).toBeCloseTo(base);
    expect(speedFactor(pt(0, 0), pt(9, 9))).toBe(1); // identical timestamps
  });
});

describe("persistence", () => {
  it("round-trips strokes and falls back on junk", () => {
    const doc = pushStroke({ ...emptyInk("grid"), paper: "grid" }, stroke([[3, 4]]));
    const again = deserializeInk(JSON.stringify(doc));
    expect(again.paper).toBe("grid");
    expect(again.strokes[0].points[0].y).toBe(4);
    expect(parseInk(null).strokes).toEqual([]);
    expect(deserializeInk("not-json").version).toBe(1);
  });
});
