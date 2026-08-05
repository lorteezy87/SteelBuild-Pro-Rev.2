import { describe, it, expect } from "vitest";
import {
  buildRiskSummary,
  type RiskSignal,
  type ConstraintRecord,
} from "../riskControlCenter.derive";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RFI_SIGNAL: RiskSignal = {
  signal: "open_rfis",
  label: "Open RFIs",
  risk: "high",
  totalExposure: 15000,
  items: [
    {
      signal: "open_rfis",
      label: "RFI #001 – Connection detail",
      severity: "critical",
      exposure: 10000,
      detail: "Open 21d – Critical – Cost flagged",
      entityType: "RFI",
      entityId: "rfi-1",
      area: "Area A",
    },
    {
      signal: "open_rfis",
      label: "RFI #002 – Anchor spacing",
      severity: "high",
      exposure: 5000,
      detail: "Open 8d – High",
      entityType: "RFI",
      entityId: "rfi-2",
      area: null,
    },
  ],
};

const SLIP_SIGNAL: RiskSignal = {
  signal: "schedule_slips",
  label: "Schedule Slips",
  risk: "medium",
  totalExposure: 3000,
  items: [
    {
      signal: "schedule_slips",
      label: "Erection – Phase 2 slip",
      severity: "medium",
      exposure: 3000,
      detail: "7d slip detected",
      entityType: "ScheduleTask",
      entityId: "task-1",
      area: "Area B",
    },
  ],
};

const EMPTY_SIGNALS: RiskSignal[] = [];

const CONSTRAINTS: ConstraintRecord[] = [
  {
    id: "con-1",
    title: "Steel shop drawings not approved",
    description: "Waiting on EOR approval",
    priority: "Critical",
    status: "Open",
    due_date: "2026-07-10",
    assigned_to: "PM Jones",
    constraint_type: "Drawing",
    project_area: "Main Steel",
    created_at: "2026-06-01T00:00:00Z",
  },
  {
    id: "con-2",
    title: "Crane mat not ordered",
    description: null,
    priority: "High",
    status: "In Progress",
    due_date: null,
    assigned_to: null,
    constraint_type: "Procurement",
    project_area: null,
    created_at: "2026-06-10T00:00:00Z",
  },
  {
    id: "con-3",
    title: "Resolved item",
    description: "Done",
    priority: "Low",
    status: "Resolved",
    due_date: null,
    assigned_to: null,
    constraint_type: null,
    project_area: null,
    created_at: "2026-05-01T00:00:00Z",
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildRiskSummary – counts", () => {
  it("combines engine items and open constraints, excluding resolved ones", () => {
    const s = buildRiskSummary([RFI_SIGNAL, SLIP_SIGNAL], CONSTRAINTS);
    // engine: 3 items; constraints: 2 open (con-3 is Resolved, excluded)
    expect(s.total).toBe(5);
  });

  it("counts critical items correctly from engine + constraints", () => {
    const s = buildRiskSummary([RFI_SIGNAL], CONSTRAINTS);
    // engine: 1 critical (rfi-1); constraints: 1 critical (con-1)
    expect(s.criticalCount).toBe(2);
  });

  it("counts high = critical + high items", () => {
    const s = buildRiskSummary([RFI_SIGNAL], []);
    // 1 critical + 1 high from RFI_SIGNAL
    expect(s.highCount).toBe(2);
  });

  it("counts medium items", () => {
    const s = buildRiskSummary([SLIP_SIGNAL], []);
    expect(s.mediumCount).toBe(1);
  });

  it("openCount = total (all non-resolved items)", () => {
    const s = buildRiskSummary([RFI_SIGNAL], CONSTRAINTS);
    expect(s.openCount).toBe(s.total);
  });

  it("counts mitigating = constraints with status In Progress only", () => {
    const s = buildRiskSummary([RFI_SIGNAL], CONSTRAINTS);
    // Only con-2 has status "In Progress"
    expect(s.mitigatingCount).toBe(1);
  });
});

