/**
 * document — the board's single write path.
 *
 * Every change to a board goes through {@link applyBoardAction}: a pure function
 * from (document, action, timestamp) to a new document. Nothing else mutates a
 * board. That constraint is what buys the three features the blueprint asks for
 * almost for free:
 *
 *   - **Time Machine.** If the document is only ever replaced, a history is just
 *     a list of the values it has held (`history.ts`).
 *   - **Offline sync.** If every change is a named action against a known `rev`,
 *     the pending queue is a list of actions, not a diff of two blobs
 *     (`storage.ts`).
 *   - **Undo.** Falls out of the history, with no per-feature inverse to write.
 *
 * ## No-ops return the same object
 *
 * An action that changes nothing — deleting an id that is not there, dragging by
 * zero, adding a duplicate connector — returns the *identical* document
 * reference and does not bump `rev`. React skips the re-render, the history does
 * not fill with empty frames a user has to scrub past, and the sync queue does
 * not ship changes that say nothing. Callers can therefore fire actions
 * optimistically on every pointer move without filtering first.
 *
 * ## Timestamps are passed in
 *
 * `now` is a parameter rather than a `Date.now()` call inside the reducer so the
 * whole module is deterministic under test. The UI passes `nowIso()`.
 */

import { rectContains, resizeRect, snap, translateRect, type Rect, type Vec2 } from "./geometry";
import {
  BOARD_SCHEMA_VERSION,
  type BoardBookmark,
  type BoardColor,
  type BoardDeliveryNode,
  type BoardDoc,
  type BoardEdge,
  type BoardEdgeKind,
  type BoardNode,
  type BoardOverlay,
  type BoardTaskNode,
  type InkStroke,
  type OverlayAnchor,
} from "./types";

/** Fields of a task a caller may change. */
export type TaskPatch = Partial<
  Pick<
    BoardTaskNode,
    "text" | "start_date" | "end_date" | "status" | "blocked" | "blocked_reason" | "owner"
  >
>;

/** Fields of a delivery a caller may change. */
export type DeliveryPatch = Partial<
  Pick<BoardDeliveryNode, "material" | "vendor" | "needed_by" | "received">
>;

export type OverlayPatch = Partial<Pick<BoardOverlay, "name" | "sheet_number" | "opacity" | "locked" | "rect">>;

export type EdgePatch = Partial<Pick<BoardEdge, "label" | "color" | "kind">>;

export type BoardAction =
  | { type: "rename_board"; name: string }
  | { type: "add_node"; node: BoardNode }
  | { type: "move_nodes"; ids: readonly string[]; dx: number; dy: number; grid?: number }
  | { type: "resize_node"; id: string; dw: number; dh: number }
  | { type: "delete_nodes"; ids: readonly string[] }
  | { type: "set_node_color"; id: string; color: BoardColor }
  | { type: "update_note"; id: string; text: string }
  | { type: "update_task"; id: string; patch: TaskPatch }
  | { type: "update_delivery"; id: string; patch: DeliveryPatch }
  | { type: "update_photo"; id: string; caption: string }
  | { type: "update_link"; id: string; url?: string; title?: string }
  | { type: "append_stroke"; id: string; stroke: InkStroke }
  | { type: "pin_node"; id: string; anchor: OverlayAnchor | null }
  | { type: "bring_to_front"; id: string }
  | { type: "add_edge"; edge: BoardEdge }
  | { type: "update_edge"; id: string; patch: EdgePatch }
  | { type: "delete_edge"; id: string }
  | { type: "add_overlay"; overlay: BoardOverlay }
  | { type: "update_overlay"; id: string; patch: OverlayPatch }
  | { type: "delete_overlay"; id: string }
  | { type: "add_bookmark"; bookmark: BoardBookmark }
  | { type: "delete_bookmark"; id: string };

/** An empty board for `projectId`. */
export function createBoardDoc(id: string, projectId: string | null, name: string, now: string): BoardDoc {
  return {
    id,
    schema_version: BOARD_SCHEMA_VERSION,
    project_id: projectId,
    name,
    rev: 0,
    updated_at: now,
    nodes: [],
    edges: [],
    overlays: [],
    bookmarks: [],
  };
}

