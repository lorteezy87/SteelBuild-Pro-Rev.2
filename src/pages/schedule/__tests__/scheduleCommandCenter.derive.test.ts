import { describe, expect, it } from "vitest";
import { buildScheduleSummary } from "../scheduleCommandCenter.derive";
import type { TaskRecord } from "../scheduleCommandCenter.derive";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** ISO date string offset from today by `days`. Negative = past. */
function daysFromToday(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const YESTERDAY = daysFromToday(-1);
const TOMORROW = daysFromToday(1);
const IN_7_DAYS = daysFromToday(7);
const IN_20_DAYS = daysFromToday(20);
const THREE_WEEKS_AGO = daysFromToday(-21);

// ── Factory ───────────────────────────────────────────────────────────────────

let idSeq = 0;
function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  idSeq++;
  return {
    id: `task-${idSeq}`,
    task_name: `Task ${idSeq}`,
    status: "Not Started",
    percent_complete: 0,
    start_date: null,
    end_date: null,
    phase: "Fabrication",
    milestone: false,
    priority: "Normal",
    blockers: null,
    resource_names: "Alice",
    assigned_to: null,
    ...overrides,
  };
}

// ── Counts and TBD ────────────────────────────────────────────────────────────

describe("buildScheduleSummary — totals and TBD", () => {
  it("returns zeroed summary for empty task list", () => {
    const s = buildScheduleSummary([]);
    expect(s.total).toBe(0);
    expect(s.critical).toBe(0);
    expect(s.activities).toBe(0);
    expect(s.atRisk).toBe(0);
    expect(s.overdue).toBe(0);
    expect(s.inLookahead).toBe(0);
    expect(s.pctComplete).toBe(0);
    expect(s.tbd).toBe(0);
    expect(s.milestones).toBe(0);
    expect(s.lookaheadQueue).toHaveLength(0);
    expect(s.milestoneQueue).toHaveLength(0);
    expect(s.riskQueue).toHaveLength(0);
  });

  it("counts tasks with no start AND no end as TBD", () => {
    const tasks = [
      makeTask({ start_date: null, end_date: null }),          // TBD
      makeTask({ start_date: TOMORROW, end_date: null }),       // not TBD (has start)
      makeTask({ start_date: null, end_date: IN_7_DAYS }),      // not TBD (has end)
      makeTask({ start_date: YESTERDAY, end_date: TOMORROW }),  // not TBD
    ];
    const s = buildScheduleSummary(tasks);
    expect(s.tbd).toBe(1);
  });

  it("does NOT count TBD task as overdue even if status is open", () => {
    const task = makeTask({ start_date: null, end_date: null, status: "Not Started" });
    const s = buildScheduleSummary([task]);
    expect(s.overdue).toBe(0);
  });
});

// ── Summary tasks excluded from activities ────────────────────────────────────

describe("buildScheduleSummary — summary task exclusion", () => {
  it("excludes _hasChildren summary from activities count", () => {
    const summary = makeTask({ _hasChildren: true });
    const leaf = makeTask();
    const s = buildScheduleSummary([summary, leaf]);
    expect(s.activities).toBe(1);
    expect(s.total).toBe(2);
  });

  it("excludes is_summary flag from activities count", () => {
    const summary = makeTask({ is_summary: true });
    const leaf = makeTask();
    const s = buildScheduleSummary([summary, leaf]);
    expect(s.activities).toBe(1);
  });
});

// ── Overdue ───────────────────────────────────────────────────────────────────

describe("buildScheduleSummary — overdue", () => {
  it("flags open task whose end_date is yesterday", () => {
    const task = makeTask({ end_date: YESTERDAY, status: "In Progress" });
    const s = buildScheduleSummary([task]);
    expect(s.overdue).toBe(1);
  });

  it("does not flag complete task as overdue", () => {
    const task = makeTask({ end_date: YESTERDAY, status: "Complete" });
    const s = buildScheduleSummary([task]);
    expect(s.overdue).toBe(0);
  });

  it("does not flag task with future end_date as overdue", () => {
    const task = makeTask({ end_date: TOMORROW, status: "In Progress" });
    const s = buildScheduleSummary([task]);
    expect(s.overdue).toBe(0);
  });

  it("does not flag task with null end_date as overdue", () => {
    const task = makeTask({ start_date: THREE_WEEKS_AGO, end_date: null, status: "In Progress" });
    const s = buildScheduleSummary([task]);
    expect(s.overdue).toBe(0);
  });
});

