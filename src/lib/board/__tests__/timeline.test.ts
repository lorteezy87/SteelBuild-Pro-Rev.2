import { describe, expect, it } from "vitest";
import { applyBoardAction, applyBoardActions, createBoardDoc } from "../document";
import { createEdge, createTaskNode } from "../factory";
import {
  DEFAULT_PX_PER_DAY,
  MAX_PX_PER_DAY,
  MIN_PX_PER_DAY,
  clampPxPerDay,
  dateToX,
  daysBetween,
  dragBar,
  pinchBar,
  resizeBarEnd,
  resizeBarStart,
  scheduleAt,
  scheduledTasks,
  sequenceViolations,
  taskBar,
  timelineRange,
  timelineTicks,
  unscheduledTasks,
  xToDate,
  type TimelineScale,
} from "../timeline";
import type { BoardDoc, BoardTaskNode } from "../types";

const T0 = "2026-03-02T08:00:00.000Z";
const SCALE: TimelineScale = { origin: "2026-03-01", pxPerDay: 10 };

function task(overrides: Partial<BoardTaskNode> = {}): BoardTaskNode {
  return { ...createTaskNode({ x: 0, y: 0 }, "Set columns", "info", T0), ...overrides };
}

function boardWith(tasks: BoardTaskNode[]): BoardDoc {
  return applyBoardActions(
    createBoardDoc("board_1", "proj_1", "Lane", T0),
    tasks.map((node) => ({ type: "add_node" as const, node })),
    T0,
  );
}

describe("date ↔ x", () => {
  it("maps a date to its day column", () => {
    expect(dateToX(SCALE, "2026-03-01")).toBe(0);
    expect(dateToX(SCALE, "2026-03-11")).toBe(100);
    expect(dateToX(SCALE, "2026-02-27")).toBe(-20);
  });

  it("returns null rather than 0 for a missing date", () => {
    expect(dateToX(SCALE, null)).toBeNull();
    expect(dateToX(SCALE, "not a date")).toBeNull();
    expect(daysBetween(null, "2026-03-01")).toBeNull();
  });

  it("floors x into the day column it falls in, so a drag saves the day it looks like", () => {
    expect(xToDate(SCALE, 0)).toBe("2026-03-01");
    expect(xToDate(SCALE, 9.9)).toBe("2026-03-01");
    expect(xToDate(SCALE, 10)).toBe("2026-03-02");
    // Rounding instead of flooring would report 03-02 for the right half of the
    // first column, which is how a bar dropped on Sunday saves as Monday.
    expect(xToDate(SCALE, 5)).toBe("2026-03-01");
  });

  it("clamps the zoom", () => {
    expect(clampPxPerDay(1000)).toBe(MAX_PX_PER_DAY);
    expect(clampPxPerDay(0.01)).toBe(MIN_PX_PER_DAY);
    expect(clampPxPerDay(Number.NaN)).toBe(DEFAULT_PX_PER_DAY);
  });
});

describe("taskBar", () => {
  it("is inclusive: Mon → Fri is five days wide", () => {
    const bar = taskBar(SCALE, task({ start_date: "2026-03-02", end_date: "2026-03-06" }));
    expect(bar?.days).toBe(5);
    expect(bar?.width).toBe(50);
    expect(bar?.x).toBe(10);
  });

  it("gives a same-day task one day, not zero", () => {
    expect(taskBar(SCALE, task({ start_date: "2026-03-02", end_date: "2026-03-02" }))?.days).toBe(1);
  });

  it("has no bar for an unscheduled task — it does not default to today", () => {
    expect(taskBar(SCALE, task({ start_date: "2026-03-02", end_date: null }))).toBeNull();
    expect(taskBar(SCALE, task({ start_date: null, end_date: null }))).toBeNull();
  });

  it("has no bar for an inverted window", () => {
    expect(taskBar(SCALE, task({ start_date: "2026-03-06", end_date: "2026-03-02" }))).toBeNull();
  });
});

describe("lane membership", () => {
  it("separates scheduled from unscheduled and orders by start date", () => {
    const later = task({ text: "B", start_date: "2026-03-10", end_date: "2026-03-12" });
    const earlier = task({ text: "A", start_date: "2026-03-02", end_date: "2026-03-06" });
    const undated = task({ text: "C" });
    const inverted = task({ text: "D", start_date: "2026-03-20", end_date: "2026-03-10" });
    const doc = boardWith([later, earlier, undated, inverted]);
    expect(scheduledTasks(doc).map((t) => t.text)).toEqual(["A", "B"]);
    expect(unscheduledTasks(doc).map((t) => t.text).sort()).toEqual(["C", "D"]);
  });
});

