import { describe, it, expect } from "vitest";
import { buildDependencyEdges } from "../useZoneData";

const mkZone = (id, drawingId, x_min, y_min, x_max, y_max, sheet_number) => ({
  id, drawing_id: drawingId, x_min, y_min, x_max, y_max, sheet_number,
});
const mkRow = (id, source, target, relationship = "blocks", weight = 1) => ({
  id,
  __source: source,
  __target: target,
  relationship,
  propagation_weight: weight,
});

describe("buildDependencyEdges", () => {
  it("returns [] when showDeps is false even with rows present", () => {
    const rows = [mkRow("r1", mkZone("a", "d1", 0, 0, 10, 10), mkZone("b", "d1", 20, 20, 30, 30))];
    expect(buildDependencyEdges({ showDeps: false, sheetDependencies: rows, activeDrawingId: "d1" })).toEqual([]);
  });

  it("returns [] when there are no rows", () => {
    expect(buildDependencyEdges({ showDeps: true, sheetDependencies: [], activeDrawingId: "d1" })).toEqual([]);
  });

  it("emits a fully on-sheet edge with both centroids and isCrossSheet=false", () => {
    const rows = [mkRow(
      "r1",
      mkZone("a", "d1", 0, 0, 10, 10),     // centroid 5,5
      mkZone("b", "d1", 20, 20, 40, 40),   // centroid 30,30
      "blocks",
      2,
    )];
    const out = buildDependencyEdges({ showDeps: true, sheetDependencies: rows, activeDrawingId: "d1" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "r1",
      sourceCenter: [5, 5],
      targetCenter: [30, 30],
      relationship: "blocks",
      propagationWeight: 2,
      isCrossSheet: false,
      crossSheetLabel: null,
    });
  });

  it("emits an outbound cross-sheet pill anchored at the on-sheet source", () => {
    const rows = [mkRow(
      "r2",
      mkZone("a", "d1", 0, 0, 10, 10),       // on-sheet source, centroid 5,5
      mkZone("b", "d2", 20, 20, 40, 40, "S-202"),  // off-sheet target
    )];
    const out = buildDependencyEdges({ showDeps: true, sheetDependencies: rows, activeDrawingId: "d1" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "r2",
      sourceCenter: [5, 5],
      targetCenter: null,
      isCrossSheet: true,
      crossSheetLabel: "S-202",
    });
  });

  it("emits an inbound cross-sheet pill anchored at the on-sheet target", () => {
    const rows = [mkRow(
      "r3",
      mkZone("a", "d2", 0, 0, 10, 10, "S-101"),    // off-sheet source
      mkZone("b", "d1", 100, 100, 120, 140),       // on-sheet target, centroid 110,120
    )];
    const out = buildDependencyEdges({ showDeps: true, sheetDependencies: rows, activeDrawingId: "d1" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "r3",
      sourceCenter: [110, 120],   // anchor at on-sheet endpoint
      targetCenter: null,
      isCrossSheet: true,
      crossSheetLabel: "from S-101",
    });
  });

  it("skips edges where neither endpoint is on the active sheet", () => {
    const rows = [mkRow(
      "r4",
      mkZone("a", "d2", 0, 0, 10, 10),
      mkZone("b", "d3", 20, 20, 40, 40),
    )];
    expect(buildDependencyEdges({ showDeps: true, sheetDependencies: rows, activeDrawingId: "d1" })).toEqual([]);
  });

  it("skips rows missing __source or __target", () => {
    const rows = [
      { id: "r5", __source: null, __target: mkZone("b", "d1", 0, 0, 10, 10), relationship: "blocks" },
      { id: "r6", __source: mkZone("a", "d1", 0, 0, 10, 10), __target: undefined, relationship: "blocks" },
    ];
    expect(buildDependencyEdges({ showDeps: true, sheetDependencies: rows, activeDrawingId: "d1" })).toEqual([]);
  });
});