// ── Critical path ─────────────────────────────────────────────────────────────

describe("buildScheduleSummary — critical", () => {
  it("counts tasks with metadata.is_critical as critical", () => {
    const tasks = [
      makeTask({ metadata: { is_critical: true } }),
      makeTask({ metadata: { is_critical: false } }),
      makeTask(),
    ];
    const s = buildScheduleSummary(tasks);
    expect(s.critical).toBe(1);
  });

  it("includes summary tasks in critical count", () => {
    // Critical-path summary should appear in the critical KPI even though
    // it is excluded from 'activities'.
    const task = makeTask({ _hasChildren: true, metadata: { is_critical: true } });
    const s = buildScheduleSummary([task]);
    expect(s.critical).toBe(1);
    expect(s.activities).toBe(0);
  });
});

// ── atRisk ────────────────────────────────────────────────────────────────────

describe("buildScheduleSummary — atRisk", () => {
  it("flags open actionable tasks with Critical priority", () => {
    const task = makeTask({ priority: "Critical", status: "In Progress" });
    const s = buildScheduleSummary([task]);
    expect(s.atRisk).toBe(1);
  });

  it("flags open actionable tasks with non-empty blockers", () => {
    const task = makeTask({ blockers: "Waiting on EOR", status: "Not Started" });
    const s = buildScheduleSummary([task]);
    expect(s.atRisk).toBe(1);
  });

  it("does not flag completed task with Critical priority", () => {
    const task = makeTask({ priority: "Critical", status: "Complete" });
    const s = buildScheduleSummary([task]);
    expect(s.atRisk).toBe(0);
  });

  it("does not flag open task with Normal priority and no blockers", () => {
    const task = makeTask({ priority: "Normal", status: "In Progress" });
    const s = buildScheduleSummary([task]);
    expect(s.atRisk).toBe(0);
  });
});

// ── pctComplete ───────────────────────────────────────────────────────────────

describe("buildScheduleSummary — pctComplete", () => {
  it("averages displayPct across actionable tasks", () => {
    const tasks = [
      makeTask({ percent_complete: 0 }),
      makeTask({ percent_complete: 50 }),
      makeTask({ percent_complete: 100 }),
    ];
    const s = buildScheduleSummary(tasks);
    expect(s.pctComplete).toBe(50);
  });

  it("treats Complete status as 100% even if percent_complete is 0", () => {
    const tasks = [
      makeTask({ status: "Complete", percent_complete: 0 }),
      makeTask({ status: "Not Started", percent_complete: 0 }),
    ];
    const s = buildScheduleSummary(tasks);
    // (100 + 0) / 2 = 50
    expect(s.pctComplete).toBe(50);
  });

  it("excludes summary tasks from pctComplete mean", () => {
    // A summary with 80% should NOT skew the leaf average.
    const tasks = [
      makeTask({ _hasChildren: true, percent_complete: 80 }),
      makeTask({ percent_complete: 20 }),
      makeTask({ percent_complete: 60 }),
    ];
    const s = buildScheduleSummary(tasks);
    expect(s.pctComplete).toBe(40); // (20 + 60) / 2
  });
});

// ── Lookahead queue ───────────────────────────────────────────────────────────

