import { describe, it, expect } from "vitest";
import {
  buildFabReleaseSummary,
  riskTone,
  stageTone,
  stageLabel,
} from "../fabReleaseControlCenter.derive";
import type { FabMetrics, EnrichedWorkPackage, FabSignals } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoOffset(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Minimal FabSignals stub — caller overrides specific fields. */
function makeSignals(overrides: Partial<FabSignals> = {}): FabSignals {
  return {
    stage: "drawings_approved",
    status: "Not Started",
    progress: 0,
    complete: false,
    releasedDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    overduePlan: false,
    daysSinceRelease: null,
    needsRelease: true,
    inShop: false,
    readyForRelease: false,
    drawing: {
      linkedIds: [],
      linkedDrawings: [],
      linkedCount: 0,
      knownCount: 0,
      missingLinks: 0,
      releasedCount: 0,
      hasAny: false,
      hasReleased: false,
      allKnownReleased: false,
      packages: [],
      packageNames: [],
    },
    flags: [],
    risk: "clear",
    readinessScore: 0,
    readinessBreakdown: [],
    totalBudgetHours: 0,
    totalActualHours: 0,
    hourBurn: 0,
    ...overrides,
  };
}

function makeWP(id: string, overrides: Partial<EnrichedWorkPackage> = {}): EnrichedWorkPackage {
  return {
    id,
    wp_number: `WP-${id}`,
    name: `Package ${id}`,
    status: "Not Started",
    phase: "Fabrication",
    _signals: makeSignals(),
    ...overrides,
  } as unknown as EnrichedWorkPackage;
}

/** Minimal FabMetrics stub with empty collections. */
function makeMetrics(overrides: Partial<FabMetrics> = {}): FabMetrics {
  return {
    enriched: [],
    totalCount: 0,
    totalTons: 0,
    releasedTons: 0,
    weightedProgress: 0,
    activeShop: [],
    readyToShip: [],
    readyForRelease: [],
    exceptions: [],
    warnings: [],
    onHold: [],
    drawingGaps: [],
    releaseBlocked: [],
    totalBudgetHours: 0,
    totalActualHours: 0,
    laborBurn: 0,
    stageRollup: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// riskTone
// ---------------------------------------------------------------------------

describe("riskTone", () => {
  it("maps high → danger, medium → warn, clear → good", () => {
    expect(riskTone("high")).toBe("danger");
    expect(riskTone("medium")).toBe("warn");
    expect(riskTone("clear")).toBe("good");
  });
});

// ---------------------------------------------------------------------------
// stageTone
// ---------------------------------------------------------------------------

describe("stageTone", () => {
  it("ready_to_ship is good, in_fabrication is neutral", () => {
    expect(stageTone("ready_to_ship")).toBe("good");
    expect(stageTone("in_fabrication")).toBe("neutral");
  });
  it("unknown stage falls back to neutral", () => {
    expect(stageTone("something_unknown")).toBe("neutral");
  });
});

// ---------------------------------------------------------------------------
// stageLabel
// ---------------------------------------------------------------------------

describe("stageLabel", () => {
  it("returns a human label for every canonical stage id", () => {
    expect(stageLabel("shop_released")).toBe("Released");
    expect(stageLabel("in_fabrication")).toBe("In Fab");
    expect(stageLabel("ready_to_ship")).toBe("Ship Ready");
  });
  it("falls back to the raw stage id for unknown values", () => {
    expect(stageLabel("mystery_stage")).toBe("mystery_stage");
  });
});

// ---------------------------------------------------------------------------
// buildFabReleaseSummary — KPI counts
// ---------------------------------------------------------------------------

describe("buildFabReleaseSummary – KPI counts", () => {
  it("returns all-zero KPIs for an empty project", () => {
    const s = buildFabReleaseSummary(makeMetrics());
    expect(s.totalCount).toBe(0);
    expect(s.releasedCount).toBe(0);
    expect(s.readyForReleaseCount).toBe(0);
    expect(s.blockedCount).toBe(0);
    expect(s.inFabCount).toBe(0);
    expect(s.percentReleased).toBe(0);
    expect(s.kpis).toHaveLength(6);
  });

  it("counts releasedCount as activeShop + readyToShip", () => {
    const shopWp = makeWP("1", { _signals: makeSignals({ stage: "in_fabrication", inShop: true }) });
    const shipWp = makeWP("2", { _signals: makeSignals({ stage: "ready_to_ship", complete: true }) });
    const metrics = makeMetrics({
      totalCount: 2,
      activeShop: [shopWp],
      readyToShip: [shipWp],
    });
    const s = buildFabReleaseSummary(metrics);
    expect(s.releasedCount).toBe(2);
  });

  it("counts inFabCount as activeShop packages at in_fabrication stage only", () => {
    const inFab = makeWP("1", { _signals: makeSignals({ stage: "in_fabrication", inShop: true }) });
    const shopRel = makeWP("2", { _signals: makeSignals({ stage: "shop_released", inShop: true }) });
    const metrics = makeMetrics({ activeShop: [inFab, shopRel] });
    const s = buildFabReleaseSummary(metrics);
    expect(s.inFabCount).toBe(1); // only the in_fabrication one
  });

  it("counts blockedCount from releaseBlocked with non-clear risk only", () => {
    const blocked = makeWP("1", { _signals: makeSignals({ needsRelease: true, risk: "high" }) });
    const warn = makeWP("2", { _signals: makeSignals({ needsRelease: true, risk: "medium" }) });
    const ready = makeWP("3", { _signals: makeSignals({ needsRelease: true, risk: "clear", readyForRelease: true }) });
    const metrics = makeMetrics({
      releaseBlocked: [blocked, warn, ready],
      readyForRelease: [ready],
    });
    const s = buildFabReleaseSummary(metrics);
    expect(s.blockedCount).toBe(2); // high + medium; clear excluded
  });

  it("computes percentReleased by tonnage when tons > 0", () => {
    const metrics = makeMetrics({ totalTons: 100, releasedTons: 40 });
    const s = buildFabReleaseSummary(metrics);
    expect(s.percentReleased).toBe(40);
  });

  it("falls back to count-based percent when totalTons is 0", () => {
    const shopWp = makeWP("1", { _signals: makeSignals({ inShop: true }) });
    const metrics = makeMetrics({
      totalCount: 4,
      totalTons: 0,
      activeShop: [shopWp],
    });
    const s = buildFabReleaseSummary(metrics);
    // 1 released out of 4 total → 25%
    expect(s.percentReleased).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// buildFabReleaseSummary — decision panel queues
// ---------------------------------------------------------------------------

describe("buildFabReleaseSummary – decision panel queues", () => {
  it("readyQueue contains readyForRelease packages, sorted by readinessScore desc, capped at 6", () => {
    const wps = Array.from({ length: 8 }, (_, i) =>
      makeWP(String(i), {
        _signals: makeSignals({ readyForRelease: true, readinessScore: i * 10 }),
      })
    );
    const metrics = makeMetrics({ readyForRelease: wps });
    const s = buildFabReleaseSummary(metrics);
    expect(s.readyQueue).toHaveLength(6);
    // Highest readinessScore first (7→6→5…)
    expect(s.readyQueue[0]._signals.readinessScore).toBe(70);
  });

  it("blockedQueue excludes clear-risk packages and sorts high risk first", () => {
    const high = makeWP("h", { _signals: makeSignals({ needsRelease: true, risk: "high" }) });
    const med  = makeWP("m", { _signals: makeSignals({ needsRelease: true, risk: "medium" }) });
    const clr  = makeWP("c", { _signals: makeSignals({ needsRelease: true, risk: "clear" }) });
    const metrics = makeMetrics({ releaseBlocked: [med, clr, high] });
    const s = buildFabReleaseSummary(metrics);
    expect(s.blockedQueue[0].id).toBe("h");
    expect(s.blockedQueue.every((wp) => wp._signals.risk !== "clear")).toBe(true);
  });

  it("recentlyReleased shows in-shop packages sorted by released_date descending", () => {
    const older = makeWP("old", {
      released_date: isoOffset(-10),
      _signals: makeSignals({ inShop: true }),
    });
    const newer = makeWP("new", {
      released_date: isoOffset(-2),
      _signals: makeSignals({ inShop: true }),
    });
    const noDate = makeWP("nd", { _signals: makeSignals({ inShop: true }) });
    const metrics = makeMetrics({ activeShop: [older, newer, noDate] });
    const s = buildFabReleaseSummary(metrics);
    // noDate has no released_date → excluded from recentlyReleased
    expect(s.recentlyReleased.map((wp) => wp.id)).toEqual(["new", "old"]);
  });

  it("recentlyReleased is capped at 6", () => {
    const wps = Array.from({ length: 10 }, (_, i) =>
      makeWP(String(i), {
        released_date: isoOffset(-i),
        _signals: makeSignals({ inShop: true }),
      })
    );
    const metrics = makeMetrics({ activeShop: wps });
    const s = buildFabReleaseSummary(metrics);
    expect(s.recentlyReleased).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// KPI cell structure
// ---------------------------------------------------------------------------

describe("buildFabReleaseSummary – KPI cells", () => {
  it("emits exactly 6 KPI cells with label, value, sublabel, tone", () => {
    const s = buildFabReleaseSummary(makeMetrics());
    expect(s.kpis).toHaveLength(6);
    for (const kpi of s.kpis) {
      expect(typeof kpi.label).toBe("string");
      expect(kpi.value).toBeDefined();
      expect(typeof kpi.sublabel).toBe("string");
      expect(["danger", "warn", "good", "neutral", "info"]).toContain(kpi.tone);
    }
  });

  it("marks Blocked KPI as danger when blockedCount > 0", () => {
    const blocked = makeWP("1", { _signals: makeSignals({ needsRelease: true, risk: "high" }) });
    const s = buildFabReleaseSummary(makeMetrics({ releaseBlocked: [blocked] }));
    const blockedKpi = s.kpis.find((k) => k.label === "Blocked");
    expect(blockedKpi?.tone).toBe("danger");
  });

  it("marks labor burn as danger when over 110%", () => {
    const s = buildFabReleaseSummary(
      makeMetrics({ totalBudgetHours: 100, totalActualHours: 120, laborBurn: 120 })
    );
    const burnKpi = s.kpis.find((k) => k.label === "Labor Burn");
    expect(burnKpi?.tone).toBe("danger");
  });
});
