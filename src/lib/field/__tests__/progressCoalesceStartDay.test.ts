import { describe, expect, it } from "vitest";
import { enqueueOp, makeProgressOp } from "@/lib/field/offlineQueue";
import { persistScheduleProgress } from "@/lib/field/progressSync";
import type { ScheduleProgressTask } from "@/lib/field/progressSync";

/**
 * Work that STARTS and FINISHES inside one offline stretch keeps both days.
 *
 * Progress ops coalesce per task — only the latest value for a task survives,
 * which is right for the percentage. But the capture day is not a value to
 * overwrite: `deriveActualsPatch` stamps actual_start_date the first time a
 * task moves off Not Started, and actual_finish_date when it completes. Those
 * are two different days whenever a crew starts on one shift and closes out on
 * a later one.
 *
 * On a job with no signal that is an ordinary week, not an edge case. The
 * foreman taps 25% Monday and 100% Tuesday; both ops sit in the queue; the
 * Tuesday op supersedes the Monday one. Replaying only the survivor stamps
 * Tuesday as BOTH the start and the finish, so a two-day activity reads as
 * same-day and the actual-start variance a PM reads back is a day late.
 *
 * So the op carries `startCaptureDay`: the day work was first recorded as
 * underway, inherited across coalescing. The percentage still collapses to the
 * latest; the start day does not.
 */

/** A minimal gateway that records what the update was handed. */
function gatewayFor(task: ScheduleProgressTask) {
  const writes: Record<string, unknown>[] = [];
  return {
    writes,
    gateway: {
      get: async () => task,
      update: async (_id: string, patch: Record<string, unknown>) => {
        writes.push(patch);
        return patch;
      },
    },
  };
}

const MON = "2026-09-21";
const TUE = "2026-09-22";
const WED = "2026-09-23";

describe("a progress op keeps the day work started", () => {
  it("inherits the earlier capture day when a later op supersedes it", () => {
    // Monday 25%, then Tuesday 100% — the Tuesday op replaces the Monday one.
    let queue = enqueueOp([], makeProgressOp("t1", 25, 1, MON));
    queue = enqueueOp(queue, makeProgressOp("t1", 100, 2, TUE));

    expect(queue).toHaveLength(1);
    expect(queue[0].payload.pct).toBe(100);
    expect(queue[0].payload.captureDay).toBe(TUE);
    // The part that used to be lost with the superseded op.
    expect(queue[0].payload.startCaptureDay).toBe(MON);
  });

  it("does not invent a start day from an op that recorded no work", () => {
    // 0% is Not Started — it never began work, so it carries no start day.
    let queue = enqueueOp([], makeProgressOp("t1", 0, 1, MON));
    queue = enqueueOp(queue, makeProgressOp("t1", 60, 2, TUE));

    expect(queue[0].payload.startCaptureDay).toBeNull();
    expect(queue[0].payload.captureDay).toBe(TUE);
  });

  it("keeps the FIRST start day across three coalesced taps", () => {
    let queue = enqueueOp([], makeProgressOp("t1", 25, 1, MON));
    queue = enqueueOp(queue, makeProgressOp("t1", 60, 2, TUE));
    queue = enqueueOp(queue, makeProgressOp("t1", 100, 3, WED));

    expect(queue).toHaveLength(1);
    expect(queue[0].payload.startCaptureDay).toBe(MON);
    expect(queue[0].payload.captureDay).toBe(WED);
  });

  it("leaves a different task's op alone", () => {
    let queue = enqueueOp([], makeProgressOp("t1", 25, 1, MON));
    queue = enqueueOp(queue, makeProgressOp("t2", 100, 2, TUE));

    expect(queue).toHaveLength(2);
    expect(queue[0].payload.startCaptureDay).toBeNull();
    expect(queue[1].payload.startCaptureDay).toBeNull();
  });
});

describe("replaying that op stamps both days correctly", () => {
  it("stamps the start on the day work began, not the day it finished", async () => {
    // The task the server holds: never started, so both actuals are open.
    const { gateway, writes } = gatewayFor({
      id: "t1",
      status: "Not Started",
      percent_complete: 0,
      actual_start_date: null,
      actual_finish_date: null,
    });

    let queue = enqueueOp([], makeProgressOp("t1", 25, 1, MON));
    queue = enqueueOp(queue, makeProgressOp("t1", 100, 2, TUE));
    const op = queue[0];

    await persistScheduleProgress({
      gateway,
      id: "t1",
      pct: op.payload.pct,
      capturedDay: op.payload.captureDay,
      startCapturedDay: op.payload.startCaptureDay,
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].status).toBe("Complete");
    expect(writes[0].percent_complete).toBe(100);
    // Two days, not one. This is the whole point.
    expect(writes[0].actual_start_date).toBe(MON);
    expect(writes[0].actual_finish_date).toBe(TUE);
  });

  it("still stamps a same-day task with one day", async () => {
    const { gateway, writes } = gatewayFor({
      id: "t1",
      status: "Not Started",
      percent_complete: 0,
      actual_start_date: null,
      actual_finish_date: null,
    });

    const op = enqueueOp([], makeProgressOp("t1", 100, 1, TUE))[0];
    await persistScheduleProgress({
      gateway,
      id: "t1",
      pct: op.payload.pct,
      capturedDay: op.payload.captureDay,
      startCapturedDay: op.payload.startCaptureDay,
    });

    expect(writes[0].actual_start_date).toBe(TUE);
    expect(writes[0].actual_finish_date).toBe(TUE);
  });

  it("never overwrites an actual start the server already holds", async () => {
    // Somebody recorded the real start already. A queued op must not move it,
    // even though its own startCaptureDay is earlier.
    const { gateway, writes } = gatewayFor({
      id: "t1",
      status: "In Progress",
      percent_complete: 40,
      actual_start_date: "2026-09-15",
      actual_finish_date: null,
    });

    let queue = enqueueOp([], makeProgressOp("t1", 50, 1, MON));
    queue = enqueueOp(queue, makeProgressOp("t1", 100, 2, TUE));
    const op = queue[0];

    await persistScheduleProgress({
      gateway,
      id: "t1",
      pct: op.payload.pct,
      capturedDay: op.payload.captureDay,
      startCapturedDay: op.payload.startCaptureDay,
    });

    expect(writes[0].actual_start_date).toBeUndefined();
    expect(writes[0].actual_finish_date).toBe(TUE);
  });
});
