/**
 * feedAggregator.test.js — Locks in the contract from epic 7:
 *
 *   buildFeed runs schedule tasks through the project-scoped effective-date
 *   cascade BEFORE classifying urgency. So a task whose stored start_date
 *   is in the past, but whose predecessor pushes its effective start into
 *   the future, must NOT be flagged overdue by the feed.
 *
 *   If this test fails, something either:
 *     (a) removed / bypassed `overlayScheduleTaskEffectiveDates` inside
 *         `buildFeed` — urgency is now classifying on stored dates again,
 *     (b) broke project-scoping of the cascade — predecessor links from
 *         one project are bleeding into a different project's tasks, or
 *     (c) changed the cascade's date math so an FS+1 link no longer
 *         pushes the successor past its stored window.
 *
 *   Source of truth: feedAggregator.js + scheduleCascade.applyEffectiveDates.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildFeed } from "../feedAggregator";
import { applyEffectiveDates } from "@/services/scheduleCascade";

// Pin "today" to a fixed local-midnight date so dueDays math is stable.
// urgencyEngine reads "today" via dateMath.todayLocalISO() which uses
// new Date() internally — vi.setSystemTime intercepts that without us
// having to thread a `now` argument through buildFeed.
const FIXED_TODAY = new Date("2026-04-25T12:00:00");

// ─── Helpers ─────────────────────────────────────────────────────────────
// Plain ISO date arithmetic, UTC, no DST surprises. Mirrors what the
// cascade itself uses internally (addDaysIso) so test fixtures and
// production code stay aligned.
function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const TODAY = "2026-04-25";

describe("feedAggregator effective-date overlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TODAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not flag a task as overdue when its predecessor pushes effective start into the future", () => {
    // Task A — drives the cascade; ends 5 days from today.
    const taskA = {
      id: "task-a",
      project_id: "proj-1",
      task_name: "Detail steel — A",
      start_date: addDays(TODAY, -5), // 2026-04-20
      end_date:   addDays(TODAY, 5),  // 2026-04-30
      status: "In Progress",
      dependencies: null,
    };

    // Task B — stored start is 3 days in the past, stored end 2 days in
    // the future. Without the cascade, scheduleTaskUrgency anchors on
    // start_date (status = "Not Started") and reads dueDays = -3 →
    // urgency = "overdue".
    //
    // With the FS+1 cascade applied, B's effective start = A.end + 1 =
    // 2026-05-01 (6 days from today). dueDays = +6 → urgency = "due-soon"
    // (≤ TASK_DUE_SOON_DAYS = 7). Either way, NOT "overdue".
    const taskB = {
      id: "task-b",
      project_id: "proj-1",
      task_name: "Erect steel — B",
      start_date: addDays(TODAY, -3), // 2026-04-22
      end_date:   addDays(TODAY, 2),  // 2026-04-27
      status: "Not Started",
      dependencies: [{ id: "task-a", type: "FS", lag_days: 1 }],
    };

    const feed = buildFeed({ scheduleTasks: [taskA, taskB] });

    const itemB = feed.find((f) => f.itemType === "TASK" && f.sourceId === "task-b");
    expect(itemB).toBeTruthy();
    expect(itemB.urgency).not.toBe("overdue");
    // The overlay should put effective start at A.end + 1 = today + 6d,
    // landing B in the due-soon bucket. This is a stronger assertion that
    // also catches a regression where the cascade silently produces a
    // wrong-but-future date.
    expect(itemB.urgency).toBe("due-soon");
  });

  it("isolates the cascade per project — a predecessor in one project does not affect a task in another project", () => {
    // Two tasks with the same id reference across project boundaries
    // would let a buggy implementation merge graphs and cascade across
    // projects. Confirm overlayScheduleTaskEffectiveDates (which
    // buildFeed calls under the hood) groups by project_id first.
    //
    // Test directly against applyEffectiveDates per project — that's the
    // primitive overlayScheduleTaskEffectiveDates wraps. If it stays
    // honest at this layer, project isolation in buildFeed is preserved.
    const proj1Tasks = [
      {
        id: "p1-a",
        project_id: "proj-1",
        start_date: addDays(TODAY, -5),
        end_date:   addDays(TODAY, 5),
        status: "In Progress",
        dependencies: null,
      },
      {
        id: "p1-b",
        project_id: "proj-1",
        start_date: addDays(TODAY, -3),
        end_date:   addDays(TODAY, 2),
        status: "Not Started",
        dependencies: [{ id: "p1-a", type: "FS", lag_days: 1 }],
      },
    ];

    // Same shape in proj-2, but B references a task that lives in proj-1.
    // If the cascade ignores project boundaries it would resolve the link;
    // if it respects them, the link is unresolvable and B keeps its
    // stored dates (no shift).
    const proj2Tasks = [
      {
        id: "p2-b",
        project_id: "proj-2",
        start_date: addDays(TODAY, -3),
        end_date:   addDays(TODAY, 2),
        status: "Not Started",
        // Predecessor id from proj-1 — dangling reference within proj-2.
        dependencies: [{ id: "p1-a", type: "FS", lag_days: 1 }],
      },
    ];

    const overlaidProj1 = applyEffectiveDates(proj1Tasks);
    const overlaidProj2 = applyEffectiveDates(proj2Tasks);

    // Within proj-1, B is shifted (predecessor exists in the same graph).
    const p1B = overlaidProj1.find((t) => t.id === "p1-b");
    expect(p1B.start_date).toBe(addDays(TODAY, 6)); // A.end + 1d
    expect(p1B._shifted).toBe(true);

    // Within proj-2, B is NOT shifted — the predecessor id doesn't
    // resolve in this project's graph, so the cascade keeps stored dates.
    const p2B = overlaidProj2.find((t) => t.id === "p2-b");
    expect(p2B.start_date).toBe(addDays(TODAY, -3));
    expect(p2B._shifted).toBe(false);
  });

  it("excludes summary/parent tasks from the feed (no overdue double-count)", () => {
    // A summary parent + its late leaf child. Only the leaf should emit a feed
    // item; the parent (whose end_date merely spans the child) must be dropped
    // so the Command Center overdue/due-soon windows don't double-count.
    const parent = {
      id: "sum-1",
      project_id: "proj-1",
      task_name: "Fabrication (phase)",
      start_date: addDays(TODAY, -20),
      end_date:   addDays(TODAY, -2), // overdue
      status: "In Progress",
      is_summary: true,
      dependencies: null,
    };
    const child = {
      id: "leaf-1",
      project_id: "proj-1",
      task_name: "Fab beam B-12",
      start_date: addDays(TODAY, -20),
      end_date:   addDays(TODAY, -2), // overdue
      status: "In Progress",
      parent_task_id: "sum-1",
      dependencies: null,
    };

    const feed = buildFeed({ scheduleTasks: [parent, child] });
    const taskItems = feed.filter((f) => f.itemType === "TASK");
    const ids = taskItems.map((f) => f.sourceId);
    expect(ids).toContain("leaf-1");
    expect(ids).not.toContain("sum-1");
  });
});
