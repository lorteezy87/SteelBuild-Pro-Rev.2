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

describe("fab readiness agrees with the Fab Release gate", () => {
  // The page used to call a package ready when ANY ONE linked sheet was in a
  // loose stage set, so a package holding blocked sheets reported "ready,
  // 0 blocked" while Fab Release reported them blocked on the same data.
  const wpWith = (ids) => ({
    id: "wp-1",
    wp_number: "WP-001",
    phase: "Detailing",
    status: "Not Started",
    tonnage: 10,
    percent_complete: 0,
    linked_drawing_ids: ids,
  });

  it("does NOT call a package ready when only some sheets are released", () => {
    const metrics = buildWorkPackageMetrics(
      [wpWith("d1,d2")],
      [
        { id: "d1", stage: "IFC" },      // release-ready
        { id: "d2", stage: "OFA" },      // still in approval
      ],
      [],
    );
    expect(metrics.readyForFab).toHaveLength(0);
    expect(metrics.blockedSheetCount).toBe(1);
    expect(metrics.fabBlocked.map((w) => w.wp_number)).toEqual(["WP-001"]);
  });

  it("calls a package ready only when every linked sheet is release-ready", () => {
    const metrics = buildWorkPackageMetrics(
      [wpWith("d1,d2")],
      [{ id: "d1", stage: "IFC" }, { id: "d2", stage: "Released" }],
      [],
    );
    expect(metrics.readyForFab.map((w) => w.wp_number)).toEqual(["WP-001"]);
    expect(metrics.blockedSheetCount).toBe(0);
  });

  it("counts rejected and superseded sheets as blocked", () => {
    const metrics = buildWorkPackageMetrics(
      [wpWith("d1,d2,d3")],
      [
        { id: "d1", stage: "IFC" },
        { id: "d2", stage: "IFC", is_superseded: true },
        { id: "d3", stage: "IFC", set_approval_status: "Revise and Resubmit" },
      ],
      [],
    );
    expect(metrics.readyForFab).toHaveLength(0);
    expect(metrics.blockedSheetCount).toBeGreaterThanOrEqual(2);
  });

  it("counts an unresolved current revision as blocked (gate parity)", () => {
    const metrics = buildWorkPackageMetrics(
      [wpWith("d1")],
      [{ id: "d1", stage: "IFC", current_release_status: "on_hold" }],
      [],
    );
    expect(metrics.readyForFab).toHaveLength(0);
    expect(metrics.blockedSheetCount).toBe(1);
  });

  it("treats an unresolvable sheet link as blocked, never as ready", () => {
    const metrics = buildWorkPackageMetrics([wpWith("missing-id")], [], []);
    expect(metrics.readyForFab).toHaveLength(0);
    expect(metrics.blockedSheetCount).toBe(1);
  });

  it("mid-flow approvals alone do not make a package fab-ready", () => {
    // "Approved" / "Approved as Noted" / "OFS" are mid-flow per
    // submittalStageMapping — the old set treated them as release-ready.
    for (const stage of ["Approved", "Approved as Noted", "OFS"]) {
      const metrics = buildWorkPackageMetrics([wpWith("d1")], [{ id: "d1", stage }], []);
      expect(metrics.readyForFab, `stage ${stage}`).toHaveLength(0);
    }
  });

  it("flags a package that is 100% complete but still has an open status", () => {
    const signals = getWorkPackageSignals(
      { id: "wp-9", phase: "Fabrication", status: "In Progress", percent_complete: 100, linked_drawing_ids: "", crew: "A" },
      { today: "2026-05-13" },
    );
    const mismatch = signals.flags.find((f) => f.key === "pct_status_mismatch");
    expect(mismatch).toBeTruthy();
    expect(mismatch.label).toMatch(/100% but marked In Progress/);
  });
});
