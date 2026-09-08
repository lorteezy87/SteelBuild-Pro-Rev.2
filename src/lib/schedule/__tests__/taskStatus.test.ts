import { describe, it, expect } from "vitest";
import {
  SCHEDULE_STATUSES,
  SCHEDULE_TASK_TYPES,
  SCHEDULE_PRIORITIES,
  DEFAULT_SCHEDULE_STATUS,
  isScheduleStatus,
  normalizeScheduleStatus,
  reconcileStatusPercent,
  withReconciledPercent,
} from "../taskStatus";

/**
 * Audit §4.1 / §4.3.
 *
 * Two database constraints are the specification here, so they are restated as
 * predicates and every case is checked against them rather than against a
 * remembered list. If either constraint is ever widened, these fail and say so
 * instead of the UI quietly offering a value that cannot be saved.
 */

/** chk_schedule_tasks_status */
const STATUS_CHECK = ["Not Started", "In Progress", "Complete", "On Hold", "Delayed"];

/** schedule_status_pct_consistency */
function pctCheckPasses(status: string, pct: number | null | undefined): boolean {
  if (pct === null || pct === undefined) return true;
  if (status === "Complete") return pct === 100;
  if (status === "Not Started") return pct === 0;
  if (status === "In Progress") return pct < 100;
  return true;
}

