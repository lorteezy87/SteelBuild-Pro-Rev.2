import { describe, expect, it } from "vitest";
import { rect } from "../geometry";
import {
  applyBoardAction,
  applyBoardActions,
  createBoardDoc,
  edgesForNode,
  findNode,
  hitTest,
  hitTestOverlay,
  maxZ,
  predecessors,
  resolveNodeRect,
  successors,
  type BoardAction,
} from "../document";
import {
  createDeliveryNode,
  createEdge,
  createInkNode,
  createLinkNode,
  createNoteNode,
  createOverlay,
  createPhotoNode,
  createTaskNode,
} from "../factory";
import type { BoardDeliveryNode, BoardDoc, BoardTaskNode } from "../types";

const T0 = "2026-03-02T08:00:00.000Z";
const T1 = "2026-03-02T09:00:00.000Z";

function board(): BoardDoc {
  return createBoardDoc("board_1", "proj_1", "Bay 3 look-ahead", T0);
}

function withNote(doc: BoardDoc, x = 0, y = 0) {
  const node = createNoteNode({ x, y }, "Anchor bolts short", "warn", T0);
  return { doc: applyBoardAction(doc, { type: "add_node", node }, T0), node };
}

describe("createBoardDoc", () => {
  it("starts empty at rev 0", () => {
    const doc = board();
    expect(doc.rev).toBe(0);
    expect(doc.nodes).toEqual([]);
    expect(doc.schema_version).toBeGreaterThan(0);
  });
});

describe("the no-op contract", () => {
  it("returns the identical document when nothing changed", () => {
    const doc = board();
    const cases: BoardAction[] = [
      { type: "rename_board", name: "Bay 3 look-ahead" },
      { type: "rename_board", name: "   " },
      { type: "delete_nodes", ids: ["missing"] },
      { type: "delete_edge", id: "missing" },
      { type: "delete_overlay", id: "missing" },
      { type: "delete_bookmark", id: "missing" },
      { type: "move_nodes", ids: [], dx: 10, dy: 10 },
      { type: "set_node_color", id: "missing", color: "gold" },
    ];
    for (const action of cases) {
      expect(applyBoardAction(doc, action, T1)).toBe(doc);
    }
  });

  it("does not bump rev on a zero-distance drag", () => {
    const { doc, node } = withNote(board());
    expect(applyBoardAction(doc, { type: "move_nodes", ids: [node.id], dx: 0, dy: 0 }, T1)).toBe(doc);
  });

  it("bumps rev and stamps updated_at on a real change", () => {
    const doc = board();
    const next = applyBoardAction(doc, { type: "rename_board", name: "Renamed" }, T1);
    expect(next.rev).toBe(1);
    expect(next.updated_at).toBe(T1);
    expect(next.name).toBe("Renamed");
  });
});

describe("nodes", () => {
  it("refuses a duplicate id", () => {
    const { doc, node } = withNote(board());
    expect(applyBoardAction(doc, { type: "add_node", node }, T1)).toBe(doc);
  });

  it("moves and snaps to a grid", () => {
    const { doc, node } = withNote(board(), 0, 0);
    const moved = applyBoardAction(doc, { type: "move_nodes", ids: [node.id], dx: 23, dy: 26, grid: 10 }, T1);
    const updated = findNode(moved, node.id);
    expect(updated?.rect.x).toBe(snapped(node.rect.x + 23));
    expect(updated?.rect.y).toBe(snapped(node.rect.y + 26));
  });

  it("deletes a node together with every connector touching it", () => {
    let doc = board();
    const a = createNoteNode({ x: 0, y: 0 }, "a", "neutral", T0);
    const b = createNoteNode({ x: 400, y: 0 }, "b", "neutral", T0);
    const c = createNoteNode({ x: 800, y: 0 }, "c", "neutral", T0);
    doc = applyBoardActions(
      doc,
      [
        { type: "add_node", node: a },
        { type: "add_node", node: b },
        { type: "add_node", node: c },
        { type: "add_edge", edge: createEdge(a.id, b.id, "relates", "", "neutral", T0) },
        { type: "add_edge", edge: createEdge(b.id, c.id, "relates", "", "neutral", T0) },
      ],
      T0,
    );
    expect(doc.edges).toHaveLength(2);
    const pruned = applyBoardAction(doc, { type: "delete_nodes", ids: [b.id] }, T1);
    expect(pruned.nodes.map((n) => n.id)).toEqual([a.id, c.id]);
    // A connector to a node that no longer exists would draw a line to nowhere.
    expect(pruned.edges).toHaveLength(0);
  });

  it("brings a node to the front", () => {
    let doc = board();
    const a = createNoteNode({ x: 0, y: 0 }, "a", "neutral", T0);
    const b = createNoteNode({ x: 10, y: 10 }, "b", "neutral", T0);
    doc = applyBoardActions(doc, [{ type: "add_node", node: a }, { type: "add_node", node: b }], T0);
    const raised = applyBoardAction(doc, { type: "bring_to_front", id: a.id }, T1);
    expect(findNode(raised, a.id)?.z).toBe(maxZ(doc) + 1);
    // Already on top: nothing to do.
    expect(applyBoardAction(raised, { type: "bring_to_front", id: a.id }, T1)).toBe(raised);
  });
});

