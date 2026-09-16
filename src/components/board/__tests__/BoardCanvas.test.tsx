// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BoardCanvas from "../BoardCanvas";
import type { BoardTool } from "../tools";
import { applyBoardAction, applyBoardActions, createBoardDoc } from "@/lib/board/document";
import { createNoteNode, createTaskNode } from "@/lib/board/factory";
import type { BoardAction } from "@/lib/board/document";
import type { BoardDoc } from "@/lib/board/types";
import { DEFAULT_VIEWPORT, type Viewport } from "@/lib/board/viewport";

const T0 = "2026-03-02T08:00:00.000Z";

function seededBoard(): { doc: BoardDoc; noteId: string; taskId: string } {
  const note = createNoteNode({ x: 0, y: 0 }, "Anchor bolts", "warn", T0);
  const task = createTaskNode({ x: 600, y: 0 }, "Set columns", "info", T0);
  const doc = applyBoardActions(
    createBoardDoc("board_1", "proj_1", "Bay 3", T0),
    [
      { type: "add_node", node: note },
      { type: "add_node", node: task },
    ],
    T0,
  );
  return { doc, noteId: note.id, taskId: task.id };
}

interface HarnessProps {
  initialDoc: BoardDoc;
  tool?: BoardTool;
  readOnly?: boolean;
  onAction?: (action: BoardAction) => void;
  onViewport?: (viewport: Viewport) => void;
}

/**
 * A controlled host for the canvas — the real page owns this state, so a test
 * that stubs it out would not exercise the round trip from gesture to document.
 */
function Harness({ initialDoc, tool = "select", readOnly = false, onAction, onViewport }: HarnessProps) {
  const [doc, setDoc] = useState(initialDoc);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [selection, setSelection] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<BoardTool>(tool);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  return (
    <BoardCanvas
      doc={doc}
      viewport={viewport}
      setViewport={(next) => {
        setViewport((prev) => {
          const resolved = typeof next === "function" ? next(prev) : next;
          onViewport?.(resolved);
          return resolved;
        });
      }}
      tool={activeTool}
      onToolChange={setActiveTool}
      color="neutral"
      selection={selection}
      setSelection={setSelection}
      selectedEdgeId={selectedEdgeId}
      setSelectedEdgeId={setSelectedEdgeId}
      dispatch={(action) => {
        onAction?.(action);
        setDoc((prev) => applyBoardAction(prev, action, new Date().toISOString()));
      }}
      assetUrl={() => null}
      readOnly={readOnly}
    />
  );
}

const pointer = (x: number, y: number, pointerId = 1) => ({ clientX: x, clientY: y, pointerId });

