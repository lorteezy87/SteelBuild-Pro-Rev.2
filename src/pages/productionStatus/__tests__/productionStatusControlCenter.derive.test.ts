import { describe, it, expect } from "vitest";
import {
  buildProductionSummary,
  stageTone,
  stageBaselinePercent,
} from "../productionStatusControlCenter.derive";
import type { PieceProductionRow } from "@/lib/production/repository";

// ── Test data ─────────────────────────────────────────────────────────────────

function iso(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function piece(overrides: Partial<PieceProductionRow> = {}): PieceProductionRow {
  return {
    id: Math.random().toString(36).slice(2),
    project_id: "proj-1",
    piece_mark: "W12X53-1",
    assembly_mark: null,
    status: "Cut",
    percent_complete: null,
    quantity: 1,
    weight: null,
    sequence_number: null,
    erection_area: null,
    ship_date: null,
    stage_data: null,
    source: null,
    external_ref: null,
    notes: null,
    imported_at: null,
    is_deleted: false,
    ...overrides,
  };
}

// ── Empty input ───────────────────────────────────────────────────────────────

describe("buildProductionSummary — empty input", () => {
  const s = buildProductionSummary([]);

  it("returns zeroed KPIs", () => {
    expect(s.total).toBe(0);
    expect(s.inProduction).toBe(0);
    expect(s.completed).toBe(0);
    expect(s.notStarted).toBe(0);
    expect(s.qualityHold).toBe(0);
    expect(s.pastDue).toBe(0);
    expect(s.pctComplete).toBe(0);
    expect(s.unknown).toBe(0);
  });

  it("returns empty queues", () => {
    expect(s.byArea).toEqual([]);
    expect(s.stageQueue).toEqual([]);
    expect(s.pastDueQueue).toEqual([]);
  });

  it("returns byStage with canonical stages at 0", () => {
    expect(s.byStage.length).toBeGreaterThan(0);
    for (const row of s.byStage) {
      expect(row.count).toBe(0);
      expect(row.pct).toBe(0);
    }
  });
});

// ── KPI counts ────────────────────────────────────────────────────────────────

describe("buildProductionSummary — KPI counts", () => {
  const pieces = [
    piece({ status: "Shipped",     percent_complete: 100, erection_area: "Level 1" }),
    piece({ status: "Paint",       percent_complete: 90,  erection_area: "Level 1" }),
    piece({ status: "Weld",        percent_complete: 60,  erection_area: "Level 2" }),
    piece({ status: "Cut",         percent_complete: 20,  erection_area: "Level 2" }),
    piece({ status: "Not Started", percent_complete: 0,   erection_area: "Level 2" }),
    piece({ status: null,          percent_complete: null }),  // unmapped
  ];

  const s = buildProductionSummary(pieces);

  it("total = all pieces", () => expect(s.total).toBe(6));
  it("completed = Shipped count", () => expect(s.completed).toBe(1));
  it("notStarted = Not Started count", () => expect(s.notStarted).toBe(1));
  it("unknown = pieces with no canonical stage", () => expect(s.unknown).toBe(1));
  it("inProduction = total - shipped - notStarted - unknown", () => {
    // 6 - 1 - 1 - 1 = 3
    expect(s.inProduction).toBe(3);
  });
  it("qualityHold is always 0 (no field on PieceProductionRow)", () => {
    expect(s.qualityHold).toBe(0);
  });
  it("pctComplete is the rounded average of percent_complete (non-null)", () => {
    // (100+90+60+20+0) / 5 = 54
    expect(s.pctComplete).toBe(54);
  });
});

// ── Past-due detection ────────────────────────────────────────────────────────

describe("buildProductionSummary — past-due", () => {
  it("counts pieces with ship_date < today AND not Shipped", () => {
    const pieces = [
      piece({ status: "Weld",    ship_date: iso(-3) }),  // past-due
      piece({ status: "Paint",   ship_date: iso(-1) }),  // past-due
      piece({ status: "Shipped", ship_date: iso(-5) }),  // shipped — NOT past-due
      piece({ status: "Cut",     ship_date: iso(3) }),   // future — not past-due
      piece({ status: "Fit",     ship_date: null }),     // no date — not past-due
    ];
    const s = buildProductionSummary(pieces);
    expect(s.pastDue).toBe(2);
    expect(s.pastDueQueue.length).toBe(2);
  });

  it("sorts past-due queue by ship_date ascending (most overdue first)", () => {
    const pieces = [
      piece({ status: "Cut",   ship_date: iso(-1), piece_mark: "B" }),
      piece({ status: "Weld",  ship_date: iso(-5), piece_mark: "A" }),
    ];
    const s = buildProductionSummary(pieces);
    expect(s.pastDueQueue[0].piece_mark).toBe("A"); // ship_date: iso(-5) < iso(-1)
  });
});

// ── By Area panel ────────────────────────────────────────────────────────────

describe("buildProductionSummary — byArea", () => {
  const pieces = [
    piece({ erection_area: "Level 1", status: "Shipped",     percent_complete: 100 }),
    piece({ erection_area: "Level 1", status: "Weld",        percent_complete: 60  }),
    piece({ erection_area: "Level 2", status: "Cut",         percent_complete: 20  }),
    piece({ erection_area: null,       status: "Not Started", percent_complete: 0   }),
  ];

  const s = buildProductionSummary(pieces);

  it("groups by erection_area, null → 'Unassigned'", () => {
    const areas = s.byArea.map((a) => a.area);
    expect(areas).toContain("Level 1");
    expect(areas).toContain("Level 2");
    expect(areas).toContain("Unassigned");
  });

  it("counts shipped and inFab correctly per area", () => {
    const l1 = s.byArea.find((a) => a.area === "Level 1")!;
    expect(l1.total).toBe(2);
    expect(l1.shipped).toBe(1);
    expect(l1.inFab).toBe(1); // Weld
  });

  it("computes avgPct per area from pieces that have percent_complete", () => {
    const l1 = s.byArea.find((a) => a.area === "Level 1")!;
    expect(l1.avgPct).toBe(80); // (100+60)/2
  });

  it("sorts areas by total descending", () => {
    expect(s.byArea[0].total).toBeGreaterThanOrEqual(s.byArea[s.byArea.length - 1].total);
  });
});

// ── Stage queue ───────────────────────────────────────────────────────────────

describe("buildProductionSummary — stageQueue", () => {
  it("excludes Shipped and Not Started from the stage queue", () => {
    const pieces = [
      piece({ status: "Shipped" }),
      piece({ status: "Not Started" }),
      piece({ status: "Weld" }),
      piece({ status: "Weld" }),
      piece({ status: "Paint" }),
    ];
    const s = buildProductionSummary(pieces);
    const stageNames = s.stageQueue.map((r) => r.stage);
    expect(stageNames).not.toContain("Shipped");
    expect(stageNames).not.toContain("Not Started");
    expect(stageNames).toContain("Weld");
    expect(stageNames).toContain("Paint");
  });

  it("sorts stageQueue by count descending", () => {
    const pieces = [
      piece({ status: "Cut" }),
      piece({ status: "Weld" }),
      piece({ status: "Weld" }),
    ];
    const s = buildProductionSummary(pieces);
    expect(s.stageQueue[0].stage).toBe("Weld");
    expect(s.stageQueue[0].count).toBe(2);
  });
});

// ── stageTone ─────────────────────────────────────────────────────────────────

describe("stageTone", () => {
  it("maps Shipped and Paint to 'good'", () => {
    expect(stageTone("Shipped")).toBe("good");
    expect(stageTone("Paint")).toBe("good");
  });
  it("maps active shop stages to warn/info", () => {
    expect(stageTone("Weld")).toBe("warn");
    expect(stageTone("Fit")).toBe("warn");
    expect(stageTone("Clean")).toBe("info");
    expect(stageTone("Cut")).toBe("info");
  });
  it("maps Not Started and unknown to neutral", () => {
    expect(stageTone("Not Started")).toBe("neutral");
    expect(stageTone(null)).toBe("neutral");
    expect(stageTone(undefined)).toBe("neutral");
    expect(stageTone("")).toBe("neutral");
  });
});

// ── stageBaselinePercent ──────────────────────────────────────────────────────

describe("stageBaselinePercent", () => {
  it("returns the canonical percent from STAGE_PERCENT", () => {
    expect(stageBaselinePercent("Shipped")).toBe(100);
    expect(stageBaselinePercent("Not Started")).toBe(0);
    expect(stageBaselinePercent("Weld")).toBe(60);
  });
  it("returns 0 for null/undefined/unknown stage", () => {
    expect(stageBaselinePercent(null)).toBe(0);
    expect(stageBaselinePercent(undefined)).toBe(0);
    expect(stageBaselinePercent("GalvPlus")).toBe(0);
  });
});