describe("typed updates", () => {
  it("only applies a note update to a note", () => {
    const { doc, node } = withNote(board());
    const updated = applyBoardAction(doc, { type: "update_note", id: node.id, text: "Rebar clash" }, T1);
    const found = findNode(updated, node.id);
    expect(found?.kind === "note" && found.text).toBe("Rebar clash");

    const task = createTaskNode({ x: 0, y: 0 }, "Set columns", "info", T0);
    const withTask = applyBoardAction(doc, { type: "add_node", node: task }, T0);
    // A note update aimed at a task changes nothing.
    expect(applyBoardAction(withTask, { type: "update_note", id: task.id, text: "x" }, T1)).toBe(withTask);
  });

  it("patches a task and ignores a patch that changes nothing", () => {
    const task = createTaskNode({ x: 0, y: 0 }, "Set columns", "info", T0);
    const doc = applyBoardAction(board(), { type: "add_node", node: task }, T0);
    const scheduled = applyBoardAction(
      doc,
      { type: "update_task", id: task.id, patch: { start_date: "2026-03-09", end_date: "2026-03-13" } },
      T1,
    );
    const updated = findNode(scheduled, task.id) as BoardTaskNode;
    expect(updated.start_date).toBe("2026-03-09");
    expect(applyBoardAction(scheduled, { type: "update_task", id: task.id, patch: { start_date: "2026-03-09" } }, T1)).toBe(
      scheduled,
    );
  });

  it("keeps blocked separate from status, because the database has no blocked status", () => {
    const task = createTaskNode({ x: 0, y: 0 }, "Erect frame", "info", T0);
    const doc = applyBoardAction(board(), { type: "add_node", node: task }, T0);
    const blocked = applyBoardAction(
      doc,
      {
        type: "update_task",
        id: task.id,
        patch: { status: "In Progress", blocked: true, blocked_reason: "Embed missing at grid C-4" },
      },
      T1,
    );
    const updated = findNode(blocked, task.id) as BoardTaskNode;
    expect(updated.status).toBe("In Progress");
    expect(updated.blocked).toBe(true);
  });

  it("updates a photo caption and a link", () => {
    let doc = board();
    const photo = createPhotoNode({ x: 0, y: 0 }, "asset_1", "", T0);
    const link = createLinkNode({ x: 0, y: 0 }, "https://example.test/spec", "", T0);
    doc = applyBoardActions(doc, [{ type: "add_node", node: photo }, { type: "add_node", node: link }], T0);
    doc = applyBoardAction(doc, { type: "update_photo", id: photo.id, caption: "Bent gusset" }, T1);
    doc = applyBoardAction(doc, { type: "update_link", id: link.id, title: "Spec 05 12 00" }, T1);
    const savedPhoto = findNode(doc, photo.id);
    const savedLink = findNode(doc, link.id);
    expect(savedPhoto?.kind === "photo" && savedPhoto.caption).toBe("Bent gusset");
    expect(savedLink?.kind === "link" && savedLink.title).toBe("Spec 05 12 00");
    expect(savedLink?.kind === "link" && savedLink.url).toBe("https://example.test/spec");
  });

  it("patches a delivery and ignores a patch that changes nothing", () => {
    const bolts = createDeliveryNode({ x: 0, y: 0 }, "Anchor bolts", "", "gold", T0);
    const doc = applyBoardAction(board(), { type: "add_node", node: bolts }, T0);
    const dated = applyBoardAction(
      doc,
      { type: "update_delivery", id: bolts.id, patch: { vendor: "Nucor", needed_by: "2026-03-10" } },
      T1,
    );
    const updated = findNode(dated, bolts.id) as BoardDeliveryNode;
    expect(updated.vendor).toBe("Nucor");
    expect(updated.needed_by).toBe("2026-03-10");
    expect(updated.received).toBe(false);
    expect(
      applyBoardAction(dated, { type: "update_delivery", id: bolts.id, patch: { vendor: "Nucor" } }, T1),
    ).toBe(dated);
  });

  it("keeps received separate from the date, which only says whether it is late", () => {
    const bolts = createDeliveryNode({ x: 0, y: 0 }, "Anchor bolts", "Nucor", "gold", T0);
    let doc = applyBoardAction(board(), { type: "add_node", node: bolts }, T0);
    doc = applyBoardAction(
      doc,
      { type: "update_delivery", id: bolts.id, patch: { needed_by: "2020-01-01" } },
      T1,
    );
    expect((findNode(doc, bolts.id) as BoardDeliveryNode).received).toBe(false);
    doc = applyBoardAction(doc, { type: "update_delivery", id: bolts.id, patch: { received: true } }, T1);
    const received = findNode(doc, bolts.id) as BoardDeliveryNode;
    expect(received.received).toBe(true);
    expect(received.needed_by).toBe("2020-01-01");
  });

  it("only applies a delivery update to a delivery", () => {
    const task = createTaskNode({ x: 0, y: 0 }, "Set columns", "info", T0);
    const doc = applyBoardAction(board(), { type: "add_node", node: task }, T0);
    expect(
      applyBoardAction(doc, { type: "update_delivery", id: task.id, patch: { vendor: "Nucor" } }, T1),
    ).toBe(doc);
  });

  it("rejects a stroke with fewer than two points", () => {
    const ink = createInkNode(rect(0, 0, 100, 100), "neutral", T0);
    const doc = applyBoardAction(board(), { type: "add_node", node: ink }, T0);
    const stray = applyBoardAction(
      doc,
      { type: "append_stroke", id: ink.id, stroke: { points: [1, 2], width: 2, color: "neutral" } },
      T1,
    );
    expect(stray).toBe(doc);
    const real = applyBoardAction(
      doc,
      { type: "append_stroke", id: ink.id, stroke: { points: [1, 2, 3, 4], width: 2, color: "neutral" } },
      T1,
    );
    const saved = findNode(real, ink.id);
    expect(saved?.kind === "ink" && saved.strokes).toHaveLength(1);
  });
});