describe("BoardCanvas", () => {
  it("renders every node at its world position inside one transformed layer", () => {
    const { doc, noteId } = seededBoard();
    render(<Harness initialDoc={doc} />);
    const world = screen.getByTestId("board-world");
    expect(world.style.transform).toContain("scale(1)");
    expect(screen.getByTestId(`board-node-${noteId}`)).toBeTruthy();
  });

  it("pans the viewport on a one-finger drag over empty canvas", () => {
    const { doc } = seededBoard();
    const seen: Viewport[] = [];
    render(<Harness initialDoc={doc} onViewport={(v) => seen.push(v)} />);
    const canvas = screen.getByTestId("board-canvas");
    fireEvent.pointerDown(canvas, pointer(400, 400));
    fireEvent.pointerMove(canvas, pointer(350, 370));
    fireEvent.pointerUp(canvas, pointer(350, 370));
    // Dragging left/up shows content to the right/below: the origin moves with it.
    expect(seen.at(-1)).toEqual({ x: 50, y: 30, scale: 1 });
  });

  it("places a note where the canvas was tapped and hands the board back to Select", () => {
    const { doc } = seededBoard();
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={doc} tool="note" onAction={(a) => actions.push(a)} />);
    fireEvent.pointerDown(screen.getByTestId("board-canvas"), pointer(300, 200));
    const added = actions.find((a) => a.type === "add_node");
    expect(added?.type === "add_node" && added.node.kind).toBe("note");
    // Centred on the tap: a 220-wide default note starts 110 to its left.
    expect(added?.type === "add_node" && added.node.rect.x).toBe(190);

    // A second tap must not place a second note — the tool reverted.
    actions.length = 0;
    fireEvent.pointerDown(screen.getByTestId("board-canvas"), pointer(500, 200));
    expect(actions.some((a) => a.type === "add_node")).toBe(false);
  });

  it("drags a card, snapping to the grid", () => {
    const { doc, noteId } = seededBoard();
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={doc} onAction={(a) => actions.push(a)} />);
    const card = screen.getByTestId(`board-node-${noteId}`);
    fireEvent.pointerDown(card, pointer(0, 0));
    fireEvent.pointerMove(screen.getByTestId("board-canvas"), pointer(40, 24));
    fireEvent.pointerUp(screen.getByTestId("board-canvas"), pointer(40, 24));
    const move = actions.find((a) => a.type === "move_nodes");
    expect(move?.type === "move_nodes" && move.ids).toEqual([noteId]);
    expect(move?.type === "move_nodes" && move.dx).toBe(40);
  });

  it("raises the card being dragged so it is not left under its neighbours", () => {
    const { doc, noteId } = seededBoard();
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={doc} onAction={(a) => actions.push(a)} />);
    fireEvent.pointerDown(screen.getByTestId(`board-node-${noteId}`), pointer(0, 0));
    expect(actions.some((a) => a.type === "bring_to_front")).toBe(true);
  });

  it("cancels a drag when a second finger lands, and pinches instead", () => {
    const { doc, noteId } = seededBoard();
    const actions: BoardAction[] = [];
    const seen: Viewport[] = [];
    render(<Harness initialDoc={doc} onAction={(a) => actions.push(a)} onViewport={(v) => seen.push(v)} />);
    const canvas = screen.getByTestId("board-canvas");

    fireEvent.pointerDown(screen.getByTestId(`board-node-${noteId}`), pointer(100, 100, 1));
    fireEvent.pointerDown(canvas, pointer(200, 100, 2));
    actions.length = 0;

    // Spreading the fingers must zoom, not carry on dragging the card.
    fireEvent.pointerMove(canvas, pointer(300, 100, 2));
    expect(actions.some((a) => a.type === "move_nodes")).toBe(false);
    expect(seen.at(-1)?.scale).toBeGreaterThan(1);
  });

  it("draws a connector between two tapped cards in Connect mode", () => {
    const { doc, noteId, taskId } = seededBoard();
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={doc} tool="connect" onAction={(a) => actions.push(a)} />);
    fireEvent.pointerDown(screen.getByTestId(`board-node-${noteId}`), pointer(0, 0, 1));
    fireEvent.pointerUp(screen.getByTestId("board-canvas"), pointer(0, 0, 1));
    fireEvent.pointerDown(screen.getByTestId(`board-node-${taskId}`), pointer(600, 0, 2));
    const edge = actions.find((a) => a.type === "add_edge");
    expect(edge?.type === "add_edge" && edge.edge.from_node_id).toBe(noteId);
    expect(edge?.type === "add_edge" && edge.edge.to_node_id).toBe(taskId);
  });

  it("collects a stroke while drawing and commits it once on pointer up", () => {
    const { doc } = seededBoard();
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={doc} tool="ink" onAction={(a) => actions.push(a)} />);
    const canvas = screen.getByTestId("board-canvas");
    fireEvent.pointerDown(canvas, pointer(10, 10));
    fireEvent.pointerMove(canvas, pointer(40, 30));
    fireEvent.pointerMove(canvas, pointer(80, 60));
    // Nothing is written to the document mid-stroke.
    expect(actions).toHaveLength(0);
    expect(screen.getByTestId("board-live-stroke")).toBeTruthy();

    fireEvent.pointerUp(canvas, pointer(80, 60));
    const added = actions.find((a) => a.type === "add_node");
    expect(added?.type === "add_node" && added.node.kind).toBe("ink");
    expect(added?.type === "add_node" && added.node.kind === "ink" && added.node.strokes).toHaveLength(1);
  });

  it("discards an in-progress stroke when a second finger starts a pinch", () => {
    const { doc } = seededBoard();
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={doc} tool="ink" onAction={(a) => actions.push(a)} />);
    const canvas = screen.getByTestId("board-canvas");
    fireEvent.pointerDown(canvas, pointer(10, 10, 1));
    fireEvent.pointerMove(canvas, pointer(60, 40, 1));
    fireEvent.pointerDown(canvas, pointer(200, 200, 2));
    fireEvent.pointerUp(canvas, pointer(200, 200, 2));
    fireEvent.pointerUp(canvas, pointer(60, 40, 1));
    // Half a scribble made while zooming is not a mark the user meant to leave.
    expect(actions.some((a) => a.type === "add_node")).toBe(false);
  });

  it("makes no edit while the Time Machine is scrubbing, but still pans", () => {
    const { doc, noteId } = seededBoard();
    const actions: BoardAction[] = [];
    const seen: Viewport[] = [];
    render(
      <Harness initialDoc={doc} readOnly onAction={(a) => actions.push(a)} onViewport={(v) => seen.push(v)} />,
    );
    const canvas = screen.getByTestId("board-canvas");
    fireEvent.pointerDown(screen.getByTestId(`board-node-${noteId}`), pointer(100, 100));
    fireEvent.pointerMove(canvas, pointer(160, 140));
    fireEvent.pointerUp(canvas, pointer(160, 140));
    expect(actions).toEqual([]);
    expect(seen.at(-1)).toEqual({ x: -60, y: -40, scale: 1 });
  });

  it("does not create a node on the canvas when the tool is Select", () => {
    const { doc } = seededBoard();
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={doc} onAction={(a) => actions.push(a)} />);
    fireEvent.pointerDown(screen.getByTestId("board-canvas"), pointer(10, 10));
    expect(actions.some((a) => a.type === "add_node")).toBe(false);
  });

  it("hides the grid when zoomed far enough out for it to be noise", () => {
    const { doc } = seededBoard();
    const { container } = render(<Harness initialDoc={doc} />);
    const canvas = screen.getByTestId("board-canvas");
    const grid = container.querySelector(".sbp-canvas__grid") as HTMLElement;
    expect(grid.style.opacity).toBe("0.5");
    // Wheel-zoom far out. 40 world units per line, so below 0.2 scale the lines
    // are under 8px apart.
    for (let i = 0; i < 30; i += 1) {
      fireEvent.wheel(canvas, { deltaY: 100, ctrlKey: true, clientX: 0, clientY: 0 });
    }
    expect(grid.style.opacity).toBe("0");
  });

  it("zooms about the pointer on a trackpad pinch", () => {
    const { doc } = seededBoard();
    const seen: Viewport[] = [];
    render(<Harness initialDoc={doc} onViewport={(v) => seen.push(v)} />);
    fireEvent.wheel(screen.getByTestId("board-canvas"), {
      deltaY: -100,
      ctrlKey: true,
      clientX: 200,
      clientY: 100,
    });
    const next = seen.at(-1);
    expect(next?.scale).toBeGreaterThan(1);
    // The world point under (200, 100) is unchanged by the zoom.
    expect((200 / (next?.scale ?? 1) + (next?.x ?? 0))).toBeCloseTo(200, 6);
  });

  it("does not let the page scroll behind a trackpad zoom", () => {
    const { doc } = seededBoard();
    render(<Harness initialDoc={doc} />);
    const event = new Event("wheel", { bubbles: true, cancelable: true });
    Object.assign(event, { deltaY: -100, ctrlKey: true, clientX: 0, clientY: 0 });
    const prevented = !screen.getByTestId("board-canvas").dispatchEvent(event);
    expect(prevented).toBe(true);
  });

  it("scrolls the board on a plain wheel rather than zooming", () => {
    const { doc } = seededBoard();
    const seen: Viewport[] = [];
    render(<Harness initialDoc={doc} onViewport={(v) => seen.push(v)} />);
    fireEvent.wheel(screen.getByTestId("board-canvas"), { deltaY: 120, deltaX: 0, clientX: 0, clientY: 0 });
    expect(seen.at(-1)).toEqual({ x: 0, y: 120, scale: 1 });
  });
});

