import { describe, it, expect } from "vitest";
import { diffPlannerEvent, buildChangeLog, summarizeEntry } from "../scheduleChangeLog";

/**
 * Cover for audit §1.3 / §7.6.
 *
 * Note the audit's §1.3 count is wrong and the migration header records the
 * correction: `record_planner_action_event` HAS been logging every schedule_task
 * insert and update since 2026-08-05. The gap was never that nothing was
 * recorded — it was that nothing could read it back, plus deletes and several
 * fields going uncaptured. This module is the read half.
 *
 * The rule these tests exist to hold: report only what CHANGED. An entry that
 * echoes fifteen unchanged fields buries the one date that moved.
 */

const evt = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  entity_id: "task-1",
  entity_type: "schedule_task",
  event_type: "schedule_task_updated",
  occurred_at: "2026-09-04T18:22:00Z",
  actor_user_id: "user-1",
  before_state: {},
  after_state: {},
  ...over,
});

describe("diffPlannerEvent — only what changed", () => {
  it("reports a moved finish date and nothing else", () => {
    const entry = diffPlannerEvent(evt({
      before_state: { task_name: "Fab beams", start_date: "2026-03-01", end_date: "2026-03-10", status: "In Progress" },
      after_state:  { task_name: "Fab beams", start_date: "2026-03-01", end_date: "2026-03-17", status: "In Progress" },
    }))!;

    expect(entry.changes).toHaveLength(1);
    expect(entry.changes[0]).toMatchObject({
      field: "end_date", label: "Finish", from: "2026-03-10", to: "2026-03-17", kind: "date",
    });
    expect(entry.movedDates).toBe(true);
  });

  it("orders dates before everything else", () => {
    // The log is read for dates; a status change listed above a slipped finish
    // makes the reader hunt for the thing they opened it to find.
    const entry = diffPlannerEvent(evt({
      before_state: { priority: "Normal", status: "Not Started", end_date: "2026-03-10" },
      after_state:  { priority: "High",   status: "In Progress", end_date: "2026-03-17" },
    }))!;
    expect(entry.changes.map((c) => c.field)).toEqual(["end_date", "status", "priority"]);
  });

  it("says nothing when a save touched no tracked field", () => {
    const entry = diffPlannerEvent(evt({
      before_state: { task_name: "Fab beams", notes: "old" },
      after_state:  { task_name: "Fab beams", notes: "new" },
    }))!;
    expect(entry.changes).toEqual([]);
    expect(summarizeEntry(entry)).toBe("No tracked fields changed");
  });

  it("treats null, undefined and empty string as the same absence", () => {
    // Otherwise clearing a date to '' logs a change against a column that was
    // already null, and every such save produces a phantom entry.
    const entry = diffPlannerEvent(evt({
      before_state: { end_date: null, assigned_to: "" },
      after_state:  { end_date: "",   assigned_to: null },
    }))!;
    expect(entry.changes).toEqual([]);
  });
});

describe("diffPlannerEvent — create and delete", () => {
  it("a create reports its opening values with no 'from'", () => {
    const entry = diffPlannerEvent(evt({
      event_type: "schedule_task_created",
      before_state: null,
      after_state: { task_name: "Erect seq 2", start_date: "2026-06-01", end_date: "2026-06-10" },
    }))!;

    expect(entry.eventType).toBe("created");
    expect(entry.changes.every((c) => c.from === null)).toBe(true);
    expect(entry.changes.map((c) => c.field)).toEqual(["start_date", "end_date", "task_name"]);
  });

  it("a delete reports what was lost, and keeps the name from before_state", () => {
    // after_state is NULL on a delete, so a name read only from after_state
    // would leave the most important entry in the log unlabelled.
    const entry = diffPlannerEvent(evt({
      event_type: "schedule_task_deleted",
      before_state: { task_name: "Approve shop drawings", start_date: "2026-02-01", end_date: "2026-02-14" },
      after_state: null,
    }))!;

    expect(entry.eventType).toBe("deleted");
    expect(entry.taskName).toBe("Approve shop drawings");
    expect(entry.changes.every((c) => c.to === null)).toBe(true);
    expect(summarizeEntry(entry)).toBe("Task deleted");
  });
});

