import { describe, it, expect } from "vitest";
import { normalizeSN, parseZonePayload } from "../drawingViewerUtils";

describe("normalizeSN", () => {
  it("handles nullish and non-string input by returning empty string", () => {
    expect(normalizeSN(null)).toBe("");
    expect(normalizeSN(undefined)).toBe("");
    expect(normalizeSN("")).toBe("");
  });

  it("uppercases and strips spaces / dashes / underscores / dots", () => {
    expect(normalizeSN("s-201")).toBe("S201");
    expect(normalizeSN("S 201")).toBe("S201");
    expect(normalizeSN("S_201")).toBe("S201");
    expect(normalizeSN("S.2.01")).toBe("S201");
    expect(normalizeSN(" S - 2 0 1 ")).toBe("S201");
  });

  it("collapses callout-style references to the same key", () => {
    // The viewer relies on this collapse so that "S-201", "S201" and
    // "DETAIL 3 / S-201" share a normalised prefix when matched against
    // the project drawing list.
    const a = normalizeSN("S-201");
    const b = normalizeSN("S201");
    const c = normalizeSN("s 201");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("coerces numeric input to a string before normalising", () => {
    // Some legacy callouts come in as numbers (sheet 201 with no prefix).
    expect(normalizeSN(201)).toBe("201");
  });
});

describe("parseZonePayload", () => {
  it("returns polygon geometry when the payload shape is 'polygon'", () => {
    const points = [[0, 0], [10, 0], [10, 10]];
    expect(parseZonePayload({ shape: "polygon", points })).toEqual({
      shapeType: "polygon",
      polygonPoints: points,
    });
  });

  it("returns the rect bbox for the default (MVP) rect path", () => {
    const payload = { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.6 };
    expect(parseZonePayload(payload)).toEqual({
      xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.6,
    });
  });

  it("treats a missing/undefined shape as the rect path", () => {
    // ZoneLayer emits rect payloads without a `shape` discriminator; the
    // original branch used `payload?.shape === "polygon"` so anything else
    // falls to the bbox path.
    const payload = { xMin: 1, yMin: 2, xMax: 3, yMax: 4 };
    expect(parseZonePayload(payload)).toEqual({
      xMin: 1, yMin: 2, xMax: 3, yMax: 4,
    });
    expect(parseZonePayload(payload)).not.toHaveProperty("shapeType");
  });

  it("treats an explicit shape:'rect' as the rect path", () => {
    const payload = { shape: "rect", xMin: 1, yMin: 2, xMax: 3, yMax: 4 };
    expect(parseZonePayload(payload)).toEqual({
      xMin: 1, yMin: 2, xMax: 3, yMax: 4,
    });
  });
});
