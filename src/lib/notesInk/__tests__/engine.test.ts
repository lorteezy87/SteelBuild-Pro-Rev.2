import { describe, expect, it } from "vitest";
import {
  acceptPointer,
  appendPoint,
  deserializeInk,
  emptyInk,
  eraseStrokesAt,
  isPencilDoubleTap,
  parseInk,
  pointFromPointer,
  pushStroke,
  shouldKeepPoint,
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