export function findNode(doc: BoardDoc, id: string): BoardNode | null {
  return doc.nodes.find((n) => n.id === id) ?? null;
}

export function findOverlay(doc: BoardDoc, id: string): BoardOverlay | null {
  return doc.overlays.find((o) => o.id === id) ?? null;
}

/**
 * Where a node actually sits, given the overlays.
 *
 * An anchored node's truth is its `(u, v)` fraction of its sheet; `node.rect` is
 * a cache. They diverge whenever the overlay moves, which is exactly when a pin
 * must follow. When the anchor names an overlay that is not present — a sheet
 * deleted on another device, or one whose image has not loaded yet — the cached
 * rect is returned unchanged rather than collapsing the node to the origin.
 */
export function resolveNodeRect(doc: BoardDoc, node: BoardNode): Rect {
  if (!node.anchor) return node.rect;
  const overlay = findOverlay(doc, node.anchor.overlay_id);
  if (!overlay) return node.rect;
  return {
    x: overlay.rect.x + node.anchor.u * overlay.rect.w,
    y: overlay.rect.y + node.anchor.v * overlay.rect.h,
    w: node.rect.w,
    h: node.rect.h,
  };
}

/** The topmost node whose resolved rect contains `p`, or null. */
export function hitTest(doc: BoardDoc, p: Vec2): BoardNode | null {
  let best: BoardNode | null = null;
  for (const node of doc.nodes) {
    if (!rectContains(resolveNodeRect(doc, node), p)) continue;
    if (!best || node.z >= best.z) best = node;
  }
  return best;
}

/** The overlay under `p`, topmost last, ignoring locked sheets. */
export function hitTestOverlay(doc: BoardDoc, p: Vec2, includeLocked = false): BoardOverlay | null {
  let best: BoardOverlay | null = null;
  for (const overlay of doc.overlays) {
    if (overlay.locked && !includeLocked) continue;
    if (rectContains(overlay.rect, p)) best = overlay;
  }
  return best;
}

/** Highest z in the document, or 0 for an empty board. */
export function maxZ(doc: BoardDoc): number {
  return doc.nodes.reduce((acc, n) => Math.max(acc, n.z), 0);
}

function commit(doc: BoardDoc, next: Partial<BoardDoc>, now: string): BoardDoc {
  return { ...doc, ...next, rev: doc.rev + 1, updated_at: now };
}

/**
 * Replace one node by id, running `fn` on it.
 *
 * Returns null when the id is absent or `fn` declines the change (by returning
 * the node it was given), which the reducer turns into a no-op.
 */
function mapNode(
  doc: BoardDoc,
  id: string,
  fn: (node: BoardNode) => BoardNode,
): BoardNode[] | null {
  const index = doc.nodes.findIndex((n) => n.id === id);
  if (index < 0) return null;
  const current = doc.nodes[index];
  const updated = fn(current);
  if (updated === current) return null;
  const nodes = doc.nodes.slice();
  nodes[index] = updated;
  return nodes;
}

/** True when the connector already exists, in either direction. */
function hasEdgeBetween(doc: BoardDoc, a: string, b: string): boolean {
  return doc.edges.some(
    (e) =>
      (e.from_node_id === a && e.to_node_id === b) || (e.from_node_id === b && e.to_node_id === a),
  );
}

