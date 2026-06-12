import { describe, expect, it } from "vitest";
import { cloudPathFromRect, STAMP_TYPES } from "../AnnotationLayer";

describe("cloudPathFromRect", () => {
  it("produces a closed path of outward arcs around the rect", () => {
    const d = cloudPathFromRect(10, 20, 100, 60, 10);
    expect(d.startsWith("M 10.00 20.00")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    // 100/20=5 bumps top + 5 bottom, 60/20=3 right + 3 left = 16 arcs.
    const arcs = d.match(/A /g) || [];
    expect(arcs).toHaveLength(16);
    // Every arc bulges outward on a clockwise walk: sweep flag 0.
    for (const seg of d.split("A ").slice(1)) {
      const [, , , largeArc, sweep] = seg.trim().split(/\s+/);
      expect(largeArc).toBe("0");
      expect(sweep).toBe("0");
    }
  });

  it("always emits at least one bump per edge for tiny rects", () => {
    const d = cloudPathFromRect(0, 0, 5, 5, 10);
    expect((d.match(/A /g) || [])).toHaveLength(4);
  });

  it("arcs land back on the rect corners", () => {
    const d = cloudPathFromRect(0, 0, 40, 20, 10);
    // The path must pass through every corner of the rect.
    expect(d).toContain("40.00 0.00");   // top-right
    expect(d).toContain("40.00 20.00");  // bottom-right
    expect(d).toContain("0.00 20.00");   // bottom-left
    expect(d).toContain("0.00 0.00");    // back to origin
  });
});

describe("STAMP_TYPES", () => {
  it("covers the canonical review dispositions with unique keys", () => {
    const keys = STAMP_TYPES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("APPROVED");
    expect(keys).toContain("APPROVED_AS_NOTED");
    expect(keys).toContain("REVISE_RESUBMIT");
    expect(keys).toContain("REJECTED");
    for (const s of STAMP_TYPES) {
      expect(s.label).toBeTruthy();
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