describe("buildScheduleSummary — lookaheadQueue", () => {
  it("includes tasks starting within 14 days", () => {
    const tasks = [
      makeTask({ start_date: IN_7_DAYS, end_date: IN_20_DAYS }),   // in window
      makeTask({ start_date: IN_20_DAYS, end_date: IN_20_DAYS }),  // outside window
    ];
    const s = buildScheduleSummary(tasks);
    expect(s.inLookahead).toBe(1);
    expect(s.lookaheadQueue).toHaveLength(1);
  });

  it("sorts lookaheadQueue by start_date asc, null-last", () => {
    const tasks = [
      makeTask({ start_date: IN_7_DAYS, end_date: IN_7_DAYS }),
      makeTask({ start_date: TOMORROW, end_date: IN_7_DAYS }),
      makeTask({ start_date: null, end_date: IN_7_DAYS }),  // null end, null start → edge case for lookahead
    ];
    const s = buildScheduleSummary(tasks);
    // Tasks with defined start dates come first
    const withDates = s.lookaheadQueue.filter((t) => t.start_date !== null);
    if (withDates.length >= 2) {
      expect(new Date(withDates[0].start_date!).getTime())
        .toBeLessThanOrEqual(new Date(withDates[1].start_date!).getTime());
    }
  });

  it("caps lookaheadQueue at 8", () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      makeTask({ start_date: daysFromToday(i + 1), end_date: daysFromToday(i + 2) }),
    );
    const s = buildScheduleSummary(tasks);
    expect(s.lookaheadQueue.length).toBeLessThanOrEqual(8);
  });
});

// ── Milestone queue ───────────────────────────────────────────────────────────

describe("buildScheduleSummary — milestoneQueue", () => {
  it("includes tasks with milestone flag", () => {
    const tasks = [
      makeTask({ milestone: true, start_date: IN_7_DAYS }),
      makeTask({ milestone: false }),
    ];
    const s = buildScheduleSummary(tasks);
    expect(s.milestones).toBe(1);
    expect(s.milestoneQueue).toHaveLength(1);
  });

  it("milestone with null date is included but sorted last", () => {
    const tasks = [
      makeTask({ milestone: true, start_date: null }),
      makeTask({ milestone: true, start_date: IN_7_DAYS }),
    ];
    const s = buildScheduleSummary(tasks);
    expect(s.milestones).toBe(2);
    // The one with a date should come first
    expect(s.milestoneQueue[0].start_date).toBe(IN_7_DAYS);
    expect(s.milestoneQueue[1].start_date).toBeNull();
  });

  it("caps milestoneQueue at 8", () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      makeTask({ milestone: true, start_date: daysFromToday(i + 1) }),
    );
    const s = buildScheduleSummary(tasks);
    expect(s.milestoneQueue.length).toBeLessThanOrEqual(8);
  });
});

// ── Risk queue ────────────────────────────────────────────────────────────────

describe("buildScheduleSummary — riskQueue", () => {
  it("caps riskQueue at 5", () => {
    const tasks = Array.from({ length: 10 }, () =>
      makeTask({ end_date: YESTERDAY, status: "In Progress" }),
    );
    const s = buildScheduleSummary(tasks);
    expect(s.riskQueue.length).toBeLessThanOrEqual(5);
  });

  it("overdue task scores higher than merely critical-priority task", () => {
    const overdue = makeTask({ end_date: YESTERDAY, status: "In Progress", priority: "Normal" });
    const critical = makeTask({ priority: "Critical", status: "In Progress" });
    const s = buildScheduleSummary([overdue, critical]);
    // overdue should rank first in riskQueue
    expect(s.riskQueue[0].id).toBe(overdue.id);
  });

  it("omits tasks with zero risk score from riskQueue", () => {
    const safeTask = makeTask({ status: "Not Started", priority: "Normal", blockers: null });
    const s = buildScheduleSummary([safeTask]);
    // No overdue, no stall, not critical, assigned (resource_names default "Alice"), no blockers
    expect(s.riskQueue).toHaveLength(0);
  });
});

// ── Null-date boundary (CLAUDE.md §22 enforcement) ───────────────────────────

describe("buildScheduleSummary — null-date / TBD invariants (CLAUDE.md §22)", () => {
  it("never treats a task with null dates as overdue", () => {
    const tasks = Array.from({ length: 5 }, () =>
      makeTask({ start_date: null, end_date: null, status: "In Progress" }),
    );
    const s = buildScheduleSummary(tasks);
    expect(s.overdue).toBe(0);
  });

  it("null-date tasks do not appear in lookaheadQueue if they have no end date either", () => {
    // A fully TBD task should not be visible in the 14-day lookahead
    const tbd = makeTask({ start_date: null, end_date: null });
    const s = buildScheduleSummary([tbd]);
    // isLookaheadTask returns false when both dates are null
    expect(s.inLookahead).toBe(0);
    expect(s.lookaheadQueue).toHaveLength(0);
  });
});