describe("connectors", () => {
  function twoNodes() {
    let doc = board();
    const a = createNoteNode({ x: 0, y: 0 }, "a", "neutral", T0);
    const b = createNoteNode({ x: 500, y: 0 }, "b", "neutral", T0);
    doc = applyBoardActions(doc, [{ type: "add_node", node: a }, { type: "add_node", node: b }], T0);
    return { doc, a, b };
  }

  it("refuses a self-connector", () => {
    const { doc, a } = twoNodes();
    expect(applyBoardAction(doc, { type: "add_edge", edge: createEdge(a.id, a.id, "relates", "", "neutral", T0) }, T1)).toBe(
      doc,
    );
  });

  it("refuses a connector to a node that is not on the board", () => {
    const { doc, a } = twoNodes();
    expect(
      applyBoardAction(doc, { type: "add_edge", edge: createEdge(a.id, "ghost", "relates", "", "neutral", T0) }, T1),
    ).toBe(doc);
  });

  it("allows only one connector per pair, in either direction", () => {
    const { doc, a, b } = twoNodes();
    const linked = applyBoardAction(doc, { type: "add_edge", edge: createEdge(a.id, b.id, "relates", "", "neutral", T0) }, T1);
    expect(linked.edges).toHaveLength(1);
    const reversed = applyBoardAction(
      linked,
      { type: "add_edge", edge: createEdge(b.id, a.id, "precedes", "", "neutral", T0) },
      T1,
    );
    expect(reversed).toBe(linked);
  });

  it("relabels a connector and reports its neighbours", () => {
    const { doc, a, b } = twoNodes();
    const edge = createEdge(a.id, b.id, "precedes", "", "neutral", T0);
    let linked = applyBoardAction(doc, { type: "add_edge", edge }, T1);
    linked = applyBoardAction(linked, { type: "update_edge", id: edge.id, patch: { label: "after grout cures" } }, T1);
    expect(linked.edges[0].label).toBe("after grout cures");
    expect(edgesForNode(linked, a.id)).toHaveLength(1);
    expect(successors(linked, a.id, "precedes").map((n) => n.id)).toEqual([b.id]);
    expect(predecessors(linked, b.id, "precedes").map((n) => n.id)).toEqual([a.id]);
  });
});

