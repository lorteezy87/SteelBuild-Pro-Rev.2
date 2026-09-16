import { describe, expect, it } from "vitest";
import { rect } from "../geometry";
import {
  anchorPoint,
  arrowHeadPoints,
  chooseSides,
  connectorPath,
  draftConnectorPath,
  edgeDash,
  edgeKindLabel,
  pointOnCubic,
} from "../connectors";

describe("anchorPoint", () => {
  const r = rect(100, 100, 200, 100);

  it("returns the midpoint of each side", () => {
    expect(anchorPoint(r, "left")).toEqual({ x: 100, y: 150 });
    expect(anchorPoint(r, "right")).toEqual({ x: 300, y: 150 });
    expect(anchorPoint(r, "top")).toEqual({ x: 200, y: 100 });
    expect(anchorPoint(r, "bottom")).toEqual({ x: 200, y: 200 });
  });
});

describe("chooseSides", () => {
  it("connects side by side cards left to right", () => {
    expect(chooseSides(rect(0, 0, 100, 100), rect(400, 20, 100, 100))).toEqual({
      from: "right",
      to: "left",
    });
  });

  it("reverses when the target is to the left", () => {
    expect(chooseSides(rect(400, 0, 100, 100), rect(0, 0, 100, 100))).toEqual({
      from: "left",
      to: "right",
    });
  });

  it("connects stacked cards top to bottom", () => {
    expect(chooseSides(rect(0, 0, 100, 100), rect(20, 400, 100, 100))).toEqual({
      from: "bottom",
      to: "top",
    });
  });

  it("resolves an exact diagonal tie horizontally", () => {
    expect(chooseSides(rect(0, 0, 100, 100), rect(200, 200, 100, 100)).from).toBe("right");
  });
});

describe("connectorPath", () => {
  const from = rect(0, 0, 100, 100);
  const to = rect(400, 0, 100, 100);

  it("leaves and arrives at the facing edges, not the centres", () => {
    const path = connectorPath(from, to);
    expect(path.start).toEqual({ x: 100, y: 50 });
    expect(path.end).toEqual({ x: 400, y: 50 });
  });

  it("bows outward from each card", () => {
    const path = connectorPath(from, to);
    expect(path.control1.x).toBeGreaterThan(path.start.x);
    expect(path.control2.x).toBeLessThan(path.end.x);
  });

  it("puts the label on the curve, not on the chord", () => {
    const path = connectorPath(rect(0, 0, 100, 100), rect(0, 400, 100, 100));
    const onCurve = pointOnCubic(0.5, path.start, path.control1, path.control2, path.end);
    expect(path.label.x).toBeCloseTo(onCurve.x, 10);
    expect(path.label.y).toBeCloseTo(onCurve.y, 10);
  });

  it("points the arrow along the tangent at the target", () => {
    const path = connectorPath(from, to);
    // Arriving at a left edge means travelling rightwards.
    expect(path.direction.x).toBeCloseTo(1, 6);
    expect(path.direction.y).toBeCloseTo(0, 6);
  });

  it("emits a cubic path string", () => {
    expect(connectorPath(from, to).d).toMatch(/^M [\d.-]+ [\d.-]+ C /);
  });

  it("keeps a visible bow between adjacent cards", () => {
    const close = connectorPath(rect(0, 0, 100, 100), rect(110, 0, 100, 100));
    expect(close.control1.x).toBeGreaterThan(close.start.x);
  });
});

describe("draftConnectorPath", () => {
  it("rubber-bands straight to a loose point", () => {
    const path = draftConnectorPath(rect(0, 0, 100, 100), { x: 400, y: 50 });
    expect(path.d).toMatch(/^M .* L /);
    expect(path.end).toEqual({ x: 400, y: 50 });
  });
});

describe("arrowHeadPoints", () => {
  it("puts the tip at the connector end and the base behind it", () => {
    const points = arrowHeadPoints({ x: 100, y: 50 }, { x: 1, y: 0 }, 10);
    const [tip, a, b] = points.split(" ");
    expect(tip).toBe("100,50");
    expect(a).toBe("90,55");
    expect(b).toBe("90,45");
  });
});

describe("edge presentation", () => {
  it("leaves the scheduling relationship solid and dashes the rest", () => {
    expect(edgeDash("precedes")).toBeUndefined();
    expect(edgeDash("relates")).toBeDefined();
    expect(edgeDash("blocks")).toBeDefined();
    expect(edgeDash("supplies")).toBeDefined();
  });

  it("gives every kind a label that reads along the arrow", () => {
    expect(edgeKindLabel("precedes")).toBe("then");
    expect(edgeKindLabel("blocks")).toBe("blocks");
    expect(edgeKindLabel("supplies")).toBe("supplies");
    expect(edgeKindLabel("relates")).toBe("relates to");
  });
});
