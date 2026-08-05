import { describe, expect, it } from "vitest";
import { buildWorkPackageMetrics, getWorkPackageSignals, parseLinkedIds } from "../analytics";

describe("work package analytics", () => {
  it("parses comma-separated linked drawing ids", () => {
    expect(parseLinkedIds("a, b ,, c")).toEqual(["a", "b", "c"]);
    expect(parseLinkedIds(["a", "b"])).toEqual(["a", "b"]);
  });

  it("flags production packages without approved drawings", () => {
    const wp = {
      id: "wp-1",
      phase: "Fabrication",
      status: "In Progress",
      percent_complete: 35,
      linked_drawing_ids: "d1",
      crew: "Shop A",
    };
    const drawingsById = new Map([["d1", { id: "d1", stage: "OFA" }]]);

    const signals = getWorkPackageSignals(wp, {
      drawingsById,
      today: "2026-05-13",
    });

    expect(signals.risk).toBe("high");
    expect(signals.flags.map((flag) => flag.key)).toContain("drawings_not_released");
  });

  it("rolls up weighted progress, exceptions, and readiness buckets", () => {
    const metrics = buildWorkPackageMetrics(
      [
        {
          id: "wp-1",
          wp_number: "WP-001",
          phase: "Detailing",
          status: "Not Started",
          tonnage: 10,
          percent_complete: 25,
          linked_drawing_ids: "d1",
        },
        {
          id: "wp-2",
          wp_number: "WP-002",
          phase: "Fabrication",
          status: "In Progress",
          tonnage: 30,
          percent_complete: 75,
          linked_drawing_ids: "d1",
          crew: "Shop A",
          shop_hours_budget: 100,
          shop_hours_actual: 80,
        },
        {
          id: "wp-3",
          wp_number: "WP-003",
          phase: "Delivery",
          status: "On Hold",
          tonnage: 10,
          percent_complete: 40,
          linked_drawing_ids: "",
        },
      ],
      [{ id: "d1", stage: "IFC" }],
      []
    );

    expect(metrics.totalCount).toBe(3);
    expect(metrics.totalTons).toBe(50);
    expect(metrics.progress).toBe(58);
    expect(metrics.onHold).toHaveLength(1);
    expect(metrics.readyForFab.map((wp) => wp.wp_number)).toEqual(["WP-001"]);
    expect(metrics.drawingGaps.map((wp) => wp.wp_number)).toContain("WP-003");
    expect(metrics.laborBurn).toBe(80);
  });
});
