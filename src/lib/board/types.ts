/**
 * types — the Subcontractor Command Center board document.
 *
 * A board is one project's freeform planning surface: notes, tasks, photos,
 * links and pen strokes laid out on an unbounded plane, optionally over
 * blueprint sheets, wired together with labelled connectors.
 *
 * ## Why the board owns its own records
 *
 * A board task is **not** a `schedule_tasks` row and this file deliberately does
 * not pretend otherwise. The board is where a foreman thinks out loud before the
 * schedule is committed; a lot of what lands on it never becomes a scheduled
 * task at all. Two consequences are load-bearing:
 *
 *   - {@link BoardTaskNode.status} reuses {@link ScheduleStatus} so that a board
 *     task promoted to the schedule needs no translation — the vocabulary is
 *     already the one `chk_schedule_tasks_status` accepts.
 *   - "Blocked" is a **separate flag**, not a status, because the database has
 *     no such status and inventing one here would produce a value that can never
 *     save. It is also the signal the RFI drafter reads, so it needs to coexist
 *     with whatever the task's real status is: a blocked task is usually still
 *     "In Progress".
 *
 * ## Dates
 *
 * Task dates are date-only `YYYY-MM-DD` strings, matching `schedule_tasks`, and
 * are interpreted the same way the rest of the app interprets them (UTC
 * midnight, via `parseDateUTC`). Durations are inclusive calendar days — see
 * `src/lib/schedule/duration.ts`, which this module's timeline math calls rather
 * than re-deriving.
 */

import type { ScheduleStatus } from "@/lib/schedule/taskStatus";
import type { Rect, Vec2 } from "./geometry";
import type { Viewport } from "./viewport";

/** Schema version stamped into every persisted board, for future migrations. */
export const BOARD_SCHEMA_VERSION = 1;

/**
 * Semantic colours available to nodes and connectors.
 *
 * Names, not hex. The design system forbids hardcoded colour in components, and
 * a persisted board outlives any one palette — a board saved as "danger" still
 * reads correctly after a theme change, where a stored `#ef4444` would not.
 * `src/lib/board/palette.ts` maps these onto the `--cmd-*` CSS variables.
 */
export const BOARD_COLORS = ["neutral", "gold", "good", "warn", "danger", "info", "review"] as const;
export type BoardColor = (typeof BOARD_COLORS)[number];
export const DEFAULT_BOARD_COLOR: BoardColor = "neutral";

/** Node kinds the canvas can render. */
export const BOARD_NODE_KINDS = ["note", "task", "photo", "link", "ink"] as const;
export type BoardNodeKind = (typeof BOARD_NODE_KINDS)[number];

/**
 * A node's attachment to a blueprint overlay.
 *
 * Stored normalized (`0..1` across the sheet) rather than as a world coordinate,
 * so the pin follows the sheet when the overlay is moved, rescaled, or swapped
 * for a re-issued revision at a different size. A pin that stored world
 * coordinates would stay where it was on the *board* while the sheet moved out
 * from under it — which is the same failure as a mark-up on the wrong revision.
 */
export interface OverlayAnchor {
  overlay_id: string;
  /** Fraction across the sheet, left to right. Outside 0..1 for margin callouts. */
  u: number;
  /** Fraction down the sheet, top to bottom. */
  v: number;
}

/** Fields every node carries, whatever its kind. */
export interface BoardNodeCommon {
  id: string;
  kind: BoardNodeKind;
  /**
   * World-space placement. For an anchored node this is the **cached** position:
   * `resolveNodeRect` recomputes it from the overlay, and the cache is what keeps
   * hit testing and the minimap correct for a board whose overlays are still
   * loading.
   */
  rect: Rect;
  /** Blueprint attachment, or null for a node floating on the open canvas. */
  anchor: OverlayAnchor | null;
  color: BoardColor;
  /** Paint order. Higher draws on top; `bringToFront` assigns max + 1. */
  z: number;
  created_at: string;
  updated_at: string;
}

/** A typed or handwritten sticky. The board's default object. */
export interface BoardNoteNode extends BoardNodeCommon {
  kind: "note";
  text: string;
}

/**
 * A unit of work. Gains a timeline bar once it has both dates; until then it is
 * an undated card that the Gantt lane lists as unscheduled rather than guessing.
 */
export interface BoardTaskNode extends BoardNodeCommon {
  kind: "task";
  text: string;
  /** `YYYY-MM-DD`, or null when not yet scheduled. */
  start_date: string | null;
  end_date: string | null;
  status: ScheduleStatus;
  /** Set when work cannot proceed. Independent of `status` — see the file header. */
  blocked: boolean;
  /** Why it is blocked, in the foreman's words. Becomes the body of a drafted RFI. */
  blocked_reason: string;
  /** Crew or vendor responsible. Free text: the board predates a resource record. */
  owner: string;
}