/** Apply one action. See the file header for the no-op and timestamp contracts. */
export function applyBoardAction(doc: BoardDoc, action: BoardAction, now: string): BoardDoc {
  switch (action.type) {
    case "rename_board": {
      const name = action.name.trim();
      if (!name || name === doc.name) return doc;
      return commit(doc, { name }, now);
    }

    case "add_node": {
      if (findNode(doc, action.node.id)) return doc;
      return commit(doc, { nodes: [...doc.nodes, action.node] }, now);
    }

    case "move_nodes": {
      const grid = action.grid ?? 0;
      if (action.ids.length === 0) return doc;
      if (action.dx === 0 && action.dy === 0 && grid <= 0) return doc;
      const moving = new Set(action.ids);
      let changed = false;
      const nodes = doc.nodes.map((node) => {
        if (!moving.has(node.id)) return node;
        // The drag is applied to where the node is *shown*, which for a pinned
        // node is its resolved position, not the cache. Dragging a pin off its
        // sheet by ignoring that would snap it back to a stale coordinate first.
        const from = resolveNodeRect(doc, node);
        const moved = translateRect(from, action.dx, action.dy);
        const rect: Rect =
          grid > 0 ? { ...moved, x: snap(moved.x, grid), y: snap(moved.y, grid) } : moved;
        if (rect.x === node.rect.x && rect.y === node.rect.y && !node.anchor) return node;
        changed = true;
        // Dragging a node re-anchors or un-anchors it via `pin_node`; a plain
        // move only updates the cache and drops a stale anchor, so a pin the
        // user has dragged away from its sheet does not spring back.
        const anchor = node.anchor ? reanchor(doc, node.anchor, rect) : null;
        return { ...node, rect, anchor, updated_at: now };
      });
      if (!changed) return doc;
      return commit(doc, { nodes }, now);
    }

    case "resize_node": {
      const nodes = mapNode(doc, action.id, (node) => {
        const rect = resizeRect(node.rect, action.dw, action.dh);
        if (rect.w === node.rect.w && rect.h === node.rect.h) return node;
        return { ...node, rect, updated_at: now };
      });
      return nodes ? commit(doc, { nodes }, now) : doc;
    }

    case "delete_nodes": {
      if (action.ids.length === 0) return doc;
      const doomed = new Set(action.ids);
      const nodes = doc.nodes.filter((n) => !doomed.has(n.id));
      if (nodes.length === doc.nodes.length) return doc;
      // A connector to a node that no longer exists would render as a line to
      // nowhere and break the dependency walk, so it goes with the node.
      const edges = doc.edges.filter(
        (e) => !doomed.has(e.from_node_id) && !doomed.has(e.to_node_id),
      );
      return commit(doc, { nodes, edges }, now);
    }

    case "set_node_color": {
      const nodes = mapNode(doc, action.id, (node) =>
        node.color === action.color ? node : { ...node, color: action.color, updated_at: now },
      );
      return nodes ? commit(doc, { nodes }, now) : doc;
    }

    case "update_note": {
      const nodes = mapNode(doc, action.id, (node) =>
        node.kind === "note" && node.text !== action.text
          ? { ...node, text: action.text, updated_at: now }
          : node,
      );
      return nodes ? commit(doc, { nodes }, now) : doc;
    }

    case "update_task": {
      const nodes = mapNode(doc, action.id, (node) => {
        if (node.kind !== "task") return node;
        const merged: BoardTaskNode = { ...node, ...action.patch, updated_at: now };
        return taskEquals(node, merged) ? node : merged;
      });
      return nodes ? commit(doc, { nodes }, now) : doc;
    }

    case "update_delivery": {
      const nodes = mapNode(doc, action.id, (node) => {
        if (node.kind !== "delivery") return node;
        const merged: BoardDeliveryNode = { ...node, ...action.patch, updated_at: now };
        return deliveryEquals(node, merged) ? node : merged;
      });
      return nodes ? commit(doc, { nodes }, now) : doc;
    }

    case "update_photo": {
      const nodes = mapNode(doc, action.id, (node) =>
        node.kind === "photo" && node.caption !== action.caption
          ? { ...node, caption: action.caption, updated_at: now }
          : node,
      );
      return nodes ? commit(doc, { nodes }, now) : doc;
    }

    case "update_link": {
      const nodes = mapNode(doc, action.id, (node) => {
        if (node.kind !== "link") return node;
        const url = action.url ?? node.url;
        const title = action.title ?? node.title;
        if (url === node.url && title === node.title) return node;
        return { ...node, url, title, updated_at: now };
      });
      return nodes ? commit(doc, { nodes }, now) : doc;
    }

    case "append_stroke": {
      // A stroke with fewer than two points is a stray tap while panning, not
      // handwriting; recording it leaves invisible ink that still counts toward
      // the node's bounds.
      if (action.stroke.points.length < 4) return doc;
      const nodes = mapNode(doc, action.id, (node) =>
        node.kind === "ink"
          ? { ...node, strokes: [...node.strokes, action.stroke], updated_at: now }
          : node,
      );
      return nodes ? commit(doc, { nodes }, now) : doc;
    }

    case "pin_node": {
      // Pinning to an overlay that is not on the board would produce an anchor
      // that resolves to nothing — refuse rather than store a dangling pin.
      if (action.anchor && !findOverlay(doc, action.anchor.overlay_id)) return doc;
      const nodes = mapNode(doc, action.id, (node) => {
        if (anchorsEqual(node.anchor, action.anchor)) return node;
        const pinned = { ...node, anchor: action.anchor, updated_at: now };
        // Refresh the cache immediately so the card does not jump on the next
        // render before something else recomputes it.
        return { ...pinned, rect: resolveNodeRect({ ...doc, nodes: [pinned] }, pinned) };
      });
      return nodes ? commit(doc, { nodes }, now) : doc;
    }

    case "bring_to_front": {
      // Compared against the *other* nodes, not the document maximum. Every node
      // is created at z 0, so a board where nothing has been raised yet has a
      // maximum of 0 — and `z >= max` would then treat every tap as "already on
      // top" and never raise anything at all.
      const topOther = doc.nodes.reduce((acc, n) => (n.id === action.id ? acc : Math.max(acc, n.z)), 0);
      const nodes = mapNode(doc, action.id, (node) =>
        node.z > topOther ? node : { ...node, z: topOther + 1, updated_at: now },
      );
      return nodes ? commit(doc, { nodes }, now) : doc;
    }

    case "add_edge": {
      const { edge } = action;
      // A connector needs two distinct, existing endpoints, and the board shows
      // one line per pair — a second connector between the same two cards is
      // indistinguishable from the first and only makes the label ambiguous.
      if (edge.from_node_id === edge.to_node_id) return doc;
      if (!findNode(doc, edge.from_node_id) || !findNode(doc, edge.to_node_id)) return doc;
      if (doc.edges.some((e) => e.id === edge.id)) return doc;
      if (hasEdgeBetween(doc, edge.from_node_id, edge.to_node_id)) return doc;
      return commit(doc, { edges: [...doc.edges, edge] }, now);
    }

    case "update_edge": {
      const index = doc.edges.findIndex((e) => e.id === action.id);
      if (index < 0) return doc;
      const current = doc.edges[index];
      const merged: BoardEdge = { ...current, ...action.patch };
      if (
        merged.label === current.label &&
        merged.color === current.color &&
        merged.kind === current.kind
      ) {
        return doc;
      }
      const edges = doc.edges.slice();
      edges[index] = merged;
      return commit(doc, { edges }, now);
    }

    case "delete_edge": {
      const edges = doc.edges.filter((e) => e.id !== action.id);
      return edges.length === doc.edges.length ? doc : commit(doc, { edges }, now);
    }

    case "add_overlay": {
      if (findOverlay(doc, action.overlay.id)) return doc;
      return commit(doc, { overlays: [...doc.overlays, action.overlay] }, now);
    }

    case "update_overlay": {
      const index = doc.overlays.findIndex((o) => o.id === action.id);
      if (index < 0) return doc;
      const current = doc.overlays[index];
      const merged: BoardOverlay = { ...current, ...action.patch };
      if (overlayEquals(current, merged)) return doc;
      const overlays = doc.overlays.slice();
      overlays[index] = merged;
      // Moving or rescaling a sheet moves everything pinned to it. Recomputing
      // the caches here — rather than leaving it to render time — keeps hit
      // testing, the minimap bounds and the next drag all agreeing.
      const moved = { ...doc, overlays };
      const nodes = doc.nodes.map((node) =>
        node.anchor?.overlay_id === action.id
          ? { ...node, rect: resolveNodeRect(moved, node) }
          : node,
      );
      return commit(doc, { overlays, nodes }, now);
    }

    case "delete_overlay": {
      const overlays = doc.overlays.filter((o) => o.id !== action.id);
      if (overlays.length === doc.overlays.length) return doc;
      // Pins on a removed sheet are *unpinned in place*, not deleted. The note
      // someone wrote about a conflict is worth more than the sheet it was
      // stuck to, and deleting it silently with the overlay would lose field
      // observations on every drawing revision.
      const nodes = doc.nodes.map((node) =>
        node.anchor?.overlay_id === action.id
          ? { ...node, rect: resolveNodeRect(doc, node), anchor: null, updated_at: now }
          : node,
      );
      return commit(doc, { overlays, nodes }, now);
    }

    case "add_bookmark": {
      if (doc.bookmarks.some((b) => b.id === action.bookmark.id)) return doc;
      return commit(doc, { bookmarks: [...doc.bookmarks, action.bookmark] }, now);
    }

    case "delete_bookmark": {
      const bookmarks = doc.bookmarks.filter((b) => b.id !== action.id);
      return bookmarks.length === doc.bookmarks.length ? doc : commit(doc, { bookmarks }, now);
    }

    default:
      return doc;
  }
}

