/**
 * factory — constructors for the records the reducer accepts.
 *
 * `applyBoardAction` takes whole records rather than partial drafts so that it
 * stays pure and fully determined by its inputs. That puts id and timestamp
 * generation here, at the edge, where it can be stubbed in a test and where the
 * defaults for a new card live in one place instead of in every toolbar button.
 */

import { DEFAULT_SCHEDULE_STATUS } from "@/lib/schedule/taskStatus";
import type { Rect, Vec2 } from "./geometry";
import {
  DEFAULT_BOARD_COLOR,
  type BoardBookmark,
  type BoardColor,
  type BoardEdge,
  type BoardEdgeKind,
  type BoardInkNode,
  type BoardLinkNode,
  type BoardNodeCommon,
  type BoardNoteNode,
  type BoardOverlay,
  type BoardPhotoNode,
  type BoardTaskNode,
} from "./types";
import type { Viewport } from "./viewport";

/** Default card footprint in world units — sized for a legible two-line note at 1:1. */
export const DEFAULT_NOTE_SIZE = { w: 220, h: 140 };
export const DEFAULT_TASK_SIZE = { w: 260, h: 160 };
export const DEFAULT_PHOTO_SIZE = { w: 260, h: 200 };
export const DEFAULT_LINK_SIZE = { w: 240, h: 96 };

/**
 * A board-unique id.
 *
 * `crypto.randomUUID` where it exists; otherwise a timestamp-plus-random string.
 * The fallback matters — `randomUUID` is unavailable on insecure origins, which
 * is exactly the jobsite-laptop-on-a-local-IP case this app has to survive, and
 * an id generator that throws there would make the board unusable rather than
 * merely less tidy.
 */
export function newId(prefix: string): string {
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `${prefix}_${cryptoObj.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function base(id: string, rect: Rect, color: BoardColor, now: string): Omit<BoardNodeCommon, "kind"> {
  return {
    id,
    rect,
    anchor: null,
    color,
    z: 0,
    created_at: now,
    updated_at: now,
  };
}

/** Rect of the given size centred on a world point — where a tap drops a card. */
export function centeredRect(at: Vec2, size: { w: number; h: number }): Rect {
  return { x: at.x - size.w / 2, y: at.y - size.h / 2, w: size.w, h: size.h };
}

export function createNoteNode(
  at: Vec2,
  text = "",
  color: BoardColor = DEFAULT_BOARD_COLOR,
  now = nowIso(),
): BoardNoteNode {
  return {
    ...base(newId("node"), centeredRect(at, DEFAULT_NOTE_SIZE), color, now),
    kind: "note",
    text,
  };
}

export function createTaskNode(
  at: Vec2,
  text = "",
  color: BoardColor = "info",
  now = nowIso(),
): BoardTaskNode {
  return {
    ...base(newId("node"), centeredRect(at, DEFAULT_TASK_SIZE), color, now),
    kind: "task",
    text,
    start_date: null,
    end_date: null,
    status: DEFAULT_SCHEDULE_STATUS,
    blocked: false,
    blocked_reason: "",
    owner: "",
  };
}

export function createPhotoNode(
  at: Vec2,
  assetId: string,
  caption = "",
  now = nowIso(),
): BoardPhotoNode {
  return {
    ...base(newId("node"), centeredRect(at, DEFAULT_PHOTO_SIZE), DEFAULT_BOARD_COLOR, now),
    kind: "photo",
    asset_id: assetId,
    caption,
  };
}

export function createLinkNode(at: Vec2, url: string, title = "", now = nowIso()): BoardLinkNode {
  return {
    ...base(newId("node"), centeredRect(at, DEFAULT_LINK_SIZE), "info", now),
    kind: "link",
    url,
    title,
  };
}

/** An empty ink node. Its rect is rewritten from the stroke bounds as it is drawn. */
export function createInkNode(rect: Rect, color: BoardColor = "neutral", now = nowIso()): BoardInkNode {
  return {
    ...base(newId("node"), rect, color, now),
    kind: "ink",
    strokes: [],
  };
}

export function createEdge(
  fromNodeId: string,
  toNodeId: string,
  kind: BoardEdgeKind = "relates",
  label = "",
  color: BoardColor = DEFAULT_BOARD_COLOR,
  now = nowIso(),
): BoardEdge {
  return {
    id: newId("edge"),
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
    kind,
    label,
    color,
    created_at: now,
  };
}

export function createOverlay(
  assetId: string,
  name: string,
  sheetNumber: string,
  rect: Rect,
  now = nowIso(),
): BoardOverlay {
  return {
    id: newId("sheet"),
    name,
    sheet_number: sheetNumber,
    asset_id: assetId,
    rect,
    // Dropped back by default: a sheet at full strength swamps the cards pinned
    // to it, and the cards are the reason the sheet is on the board.
    opacity: 0.6,
    // Locked by default so panning across a drawing does not drag the drawing.
    locked: true,
    created_at: now,
  };
}

export function createBookmark(label: string, viewport: Viewport, now = nowIso()): BoardBookmark {
  return {
    id: newId("mark"),
    label,
    viewport: { ...viewport },
    created_at: now,
  };
}
