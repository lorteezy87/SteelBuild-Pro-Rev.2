/**
 * Tests for the Projects Control Center derivation module.
 * Pure functions only — no React, no network.
 */
import { describe, it, expect } from "vitest";
import {
  buildProjectsSummary,
  effectivePct,
  type ProjectRecord,
  type WorkPackageRecord,
  type RfiRecord,
  type ChangeOrderRecord,
} from "../projectsControlCenter.derive";

// ── Fixtures ──────────────────────────────────────────────────────

function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: "p1",
    name: "Test Project",
    phase: "Fabrication",
    health_status: "On Track",
    original_contract_value: 500_000,
    target_completion_date: null,
    on_hold: false,
    updated_at: "2026-06-20T10:00:00Z",
    ...overrides,
  };
}

function makeWP(overrides: Partial<WorkPackageRecord> = {}): WorkPackageRecord {
  return {
    id: "wp1",
    project_id: "p1",
    status: "In Progress",
    tonnage: 10,
    ...overrides,
  };
}

function makeRfi(overrides: Partial<RfiRecord> = {}): RfiRecord {
  return {
    id: "r1",
    project_id: "p1",
    status: "Open",
    date_required: null,
    ...overrides,
  };
}

function makeCO(overrides: Partial<ChangeOrderRecord> = {}): ChangeOrderRecord {
  return {
    id: "co1",
    project_id: "p1",
    status: "Submitted",
    co_amount: 25_000,
    ...overrides,
  };
}

// ── effectivePct ─────────────────────────────────────────────────

describe("effectivePct", () => {
  it("uses scope_complete_pct_override when present", () => {
    const p = makeProject({ scope_complete_pct_override: 72.6 });
    expect(effectivePct(p, [])).toBe(73); // Math.round
  });

  it("falls back to WP progress when override is null", () => {
    const p = makeProject({ scope_complete_pct_override: null });
    const wps: WorkPackageRecord[] = [
      makeWP({ status: "Complete" }),
      makeWP({ id: "wp2", status: "In Progress" }),
    ];
    expect(effectivePct(p, wps)).toBe(50);
  });

  it("returns 0 when no WPs and no override", () => {
    const p = makeProject({ scope_complete_pct_override: null });
    expect(effectivePct(p, [])).toBe(0);
  });
});

// ── buildProjectsSummary KPIs ─────────────────────────────────────

