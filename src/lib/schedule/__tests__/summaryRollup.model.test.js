import { describe, it, expect } from "vitest";

// ── Reference model of the DB rollup trigger ──────────────────────────────
//
// The authoritative rollup lives in the Postgres trigger added by
// supabase/migrations/20260706000000_schedule_summary_rollup.sql
// (recompute_schedule_summary + schedule_task_rollup). That trigger can't run
// in a JS unit test, so this file encodes the SAME semantics as a pure model
// and asserts the three behaviors the migration must guarantee:
//   1. inserting a child rolls the parent's dates up (MIN start / MAX end)
//   2. reparenting a child moves the rollup from the old parent to the new one
//   3. deleting a task's last child clears its is_summary flag
//
// The corresponding SQL-level assertions (run against a real branch DB) live in
// supabase/tests/schedule_summary_rollup_test.sql. Keep the two in sync: this
// model mirrors recompute_schedule_summary exactly (dates only + is_summary; no
// pct/duration rollup, since the schedule_status_pct_consistency CHECK forbids a
// naive pct average).

/**
 * Pure mirror of recompute_schedule_summary(p_task_id): recompute is_summary +
 * rolled start/end for ONE task from its direct children, mutating the row in
 * `byId`. Returns whether the row changed (so a caller can mimic the AFTER
 * cascade's IS-DISTINCT-FROM termination).
 */
function recomputeSummary(byId, taskId) {
  const task = byId.get(taskId);
  if (!task) return false;
  const children = [...byId.values()].filter(
    (c) => c.parent_task_id === taskId && c.project_id === task.project_id,
  );
  const isSummary = children.length > 0;

  if (!isSummary) {
    if (task.is_summary !== false) {
      task.is_summary = false;
      return true;
    }
    return false;
  }

  const starts = children.map((c) => c.start_date).filter(Boolean).sort();
  const ends = children.map((c) => c.end_date).filter(Boolean).sort();
  const minStart = starts.length ? starts[0] : task.start_date;
  const maxEnd = ends.length ? ends[ends.length - 1] : task.end_date;

  const changed =
    task.is_summary !== true ||
    task.start_date !== minStart ||
    task.end_date !== maxEnd;
  task.is_summary = true;
  task.start_date = minStart;
  task.end_date = maxEnd;
  return changed;
}

/** Walk up the parent chain recomputing each ancestor (mirrors AFTER re-fire). */
function propagateUp(byId, startParentId) {
  let cursor = startParentId;
  let guard = 0;
  while (cursor && guard < 1000) {
    const changed = recomputeSummary(byId, cursor);
    const row = byId.get(cursor);
    if (!changed || !row) break;
    cursor = row.parent_task_id;
    guard += 1;
  }
}

function makeStore(rows) {
  return new Map(rows.map((r) => [r.id, { ...r }]));
}

describe("schedule summary rollup (model of the DB trigger)", () => {
  it("rolls the parent's dates up when a child is inserted", () => {
    const byId = makeStore([
      { id: "p", project_id: "proj", is_summary: false, start_date: null, end_date: null },
    ]);
    // Insert first child → parent becomes a summary spanning that child.
    byId.set("c1", { id: "c1", project_id: "proj", parent_task_id: "p", start_date: "2026-03-10", end_date: "2026-03-20" });
    propagateUp(byId, "p");

    const p = byId.get("p");
    expect(p.is_summary).toBe(true);
    expect(p.start_date).toBe("2026-03-10");
    expect(p.end_date).toBe("2026-03-20");

    // Insert a second, wider child → parent widens to the min start / max end.
    byId.set("c2", { id: "c2", project_id: "proj", parent_task_id: "p", start_date: "2026-03-05", end_date: "2026-04-01" });
    propagateUp(byId, "p");

    expect(byId.get("p").start_date).toBe("2026-03-05");
    expect(byId.get("p").end_date).toBe("2026-04-01");
  });

  it("moves the rollup from the old parent to the new parent on reparent", () => {
    const byId = makeStore([
      { id: "p1", project_id: "proj", is_summary: true, start_date: "2026-03-01", end_date: "2026-03-31" },
      { id: "p2", project_id: "proj", is_summary: false, start_date: null, end_date: null },
      { id: "c", project_id: "proj", parent_task_id: "p1", start_date: "2026-03-01", end_date: "2026-03-31" },
    ]);
    // Reparent c: p1 → p2. Recompute BOTH chains (as the trigger does).
    const oldParent = byId.get("c").parent_task_id;
    byId.get("c").parent_task_id = "p2";
    propagateUp(byId, oldParent);   // p1 lost its only child
    propagateUp(byId, "p2");        // p2 gained the child

    const p1 = byId.get("p1");
    const p2 = byId.get("p2");
    // p1 no longer has children → is_summary cleared.
    expect(p1.is_summary).toBe(false);
    // p2 now spans the moved child.
    expect(p2.is_summary).toBe(true);
    expect(p2.start_date).toBe("2026-03-01");
    expect(p2.end_date).toBe("2026-03-31");
  });

  it("clears is_summary when the last child is deleted", () => {
    const byId = makeStore([
      { id: "p", project_id: "proj", is_summary: true, start_date: "2026-05-01", end_date: "2026-05-10" },
      { id: "c", project_id: "proj", parent_task_id: "p", start_date: "2026-05-01", end_date: "2026-05-10" },
    ]);
    // Delete the only child, then recompute the (former) parent.
    const oldParent = byId.get("c").parent_task_id;
    byId.delete("c");
    propagateUp(byId, oldParent);

    expect(byId.get("p").is_summary).toBe(false);
  });

  it("propagates a widened span up to the grandparent", () => {
    const byId = makeStore([
      { id: "gp", project_id: "proj", is_summary: true, start_date: "2026-03-10", end_date: "2026-03-20" },
      { id: "p", project_id: "proj", parent_task_id: "gp", is_summary: true, start_date: "2026-03-10", end_date: "2026-03-20" },
      { id: "c", project_id: "proj", parent_task_id: "p", start_date: "2026-03-10", end_date: "2026-03-20" },
    ]);
    // A new, earlier-starting/later-ending child under p should widen p AND gp.
    byId.set("c2", { id: "c2", project_id: "proj", parent_task_id: "p", start_date: "2026-03-01", end_date: "2026-04-05" });
    propagateUp(byId, "p");

    expect(byId.get("p").start_date).toBe("2026-03-01");
    expect(byId.get("p").end_date).toBe("2026-04-05");
    // Grandparent picked up the widening via the upward cascade.
    expect(byId.get("gp").start_date).toBe("2026-03-01");
    expect(byId.get("gp").end_date).toBe("2026-04-05");
  });
});