describe("blueprint overlays and pins", () => {
  function pinned() {
    let doc = board();
    const overlay = createOverlay("asset_sheet", "Framing Plan", "S-301", rect(0, 0, 1000, 800), T0);
    const node = createNoteNode({ x: 500, y: 400 }, "Embed conflict", "danger", T0);
    doc = applyBoardActions(
      doc,
      [
        { type: "add_overlay", overlay },
        { type: "add_node", node },
        { type: "pin_node", id: node.id, anchor: { overlay_id: overlay.id, u: 0.5, v: 0.5 } },
      ],
      T0,
    );
    return { doc, overlay, node };
  }

  it("refuses a pin to an overlay that is not on the board", () => {
    const { doc, node } = withNote(board());
    expect(
      applyBoardAction(doc, { type: "pin_node", id: node.id, anchor: { overlay_id: "ghost", u: 0.5, v: 0.5 } }, T1),
    ).toBe(doc);
  });

  it("resolves a pin from the sheet, not from the cached rect", () => {
    const { doc, overlay, node } = pinned();
    const moved = applyBoardAction(doc, { type: "update_overlay", id: overlay.id, patch: { rect: rect(2000, 0, 1000, 800) } }, T1);
    const resolved = resolveNodeRect(moved, findNode(moved, node.id)!);
    // The pin travelled with the sheet: still half way across it.
    expect(resolved.x).toBe(2500);
    expect(resolved.y).toBe(400);
  });

  it("refreshes the cached rect when the sheet moves, so hit testing agrees", () => {
    const { doc, overlay } = pinned();
    const moved = applyBoardAction(doc, { type: "update_overlay", id: overlay.id, patch: { rect: rect(2000, 0, 1000, 800) } }, T1);
    expect(hitTest(moved, { x: 2510, y: 410 })?.kind).toBe("note");
    expect(hitTest(moved, { x: 510, y: 410 })).toBeNull();
  });

  it("survives a rescaled sheet, which a stored world coordinate would not", () => {
    const { doc, overlay, node } = pinned();
    const rescaled = applyBoardAction(doc, { type: "update_overlay", id: overlay.id, patch: { rect: rect(0, 0, 500, 400) } }, T1);
    const resolved = resolveNodeRect(rescaled, findNode(rescaled, node.id)!);
    expect(resolved.x).toBe(250);
    expect(resolved.y).toBe(200);
  });

  it("unpins in place when the sheet is deleted, rather than losing the note", () => {
    const { doc, overlay, node } = pinned();
    const removed = applyBoardAction(doc, { type: "delete_overlay", id: overlay.id }, T1);
    const survivor = findNode(removed, node.id);
    expect(survivor).not.toBeNull();
    expect(survivor?.anchor).toBeNull();
    expect(survivor?.rect.x).toBe(500);
  });

  it("re-anchors rather than springing back when a pin is dragged", () => {
    const { doc, node } = pinned();
    const dragged = applyBoardAction(doc, { type: "move_nodes", ids: [node.id], dx: 100, dy: 0 }, T1);
    const updated = findNode(dragged, node.id)!;
    expect(updated.anchor?.u).toBeCloseTo(0.6, 10);
    expect(resolveNodeRect(dragged, updated).x).toBeCloseTo(600, 10);
  });

  it("ignores locked sheets when hit testing, so panning over a drawing does not drag it", () => {
    const { doc, overlay } = pinned();
    expect(overlay.locked).toBe(true);
    expect(hitTestOverlay(doc, { x: 10, y: 10 })).toBeNull();
    expect(hitTestOverlay(doc, { x: 10, y: 10 }, true)?.id).toBe(overlay.id);
    const unlocked = applyBoardAction(doc, { type: "update_overlay", id: overlay.id, patch: { locked: false } }, T1);
    expect(hitTestOverlay(unlocked, { x: 10, y: 10 })?.id).toBe(overlay.id);
  });
});

describe("hitTest", () => {
  it("returns the topmost node under the point", () => {
    let doc = board();
    const under = createNoteNode({ x: 100, y: 100 }, "under", "neutral", T0);
    const over = createNoteNode({ x: 100, y: 100 }, "over", "neutral", T0);
    doc = applyBoardActions(doc, [{ type: "add_node", node: under }, { type: "add_node", node: over }], T0);
    doc = applyBoardAction(doc, { type: "bring_to_front", id: under.id }, T1);
    expect(hitTest(doc, { x: 100, y: 100 })?.id).toBe(under.id);
  });

  it("returns null on empty canvas", () => {
    expect(hitTest(board(), { x: 0, y: 0 })).toBeNull();
  });
});

describe("bookmarks", () => {
  it("adds and removes saved views", () => {
    const bookmark = {
      id: "mark_1",
      label: "Bay 3",
      viewport: { x: 10, y: 20, scale: 1.5 },
      created_at: T0,
    };
    let doc = applyBoardAction(board(), { type: "add_bookmark", bookmark }, T1);
    expect(doc.bookmarks).toHaveLength(1);
    expect(applyBoardAction(doc, { type: "add_bookmark", bookmark }, T1)).toBe(doc);
    doc = applyBoardAction(doc, { type: "delete_bookmark", id: "mark_1" }, T1);
    expect(doc.bookmarks).toHaveLength(0);
  });
});

function snapped(n: number): number {
  return Math.round(n / 10) * 10;
}