describe("buildProjectsSummary – KPIs", () => {
  it("moves stored On Track projects with five overdue leaf tasks into At Risk", () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const summary = buildProjectsSummary(
      [makeProject({ id: "p1", health_status: "On Track" })],
      [],
      [],
      [],
      Array.from({ length: 5 }, (_, i) => ({
        id: `t${i}`,
        project_id: "p1",
        end_date: yesterday,
        percent_complete: 0,
      })),
      today,
      { rfiEvidenceLoaded: true, scheduleEvidenceLoaded: true },
    );
    expect(summary.kpis.atRisk).toBe(1);
    expect(summary.atRiskQueue[0].project.id).toBe("p1");
    expect(summary.healthByProjectId.p1.label).toBe("At Risk");
  });

  it("does not count a 100 percent project as active", () => {
    const summary = buildProjectsSummary([
      makeProject({ id: "p1", scope_complete_pct_override: 100, health_status: "On Track" }),
    ]);
    expect(summary.kpis.activeProjects).toBe(0);
  });

  it("counts total + active + at-risk + on-hold correctly", () => {
    const projects: ProjectRecord[] = [
      makeProject({ id: "p1", health_status: "At Risk" }),
      makeProject({ id: "p2", health_status: "On Track" }),
      makeProject({ id: "p3", on_hold: true, health_status: "On Track" }),
      makeProject({ id: "p4", phase: "Closeout", health_status: "On Track" }),
    ];
    const { kpis } = buildProjectsSummary(projects);
    expect(kpis.totalProjects).toBe(4);
    expect(kpis.atRisk).toBe(1);           // only active at-risk
    expect(kpis.onHold).toBe(1);
    expect(kpis.activeProjects).toBe(2);   // not Closeout, not on_hold
  });

  it("excludes on-hold projects from contract-value rollup", () => {
    const projects: ProjectRecord[] = [
      makeProject({ id: "p1", original_contract_value: 1_000_000, on_hold: false }),
      makeProject({ id: "p2", original_contract_value: 500_000, on_hold: true }),
    ];
    const { kpis } = buildProjectsSummary(projects);
    expect(kpis.totalContractValue).toBe(1_000_000);
  });

  it("counts pending COs and their total value (active only)", () => {
    const projects: ProjectRecord[] = [
      makeProject({ id: "p1" }),
      makeProject({ id: "p2", on_hold: true }),
    ];
    const cos: ChangeOrderRecord[] = [
      makeCO({ id: "co1", project_id: "p1", status: "Submitted", co_amount: 10_000 }),
      makeCO({ id: "co2", project_id: "p2", status: "Submitted", co_amount: 20_000 }),  // on-hold — excluded
      makeCO({ id: "co3", project_id: "p1", status: "Approved",  co_amount: 5_000 }),   // approved — not pending
    ];
    const { kpis } = buildProjectsSummary(projects, [], [], cos);
    expect(kpis.pendingCOCount).toBe(1);
    expect(kpis.pendingCOValue).toBe(10_000);
  });

  it("counts open and overdue RFIs on active projects only", () => {
    const projects: ProjectRecord[] = [
      makeProject({ id: "p1" }),
      makeProject({ id: "p2", on_hold: true }),
    ];
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const rfis: RfiRecord[] = [
      makeRfi({ id: "r1", project_id: "p1", status: "Open", date_required: yesterday }),
      makeRfi({ id: "r2", project_id: "p2", status: "Open", date_required: yesterday }), // on-hold excluded
    ];
    const { kpis } = buildProjectsSummary(projects, [], rfis);
    expect(kpis.openRfis).toBe(1);
    expect(kpis.overdueRfis).toBe(1);
  });

  it("computes avgPctComplete from scope_complete_pct_override when set", () => {
    const projects: ProjectRecord[] = [
      makeProject({ id: "p1", scope_complete_pct_override: 40 }),
      makeProject({ id: "p2", scope_complete_pct_override: 60 }),
    ];
    const { kpis } = buildProjectsSummary(projects);
    expect(kpis.avgPctComplete).toBe(50);
  });
});

// ── buildProjectsSummary panels ──────────────────────────────────

