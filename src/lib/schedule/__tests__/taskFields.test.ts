import { describe, it, expect } from "vitest";
import { isMilestoneTask, milestonePatch, withMilestoneFlags } from "../taskFields";
import { withAssignmentPair } from "@/pages/schedule/scheduleAssignmentHelpers";

/**
 * Audit §4.3 — the milestone flag and the assignment field, each written one
 * way so a reader and a writer can no longer disagree about the same row.
 */

describe("isMilestoneTask", () => {
  it("accepts any of the three signals", () => {
    expect(isMilestoneTask({ task_type: "Milestone" })).toBe(true);
    expect(isMilestoneTask({ is_milestone: true })).toBe(true);
    expect(isMilestoneTask({ milestone: true })).toBe(true);
  });

  it("does not infer a milestone from the shape of a task", () => {
    // Auto-detection was removed once already: both add paths default the two
    // dates to today, which flagged every newly created task as a milestone.
    expect(isMilestoneTask({ task_type: "Task", start_date: "2026-09-01", end_date: "2026-09-01" })).toBe(false);
    expect(isMilestoneTask({ task_type: "Task", duration: 0 })).toBe(false);
  });

  it("treats missing and false alike, and survives a null task", () => {
    expect(isMilestoneTask(null)).toBe(false);
    expect(isMilestoneTask(undefined)).toBe(false);
    expect(isMilestoneTask({})).toBe(false);
    expect(isMilestoneTask({ is_milestone: false, milestone: false })).toBe(false);
  });
});

describe("milestonePatch", () => {
  it("writes both booleans so no consumer is left reading a null", () => {
    // is_milestone is what the calendar, reports, PCC and margin views read;
    // nothing used to write it, so the 3 production milestones were invisible
    // to all four.
    expect(milestonePatch("Milestone")).toEqual({ is_milestone: true, milestone: true });
  });

  it("writes false rather than leaving the flags unset", () => {
    // Otherwise "not a milestone" and "never asked" are the same value, and
    // isMilestoneTask keeps returning true off the stale column.
    expect(milestonePatch("Task")).toEqual({ is_milestone: false, milestone: false });
    expect(milestonePatch(null)).toEqual({ is_milestone: false, milestone: false });
  });
});

describe("withMilestoneFlags", () => {
  it("round-trips through isMilestoneTask for every task type", () => {
    for (const taskType of ["Task", "Fabrication", "Milestone", "RFI"]) {
      const row = withMilestoneFlags({ task_type: taskType });
      expect(isMilestoneTask(row)).toBe(taskType === "Milestone");
    }
  });

  it("clears the flags when a milestone is retyped as something else", () => {
    expect(withMilestoneFlags({ task_type: "Task", is_milestone: true, milestone: true }))
      .toEqual({ task_type: "Task", is_milestone: false, milestone: false });
  });

  it("leaves a partial update that never mentions task_type alone", () => {
    // Moving a date must not restate a flag it was not given.
    const fields = { start_date: "2026-09-01" };
    expect(withMilestoneFlags(fields)).toBe(fields);
    expect(withMilestoneFlags({ task_type: undefined })).toEqual({ task_type: undefined });
  });
});

describe("withAssignmentPair", () => {
  it("fills in assigned_to when only resource_names was given", () => {
    // The two add paths wrote resource_names alone: 315 production rows carry
    // it against 151 with assigned_to.
    expect(withAssignmentPair({ resource_names: "Fab A" }))
      .toEqual({ resource_names: "Fab A", assigned_to: "Fab A" });
  });

  it("fills in resource_names when only assigned_to was given", () => {
    // The Task List's inline editor writes assigned_to, but taskOwner reads
    // resource_names first — so on any row that already had one, the edit
    // saved and changed nothing the user could see.
    expect(withAssignmentPair({ assigned_to: "Crew 2" }))
      .toEqual({ resource_names: "Crew 2", assigned_to: "Crew 2" });
  });

  it("settles a disagreement on the half that is read first", () => {
    expect(withAssignmentPair({ resource_names: "Fab A", assigned_to: "stale" }))
      .toEqual({ resource_names: "Fab A", assigned_to: "Fab A" });
  });

  it("clears both halves together", () => {
    expect(withAssignmentPair({ assigned_to: "" }))
      .toEqual({ resource_names: null, assigned_to: null });
    expect(withAssignmentPair({ resource_names: null }))
      .toEqual({ resource_names: null, assigned_to: null });
  });

  it("trims, so a name typed with a trailing space is not a different owner", () => {
    expect(withAssignmentPair({ resource_names: "  Fab A  " }))
      .toEqual({ resource_names: "Fab A", assigned_to: "Fab A" });
  });

  it("leaves a payload that touches neither field alone", () => {
    const fields = { status: "Complete" };
    expect(withAssignmentPair(fields)).toBe(fields);
  });

  it("does not touch the crew columns", () => {
    // crew_id is a foreign key to a real crew record, not a free-text owner;
    // folding it in would let a typed name overwrite an actual assignment.
    const out = withAssignmentPair({ resource_names: "Fab A", crew_id: "crew-1", crew_name: "Red" });
    expect(out.crew_id).toBe("crew-1");
    expect(out.crew_name).toBe("Red");
  });
});
