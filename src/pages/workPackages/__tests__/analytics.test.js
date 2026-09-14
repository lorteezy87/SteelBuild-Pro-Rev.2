import { describe, expect, it } from "vitest";
import {
  buildWorkPackageMetrics,
  compareForRegisterSort,
  getWorkPackageSignals,
  matchesFocusFilter,
  parseLinkedIds,
} from "../analytics";
import { indexReleasesByWorkPackage, summarizePiecesByWorkPackage } from "../canonical";

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
    expect(metrics.progressMethod).toBe("tonnage");
    expect(metrics.onHold).toHaveLength(1);
    expect(metrics.readyForFab.map((wp) => wp.wp_number)).toEqual(["WP-001"]);
    expect(metrics.drawingGaps.map((wp) => wp.wp_number)).toContain("WP-003");
    expect(metrics.laborBurn).toBe(80);
  });

  it("says when the headline progress could not be tonnage-weighted for every package", () => {
    const metrics = buildWorkPackageMetrics(
      [
        { id: "a", tonnage: 10, percent_complete: 100 },
        { id: "b", tonnage: 0, percent_complete: 0 },
      ],
      [],
      [],
    );
    expect(metrics.progress).toBe(100); // the 0-ton package carries no weight
    expect(metrics.progressMethod).toBe("partial-tonnage");
    expect(metrics.tonnageMissingCount).toBe(1);
    expect(buildWorkPackageMetrics([{ id: "a", percent_complete: 50 }], [], []).progressMethod).toBe("count");
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

describe("canonical release + pieces feed the signals", () => {
  const releasesByWp = indexReleasesByWorkPackage([
    { id: "r1", work_package_id: "wp-rel", status: "Released", is_exception: true, weight_tons: 8 },
  ]);
  const piecesByWp = summarizePiecesByWorkPackage([
    { id: "p1", work_package_id: "wp-rel", lifecycle_status: "shipped" },
    { id: "p2", work_package_id: "wp-rel", lifecycle_status: "fabricated" },
    { id: "p3", work_package_id: "wp-plain", lifecycle_status: "not_started" },
  ]);

  it("a released package is no longer a drawing gap, and an exception release is flagged medium", () => {
    // Legacy list empty + phase past Detailing used to raise "No linked drawings" (high).
    const signals = getWorkPackageSignals(
      { id: "wp-rel", phase: "Fabrication", status: "In Progress", percent_complete: 40, linked_drawing_ids: "", crew: "A" },
      { releasesByWp, piecesByWp, pieceControlMode: "live", today: "2026-09-05" },
    );
    expect(signals.released).toBe(true);
    expect(signals.flags.map((f) => f.key)).not.toContain("no_drawings");
    expect(signals.flags.map((f) => f.key)).toContain("exception_release");
    expect(signals.risk).toBe("medium");
    expect(signals.readinessScore).toBeGreaterThanOrEqual(50);
  });

  it("derives the phase from pieces on piece-driven packages and reports the stored mismatch", () => {
    const signals = getWorkPackageSignals(
      { id: "wp-rel", phase: "Erection", status: "In Progress", percent_complete: 40, crew: "A" },
      { releasesByWp, piecesByWp, pieceControlMode: "live" },
    );
    expect(signals.pieceDriven).toBe(true);
    expect(signals.phase).toBe("Delivery"); // one lot shipped, none delivered
    expect(signals.storedPhase).toBe("Erection");
    expect(signals.phaseMismatch).toBe(true);
    expect(signals.pieces?.leafCount).toBe(2);
  });

  it("leaves the stored phase alone when piece control is off or shadow, or the package has no pieces", () => {
    for (const mode of ["off", "shadow"]) {
      const s = getWorkPackageSignals({ id: "wp-rel", phase: "Erection" }, { piecesByWp, pieceControlMode: mode });
      expect(s.pieceDriven, mode).toBe(false);
      expect(s.phase, mode).toBe("Erection");
    }
    const none = getWorkPackageSignals({ id: "wp-none", phase: "Delivery" }, { piecesByWp, pieceControlMode: "live" });
    expect(none.pieceDriven).toBe(false);
    expect(none.phase).toBe("Delivery");
  });

  it("released packages leave the Ready-for-Fab bucket and show up in the released buckets", () => {
    const metrics = buildWorkPackageMetrics(
      [
        { id: "wp-rel", wp_number: "WP-1", phase: "Detailing", status: "Not Started", tonnage: 5, linked_drawing_ids: "d1" },
        { id: "wp-plain", wp_number: "WP-2", phase: "Detailing", status: "Not Started", tonnage: 5, linked_drawing_ids: "d1" },
      ],
      [{ id: "d1", stage: "IFC" }],
      [],
      { releasesByWp, piecesByWp, pieceControlMode: "live" },
    );
    expect(metrics.readyForFab.map((w) => w.wp_number)).toEqual(["WP-2"]);
    expect(metrics.released.map((w) => w.wp_number)).toEqual(["WP-1"]);
    expect(metrics.exceptionReleases).toHaveLength(1);
    expect(metrics.pieceDrivenCount).toBe(2);
    expect(metrics.phaseMismatches.map((w) => w.wp_number)).toEqual(["WP-1"]); // Detailing stored, Delivery derived
  });

  it("focus filters resolve against signals and metrics", () => {
    const metrics = buildWorkPackageMetrics(
      [
        { id: "wp-rel", wp_number: "WP-1", phase: "Detailing", status: "Not Started", linked_drawing_ids: "" },
        { id: "wp-plain", wp_number: "WP-2", phase: "Fabrication", status: "Not Started", linked_drawing_ids: "", scheduled_end_date: "2000-01-01" },
      ],
      [],
      [],
      // Piece control off: the stored Fabrication phase stands, so WP-2 is a
      // drawing gap (with pieces all not_started it would derive Detailing).
      { releasesByWp, piecesByWp, pieceControlMode: "off" },
    );
    const [rel, plain] = metrics.enriched;
    expect(matchesFocusFilter(rel, "released", metrics)).toBe(true);
    expect(matchesFocusFilter(rel, "exception", metrics)).toBe(true);
    expect(matchesFocusFilter(plain, "released", metrics)).toBe(false);
    expect(matchesFocusFilter(plain, "drawing_gaps", metrics)).toBe(true);
    expect(matchesFocusFilter(plain, "overdue", metrics)).toBe(true);
    expect(matchesFocusFilter(plain, "high", metrics)).toBe(true);
    expect(matchesFocusFilter(rel, "all", metrics)).toBe(true);
  });

  it("flags a live package with no plan date as low-severity so the date gets filled", () => {
    const s = getWorkPackageSignals({ id: "x", phase: "Fabrication", status: "In Progress", crew: "A", linked_drawing_ids: "d1" }, {
      drawingsById: new Map([["d1", { id: "d1", stage: "IFC" }]]),
    });
    expect(s.flags.find((f) => f.key === "no_plan_date")?.severity).toBe("low");
    expect(s.risk).toBe("clear");
  });
});

describe("register sorting", () => {
  const rows = [
    { id: "a", wp_number: "WP-10", name: "Zulu", tonnage: 5, _signals: { phase: "Erection", status: "Complete", progress: 100, readinessScore: 100, hourBurn: 50, risk: "clear", released: true } },
    { id: "b", wp_number: "WP-2", name: "Alpha", tonnage: 20, _signals: { phase: "Detailing", status: "Not Started", progress: 0, readinessScore: 20, hourBurn: 120, risk: "high", released: false } },
  ];
  it("sorts numerically by number and by each column both ways", () => {
    expect(rows.slice().sort((x, y) => compareForRegisterSort(x, y, "wp_number", "asc")).map((r) => r.id)).toEqual(["b", "a"]);
    expect(rows.slice().sort((x, y) => compareForRegisterSort(x, y, "tonnage", "desc")).map((r) => r.id)).toEqual(["b", "a"]);
    expect(rows.slice().sort((x, y) => compareForRegisterSort(x, y, "labor", "asc")).map((r) => r.id)).toEqual(["a", "b"]);
    expect(rows.slice().sort((x, y) => compareForRegisterSort(x, y, "release", "desc")).map((r) => r.id)).toEqual(["a", "b"]);
    // null key = execution order (risk first)
    expect(rows.slice().sort((x, y) => compareForRegisterSort(x, y, null)).map((r) => r.id)).toEqual(["b", "a"]);
  });
});