/** A jobsite photo. The bytes live in the asset store, not in the document. */
export interface BoardPhotoNode extends BoardNodeCommon {
  kind: "photo";
  asset_id: string;
  caption: string;
}

/** A web or in-app link — a submittal, a spec section, a supplier page. */
export interface BoardLinkNode extends BoardNodeCommon {
  kind: "link";
  url: string;
  title: string;
}

/** A single pen or finger stroke, in world coordinates. */
export interface InkStroke {
  /** Flat `[x0, y0, x1, y1, …]`. Flat rather than points to keep a long stroke small on disk. */
  points: number[];
  /** Stroke width in world units, before pressure. */
  width: number;
  color: BoardColor;
}

/** Handwriting / markup. Its `rect` is the bounding box of every stroke. */
export interface BoardInkNode extends BoardNodeCommon {
  kind: "ink";
  strokes: InkStroke[];
}

export type BoardNode =
  | BoardNoteNode
  | BoardTaskNode
  | BoardPhotoNode
  | BoardLinkNode
  | BoardInkNode;

/**
 * Connector relationships.
 *
 * Every kind reads **along the arrow**: "`from` precedes `to`", "`from` blocks
 * `to`", "`from` supplies `to`". That is a deliberate constraint. The obvious
 * alternative — a kind named `depends`, meaning `from` depends on `to` — points
 * its arrow backwards against the flow of work, and a board where some arrows
 * mean "next" and others mean "previous" is a board nobody can read at a glance.
 *
 * `precedes` is the only kind the timeline treats as a scheduling constraint
 * (finish-to-start). The rest are documentation: they say *why* two things are
 * on the same board, which is most of a board's value when someone else opens it
 * three weeks later.
 */
export const BOARD_EDGE_KINDS = ["relates", "precedes", "blocks", "supplies"] as const;
export type BoardEdgeKind = (typeof BOARD_EDGE_KINDS)[number];

export interface BoardEdge {
  id: string;
  from_node_id: string;
  to_node_id: string;
  kind: BoardEdgeKind;
  /** Free-text relationship label drawn at the midpoint, e.g. "after grout cures". */
  label: string;
  color: BoardColor;
  created_at: string;
}

/**
 * A drawing sheet placed on the board as a background layer.
 *
 * `sheet_number` is carried separately from `name` because it is what an RFI has
 * to cite. A drafted RFI that says "see the attached plan" gets sent back; one
 * that says "S-301, detail 4" gets answered.
 */
export interface BoardOverlay {
  id: string;
  name: string;
  sheet_number: string;
  asset_id: string;
  rect: Rect;
  /** 0..1. Dropped back so pinned cards stay readable over a dense sheet. */
  opacity: number;
  /** Locked overlays ignore drags, so panning over a sheet does not move it. */
  locked: boolean;
  created_at: string;
}

/** A saved view — the "spatial bookmark" in the minimap. */
export interface BoardBookmark {
  id: string;
  label: string;
  viewport: Viewport;
  created_at: string;
}

/**
 * The whole board.
 *
 * `rev` increments on every applied action and is what the sync layer compares;
 * `updated_at` is for humans. Both are set by the reducer, never by callers.
 */
export interface BoardDoc {
  id: string;
  schema_version: number;
  project_id: string | null;
  name: string;
  rev: number;
  updated_at: string;
  nodes: BoardNode[];
  edges: BoardEdge[];
  overlays: BoardOverlay[];
  bookmarks: BoardBookmark[];
}

/** Narrowing helper — `node.kind === "task"` inline loses the discriminant in some callers. */
export function isTaskNode(node: BoardNode | null | undefined): node is BoardTaskNode {
  return !!node && node.kind === "task";
}

export function isInkNode(node: BoardNode | null | undefined): node is BoardInkNode {
  return !!node && node.kind === "ink";
}

/** The text a node contributes to search, daily logs and RFI context. */
export function nodeText(node: BoardNode): string {
  switch (node.kind) {
    case "note":
    case "task":
      return node.text;
    case "photo":
      return node.caption;
    case "link":
      return node.title || node.url;
    case "ink":
      return "";
    default:
      return "";
  }
}

/** Centre of a node's cached rect — the point connectors and the minimap use. */
export function nodeCenter(node: BoardNode): Vec2 {
  return { x: node.rect.x + node.rect.w / 2, y: node.rect.y + node.rect.h / 2 };
}