/** Apply a batch in order, short-circuiting on no-ops. */
export function applyBoardActions(
  doc: BoardDoc,
  actions: readonly BoardAction[],
  now: string,
): BoardDoc {
  return actions.reduce((acc, action) => applyBoardAction(acc, action, now), doc);
}

function anchorsEqual(a: OverlayAnchor | null, b: OverlayAnchor | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.overlay_id === b.overlay_id && a.u === b.u && a.v === b.v;
}

/** Recompute an anchor's fractions after its node has been dragged to `rect`. */
function reanchor(doc: BoardDoc, anchor: OverlayAnchor, rect: Rect): OverlayAnchor | null {
  const overlay = findOverlay(doc, anchor.overlay_id);
  if (!overlay || overlay.rect.w === 0 || overlay.rect.h === 0) return null;
  return {
    overlay_id: anchor.overlay_id,
    u: (rect.x - overlay.rect.x) / overlay.rect.w,
    v: (rect.y - overlay.rect.y) / overlay.rect.h,
  };
}

function taskEquals(a: BoardTaskNode, b: BoardTaskNode): boolean {
  return (
    a.text === b.text &&
    a.start_date === b.start_date &&
    a.end_date === b.end_date &&
    a.status === b.status &&
    a.blocked === b.blocked &&
    a.blocked_reason === b.blocked_reason &&
    a.owner === b.owner
  );
}

