import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `percent_complete: null` means UNKNOWN, and this layer used to destroy it.
 *
 * `reconcileStatusPercent` returns null on purpose when a finished task
 * reopens: the transition says the task is no longer done, but nothing in it
 * says how much now remains. `taskStatus.ts` argues that case at length and
 * names both alternatives as lies — 99% asserts the task is nearly finished,
 * 0% erases work that was really done.
 *
 * Then `normalizeFields` in entities.ts undid that decision three ways, because
 * its `hasPct` test only asked whether the KEY was present:
 *
 *   {status:"In Progress", percent_complete:null}  ->  percent_complete: 0
 *   {percent_complete:null}                        ->  0 AND status:"Not Started"
 *   {status:"In Progress", percent_complete:100}   ->  percent_complete: 99
 *
 * The first is the one CLAUDE.md flags: `Number(null)` is 0 and
 * `Number.isFinite(0)` is true, so the clamp accepted it. A reopened task then
 * printed "0%" and landed in the stalled filter one click after showing 100%.
 * The second is worse — it wrote a status column the caller never mentioned.
 *
 * These assert on the payload actually handed to PostgREST, not on the source,
 * because the whole defect was a value silently changing on the way down.
 * `cleanRecord` drops only `undefined`, so a null genuinely reaches the column.
 */

let captured: Record<string, unknown> | null = null;

const single = vi.fn(async () => ({ data: { id: "t1" }, error: null }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
    from: () => ({
      update: (body: Record<string, unknown>) => {
        captured = body;
        return { eq: () => ({ select: () => ({ single }) }) };
      },
    }),
  },
}));

import { entities } from "@/api/client/entities";

/** The payload `ScheduleTask.update` actually sends, minus the trigger column. */
async function sentFor(fields: Record<string, unknown>) {
  captured = null;
  await entities.ScheduleTask.update("t1", fields as never);
  const { updated_at: _ignored, ...rest } = (captured ?? {}) as Record<string, unknown>;
  return rest;
}

describe("a null percent_complete survives the client layer", () => {
  beforeEach(() => {
    captured = null;
    single.mockClear();
  });

  it("keeps the deliberate null on a reopen instead of writing 0", async () => {
    // THE regression. reconcileStatusPercent chose null; this layer must not
    // second-guess it into 0.
    const sent = await sentFor({ status: "In Progress", percent_complete: null });
    expect(sent.percent_complete).toBeNull();
    expect(sent.percent_complete).not.toBe(0);
    expect(sent.status).toBe("In Progress");
  });

  it("does not invent a status when only an unknown percent is supplied", async () => {
    // This branch read null as 0 and wrote status:"Not Started" — changing a
    // column the caller never mentioned, on the strength of Number(null).
    const sent = await sentFor({ percent_complete: null });
    expect(sent.percent_complete).toBeNull();
    expect("status" in sent).toBe(false);
  });

  it("answers In Progress at 100 with null, not the invented 99", async () => {
    // A contradiction the CHECK would reject either way. taskStatus.ts is the
    // one reconciler and it says unknown; 99 asserts nearly-finished.
    const sent = await sentFor({ status: "In Progress", percent_complete: 100 });
    expect(sent.percent_complete).toBeNull();
    expect(sent.percent_complete).not.toBe(99);
  });
});

describe("the behaviour that must not regress", () => {
  beforeEach(() => {
    captured = null;
    single.mockClear();
  });

  it("still fills the two definitional gaps", async () => {
    // Complete means the work is done; Not Started means none of it is. Both
    // are safe without knowing the stored row.
    expect((await sentFor({ status: "Complete" })).percent_complete).toBe(100);
    expect((await sentFor({ status: "Not Started" })).percent_complete).toBe(0);
  });

  it("leaves the column alone for a status that pins no value", async () => {
    // This layer does not know the stored percent, so it must not guess. The
    // canonical answer needs that row and belongs to withReconciledPercent.
    for (const status of ["In Progress", "Delayed", "On Hold"]) {
      const sent = await sentFor({ status });
      expect("percent_complete" in sent, `${status} wrote a percent`).toBe(false);
    }
  });

  it("still derives status from a moved slider", async () => {
    expect((await sentFor({ percent_complete: 100 })).status).toBe("Complete");
    expect((await sentFor({ percent_complete: 45 })).status).toBe("In Progress");
    expect((await sentFor({ percent_complete: 0 })).status).toBe("Not Started");
  });

  it("still clamps an out-of-range number", async () => {
    expect((await sentFor({ percent_complete: 150 })).percent_complete).toBe(100);
    expect((await sentFor({ percent_complete: -5 })).percent_complete).toBe(0);
  });

  it("keeps a legal in-progress percent and a held task's progress", async () => {
    expect((await sentFor({ status: "In Progress", percent_complete: 40 })).percent_complete).toBe(40);
    expect((await sentFor({ status: "On Hold", percent_complete: 60 })).percent_complete).toBe(60);
  });

  it("still coerces the contradictions the CHECK would reject", async () => {
    expect((await sentFor({ status: "Complete", percent_complete: 20 })).percent_complete).toBe(100);
    expect((await sentFor({ status: "Not Started", percent_complete: 30 })).percent_complete).toBe(0);
  });

  it("still turns a cleared date into null rather than an empty string", async () => {
    // Postgres rejects '' for a date column; DateOrTbdInput emits it.
    const sent = await sentFor({ actual_finish_date: "", start_date: "" });
    expect(sent.actual_finish_date).toBeNull();
    expect(sent.start_date).toBeNull();
  });
});
