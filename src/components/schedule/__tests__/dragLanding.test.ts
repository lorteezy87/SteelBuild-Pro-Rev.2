import { describe, it, expect } from "vitest";
import { computeDragLanding, describeLanding } from "../scheduleGanttDerive";

/**
 * Cover for audit §2.6 — dragging a cascade-held Gantt bar was a silent no-op.
 *
 * The Gantt draws EFFECTIVE dates; a drag writes STORED ones. When a predecessor
 * holds the row, the write lands at stored+N, the cascade re-derives the same
 * floor, and the bar returns to where it started with no feedback at all.
 *
 * computeDragLanding predicts the landing by re-running the REAL cascade over
 * the post-write rows, so it cannot drift from applyLink's semantics.
 */

// Predecessor finishes Wed 2026-03-11. FS + 1 WORKING day ⇒ anything linked to
// it floors at Thu 03-12.
//
// Anchored on weekdays deliberately. Since §2.1 the cascade will not start work
// on a weekend, so a fixture whose floor lands on a Saturday would make every
// number below a statement about the working calendar rather than about drag
// landing, which is what this file is for. workingCalendar.test.ts covers the
// weekend arithmetic on its own.
const PRED = { id: "pred", task_name: "Approve shop drawings", start_date: "2026-03-02", end_date: "2026-03-11" };
const link = JSON.stringify([{ id: "pred", type: "FS", lag_days: 1 }]);

/** Task stored 03-05 → 03-10 (5-day span), held by PRED, so it RENDERS 03-12 → 03-17. */
const HELD = {
  id: "fab",
  task_name: "Fabricate beams",
  start_date: "2026-03-05",
  end_date: "2026-03-10",
  dependencies: link,
};

const PROJECT = [PRED, HELD];

describe("computeDragLanding — held rows", () => {
  it("a backward drag on a held bar does not move it, and reports it as still held", () => {
    // Drag −4: writes 03-06 → 03-11. Floor is still 03-15, so nothing moves.
    const landing = computeDragLanding({
      taskId: "fab",
      mode: "move",
      projectTasks: PROJECT,
      renderedStart: "2026-03-12",
      renderedEnd: "2026-03-17",
      nextStart: "2026-03-03",
      nextEnd: "2026-03-08",
    })!;

    expect(landing.landedStart).toBe("2026-03-12");
    expect(landing.movedDaysStart).toBe(0);
    expect(landing.landsOffTarget).toBe(true);
    expect(landing.heldAtLanding).toBe(true);
  });

  it("a task pinned EXACTLY on its constraint is still held — the strict-> blind spot", () => {
    // This is the case that sank the first plan. applyLink drives on a strict
    // `>`, so a row whose stored start already equals the floor reports
    // shifted:false while being completely pinned. Any guard keyed on `shifted`
    // misses it — and this is the state "Update Scheduled Dates" produces.
    const pinned = { ...HELD, start_date: "2026-03-12", end_date: "2026-03-17" };
    const landing = computeDragLanding({
      taskId: "fab",
      mode: "move",
      projectTasks: [PRED, pinned],
      renderedStart: "2026-03-12",
      renderedEnd: "2026-03-17",
      nextStart: "2026-03-09", // dragged 3 days earlier
      nextEnd: "2026-03-14",
    })!;

    expect(landing.landedStart).toBe("2026-03-12"); // did not move
    expect(landing.landsOffTarget).toBe(true);
    expect(landing.heldAtLanding).toBe(true);
  });

  it("a forward drag PAST the constraint moves, and is NOT described as held", () => {
    // Drag +9 from the rendered 03-15 ⇒ writes 03-19. The floor (03-15) no
    // longer binds, so the row lands on exactly what was saved. Nothing holds
    // it there — claiming a predecessor does would name the user's own date.
    const landing = computeDragLanding({
      taskId: "fab",
      mode: "move",
      projectTasks: PROJECT,
      renderedStart: "2026-03-12",
      renderedEnd: "2026-03-17",
      nextStart: "2026-03-19",
      nextEnd: "2026-03-24",
    })!;

    expect(landing.landedStart).toBe("2026-03-19");
    expect(landing.heldAtLanding).toBe(false);
  });

  it("an unconstrained row lands exactly where it was dropped, silently", () => {
    const landing = computeDragLanding({
      taskId: "solo",
      mode: "move",
      projectTasks: [{ id: "solo", start_date: "2026-04-01", end_date: "2026-04-05" }],
      renderedStart: "2026-04-01",
      renderedEnd: "2026-04-05",
      nextStart: "2026-04-08",
      nextEnd: "2026-04-12",
    })!;

    expect(landing.landsOffTarget).toBe(false); // no toast
    expect(landing.heldAtLanding).toBe(false);
  });

  it("reports BOTH edges on a resize — the far edge can move on its own", () => {
    // resize-start of −3 writes 03-07 → 03-15. Duration grows to 8 days, and the
    // cascade recomputes the END from the new duration off the 03-15 floor. A
    // bare "the start didn't move" would be false: the finish jumps.
    const landing = computeDragLanding({
      taskId: "fab",
      mode: "resize-start",
      projectTasks: PROJECT,
      renderedStart: "2026-03-12",
      renderedEnd: "2026-03-17",
      nextStart: "2026-03-04",
      nextEnd: "2026-03-12",
    })!;

    expect(landing.axis).toBe("start");
    expect(landing.landedStart).toBe("2026-03-12");
    expect(landing.landedEnd).not.toBe("2026-03-17"); // the finish moved too
    expect(landing.landsOffTarget).toBe(true);
  });

  it("returns null rather than guessing when it has no rows to cascade over", () => {
    expect(
      computeDragLanding({
        taskId: "fab",
        mode: "move",
        projectTasks: [],
        renderedStart: "2026-03-12",
        renderedEnd: "2026-03-17",
        nextStart: "2026-03-03",
        nextEnd: "2026-03-08",
      }),
    ).toBeNull();
  });
});

describe("describeLanding — the copy must be true", () => {
  const base = {
    axis: "both" as const,
    renderedStart: "2026-03-12",
    renderedEnd: "2026-03-17",
    droppedStart: "2026-03-06",
    droppedEnd: "2026-03-11",
    landedStart: "2026-03-15",
    landedEnd: "2026-03-20",
    movedDaysStart: 0,
    movedDaysEnd: 0,
    landsOffTarget: true,
  };

  it("names a predecessor ONLY when one is still holding the row", () => {
    const held = describeLanding({ ...base, heldAtLanding: true });
    expect(held).toMatch(/predecessor still holds/);
    expect(held).toMatch(/Dependencies tab/);
  });

  it("never blames a predecessor for a row that landed on the saved dates", () => {
    // The dominant case for a forward drag. Blaming a link here would name the
    // date the user just chose and recommend a no-op remedy.
    const free = describeLanding({
      ...base,
      landedStart: "2026-03-19",
      landedEnd: "2026-03-24",
      heldAtLanding: false,
    });
    expect(free).not.toMatch(/still holds/);
    expect(free).not.toMatch(/Dependencies tab/);
    expect(free).toMatch(/on the dates you saved/);
  });

  it("always states the resulting window, so it can never say a bare 'didn't move'", () => {
    for (const held of [true, false]) {
      const msg = describeLanding({ ...base, heldAtLanding: held });
      expect(msg).toMatch(/→/); // both edges present
      expect(msg).toMatch(/saved/); // the write did happen
    }
  });
});
