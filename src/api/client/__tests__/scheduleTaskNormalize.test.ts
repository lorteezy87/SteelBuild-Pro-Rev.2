import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What entities.ScheduleTask actually sends to PostgREST for status and
 * percent_complete.
 *
 * The wrapper used to re-implement the schedule rules on its own, and three of
 * them contradicted the canonical ones in src/lib/schedule/taskStatus.ts:
 *   - `Number(null)` is 0, so a deliberate NULL (a reopened task, progress
 *     unknown) was written as 0% and landed the task in the stalled filter;
 *   - In Progress at 100 was clamped to an invented 99;
 *   - a percent sent alone re-derived the status, so a NULL percent alone
 *     moved the task to Not Started.
 * These tests drive the real client against a mocked Supabase and read the
 * request body, so they fail on the payload rather than on source text.
 */

const writes = vi.hoisted(() => ({
  update: [] as Array<Record<string, unknown>>,
  insert: [] as unknown[],
}));

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.single = vi.fn(async () => ({ data: { id: "task-1" }, error: null }));
  builder.update = vi.fn((body: Record<string, unknown>) => {
    writes.update.push(body);
    return builder;
  });
  builder.insert = vi.fn((body: unknown) => {
    writes.insert.push(body);
    return builder;
  });
  // bulkCreate awaits `.insert(rows).select()` directly.
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => makeBuilder(),
    rpc: vi.fn(),
  },
}));

import { entities } from "@/api/client/entities";
import { SCHEDULE_STATUSES } from "@/lib/schedule/taskStatus";

/** The body of the one UPDATE the call produced, minus the client timestamp. */
async function sentUpdate(fields: Record<string, unknown>) {
  writes.update.length = 0;
  await entities.ScheduleTask.update("task-1", fields as never);
  expect(writes.update).toHaveLength(1);
  const { updated_at: _stamp, ...body } = writes.update[0];
  return body;
}

beforeEach(() => {
  writes.update.length = 0;
  writes.insert.length = 0;
});

describe("entities.ScheduleTask keeps an unknown percent unknown", () => {
  it("sends a reopened task's NULL percent as NULL, not 0", async () => {
    // This is the payload buildTaskUpdate produces for Complete → In Progress.
    const body = await sentUpdate({ status: "In Progress", percent_complete: null });
    expect(body).toEqual({ status: "In Progress", percent_complete: null });
  });

  it("does not turn an unknown percent into 0 on an unconstrained status", async () => {
    // Every drawer / inline-edit save resends the row's percent. A held task
    // with no recorded progress must not come back reading 0%.
    for (const status of ["Delayed", "On Hold"]) {
      const body = await sentUpdate({ status, percent_complete: null, task_name: "Canopy" });
      expect(body, status).toEqual({ status, percent_complete: null, task_name: "Canopy" });
    }
  });

  it("treats a blank percent as unknown, not 0", async () => {
    const body = await sentUpdate({ status: "In Progress", percent_complete: "" });
    expect(body.percent_complete).toBeNull();
  });

  it("does not derive a status from a percent sent alone", async () => {
    // A NULL percent alone used to become 0 and then status "Not Started".
    expect(await sentUpdate({ percent_complete: null })).toEqual({ percent_complete: null });
    // A number alone is written as given; the client does not know the stored
    // status, so it cannot reconcile against it and must not guess one.
    expect(await sentUpdate({ percent_complete: 60 })).toEqual({ percent_complete: 60 });
  });

  it("does not add a percent to a status sent alone", async () => {
    // Only the caller knows the stored row, and the right percent depends on
    // it (a reopen of a stored 100 needs NULL; of a stored 40 needs nothing).
    // buildTaskUpdate and the create paths reconcile against it; answering
    // here, blind, is how the client layer came to contradict them.
    for (const status of SCHEDULE_STATUSES) {
      expect(await sentUpdate({ status }), status).toEqual({ status });
    }
  });
});

describe("entities.ScheduleTask reconciles a status/percent pair the canonical way", () => {
  it("never invents 99 for In Progress at 100 — progress becomes unknown", async () => {
    const body = await sentUpdate({ status: "In Progress", percent_complete: 100 });
    expect(body).toEqual({ status: "In Progress", percent_complete: null });
  });

  it("still settles the definitional pairs importers rely on", async () => {
    // Onboarding / CSV import rows carry a default percent_complete of 0 next
    // to whatever status the file said. A "Complete" row must land at 100.
    expect(await sentUpdate({ status: "Complete", percent_complete: 0 }))
      .toEqual({ status: "Complete", percent_complete: 100 });
    expect(await sentUpdate({ status: "Not Started", percent_complete: 35 }))
      .toEqual({ status: "Not Started", percent_complete: 0 });
  });

  it("leaves a legal pair exactly as sent", async () => {
    expect(await sentUpdate({ status: "In Progress", percent_complete: 40 }))
      .toEqual({ status: "In Progress", percent_complete: 40 });
    expect(await sentUpdate({ status: "On Hold", percent_complete: 100 }))
      .toEqual({ status: "On Hold", percent_complete: 100 });
  });

  it("coerces a numeric string and keeps the percent within 0–100", async () => {
    expect((await sentUpdate({ status: "In Progress", percent_complete: "45" })).percent_complete).toBe(45);
    expect((await sentUpdate({ status: "Delayed", percent_complete: 140 })).percent_complete).toBe(100);
    expect((await sentUpdate({ status: "Delayed", percent_complete: -5 })).percent_complete).toBe(0);
  });

  it("passes a status the database does not accept through untouched, for the CHECK to reject", async () => {
    // "Cancelled" is not a schedule status (chk_schedule_tasks_status). The
    // client must neither treat it as one nor quietly rewrite it.
    expect(await sentUpdate({ status: "Cancelled", percent_complete: 45 }))
      .toEqual({ status: "Cancelled", percent_complete: 45 });
  });
});

describe("create and bulkCreate take the same path", () => {
  it("create keeps a NULL percent NULL", async () => {
    await entities.ScheduleTask.create({
      project_id: "p1", task_name: "Reopened import row", status: "Delayed", percent_complete: null,
    } as never);
    expect(writes.insert[0]).toMatchObject({ status: "Delayed", percent_complete: null });
  });

  it("bulkCreate reconciles each row and keeps unknowns unknown", async () => {
    await entities.ScheduleTask.bulkCreate([
      { project_id: "p1", task_name: "A", status: "Complete", percent_complete: 0 },
      { project_id: "p1", task_name: "B", status: "In Progress", percent_complete: 100 },
      { project_id: "p1", task_name: "C", status: "On Hold", percent_complete: null },
    ] as never);
    const rows = writes.insert[0] as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.percent_complete)).toEqual([100, null, null]);
  });
});
