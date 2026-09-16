// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlannerPanel from "../PlannerPanel";
import { applyBoardAction, applyBoardActions, createBoardDoc } from "@/lib/board/document";
import type { BoardAction } from "@/lib/board/document";
import { createDeliveryNode, createTaskNode } from "@/lib/board/factory";
import type { BoardDeliveryNode, BoardDoc, BoardTaskNode } from "@/lib/board/types";

const T0 = "2026-03-02T08:00:00.000Z";
/** 2026-03-11 is a Wednesday; its week starts Monday the 9th. */
const TODAY = new Date("2026-03-11T09:00:00.000Z");

function task(text: string, overrides: Partial<BoardTaskNode> = {}): BoardTaskNode {
  return { ...createTaskNode({ x: 0, y: 0 }, text, "info", T0), ...overrides };
}

function delivery(material: string, overrides: Partial<BoardDeliveryNode> = {}): BoardDeliveryNode {
  return { ...createDeliveryNode({ x: 0, y: 0 }, material, "", "gold", T0), ...overrides };
}

function boardWith(nodes: Array<BoardTaskNode | BoardDeliveryNode>): BoardDoc {
  return applyBoardActions(
    createBoardDoc("board_1", "proj_1", "Plan", T0),
    nodes.map((node) => ({ type: "add_node" as const, node })),
    T0,
  );
}

interface HarnessProps {
  initialDoc: BoardDoc;
  onAction?: (a: BoardAction) => void;
  onShowOnMap?: (id: string) => void;
}

function Harness({ initialDoc, onAction, onShowOnMap }: HarnessProps) {
  const [doc, setDoc] = useState(initialDoc);
  const [, setSelection] = useState<string[]>([]);
  return (
    <PlannerPanel
      doc={doc}
      dispatch={(action) => {
        onAction?.(action);
        setDoc((prev) => applyBoardAction(prev, action, new Date().toISOString()));
      }}
      onShowOnMap={onShowOnMap ?? (() => {})}
      onSelect={setSelection}
    />
  );
}