describe("buildProjectsSummary – panels", () => {
  it("at-risk queue only contains health_status='At Risk' projects", () => {
    const projects: ProjectRecord[] = [
      makeProject({ id: "p1", health_status: "At Risk" }),
      makeProject({ id: "p2", health_status: "Watch" }),
      makeProject({ id: "p3", health_status: "At Risk" }),
    ];
    const { atRiskQueue } = buildProjectsSummary(projects);
    expect(atRiskQueue.map((e) => e.project.id).sort()).toEqual(["p1", "p3"]);
  });

  it("closing-soon queue only contains projects with target date ≤90 days out", () => {
    const future30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const future120 = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
    const past = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const projects: ProjectRecord[] = [
      makeProject({ id: "p1", target_completion_date: future30 }),
      makeProject({ id: "p2", target_completion_date: future120 }),
      makeProject({ id: "p3", target_completion_date: past }),  // overdue — excluded
    ];
    const { closingSoonQueue } = buildProjectsSummary(projects);
    expect(closingSoonQueue.length).toBe(1);
    expect(closingSoonQueue[0].project.id).toBe("p1");
  });

  it("closing-soon is sorted by daysLeft ascending", () => {
    const d10 = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const d5  = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const projects: ProjectRecord[] = [
      makeProject({ id: "pA", target_completion_date: d10 }),
      makeProject({ id: "pB", target_completion_date: d5 }),
    ];
    const { closingSoonQueue } = buildProjectsSummary(projects);
    expect(closingSoonQueue[0].project.id).toBe("pB");
  });

  it("recently-updated queue sorted by updated_at descending", () => {
    const projects: ProjectRecord[] = [
      makeProject({ id: "p1", updated_at: "2026-06-10T00:00:00Z" }),
      makeProject({ id: "p2", updated_at: "2026-06-25T00:00:00Z" }),
      makeProject({ id: "p3", updated_at: "2026-06-01T00:00:00Z" }),
    ];
    const { recentlyUpdatedQueue } = buildProjectsSummary(projects);
    expect(recentlyUpdatedQueue[0].project.id).toBe("p2");
    expect(recentlyUpdatedQueue[1].project.id).toBe("p1");
    expect(recentlyUpdatedQueue[2].project.id).toBe("p3");
  });

  it("panels cap at 6 entries", () => {
    const projects: ProjectRecord[] = Array.from({ length: 10 }, (_, i) => ({
      ...makeProject({ id: `p${i}`, health_status: "At Risk" }),
      updated_at: `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const { atRiskQueue, recentlyUpdatedQueue } = buildProjectsSummary(projects);
    expect(atRiskQueue.length).toBeLessThanOrEqual(6);
    expect(recentlyUpdatedQueue.length).toBeLessThanOrEqual(6);
  });
});

// ── Edge cases ────────────────────────────────────────────────────

describe("buildProjectsSummary – edge cases", () => {
  it("handles empty inputs without throwing", () => {
    expect(() => buildProjectsSummary([])).not.toThrow();
    const { kpis } = buildProjectsSummary([]);
    expect(kpis.totalProjects).toBe(0);
    expect(kpis.avgPctComplete).toBe(0);
  });

  it("ignores child entities whose project_id is not in the projects list", () => {
    const projects = [makeProject({ id: "p1" })];
    const orphanRfi = makeRfi({ id: "orphan", project_id: "ghost", status: "Open" });
    const { kpis } = buildProjectsSummary(projects, [], [orphanRfi]);
    expect(kpis.openRfis).toBe(0);
  });
});

// ── Closing Soon + per-row % complete regressions ─────────────────
describe("closingSoonQueue", () => {
  const inDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  it("includes a project in the Closeout phase that is days from completion", () => {
    // Closeout was treated as "complete" and filtered out, so the panel said
    // "none within 90 days" while a job sat 14 days out.
    const summary = buildProjectsSummary([
      makeProject({ id: "capstone", phase: "Closeout", target_completion_date: inDays(14) }),
    ]);
    expect(summary.closingSoonQueue.map((e) => e.project.id)).toEqual(["capstone"]);
    expect(summary.closingSoonQueue[0].daysLeft).toBeLessThanOrEqual(14);
  });

  it("falls back to forecast_completion_date when no target date is set", () => {
    const summary = buildProjectsSummary([
      makeProject({ id: "p9", target_completion_date: null, forecast_completion_date: inDays(30) } as Partial<ProjectRecord>),
    ]);
    expect(summary.closingSoonQueue.map((e) => e.project.id)).toEqual(["p9"]);
  });

  it("still excludes finished, on-hold, and beyond-90-day projects", () => {
    const summary = buildProjectsSummary([
      makeProject({ id: "done", status: "Complete", target_completion_date: inDays(10) }),
      makeProject({ id: "hold", on_hold: true, target_completion_date: inDays(10) }),
      makeProject({ id: "far", target_completion_date: inDays(120) }),
      makeProject({ id: "past", target_completion_date: inDays(-5) }),
    ]);
    expect(summary.closingSoonQueue).toHaveLength(0);
  });
});

describe("pctCompleteByProjectId", () => {
  it("exposes work-package progress per project so the register column isn't all dashes", () => {
    const summary = buildProjectsSummary(
      [makeProject({ id: "p1" }), makeProject({ id: "p2" })],
      [
        makeWP({ id: "a", project_id: "p1", status: "Complete" }),
        makeWP({ id: "b", project_id: "p1", status: "In Progress" }),
      ],
    );
    expect(summary.pctCompleteByProjectId.p1).toBe(50);
    expect(summary.pctCompleteByProjectId.p2).toBe(0);
  });

  it("prefers a manual scope override over work-package progress", () => {
    const summary = buildProjectsSummary(
      [makeProject({ id: "p1", scope_complete_pct_override: 80 })],
      [makeWP({ id: "a", project_id: "p1", status: "In Progress" })],
    );
    expect(summary.pctCompleteByProjectId.p1).toBe(80);
  });
});
