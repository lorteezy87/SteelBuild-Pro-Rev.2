// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useBoardController } from "../useBoardController";
import { createNoteNode } from "@/lib/board/factory";
import { loadBoard, readQueue } from "@/lib/board/storage";

describe("useBoardController", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  function boardId(result: { current: { doc: { id: string } } }): string {
    return result.current.doc.id;
  }

  it("starts a new board for a project that has none", () => {
    const { result } = renderHook(() => useBoardController({ projectId: "proj_1" }));
    expect(result.current.doc.nodes).toEqual([]);
    expect(result.current.doc.project_id).toBe("proj_1");
    expect(result.current.history.frames).toHaveLength(1);
  });

  it("persists the board and queues the change", async () => {
    const { result } = renderHook(() => useBoardController({ projectId: "proj_1" }));
    const node = createNoteNode({ x: 0, y: 0 }, "Anchor bolts short", "warn");

    act(() => {
      result.current.dispatch({ type: "add_node", node }, { label: "Added note" });
    });

    expect(result.current.doc.nodes).toHaveLength(1);
    // The queue records the action itself, so it can be replayed on top of work
    // done elsewhere rather than overwriting it.
    const queued = readQueue(boardId(result));
    expect(queued).toHaveLength(1);
    expect(queued[0].action.type).toBe("add_node");
    expect(queued[0].base_rev).toBe(0);

    await waitFor(() => {
      expect(loadBoard(boardId(result))?.nodes).toHaveLength(1);
    });
  });

  it("reopens the board that was saved for the project", async () => {
    const first = renderHook(() => useBoardController({ projectId: "proj_1" }));
    act(() => {
      first.result.current.dispatch(
        { type: "add_node", node: createNoteNode({ x: 0, y: 0 }, "Kept", "neutral") },
        { label: "Added note" },
      );
    });
    await waitFor(() => expect(loadBoard(boardId(first.result))?.nodes).toHaveLength(1));
    first.unmount();

    const second = renderHook(() => useBoardController({ projectId: "proj_1" }));
    const reopened = second.result.current.doc.nodes[0];
    expect(reopened?.kind === "note" && reopened.text).toBe("Kept");
  });

  it("records no history frame for an action the reducer refused", () => {
    const { result } = renderHook(() => useBoardController({ projectId: "proj_1" }));
    act(() => {
      result.current.dispatch({ type: "delete_edge", id: "ghost" });
    });
    expect(result.current.history.frames).toHaveLength(1);
    expect(readQueue(boardId(result))).toHaveLength(0);
  });

  it("coalesces a drag into a single history frame", () => {
    const { result } = renderHook(() => useBoardController({ projectId: "proj_1" }));
    const node = createNoteNode({ x: 0, y: 0 }, "Card", "neutral");
    act(() => {
      result.current.dispatch({ type: "add_node", node });
    });
    const before = result.current.history.frames.length;
    act(() => {
      for (let i = 0; i < 20; i += 1) {
        result.current.dispatch(
          { type: "move_nodes", ids: [node.id], dx: 9, dy: 0 },
          { key: `move:${node.id}`, label: "Moved 1 card" },
        );
      }
    });
    expect(result.current.history.frames.length).toBe(before + 1);
  });

  it("shows an older board while scrubbing without writing it back", async () => {
    const { result } = renderHook(() => useBoardController({ projectId: "proj_1" }));
    act(() => {
      result.current.dispatch({ type: "add_node", node: createNoteNode({ x: 0, y: 0 }, "One", "neutral") });
    });
    act(() => {
      result.current.dispatch({ type: "add_node", node: createNoteNode({ x: 400, y: 0 }, "Two", "neutral") });
    });
    await waitFor(() => expect(loadBoard(boardId(result))?.nodes).toHaveLength(2));

    act(() => {
      result.current.scrub(1);
    });
    expect(result.current.scrubbing).toBe(true);
    expect(result.current.doc.nodes).toHaveLength(1);

    // Looking at last Tuesday must not revert the board on the next save.
    await new Promise((resolve) => {
      setTimeout(resolve, 600);
    });
    expect(loadBoard(boardId(result))?.nodes).toHaveLength(2);
  });

  it("restores a scrubbed-to version only when asked, and drops the rejected future", async () => {
    const { result } = renderHook(() => useBoardController({ projectId: "proj_1" }));
    act(() => {
      result.current.dispatch({ type: "add_node", node: createNoteNode({ x: 0, y: 0 }, "One", "neutral") });
    });
    act(() => {
      result.current.dispatch({ type: "add_node", node: createNoteNode({ x: 400, y: 0 }, "Two", "neutral") });
    });
    act(() => {
      result.current.scrub(1);
    });
    act(() => {
      result.current.commitScrub();
    });
    expect(result.current.scrubbing).toBe(false);
    expect(result.current.canRedo).toBe(false);
    await waitFor(() => expect(loadBoard(boardId(result))?.nodes).toHaveLength(1));
  });

  it("returns to the newest frame when a scrub is cancelled", () => {
    const { result } = renderHook(() => useBoardController({ projectId: "proj_1" }));
    act(() => {
      result.current.dispatch({ type: "add_node", node: createNoteNode({ x: 0, y: 0 }, "One", "neutral") });
    });
    act(() => {
      result.current.scrub(0);
    });
    act(() => {
      result.current.cancelScrub();
    });
    expect(result.current.scrubbing).toBe(false);
    expect(result.current.doc.nodes).toHaveLength(1);
  });

  it("prunes a selection whose nodes have gone", () => {
    const { result } = renderHook(() => useBoardController({ projectId: "proj_1" }));
    const node = createNoteNode({ x: 0, y: 0 }, "Card", "neutral");
    act(() => {
      result.current.dispatch({ type: "add_node", node });
    });
    act(() => {
      result.current.setSelection([node.id, "ghost"]);
    });
    expect(result.current.selection).toEqual([node.id]);
    act(() => {
      result.current.dispatch({ type: "delete_nodes", ids: [node.id] });
    });
    expect(result.current.selection).toEqual([]);
  });

  it("reports that the board has been sent nowhere while no remote is configured", async () => {
    const { result } = renderHook(() => useBoardController({ projectId: "proj_1" }));
    act(() => {
      result.current.dispatch({ type: "add_node", node: createNoteNode({ x: 0, y: 0 }, "One", "neutral") });
    });
    await waitFor(() => {
      expect(result.current.sync.status).toBe("no-remote");
    });
    expect(result.current.sync.pending).toBe(1);
    expect(result.current.sync.message).toMatch(/not configured/i);
  });

  it("loads a different board when the project changes", async () => {
    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string }) => useBoardController({ projectId }),
      { initialProps: { projectId: "proj_1" } },
    );
    act(() => {
      result.current.dispatch({ type: "add_node", node: createNoteNode({ x: 0, y: 0 }, "Job A", "neutral") });
    });
    await waitFor(() => expect(loadBoard(boardId(result))?.nodes).toHaveLength(1));

    rerender({ projectId: "proj_2" });
    // One project's cards must not follow the user into another job.
    expect(result.current.doc.project_id).toBe("proj_2");
    expect(result.current.doc.nodes).toEqual([]);
  });
});