describe("buildRiskSummary – exposure", () => {
  it("sums engine exposure; constraints always contribute 0", () => {
    const s = buildRiskSummary([RFI_SIGNAL, SLIP_SIGNAL], CONSTRAINTS);
    expect(s.totalExposure).toBe(18000); // 10000 + 5000 + 3000
  });

  it("returns 0 exposure for pure-constraint dataset", () => {
    const s = buildRiskSummary([], CONSTRAINTS);
    expect(s.totalExposure).toBe(0);
  });
});

describe("buildRiskSummary – topByScore queue", () => {
  it("sorts by urgency score — critical/high first, then by exposure", () => {
    const s = buildRiskSummary([RFI_SIGNAL, SLIP_SIGNAL], []);
    expect(s.topByScore[0].severity).toBe("critical");
  });

  it("caps at 6 items", () => {
    const manyItems: RiskSignal = {
      signal: "open_rfis",
      label: "Open RFIs",
      risk: "high",
      totalExposure: 0,
      items: Array.from({ length: 10 }, (_, i) => ({
        signal: "open_rfis",
        label: `RFI #${i + 1}`,
        severity: "high" as const,
        exposure: i * 100,
        detail: `Detail ${i}`,
        entityType: "RFI",
        entityId: `rfi-${i}`,
      })),
    };
    const s = buildRiskSummary([manyItems], []);
    expect(s.topByScore.length).toBeLessThanOrEqual(6);
  });
});

describe("buildRiskSummary – byCategory", () => {
  it("groups engine items by signal label", () => {
    const s = buildRiskSummary([RFI_SIGNAL, SLIP_SIGNAL], []);
    const cats = s.byCategory.map((c) => c.category);
    expect(cats).toContain("Open RFIs");
    expect(cats).toContain("Schedule Slips");
  });

  it("sorts categories by exposure descending", () => {
    const s = buildRiskSummary([SLIP_SIGNAL, RFI_SIGNAL], []);
    expect(s.byCategory[0].totalExposure).toBeGreaterThanOrEqual(s.byCategory[1]?.totalExposure ?? 0);
  });

  it("groups constraints under their constraint_type", () => {
    const s = buildRiskSummary([], CONSTRAINTS);
    const cats = s.byCategory.map((c) => c.category);
    expect(cats).toContain("Drawing");
    expect(cats).toContain("Procurement");
  });
});

describe("buildRiskSummary – needsMitigation queue", () => {
  it("flags high/critical items with no owner and no mitigation status", () => {
    // rfi-1 (critical, no owner) and rfi-2 (high, no owner) qualify.
    // con-2 has no owner but IS In Progress, so it has a mitigationStatus — excluded.
    // con-1 has an owner, so excluded.
    const s = buildRiskSummary([RFI_SIGNAL], CONSTRAINTS);
    const ids = s.needsMitigation.map((i) => i.entityId);
    expect(ids).toContain("rfi-1");
    expect(ids).toContain("rfi-2");
  });

  it("caps at 6 items", () => {
    const s = buildRiskSummary([RFI_SIGNAL, SLIP_SIGNAL], []);
    expect(s.needsMitigation.length).toBeLessThanOrEqual(6);
  });
});

describe("buildRiskSummary – empty inputs", () => {
  it("returns zeroed-out summary for empty signals and empty constraints", () => {
    const s = buildRiskSummary(EMPTY_SIGNALS, []);
    expect(s.total).toBe(0);
    expect(s.criticalCount).toBe(0);
    expect(s.highCount).toBe(0);
    expect(s.mediumCount).toBe(0);
    expect(s.openCount).toBe(0);
    expect(s.mitigatingCount).toBe(0);
    expect(s.totalExposure).toBe(0);
    expect(s.topByScore).toHaveLength(0);
    expect(s.byCategory).toHaveLength(0);
    expect(s.needsMitigation).toHaveLength(0);
  });

  it("handles signals with empty items arrays gracefully", () => {
    const emptySignal: RiskSignal = { signal: "open_rfis", label: "Open RFIs", risk: "low", totalExposure: 0, items: [] };
    const s = buildRiskSummary([emptySignal], []);
    expect(s.total).toBe(0);
  });
});