describe("PlannerPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens on the current week, Monday first", () => {
    render(<Harness initialDoc={boardWith([])} />);
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Crew / vendor", "Mon 9", "Tue 10", "Wed 11", "Thu 12", "Fri 13", "Sat 14", "Sun 15"]);
  });

  it("spreads a task across its window and puts a delivery on one day", () => {
    const doc = boardWith([
      task("Erect", { owner: "Crew 2", start_date: "2026-03-10", end_date: "2026-03-12" }),
      delivery("Anchor bolts", { vendor: "Nucor", needed_by: "2026-03-11" }),
    ]);
    render(<Harness initialDoc={doc} />);
    expect(screen.getByTestId("board-planner-cell-Crew 2-2026-03-10").textContent).toContain("Erect");
    expect(screen.getByTestId("board-planner-cell-Crew 2-2026-03-12").textContent).toContain("Erect");
    expect(screen.getByTestId("board-planner-cell-Crew 2-2026-03-13").textContent).not.toContain("Erect");
    expect(screen.getByTestId("board-planner-cell-Nucor-2026-03-11").textContent).toContain("Anchor bolts");
    expect(screen.getByTestId("board-planner-cell-Nucor-2026-03-12").textContent).not.toContain("Anchor bolts");
  });

  it("names the unowned row rather than leaving it blank", () => {
    const doc = boardWith([task("Grout", { start_date: "2026-03-10", end_date: "2026-03-10" })]);
    render(<Harness initialDoc={doc} />);
    expect(screen.getByText("Nobody assigned")).toBeTruthy();
  });

  it("plans an undated card onto a crew and a day in two taps", () => {
    const erect = task("Erect");
    const actions: BoardAction[] = [];
    const doc = boardWith([erect, task("Other", { owner: "Crew 2", start_date: "2026-03-09", end_date: "2026-03-09" })]);
    render(<Harness initialDoc={doc} onAction={(a) => actions.push(a)} />);

    fireEvent.click(screen.getByRole("button", { name: "Erect" }));
    expect(screen.getByTestId("board-planner-carrying")).toBeTruthy();
    fireEvent.click(screen.getByTestId("board-planner-cell-Crew 2-2026-03-12"));

    const update = actions.find((a) => a.type === "update_task");
    // An undated task dropped on a day is one day: the tap said when, not how long.
    expect(update?.type === "update_task" && update.patch).toEqual({
      start_date: "2026-03-12",
      end_date: "2026-03-12",
      owner: "Crew 2",
    });
  });

  it("offers only undated cards in the tray — a dated one is already planned", () => {
    const erect = task("Erect", { owner: "Crew 2", start_date: "2026-03-09", end_date: "2026-03-11" });
    const later = task("Later");
    render(<Harness initialDoc={boardWith([erect, later])} />);

    const tray = screen.getByTestId("board-planner-tray");
    expect(tray.textContent).toContain("Later");
    expect(tray.textContent).not.toContain("Erect");
    // It is on the grid instead — one chip per day of its window.
    expect(screen.getByTestId("board-planner-cell-Crew 2-2026-03-09").textContent).toContain("Erect");
    expect(screen.getByTestId("board-planner-cell-Crew 2-2026-03-11").textContent).toContain("Erect");
  });

  it("cancels a pick-up without changing anything", () => {
    const actions: BoardAction[] = [];
    const doc = boardWith([task("Erect"), task("Other", { owner: "Crew 2", start_date: "2026-03-09", end_date: "2026-03-09" })]);
    render(<Harness initialDoc={doc} onAction={(a) => actions.push(a)} />);
    fireEvent.click(screen.getByRole("button", { name: "Erect" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByTestId("board-planner-cell-Crew 2-2026-03-12"));
    expect(actions).toEqual([]);
  });

  it("sends the canvas to a planned card's place on the sheet", () => {
    const erect = task("Erect", { owner: "Crew 2", start_date: "2026-03-10", end_date: "2026-03-10" });
    const shown: string[] = [];
    render(<Harness initialDoc={boardWith([erect])} onShowOnMap={(id) => shown.push(id)} />);
    fireEvent.click(screen.getByRole("button", { name: /Erect/ }));
    expect(shown).toEqual([erect.id]);
  });

  it("counts a blocked task and an overdue delivery as needing attention", () => {
    const doc = boardWith([
      task("Erect", { owner: "Crew 2", start_date: "2026-03-10", end_date: "2026-03-10", blocked: true }),
      delivery("Bolts", { vendor: "Nucor", needed_by: "2026-03-09" }),
      delivery("Deck", { vendor: "Nucor", needed_by: "2026-03-09", received: true }),
    ]);
    render(<Harness initialDoc={doc} />);
    expect(screen.getByTestId("board-planner-attention-Crew 2").textContent).toBe("1");
    // The received one is not a problem; only the late-and-missing one counts.
    expect(screen.getByTestId("board-planner-attention-Nucor").textContent).toBe("1");
  });

  it("moves a week at a time and back to this week", () => {
    render(<Harness initialDoc={boardWith([])} />);
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getAllByRole("columnheader")[1].textContent).toBe("Mon 16");
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getAllByRole("columnheader")[1].textContent).toBe("Mon 2");
    fireEvent.click(screen.getByRole("button", { name: "This week" }));
    expect(screen.getAllByRole("columnheader")[1].textContent).toBe("Mon 9");
  });

  it("says everything is dated when the tray is empty", () => {
    const doc = boardWith([task("Erect", { owner: "Crew 2", start_date: "2026-03-10", end_date: "2026-03-10" })]);
    render(<Harness initialDoc={doc} />);
    expect(screen.getByText("Everything on the board has a date.")).toBeTruthy();
    expect(screen.queryByTestId("board-planner-tray")).toBeNull();
  });
});