function deliveryEquals(a: BoardDeliveryNode, b: BoardDeliveryNode): boolean {
  return (
    a.material === b.material &&
    a.vendor === b.vendor &&
    a.needed_by === b.needed_by &&
    a.received === b.received
  );
}

function overlayEquals(a: BoardOverlay, b: BoardOverlay): boolean {
  return (
    a.name === b.name &&
    a.sheet_number === b.sheet_number &&
    a.opacity === b.opacity &&
    a.locked === b.locked &&
    a.rect.x === b.rect.x &&
    a.rect.y === b.rect.y &&
    a.rect.w === b.rect.w &&
    a.rect.h === b.rect.h
  );
}

/** Every edge touching `nodeId`, in document order. */
export function edgesForNode(doc: BoardDoc, nodeId: string): BoardEdge[] {
  return doc.edges.filter((e) => e.from_node_id === nodeId || e.to_node_id === nodeId);
}

/** Nodes reachable from `nodeId` along edges of `kind`, following direction. */
export function successors(doc: BoardDoc, nodeId: string, kind: BoardEdgeKind): BoardNode[] {
  const ids = doc.edges
    .filter((e) => e.kind === kind && e.from_node_id === nodeId)
    .map((e) => e.to_node_id);
  return doc.nodes.filter((n) => ids.includes(n.id));
}

/** Nodes that point at `nodeId` along edges of `kind`. */
export function predecessors(doc: BoardDoc, nodeId: string, kind: BoardEdgeKind): BoardNode[] {
  const ids = doc.edges
    .filter((e) => e.kind === kind && e.to_node_id === nodeId)
    .map((e) => e.from_node_id);
  return doc.nodes.filter((n) => ids.includes(n.id));
}