describe("gestures", () => {
  const bar = task({ start_date: "2026-03-02", end_date: "2026-03-06" });

  it("drag moves both dates and preserves the duration", () => {
    expect(dragBar(SCALE, bar, 30)).toEqual({ start_date: "2026-03-05", end_date: "2026-03-09" });
  });

  it("drag ignores jitter shorter than half a day column", () => {
    expect(dragBar(SCALE, bar, 4)).toBeNull();
  });

  it("dragging the right edge moves the finish and keeps the start", () => {
    expect(resizeBarEnd(SCALE, bar, 20)).toEqual({ start_date: "2026-03-02", end_date: "2026-03-08" });
  });

  it("dragging the right edge past the start clamps to a same-day task, never inverting", () => {
    expect(resizeBarEnd(SCALE, bar, -500)).toEqual({ start_date: "2026-03-02", end_date: "2026-03-02" });
  });

  it("dragging the left edge moves the start and leaves the finish put", () => {
    expect(resizeBarStart(SCALE, bar, -20)).toEqual({ start_date: "2026-02-28", end_date: "2026-03-06" });
  });

  it("dragging the left edge past the finish clamps to a same-day task", () => {
    expect(resizeBarStart(SCALE, bar, 500)).toEqual({ start_date: "2026-03-06", end_date: "2026-03-06" });
  });

  it("pinch scales the day count about the start", () => {
    expect(pinchBar(bar, 100, 200)).toEqual({ start_date: "2026-03-02", end_date: "2026-03-11" });
    expect(pinchBar(bar, 200, 100)).toEqual({ start_date: "2026-03-02", end_date: "2026-03-04" });
  });

  it("pinch never goes below a day and ignores a degenerate spread", () => {
    expect(pinchBar(bar, 1000, 1)).toEqual({ start_date: "2026-03-02", end_date: "2026-03-02" });
    expect(pinchBar(bar, 0, 100)).toBeNull();
  });

  it("every gesture is a no-op on an unscheduled task", () => {
    const undated = task();
    expect(dragBar(SCALE, undated, 50)).toBeNull();
    expect(resizeBarEnd(SCALE, undated, 50)).toBeNull();
    expect(resizeBarStart(SCALE, undated, 50)).toBeNull();
    expect(pinchBar(undated, 100, 200)).toBeNull();
  });

  it("a drop on the lane schedules one day — when, not how long", () => {
    expect(scheduleAt(SCALE, 35)).toEqual({ start_date: "2026-03-04", end_date: "2026-03-04" });
    expect(scheduleAt(SCALE, 35, 5)).toEqual({ start_date: "2026-03-04", end_date: "2026-03-08" });
  });
});

describe("timelineRange", () => {
  it("wraps every dated task with padding", () => {
    const doc = boardWith([
      task({ start_date: "2026-03-02", end_date: "2026-03-06" }),
      task({ start_date: "2026-03-10", end_date: "2026-03-12" }),
    ]);
    expect(timelineRange(doc, 2)).toEqual({ start: "2026-02-28", end: "2026-03-14", days: 15 });
  });

  it("is null when nothing is scheduled, rather than a window around today", () => {
    expect(timelineRange(boardWith([task()]))).toBeNull();
  });
});

describe("timelineTicks", () => {
  it("thins the interval so labels never collide", () => {
    const ticks = timelineTicks({ origin: "2026-03-01", pxPerDay: 4 }, 400, 56);
    const spacing = ticks[1].x - ticks[0].x;
    expect(spacing).toBeGreaterThanOrEqual(56);
  });

  it("labels in UTC, matching the UTC-midnight reading of a date-only string", () => {
    const ticks = timelineTicks({ origin: "2026-03-01", pxPerDay: 60 }, 120, 56);
    expect(ticks[0].label).toBe("3/1");
    expect(ticks[0].monthStart).toBe(true);
    expect(ticks[1].monthStart).toBe(false);
  });

  it("returns nothing for a zero-width lane", () => {
    expect(timelineTicks(SCALE, 0)).toEqual([]);
  });
});

describe("sequenceViolations", () => {
  function linked(pred: BoardTaskNode, succ: BoardTaskNode): BoardDoc {
    const doc = boardWith([pred, succ]);
    return applyBoardAction(
      doc,
      { type: "add_edge", edge: createEdge(pred.id, succ.id, "precedes", "", "neutral", T0) },
      T0,
    );
  }

  it("is quiet when the successor starts the day after", () => {
    const doc = linked(
      task({ text: "Erect", start_date: "2026-03-02", end_date: "2026-03-06" }),
      task({ text: "Deck", start_date: "2026-03-07", end_date: "2026-03-10" }),
    );
    expect(sequenceViolations(doc)).toEqual([]);
  });

  it("flags a same-day hand-off as an overlap, because both dates are whole days", () => {
    const doc = linked(
      task({ text: "Erect", start_date: "2026-03-02", end_date: "2026-03-06" }),
      task({ text: "Deck", start_date: "2026-03-06", end_date: "2026-03-10" }),
    );
    const [violation] = sequenceViolations(doc);
    expect(violation.overlap_days).toBe(1);
    expect(violation.successor_start).toBe("2026-03-06");
  });

  it("counts the days of a real overlap", () => {
    const doc = linked(
      task({ text: "Erect", start_date: "2026-03-02", end_date: "2026-03-06" }),
      task({ text: "Deck", start_date: "2026-03-03", end_date: "2026-03-10" }),
    );
    expect(sequenceViolations(doc)[0].overlap_days).toBe(4);
  });

  it("skips pairs where either task is undated — unscheduled is a question, not a conflict", () => {
    const doc = linked(
      task({ text: "Erect", start_date: "2026-03-02", end_date: "2026-03-06" }),
      task({ text: "Deck" }),
    );
    expect(sequenceViolations(doc)).toEqual([]);
  });

  it("ignores connectors that carry no scheduling meaning", () => {
    const pred = task({ text: "Erect", start_date: "2026-03-02", end_date: "2026-03-06" });
    const succ = task({ text: "Deck", start_date: "2026-03-03", end_date: "2026-03-10" });
    const doc = applyBoardAction(
      boardWith([pred, succ]),
      { type: "add_edge", edge: createEdge(pred.id, succ.id, "relates", "", "neutral", T0) },
      T0,
    );
    expect(sequenceViolations(doc)).toEqual([]);
  });
});
