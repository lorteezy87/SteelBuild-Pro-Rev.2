// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GanttLane from "../GanttLane";
import { applyBoardAction, applyBoardActions, createBoardDoc } from "@/lib/board/document";
import type { BoardAction } from "@/lib/board/document";
import { createEdge, createTaskNode } from "@/lib/board/factory";
import type { BoardDoc, BoardTaskNode } from "@/lib/board/types";

const T0 = "2026-03-02T08:00:00.000Z";
/** Matches the lane's default zoom. */
const PX_PER_DAY = 24;

function task(text: string, start: string | null, end: string | null): BoardTaskNode {
  return { ...createTaskNode({ x: 0, y: 0 }, text, "info", T0), start_date: start, end_date: end };
}

function boardWith(tasks: BoardTaskNode[]): BoardDoc {
  return applyBoardActions(
    createBoardDoc("board_1", "proj_1", "Lane", T0),
    tasks.map((node) => ({ type: "add_node" as const, node })),
    T0,
  );
}

function Harness({ initialDoc, onAction }: { initialDoc: BoardDoc; onAction?: (a: BoardAction) => void }) {
  const [doc, setDoc] = useState(initialDoc);
  const [selection, setSelection] = useState<string[]>([]);
  return (
    <GanttLane
      doc={doc}
      selection={selection}
      onSelect={setSelection}
      dispatch={(action) => {
        onAction?.(action);
        setDoc((prev) => applyBoardAction(prev, action, new Date().toISOString()));
      }}
    />
  );
}

describe("GanttLane", () => {
  it("says what is missing rather than drawing a bar for an undated task", () => {
    render(<Harness initialDoc={boardWith([task("Set columns", null, null)])} />);
    expect(screen.getByText(/No task on this board has both a start and a finish/i)).toBeTruthy();
    expect(screen.getByTestId("board-unscheduled-tray")).toBeTruthy();
  });

  it("draws a bar whose width is the inclusive day count", () => {
    const erect = task("Erect", "2026-03-09", "2026-03-13");
    render(<Harness initialDoc={boardWith([erect])} />);
    const bar = screen.getByTestId(`board-bar-${erect.id}`);
    // Mon → Fri is five days, not four.
    expect(bar.style.width).toBe(`${5 * PX_PER_DAY}px`);
    expect(bar.textContent).toContain("5d");
  });

  it("moves both dates when a bar is dragged, holding the duration", () => {
    const erect = task("Erect", "2026-03-09", "2026-03-13");
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={boardWith([erect])} onAction={(a) => actions.push(a)} />);
    const bar = screen.getByTestId(`board-bar-${erect.id}`);
    fireEvent.pointerDown(bar, { clientX: 100, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 100 + 3 * PX_PER_DAY, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 100 + 3 * PX_PER_DAY, clientY: 10, pointerId: 1 });

    const update = actions.find((a) => a.type === "update_task");
    expect(update?.type === "update_task" && update.patch).toEqual({
      start_date: "2026-03-12",
      end_date: "2026-03-16",
    });
  });

  it("extends the finish when the end grip is dragged, holding the start", () => {
    const erect = task("Erect", "2026-03-09", "2026-03-13");
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={boardWith([erect])} onAction={(a) => actions.push(a)} />);
    const grip = screen.getByTestId(`board-bar-end-${erect.id}`);
    fireEvent.pointerDown(grip, { clientX: 200, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: 200 + 2 * PX_PER_DAY, clientY: 10, pointerId: 1 });

    const update = actions.find((a) => a.type === "update_task");
    expect(update?.type === "update_task" && update.patch).toEqual({
      start_date: "2026-03-09",
      end_date: "2026-03-15",
    });
  });

  it("moves the start when the start grip is dragged, leaving the finish put", () => {
    const erect = task("Erect", "2026-03-09", "2026-03-13");
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={boardWith([erect])} onAction={(a) => actions.push(a)} />);
    const grip = screen.getByTestId(`board-bar-start-${erect.id}`);
    fireEvent.pointerDown(grip, { clientX: 200, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: 200 - 2 * PX_PER_DAY, clientY: 10, pointerId: 1 });

    const update = actions.find((a) => a.type === "update_task");
    expect(update?.type === "update_task" && update.patch).toEqual({
      start_date: "2026-03-07",
      end_date: "2026-03-13",
    });
  });

  it("measures a drag from where it started, so a slow drag does not creep", () => {
    const erect = task("Erect", "2026-03-09", "2026-03-13");
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={boardWith([erect])} onAction={(a) => actions.push(a)} />);
    const bar = screen.getByTestId(`board-bar-${erect.id}`);
    fireEvent.pointerDown(bar, { clientX: 100, clientY: 10, pointerId: 1 });
    for (let step = 1; step <= 4; step += 1) {
      fireEvent.pointerMove(bar, { clientX: 100 + step * 6, clientY: 10, pointerId: 1 });
    }
    // Four moves of a quarter-day each is one day in total, not four.
    const last = actions.filter((a) => a.type === "update_task").at(-1);
    expect(last?.type === "update_task" && last.patch).toEqual({
      start_date: "2026-03-10",
      end_date: "2026-03-14",
    });
  });

  it("flags a finish-to-start conflict along a 'precedes' connector", () => {
    const erect = task("Erect", "2026-03-09", "2026-03-13");
    const deck = task("Deck", "2026-03-11", "2026-03-16");
    const doc = applyBoardAction(
      boardWith([erect, deck]),
      { type: "add_edge", edge: createEdge(erect.id, deck.id, "precedes", "", "neutral", T0) },
      T0,
    );
    render(<Harness initialDoc={doc} />);
    expect(screen.getByTestId("board-sequence-warning").textContent).toContain("1 sequence conflict");
  });

  it("schedules a selected undated task as one day where the lane is tapped", () => {
    const erect = task("Erect", "2026-03-09", "2026-03-13");
    const deck = task("Deck", null, null);
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={boardWith([erect, deck])} onAction={(a) => actions.push(a)} />);

    fireEvent.click(screen.getByRole("button", { name: "Deck" }));
    // The lane's origin is three days before the earliest start: 2026-03-06.
    fireEvent.click(screen.getByTestId("board-gantt-lane").querySelector(".sbp-lane__grid") as Element, {
      clientX: 2 * PX_PER_DAY,
      clientY: 40,
    });

    const update = actions.find((a) => a.type === "update_task");
    // A tap says when, not how long.
    expect(update?.type === "update_task" && update.patch).toEqual({
      start_date: "2026-03-08",
      end_date: "2026-03-08",
    });
  });

  it("leaves a scheduled task alone when the lane is tapped", () => {
    const erect = task("Erect", "2026-03-09", "2026-03-13");
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={boardWith([erect])} onAction={(a) => actions.push(a)} />);
    fireEvent.pointerDown(screen.getByTestId(`board-bar-${erect.id}`), { clientX: 100, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(screen.getByTestId(`board-bar-${erect.id}`), { clientX: 100, clientY: 10, pointerId: 1 });
    actions.length = 0;
    fireEvent.click(screen.getByTestId("board-gantt-lane").querySelector(".sbp-lane__grid") as Element, {
      clientX: 10 * PX_PER_DAY,
      clientY: 40,
    });
    expect(actions).toEqual([]);
  });
});