describe("dependencies are decoded, not dumped", () => {
  it("renders link type and lag instead of raw JSON", () => {
    const entry = diffPlannerEvent(evt({
      before_state: { dependencies: JSON.stringify([{ id: "a", type: "FS", lag_days: 1 }]) },
      after_state:  { dependencies: JSON.stringify([
        { id: "a", type: "FS", lag_days: 1 },
        { id: "b", type: "SS", lag_days: 0 },
      ]) },
    }))!;

    const change = entry.changes.find((c) => c.field === "dependencies")!;
    expect(change.from).toBe("FS+1");
    expect(change.to).toBe("FS+1, SS+0");
    expect(change.kind).toBe("logic");
  });

  it("renders an emptied predecessor list as 'none', not a blank", () => {
    const entry = diffPlannerEvent(evt({
      before_state: { dependencies: JSON.stringify([{ id: "a", type: "FS", lag_days: 1 }]) },
      after_state:  { dependencies: null },
    }))!;
    const change = entry.changes.find((c) => c.field === "dependencies")!;
    expect(change.to).toBe("none");
  });

  it("compares raw values, so a storage-shape change is not reported as a change", () => {
    // Legacy id-string array vs the link-object shape parse to the same links.
    // Comparing FORMATTED strings would call this "no change" — which is right
    // here — but comparing formatted strings in general hides real changes that
    // the formatter collapses, so the comparison stays on the raw value and
    // this case is simply reported honestly as a rewrite.
    const entry = diffPlannerEvent(evt({
      before_state: { dependencies: JSON.stringify(["a"]) },
      after_state:  { dependencies: JSON.stringify([{ id: "a", type: "FS", lag_days: 1 }]) },
    }))!;
    const change = entry.changes.find((c) => c.field === "dependencies");
    expect(change).toBeTruthy();
    expect(change!.from).toBe("FS+1");
    expect(change!.to).toBe("FS+1");
  });
});

describe("actuals and duration formatting", () => {
  it("labels the actuals distinctly from the plan and counts them as dates", () => {
    const entry = diffPlannerEvent(evt({
      before_state: { actual_finish_date: null },
      after_state:  { actual_finish_date: "2026-09-08" },
    }))!;
    const change = entry.changes[0];
    expect(change.label).toBe("Actual finish");
    expect(change.kind).toBe("actual");
    expect(entry.movedDates).toBe(true);
  });

  it("suffixes duration and percent so the numbers are unambiguous", () => {
    const entry = diffPlannerEvent(evt({
      before_state: { duration: 5, percent_complete: 0 },
      after_state:  { duration: 12, percent_complete: 50 },
    }))!;
    expect(entry.changes.find((c) => c.field === "duration")).toMatchObject({ from: "5d", to: "12d" });
    expect(entry.changes.find((c) => c.field === "percent_complete")).toMatchObject({ from: "0%", to: "50%" });
  });
});

describe("buildChangeLog", () => {
  const events = [
    evt({ id: "a", before_state: { end_date: "2026-03-10" }, after_state: { end_date: "2026-03-17" } }),
    evt({ id: "b", before_state: { priority: "Normal" }, after_state: { priority: "High" } }),
    evt({ id: "c", before_state: { notes: "x" }, after_state: { notes: "y" } }), // nothing tracked
    evt({ id: "d", event_type: "schedule_task_deleted", before_state: { task_name: "Gone" }, after_state: null }),
  ];

  it("drops entries where nothing tracked changed", () => {
    expect(buildChangeLog(events).map((e) => e.id)).toEqual(["a", "b", "d"]);
  });

  it("keeps them when asked", () => {
    expect(buildChangeLog(events, { hideEmpty: false }).map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("datesOnly keeps date moves AND deletes", () => {
    // A deleted task is a schedule change whether or not its dates moved —
    // dropping it from the delay-claim view would hide the biggest event there is.
    expect(buildChangeLog(events, { datesOnly: true }).map((e) => e.id)).toEqual(["a", "d"]);
  });

  it("tolerates empty and null input", () => {
    expect(buildChangeLog([])).toEqual([]);
    expect(buildChangeLog(null)).toEqual([]);
    expect(diffPlannerEvent(null)).toBeNull();
  });
});

describe("summarizeEntry", () => {
  it("spells out a single change and names the fields for several", () => {
    const one = diffPlannerEvent(evt({
      before_state: { end_date: "2026-03-10" }, after_state: { end_date: "2026-03-17" },
    }))!;
    expect(summarizeEntry(one)).toBe("Finish 2026-03-10 → 2026-03-17");

    const many = diffPlannerEvent(evt({
      before_state: { start_date: "2026-03-01", end_date: "2026-03-10" },
      after_state:  { start_date: "2026-03-05", end_date: "2026-03-17" },
    }))!;
    expect(summarizeEntry(many)).toBe("Start, Finish changed");
  });
});
