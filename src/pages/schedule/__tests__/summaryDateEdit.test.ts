import { describe, expect, it } from "vitest";
import { sanitizeScheduleTaskUpdatePayload } from "../wbs";

/**
 * Editing a date on a PARENT row silently reverted.
 *
 * buildScheduleTree's rollupSummary overwrites a parent's start_date/end_date
 * with its children's min/max for display, stashing the hand-entered values on
 * _stored_start_date / _stored_end_date. sanitizeScheduleTaskUpdatePayload then
 * substituted those stored values back into the payload for ANY row flagged
 * _hasChildren / _isRolledUpSummary — unconditionally.
 *
 * That substitution exists for a good reason: without it, saving a parent from
 * a surface that shows the rolled-up dates would persist a DERIVED value as if
 * a PM had typed it. But doing it unconditionally also threw away every REAL
 * edit, while the mutation still reported "Task updated" — the worst pairing.
 *
 * The fix distinguishes the two by comparing against the rolled-up value the
 * row was displaying: substitute the stored value only when the payload still
 * carries that derived value, i.e. the field was never touched.
 *
 * Leaf rows are unaffected — rollupSummary early-returns for them and never
 * stamps _stored_*, so isSummaryRow is false.
 */

/** A parent row as buildScheduleTree hands it to a form: rolled dates on the
 *  real columns, hand-entered dates preserved on _stored_*, and the rolled
 *  values also exposed on _rolled_* so an edit is distinguishable. */
const parentRow = (overrides: Record<string, unknown> = {}) => ({
  id: "phase-1",
  project_id: "project-1",
  task_name: "Fabrication",
  _hasChildren: true,
  _isRolledUpSummary: true,
  // What the PM typed
  _stored_start_date: "2026-03-02",
  _stored_end_date: "2026-03-31",
  // What the children roll up to, and what the row displays
  _rolled_start_date: "2026-03-09",
  _rolled_end_date: "2026-04-10",
  start_date: "2026-03-09",
  end_date: "2026-04-10",
  ...overrides,
});

describe("editing dates on a summary/parent row", () => {
  it("honours a real edit instead of reverting it", () => {
    // The PM opens the row and types a new start and finish.
    const { fields } = sanitizeScheduleTaskUpdatePayload(
      parentRow({ start_date: "2026-04-01", end_date: "2026-05-15" }) as never,
    );

    expect(fields.start_date).toBe("2026-04-01");
    expect(fields.end_date).toBe("2026-05-15");
  });

  it("still refuses to persist the rolled-up value as hand-entered", () => {
    // Untouched: the payload carries exactly what the row displayed. Writing
    // that would turn a derived date into a stored one.
    const { fields } = sanitizeScheduleTaskUpdatePayload(parentRow() as never);

    expect(fields.start_date).toBe("2026-03-02");
    expect(fields.end_date).toBe("2026-03-31");
  });

  it("keeps the pair coherent when only one date is edited", () => {
    const { fields } = sanitizeScheduleTaskUpdatePayload(
      parentRow({ end_date: "2026-06-30" }) as never,
    );

    // Editing one date makes the PAIR touched, so both are written as sent.
    // Restoring start from _stored_* here would pair 2026-03-02 with a finish
    // three months later that the PM never saw; worse, editing the START and
    // restoring the end can invert the window outright and get the whole save
    // rejected. The pair the user saw on screen is the pair that is written.
    expect(fields.start_date).toBe("2026-03-09");
    expect(fields.end_date).toBe("2026-06-30");
  });

  it("does not invert the window when only the start is edited", () => {
    // The regression the pair rule exists to prevent: start honoured at
    // 2026-04-01 while end reverted to the stored 2026-03-31 is start > end,
    // which assertScheduleDateRange throws on — so a one-field edit used to
    // fail the entire save.
    expect(() =>
      sanitizeScheduleTaskUpdatePayload(parentRow({ start_date: "2026-04-01" }) as never),
    ).not.toThrow();

    const { fields } = sanitizeScheduleTaskUpdatePayload(
      parentRow({ start_date: "2026-04-01" }) as never,
    );
    expect(fields.start_date).toBe("2026-04-01");
    expect(fields.end_date).toBe("2026-04-10");
  });

  it("honours clearing a date on a parent row", () => {
    const { fields } = sanitizeScheduleTaskUpdatePayload(
      parentRow({ start_date: null, end_date: null }) as never,
    );

    expect(fields.start_date).toBeNull();
    expect(fields.end_date).toBeNull();
  });

  it("leaves leaf rows alone", () => {
    // rollupSummary's early return stamps no _stored_* and no summary flags.
    const { fields } = sanitizeScheduleTaskUpdatePayload({
      id: "task-9",
      project_id: "project-1",
      task_name: "Erect sequence 1",
      start_date: "2026-05-04",
      end_date: "2026-05-08",
    } as never);

    expect(fields.start_date).toBe("2026-05-04");
    expect(fields.end_date).toBe("2026-05-08");
  });

  it("strips underscore-prefixed enrichment from the payload", () => {
    const { fields } = sanitizeScheduleTaskUpdatePayload(
      parentRow({ start_date: "2026-04-01" }) as never,
    );

    for (const key of Object.keys(fields)) {
      expect(key.startsWith("_"), `${key} must not reach the database`).toBe(false);
    }
  });
});
