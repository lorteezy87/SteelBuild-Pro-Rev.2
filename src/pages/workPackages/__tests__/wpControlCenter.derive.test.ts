import { describe, it, expect } from "vitest";
import {
  wpStatusTone,
  riskTone,
  buildWpPanels,
  areAllFilteredRowsSelected,
  reconcileSelection,
} from "../wpControlCenter.derive";
import type { WpMetrics, EnrichedWp } from "../wpControlCenter.derive";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWp(overrides: Partial<EnrichedWp> = {}): EnrichedWp {
  return {
    id: "wp-1",
    wp_number: "WP-001",
    name: "Main Steel",
    phase: "Fabrication",
    status: "In Progress",
    tonnage: 10,
    percent_complete: 50,
    scheduled_end_date: null,
    crew: "Crew A",
    _signals: {
      phase: "Fabrication",
      status: "In Progress",
      progress: 50,
      complete: false,
      overdue: false,
      risk: "clear",
      readinessScore: 90,
      hourBurn: 70,
      totalBudgetHours: 100,
      totalActualHours: 70,
      flags: [],
      drawing: { linkedCount: 1, approvedCount: 1, hasAny: true, hasApproved: true },
    },
    ...overrides,
  };
}

function makeMetrics(partial: Partial<WpMetrics> = {}): WpMetrics {
  return {
    enriched: [],
    totalCount: 0,
    totalTons: 0,
    progress: 0,
    totalBudgetHours: 0,
    totalActualHours: 0,
    laborBurn: 0,
    phaseRollup: [
      { phase: "Detailing", count: 2, tons: 5, progress: 30, highRisk: 0, mediumRisk: 1 },
      { phase: "Fabrication", count: 3, tons: 20, progress: 60, highRisk: 1, mediumRisk: 0 },
      { phase: "Delivery", count: 1, tons: 8, progress: 10, highRisk: 0, mediumRisk: 0 },
      { phase: "Erection", count: 0, tons: 0, progress: 0, highRisk: 0, mediumRisk: 0 },
    ],
    highRisk: [],
    mediumRisk: [],
    onHold: [],
    drawingGaps: [],
    overdue: [],
    readyForFab: [],
    readyForShip: [],
    fieldReady: [],
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// wpStatusTone
// ---------------------------------------------------------------------------

describe("wpStatusTone", () => {
  it("maps Complete to good", () => {
    expect(wpStatusTone("Complete")).toBe("good");
  });

  it("maps In Progress to info", () => {
    expect(wpStatusTone("In Progress")).toBe("info");
  });

  it("maps On Hold to warn", () => {
    expect(wpStatusTone("On Hold")).toBe("warn");
  });

  it("maps Not Started to neutral", () => {
    expect(wpStatusTone("Not Started")).toBe("neutral");
  });

  it("maps null to neutral", () => {
    expect(wpStatusTone(null)).toBe("neutral");
  });

  it("maps undefined to neutral", () => {
    expect(wpStatusTone(undefined)).toBe("neutral");
  });

  it("maps unknown string to neutral", () => {
    expect(wpStatusTone("Closed")).toBe("neutral");
  });
});

// ---------------------------------------------------------------------------
// riskTone
// ---------------------------------------------------------------------------

describe("riskTone", () => {
  it("maps high to danger", () => {
    expect(riskTone("high")).toBe("danger");
  });

  it("maps medium to warn", () => {
    expect(riskTone("medium")).toBe("warn");
  });

  it("maps clear to neutral", () => {
    expect(riskTone("clear")).toBe("neutral");
  });

  it("maps undefined to neutral", () => {
    expect(riskTone(undefined)).toBe("neutral");
  });

  it("maps unknown string to neutral", () => {
    expect(riskTone("unknown")).toBe("neutral");
  });
});

// ---------------------------------------------------------------------------
// buildWpPanels
// ---------------------------------------------------------------------------

describe("buildWpPanels", () => {
  it("returns empty arrays when metrics are empty", () => {
    const panels = buildWpPanels(makeMetrics());
    expect(panels.workQueue).toHaveLength(0);
    expect(panels.readyToAdvance).toHaveLength(0);
    expect(panels.atRisk).toHaveLength(0);
    expect(panels.phaseRail).toHaveLength(4);
  });

  it("workQueue = highRisk sorted and capped at 8", () => {
    // Build 10 high-risk packages with distinct dates so sorting is deterministic
    const highRiskWps = Array.from({ length: 10 }, (_, i) => {
      const wp = makeWp({ id: `wp-${i}`, wp_number: `WP-${String(i).padStart(3, "0")}` });
      wp._signals.risk = "high";
      wp.scheduled_end_date = `2026-0${(i % 9) + 1}-01`;
      return wp;
    });
    const panels = buildWpPanels(makeMetrics({ highRisk: highRiskWps }));
    expect(panels.workQueue).toHaveLength(8);
  });

  it("readyToAdvance filters out high-risk, complete, and Erection packages", () => {
    const readyErection = makeWp({ id: "e1" });
    readyErection._signals.phase = "Erection";
    readyErection._signals.readinessScore = 95;
    readyErection._signals.risk = "clear";

    const readyComplete = makeWp({ id: "c1" });
    readyComplete._signals.complete = true;
    readyComplete._signals.readinessScore = 100;
    readyComplete._signals.risk = "clear";

    const readyHighRisk = makeWp({ id: "h1" });
    readyHighRisk._signals.risk = "high";
    readyHighRisk._signals.readinessScore = 90;

    const eligible = makeWp({ id: "ok1" });
    eligible._signals.readinessScore = 85;
    eligible._signals.risk = "clear";
    eligible._signals.phase = "Fabrication";
    eligible._signals.complete = false;

    const panels = buildWpPanels(
      makeMetrics({
        enriched: [readyErection, readyComplete, readyHighRisk, eligible],
      }),
    );
    expect(panels.readyToAdvance).toHaveLength(1);
    expect(panels.readyToAdvance[0].id).toBe("ok1");
  });

  it("readyToAdvance excludes packages with readinessScore < 80", () => {
    const low = makeWp({ id: "low1" });
    low._signals.readinessScore = 79;
    low._signals.risk = "clear";
    low._signals.complete = false;
    low._signals.phase = "Fabrication";

    const panels = buildWpPanels(makeMetrics({ enriched: [low] }));
    expect(panels.readyToAdvance).toHaveLength(0);
  });

  it("atRisk includes packages with hourBurn > 100", () => {
    const overBurn = makeWp({ id: "ob1" });
    overBurn._signals.hourBurn = 110;
    overBurn._signals.overdue = false;

    const panels = buildWpPanels(makeMetrics({ enriched: [overBurn] }));
    expect(panels.atRisk).toHaveLength(1);
    expect(panels.atRisk[0].id).toBe("ob1");
  });

  it("atRisk includes overdue packages", () => {
    const overdueWp = makeWp({ id: "ov1" });
    overdueWp._signals.overdue = true;
    overdueWp._signals.hourBurn = 50;

    const panels = buildWpPanels(makeMetrics({ enriched: [overdueWp] }));
    expect(panels.atRisk).toHaveLength(1);
    expect(panels.atRisk[0].id).toBe("ov1");
  });

  it("atRisk excludes packages with normal burn and not overdue", () => {
    const normal = makeWp({ id: "n1" });
    normal._signals.hourBurn = 80;
    normal._signals.overdue = false;

    const panels = buildWpPanels(makeMetrics({ enriched: [normal] }));
    expect(panels.atRisk).toHaveLength(0);
  });

  it("atRisk is capped at 8", () => {
    const overBurnWps = Array.from({ length: 12 }, (_, i) => {
      const wp = makeWp({ id: `ob-${i}` });
      wp._signals.hourBurn = 150;
      return wp;
    });
    const panels = buildWpPanels(makeMetrics({ enriched: overBurnWps }));
    expect(panels.atRisk).toHaveLength(8);
  });

  it("phaseRail passes through the phaseRollup unchanged", () => {
    const metrics = makeMetrics();
    const panels = buildWpPanels(metrics);
    expect(panels.phaseRail).toBe(metrics.phaseRollup);
  });
});

describe("selection helpers", () => {
  it("treats all visible rows as selected without counting hidden rows", () => {
    const selected = new Set(["wp-1", "hidden"]);
    expect(areAllFilteredRowsSelected([{ id: "wp-1" }], selected)).toBe(true);
    expect(areAllFilteredRowsSelected([{ id: "wp-1" }, { id: "wp-2" }], selected)).toBe(false);
    expect(areAllFilteredRowsSelected([], selected)).toBe(false);
  });

  it("reconciles selection to the current visible rows", () => {
    const next = reconcileSelection(new Set(["wp-1", "wp-2"]), ["wp-2", "wp-3"]);
    expect([...next]).toEqual(["wp-2"]);
  });
});
