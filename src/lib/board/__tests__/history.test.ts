import { describe, expect, it } from "vitest";
import { COALESCE_WINDOW_MS, MAX_FRAMES, canRedo, canUndo, createHistory, currentDoc, frameSummaries, pushFrame, redo, restoreCurrent, scrubTo, undo } from "../history";
import { applyBoardAction, createBoardDoc } from "../document";
import type { BoardDoc } from "../types";

const T0 = "2026-03-02T08:00:00.000Z";

function doc(name: string): BoardDoc {
  return createBoardDoc("board_1", "proj_1", name, T0);
}

describe("createHistory", () => {
  it("starts with one frame", () => {
    const history = createHistory(doc("A"), 0);
    expect(history.frames).toHaveLength(1);
    expect(history.index).toBe(0);
    expect(currentDoc(history).name).toBe("A");
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });
});

describe("pushFrame", () => {
  it("ignores a push of the same document reference", () => {
    const a = doc("A");
    const history = createHistory(a, 0);
    expect(pushFrame(history, a, 100)).toBe(history);
  });

  it("appends a distinct state", () => {
    const history = pushFrame(createHistory(doc("A"), 0), doc("B"), 100, { label: "Renamed" });
    expect(history.frames).toHaveLength(2);
    expect(currentDoc(history).name).toBe("B");
    expect(frameSummaries(history)[1].label).toBe("Renamed");
  });

  it("coalesces one gesture into one frame", () => {
    let history = createHistory(doc("A"), 0);
    for (let i = 1; i <= 50; i += 1) {
      history = pushFrame(history, doc(`drag-${i}`), i * 10, { key: "move:node_1" });
    }
    expect(history.frames).toHaveLength(2);
    expect(currentDoc(history).name).toBe("drag-50");
  });

  it("starts a new frame once the gesture window lapses", () => {
    let history = createHistory(doc("A"), 0);
    history = pushFrame(history, doc("B"), 0, { key: "move:node_1" });
    history = pushFrame(history, doc("C"), COALESCE_WINDOW_MS + 1, { key: "move:node_1" });
    expect(history.frames).toHaveLength(3);
  });

  it("never coalesces discrete edits", () => {
    let history = createHistory(doc("A"), 0);
    history = pushFrame(history, doc("B"), 0);
    history = pushFrame(history, doc("C"), 1);
    expect(history.frames).toHaveLength(3);
  });

  it("caps the ring and reports that it did", () => {
    let history = createHistory(doc("frame-0"), 0);
    for (let i = 1; i <= MAX_FRAMES + 10; i += 1) {
      history = pushFrame(history, doc(`frame-${i}`), i * 10_000);
    }
    expect(history.frames).toHaveLength(MAX_FRAMES);
    expect(history.truncated).toBe(true);
    // The oldest surviving frame is not the board's beginning.
    expect(currentDoc({ ...history, index: 0 }).name).not.toBe("frame-0");
  });
});

describe("undo / redo", () => {
  it("steps back and forward", () => {
    let history = createHistory(doc("A"), 0);
    history = pushFrame(history, doc("B"), 10);
    history = pushFrame(history, doc("C"), 20);
    history = undo(history);
    expect(currentDoc(history).name).toBe("B");
    expect(canRedo(history)).toBe(true);
    history = redo(history);
    expect(currentDoc(history).name).toBe("C");
  });

  it("is a no-op at each end", () => {
    const history = createHistory(doc("A"), 0);
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it("discards the redo stack once a new edit branches off it", () => {
    let history = createHistory(doc("A"), 0);
    history = pushFrame(history, doc("B"), 10);
    history = pushFrame(history, doc("C"), 20);
    history = undo(history);
    history = pushFrame(history, doc("D"), 30);
    expect(history.frames.map((f) => f.doc.name)).toEqual(["A", "B", "D"]);
    expect(canRedo(history)).toBe(false);
  });
});

describe("the Time Machine slider", () => {
  function threeFrames() {
    let history = createHistory(doc("A"), 0);
    history = pushFrame(history, doc("B"), 10);
    return pushFrame(history, doc("C"), 20);
  }

  it("scrubs to an absolute frame", () => {
    expect(currentDoc(scrubTo(threeFrames(), 0)).name).toBe("A");
  });

  it("clamps rather than throwing when the input runs past the ends", () => {
    const history = threeFrames();
    expect(currentDoc(scrubTo(history, -5)).name).toBe("A");
    expect(currentDoc(scrubTo(history, 99)).name).toBe("C");
    expect(scrubTo(history, 2)).toBe(history);
  });

  it("restoring drops the future the user has just rejected", () => {
    const restored = restoreCurrent(scrubTo(threeFrames(), 1));
    expect(restored.frames.map((f) => f.doc.name)).toEqual(["A", "B"]);
    expect(canRedo(restored)).toBe(false);
  });

  it("restoring at the newest frame changes nothing", () => {
    const history = threeFrames();
    expect(restoreCurrent(history)).toBe(history);
  });
});

describe("integration with the reducer", () => {
  it("records nothing for an action the reducer refused", () => {
    const base = doc("A");
    let history = createHistory(base, 0);
    const unchanged = applyBoardAction(base, { type: "delete_edge", id: "ghost" }, T0);
    history = pushFrame(history, unchanged, 10);
    expect(history.frames).toHaveLength(1);
  });
});