describe("the status vocabulary matches what the database accepts", () => {
  it("offers exactly the values chk_schedule_tasks_status allows", () => {
    expect([...SCHEDULE_STATUSES].sort()).toEqual([...STATUS_CHECK].sort());
  });

  it("does not offer Cancelled", () => {
    // It was in two of the five dropdowns and the constraint rejects it, so
    // choosing it failed the save — and in Bulk Add's rollback-free loop it
    // stranded every row before it.
    expect(SCHEDULE_STATUSES).not.toContain("Cancelled" as never);
    expect(isScheduleStatus("Cancelled")).toBe(false);
  });

  it("has a default that is itself a legal status", () => {
    expect(isScheduleStatus(DEFAULT_SCHEDULE_STATUS)).toBe(true);
  });

  it("keeps the type and priority lists non-empty and unique", () => {
    for (const list of [SCHEDULE_TASK_TYPES, SCHEDULE_PRIORITIES]) {
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

describe("normalizeScheduleStatus", () => {
  it("passes a legal status through untouched", () => {
    for (const status of SCHEDULE_STATUSES) {
      expect(normalizeScheduleStatus(status)).toBe(status);
    }
  });

  it("distinguishes 'not supplied' from 'supplied and unrecognised'", () => {
    // null means the importer had no status column; only a real-but-unknown
    // value is worth defaulting.
    expect(normalizeScheduleStatus(null)).toBeNull();
    expect(normalizeScheduleStatus(undefined)).toBeNull();
    expect(normalizeScheduleStatus("   ")).toBeNull();
    expect(normalizeScheduleStatus("Whatever")).toBe(DEFAULT_SCHEDULE_STATUS);
  });

  it("maps the synonyms other planning tools export", () => {
    expect(normalizeScheduleStatus("completed")).toBe("Complete");
    expect(normalizeScheduleStatus("DONE")).toBe("Complete");
    expect(normalizeScheduleStatus("in-progress")).toBe("In Progress");
    expect(normalizeScheduleStatus("overdue")).toBe("Delayed");
    expect(normalizeScheduleStatus("paused")).toBe("On Hold");
  });

  it("parks a Cancelled row rather than rejecting the whole import", () => {
    // A P6 export full of cancelled rows should import. On Hold is the closest
    // status that exists and does not claim the work was done.
    expect(normalizeScheduleStatus("Cancelled")).toBe("On Hold");
    expect(normalizeScheduleStatus("canceled")).toBe("On Hold");
  });

  it("only ever returns something the database accepts", () => {
    const inputs = ["Complete", "done", "??", "", null, 42, {}, "cancelled"];
    for (const input of inputs) {
      const out = normalizeScheduleStatus(input);
      if (out !== null) expect(STATUS_CHECK).toContain(out);
    }
  });
});

describe("reconcileStatusPercent", () => {
  it("sets the two percentages that are definitional", () => {
    expect(reconcileStatusPercent("Complete", 45)).toBe(100);
    expect(reconcileStatusPercent("Not Started", 45)).toBe(0);
  });

  it("leaves a percentage alone when it is already correct", () => {
    // undefined means "don't write this column" — the payload omits it.
    expect(reconcileStatusPercent("Complete", 100)).toBeUndefined();
    expect(reconcileStatusPercent("Not Started", 0)).toBeUndefined();
    expect(reconcileStatusPercent("In Progress", 45)).toBeUndefined();
  });

  it("clears the percentage when a finished task is reopened", () => {
    // The transition says the task is no longer done; nothing in it says how
    // much now remains. 99 would claim nearly finished, 0 would erase real work.
    expect(reconcileStatusPercent("In Progress", 100)).toBeNull();
  });

  it("treats a missing percentage on In Progress as unknown, not zero", () => {
    expect(reconcileStatusPercent("In Progress", null)).toBeNull();
    expect(reconcileStatusPercent("In Progress", undefined)).toBeNull();
  });

  it("does not touch the unconstrained statuses", () => {
    // A held task keeps the progress it had — that is the point of holding it.
    for (const status of ["On Hold", "Delayed"]) {
      expect(reconcileStatusPercent(status, 45)).toBeUndefined();
      expect(reconcileStatusPercent(status, 100)).toBeUndefined();
    }
  });

  it("ignores a status the database would reject anyway", () => {
    expect(reconcileStatusPercent("Cancelled", 45)).toBeUndefined();
    expect(reconcileStatusPercent(undefined, 45)).toBeUndefined();
  });

  it("produces a row that satisfies the constraint, from every starting point", () => {
    // The exhaustive version of the three bugs: 243, 184 and 208 of 427 live
    // rows failed one of these transitions before.
    const startingPercents = [0, 1, 45, 99, 100, null];
    for (const status of SCHEDULE_STATUSES) {
      for (const stored of startingPercents) {
        const next = reconcileStatusPercent(status, stored);
        const resulting = next === undefined ? stored : next;
        expect(
          pctCheckPasses(status, resulting),
          `${status} with stored ${stored} resolved to ${resulting}`,
        ).toBe(true);
      }
    }
  });
});

describe("withReconciledPercent", () => {
  it("is a no-op on a payload that does not touch status", () => {
    const fields = { start_date: "2026-09-01" };
    expect(withReconciledPercent(fields, { percent_complete: 45 })).toBe(fields);
  });

  it("reads the stored percentage when the payload omits one", () => {
    // The Task List and Gantt inline editors send status alone. A CHECK is
    // evaluated against the whole resulting row, so the stored value is what
    // the database will actually test.
    expect(withReconciledPercent({ status: "Complete" }, { percent_complete: 45 }))
      .toEqual({ status: "Complete", percent_complete: 100 });
  });

  it("validates the percentage the user just moved, not the stored one", () => {
    // Drawer save: slider dragged to 80 and status set to In Progress in one
    // go. Falling back to the stored 100 would have cleared their input.
    expect(
      withReconciledPercent(
        { status: "In Progress", percent_complete: 80 },
        { percent_complete: 100 },
      ),
    ).toEqual({ status: "In Progress", percent_complete: 80 });
  });

  it("still clears when the payload itself carries the offending 100", () => {
    // The Gantt's inline editor seeds its draft from the displayed percentage,
    // so reopening a Complete task sends status In Progress WITH percent 100.
    expect(
      withReconciledPercent(
        { status: "In Progress", percent_complete: 100 },
        { percent_complete: 100 },
      ),
    ).toEqual({ status: "In Progress", percent_complete: null });
  });

  it("works with no stored row at all, for the create path", () => {
    expect(withReconciledPercent({ status: "Complete", percent_complete: 0 }, null))
      .toEqual({ status: "Complete", percent_complete: 100 });
  });

  it("does not mutate its input", () => {
    const fields = { status: "Complete", percent_complete: 0 };
    withReconciledPercent(fields, null);
    expect(fields.percent_complete).toBe(0);
  });
});
