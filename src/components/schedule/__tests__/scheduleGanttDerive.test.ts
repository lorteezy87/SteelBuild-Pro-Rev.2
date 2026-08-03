import { describe, it, expect } from "vitest";
import {
  buildRowLayout,
  buildTaskPositions,
  sliceVirtualRows,
  computeVirtualPadding,
  filterVisibleDepArrows,
  computeSuccessorCountById,
  GANTT_ROW_H,
  GANTT_SUM_H,
} from "../scheduleGanttDerive";

describe("scheduleGanttDerive", () => {
  const rows = [
    { type: "summary", phase: "Fab" },
    { type: "task", task: { id: "t1" } },
    { type: "task", task: { id: "t2" } },
    { type: "delivery-summary" },
    { type: "delivery", delivery: { id: "d1" } },
  ];

  it("buildRowLayout assigns cumulative tops and total height", () => {
    const layout = buildRowLayout(rows);
    expect(layout.items).toHaveLength(5);
    expect(layout.items[0].top).toBe(0);
    expect(layout.items[0].height).toBe(GANTT_SUM_H);
    expect(layout.items[1].top).toBe(GANTT_SUM_H);
    expect(layout.items[1].height).toBe(GANTT_ROW_H);
    expect(layout.totalHeight).toBe(GANTT_SUM_H + GANTT_ROW_H * 3 + GANTT_SUM_H);
  });

  it("buildTaskPositions maps task ids to row-center Y", () => {
    const pos = buildTaskPositions(rows);
    expect(pos.t1.y).toBe(GANTT_SUM_H + GANTT_ROW_H / 2);
    expect(pos.t2.y).toBe(GANTT_SUM_H + GANTT_ROW_H + GANTT_ROW_H / 2);
    expect(pos.d1).toBeUndefined();
  });

  it("sliceVirtualRows returns only items in the viewport window", () => {
    const layout = buildRowLayout(rows);
    const visible = sliceVirtualRows(layout, GANTT_SUM_H, GANTT_ROW_H * 2, 0);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((item) => item.top + item.height >= GANTT_SUM_H)).toBe(true);
  });

  it("computeVirtualPadding pads above and below visible slice", () => {
    const layout = buildRowLayout(rows);
    const virtualRows = layout.items.slice(1, 3);
    const { virtualTopPadding, virtualBottomPadding } = computeVirtualPadding(virtualRows, layout.totalHeight);
    expect(virtualTopPadding).toBe(GANTT_SUM_H);
    expect(virtualBottomPadding).toBeGreaterThan(0);
  });

  it("filterVisibleDepArrows keeps arrows touching the viewport", () => {
    const arrows = [
      { key: "a", fromY: 10, toY: 20 },
      { key: "b", fromY: 5000, toY: 5010 },
    ];
    const visible = filterVisibleDepArrows(arrows as any, 0, 100, 0);
    expect(visible).toHaveLength(1);
    expect(visible[0].key).toBe("a");
  });

  it("computeSuccessorCountById counts incoming dependency links", () => {
    const tasks = [
      { id: "a", dependencies: [] },
      { id: "b", dependencies: ["a"] },
      { id: "c", dependencies: ["a", "b"] },
    ];
    expect(computeSuccessorCountById(tasks)).toEqual({ a: 2, b: 1 });
  });
});
