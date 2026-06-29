import { describe, it, expect } from "vitest";
import {
  PHASES,
  PHASE_BY_KEY,
  PHASE_KEY_MAP,
  normalizePhase,
  displayPct,
  isMilestoneTask,
  sanitizeTaskName,
  STATUS_COLOR,
  statusColor,
} from "../scheduleTaskUtils";

describe("PHASES + PHASE_BY_KEY", () => {
  it("exposes 7 phases in canonical order", () => {
    expect(PHASES).toHaveLength(7);
    expect(PHASES.map((p) => p.key)).toEqual([
      "Pre-Construction",
      "Detailing",
      "Procurement",
      "Fabrication",
      "Delivery",
      "Installation",
      "Closeout",
    ]);
  });

  it("PHASE_BY_KEY lets you look up a phase by its key", () => {
    expect(PHASE_BY_KEY.Detailing.id).toBe(2);
    expect(PHASE_BY_KEY.Closeout.id).toBe(7);
  });
});

describe("normalizePhase", () => {
  it("returns task.phase when present", () => {
    expect(normalizePhase({ phase: "Detailing" })).toBe("Detailing");
  });

  it("folds Erection -> Installation via PHASE_KEY_MAP", () => {
    expect(PHASE_KEY_MAP.Erection).toBe("Installation");
    expect(normalizePhase({ phase: "Erection" })).toBe("Installation");
  });
});

describe("displayPct", () => {
  it("Complete tasks always read as 100% even with stale percent_complete", () => {
    expect(displayPct({ status: "Complete", percent_complete: 0 })).toBe(100);
    expect(displayPct({ status: "Complete" })).toBe(100);
  });

  it("clamps percent_complete to [0, 100]", () => {
    expect(displayPct({ percent_complete: 150 })).toBe(100);
    expect(displayPct({ percent_complete: -10 })).toBe(0);
  });

  it("returns 0 for null / undefined task or non-numeric pct", () => {
    expect(displayPct(null)).toBe(0);
    expect(displayPct({ percent_complete: "wat" })).toBe(0);
  });
});

describe("isMilestoneTask", () => {
  it("only flags milestones when the user opted in", () => {
    expect(isMilestoneTask({ milestone: true })).toBe(true);
    expect(isMilestoneTask({ milestone: false })).toBe(false);
    expect(isMilestoneTask({ start_date: "2026-04-01", end_date: "2026-04-01" })).toBe(false);
    expect(isMilestoneTask(null)).toBe(false);
  });

  it("flags milestones authored via task_type or is_milestone", () => {
    // task_type === "Milestone" is the field AddTaskModal actually writes;
    // is_milestone is set by importers. Both must count, alongside the legacy
    // `milestone` boolean — this is the regression the tracker fix addressed.
    expect(isMilestoneTask({ task_type: "Milestone" })).toBe(true);
    expect(isMilestoneTask({ is_milestone: true })).toBe(true);
    expect(isMilestoneTask({ task_type: "Task" })).toBe(false);
    expect(isMilestoneTask({ is_milestone: false })).toBe(false);
  });
});

describe("sanitizeTaskName", () => {
  it("strips a trailing resource name from the task_name", () => {
    expect(
      sanitizeTaskName({ task_name: "Stair #2Jagdish", assigned_to: "Jagdish" })
    ).toBe("Stair #2");
  });

  it("returns the original if no resource match", () => {
    expect(
      sanitizeTaskName({ task_name: "Stair #2", assigned_to: "Jagdish" })
    ).toBe("Stair #2");
  });

  it("handles missing input safely", () => {
    expect(sanitizeTaskName({})).toBe("");
    expect(sanitizeTaskName(null)).toBe("");
  });
});

describe("statusColor", () => {
  it("returns the canonical color for known statuses", () => {
    expect(statusColor("Complete")).toBe(STATUS_COLOR.Complete);
    expect(statusColor("Delayed")).toBe(STATUS_COLOR.Delayed);
  });

  it("falls back to text-muted for unknown statuses", () => {
    expect(statusColor("Whatever")).toBe("var(--text-muted)");
    expect(statusColor(null)).toBe("var(--text-muted)");
  });
});
