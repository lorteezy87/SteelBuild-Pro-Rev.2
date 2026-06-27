import { describe, expect, it } from "vitest";
import {
  buildFabReleaseMetrics,
  fabReleaseLane,
  getFabReleaseSignals,
  getFabStage,
  parseLinkedIds,
  sortFabPackagesForRelease,
} from "../analytics";

describe("fab release analytics", () => {
  it("parses linked drawing ids from strings and arrays", () => {
    expect(parseLinkedIds("d1, d2,, d3")).toEqual(["d1", "d2", "d3"]);
    expect(parseLinkedIds(["d1", " d2 "])).toEqual(["d1", "d2"]);
  });

  it("keeps fabrication stage progression based on release and percent complete", () => {
    expect(getFabStage({ phase: "Fabrication", released_date: "2026-05-01", percent_complete: 0 })).toBe("shop_released");
    expect(getFabStage({ phase: "Fabrication", status: "In Progress", percent_complete: 30 })).toBe("in_fabrication");
    expect(getFabStage({ phase: "Fabrication", percent_complete: 70 })).toBe("fabricated");
    expect(getFabStage({ phase: "Fabrication", percent_complete: 90 })).toBe("finish_treatment");
    expect(getFabStage({ phase: "Fabrication", percent_complete: 100 })).toBe("ready_to_ship");
  });

  it("flags packages that are moving toward shop release without released drawings", () => {
    const wp = {
      id: "wp-1",
      phase: "Fabrication",
      status: "Not Started",
      percent_complete: 0,
      linked_drawing_ids: "d1",
      vif_confirmed: true,
      load_list_complete: true,
      crew: "Shop A",
    };
    const drawingsById = new Map([["d1", { id: "d1", stage: "OFA", drawing_set_name: "Main Steel" }]]);

    const signals = getFabReleaseSignals(wp, { drawingsById, today: "2026-05-13" });

    expect(signals.stage).toBe("material_on_hand");
    expect(signals.risk).toBe("high");
    expect(signals.flags.map((flag) => flag.key)).toContain("drawings_not_released");
  });

  it("rolls up stage, release, drawing, and labor metrics", () => {
    const metrics = buildFabReleaseMetrics(
      [
        {
          id: "wp-1",
          wp_number: "WP-001",
          phase: "Fabrication",
          status: "Not Started",
          tonnage: 10,
          linked_drawing_ids: "d1",
          vif_confirmed: true,
          load_list_complete: true,
          crew: "Shop A",
        },
        {
          id: "wp-2",
          wp_number: "WP-002",
          phase: "Fabrication",
          status: "In Progress",
          tonnage: 20,
          percent_complete: 50,
          linked_drawing_ids: "d1",
          released_date: "2026-05-01",
          crew: "Shop B",
          shop_hours_budget: 100,
          shop_hours_actual: 120,
        },
        {
          id: "wp-3",
          wp_number: "WP-003",
          phase: "Delivery",
          status: "Complete",
          tonnage: 5,
          percent_complete: 100,
          linked_drawing_ids: "d1",
        },
      ],
      [{ id: "d1", stage: "IFC", drawing_set_id: "set-1", drawing_set_name: "Set 2 - Main Steel" }],
      [{ id: "set-1", set_name: "Set 2 - Main Steel", metadata: { drawing_set_number: "2" } }],
      { today: "2026-05-13" }
    );

    expect(metrics.totalCount).toBe(3);
    expect(metrics.totalTons).toBe(35);
    expect(metrics.readyForRelease.map((wp) => wp.wp_number)).toEqual(["WP-001"]);
    expect(metrics.activeShop.map((wp) => wp.wp_number)).toContain("WP-002");
    expect(metrics.readyToShip.map((wp) => wp.wp_number)).toEqual(["WP-003"]);
    expect(metrics.laborBurn).toBe(120);
    expect(metrics.stageRollup.find((stage) => stage.id === "in_fabrication").count).toBe(1);
  });

  it("routes cards into visual lanes and sorts exceptions first", () => {
    const rows = buildFabReleaseMetrics(
      [
        { id: "blocked", wp_number: "WP-002", phase: "Fabrication", status: "On Hold", linked_drawing_ids: "" },
        {
          id: "ready",
          wp_number: "WP-001",
          phase: "Fabrication",
          status: "Not Started",
          linked_drawing_ids: "d1",
          vif_confirmed: true,
          load_list_complete: true,
          crew: "Shop A",
        },
      ],
      [{ id: "d1", stage: "Released" }],
      [],
      { today: "2026-05-13" }
    ).enriched;

    expect(fabReleaseLane(rows.find((row) => row.id === "blocked"))).toBe("Blocked");
    expect(fabReleaseLane(rows.find((row) => row.id === "ready"))).toBe("Ready For Release");
    expect([...rows].sort(sortFabPackagesForRelease).map((row) => row.id)).toEqual(["blocked", "ready"]);
  });
});