describe("BoardCanvas blueprint pinning", () => {
  it("pins a card to the sheet it is dropped on", () => {
    const note = createNoteNode({ x: 5000, y: 5000 }, "Embed conflict", "danger", T0);
    let doc = createBoardDoc("board_1", "proj_1", "Bay 3", T0);
    doc = applyBoardActions(
      doc,
      [
        {
          type: "add_overlay",
          overlay: {
            id: "sheet_1",
            name: "Framing Plan",
            sheet_number: "S-301",
            asset_id: "asset_1",
            rect: { x: 0, y: 0, w: 1000, h: 800 },
            opacity: 0.6,
            locked: true,
            created_at: T0,
          },
        },
        { type: "add_node", node: { ...note, rect: { x: 100, y: 100, w: 220, h: 140 } } },
      ],
      T0,
    );
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={doc} onAction={(a) => actions.push(a)} />);
    const card = screen.getByTestId(`board-node-${note.id}`);
    fireEvent.pointerDown(card, pointer(100, 100));
    fireEvent.pointerMove(screen.getByTestId("board-canvas"), pointer(108, 108));
    fireEvent.pointerUp(screen.getByTestId("board-canvas"), pointer(108, 108));
    const pin = actions.find((a) => a.type === "pin_node");
    expect(pin?.type === "pin_node" && pin.anchor?.overlay_id).toBe("sheet_1");
  });

  it("unpins a card dragged off every sheet", () => {
    const note = createNoteNode({ x: 0, y: 0 }, "note", "neutral", T0);
    let doc = createBoardDoc("board_1", "proj_1", "Bay 3", T0);
    doc = applyBoardActions(
      doc,
      [
        {
          type: "add_overlay",
          overlay: {
            id: "sheet_1",
            name: "Framing Plan",
            sheet_number: "S-301",
            asset_id: "asset_1",
            rect: { x: 0, y: 0, w: 200, h: 200 },
            opacity: 0.6,
            locked: true,
            created_at: T0,
          },
        },
        { type: "add_node", node: { ...note, rect: { x: 40, y: 40, w: 80, h: 80 } } },
        { type: "pin_node", id: note.id, anchor: { overlay_id: "sheet_1", u: 0.2, v: 0.2 } },
      ],
      T0,
    );
    const actions: BoardAction[] = [];
    render(<Harness initialDoc={doc} onAction={(a) => actions.push(a)} />);
    fireEvent.pointerDown(screen.getByTestId(`board-node-${note.id}`), pointer(0, 0));
    fireEvent.pointerMove(screen.getByTestId("board-canvas"), pointer(800, 800));
    fireEvent.pointerUp(screen.getByTestId("board-canvas"), pointer(800, 800));
    const pin = actions.filter((a) => a.type === "pin_node").at(-1);
    expect(pin?.type === "pin_node" && pin.anchor).toBeNull();
  });
});

describe("BoardCanvas cleanup", () => {
  it("removes its wheel listener on unmount", () => {
    const { doc } = seededBoard();
    const remove = vi.spyOn(HTMLElement.prototype, "removeEventListener");
    const { unmount } = render(<Harness initialDoc={doc} />);
    unmount();
    expect(remove).toHaveBeenCalledWith("wheel", expect.any(Function));
    remove.mockRestore();
  });
});
