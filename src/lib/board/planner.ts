/**
 * planner — the spatial calendar: who is doing what, on which day.
 *
 * A grid of **owner rows × day columns**. A crew's row shows the work assigned
 * to them; a vendor's row shows the material they owe. Dragging a card into a
 * cell is the only scheduling gesture: it says who and when in one motion, which
 * is how a planner is filled in on a tailgate.
 *
 * ## Tasks span, deliveries land
 *
 * A task occupies **every day of its window**, so a five-day erection sequence
 * appears in five columns and a foreman can see the crew is committed all week.
 * A delivery occupies exactly one day. That difference is the reason
 * `BoardDeliveryNode` exists rather than being a task with a vendor in the owner
 * field — see its doc comment.
 *
 * ## Undated is not today
 *
 * Anything without a date stays in {@link PlannerGrid.unassigned}, the tray the
 * user drags *from*. It is never placed on the grid at today's column. The
 * planner's whole value is that a cell means somebody committed to that day, and
 * one card that drifted onto the grid by default destroys that.
 *
 * ## Unowned is a row, not a deletion
 *
 * Dated work with nobody's name on it gets its own row at the bottom rather than
 * being hidden. That row is the question the planner exists to surface: it is
 * scheduled, and nobody is doing it.
 */

import { addDaysIso } from "@/services/scheduleCascade";
import { durationFromDates, finishFromDuration } from "@/lib/schedule/duration";
import { parseDateUTC } from "@/components/schedule/scheduleDateUtils";
import type { BoardAction } from "./document";
import { findOverlay } from "./document";
import { isDeliveryNode, isTaskNode, type BoardDoc, type BoardNode } from "./types";

/** The row that holds dated work with no owner. */
export const UNASSIGNED_OWNER = "";

/** Default planner width. Two weeks is the look-ahead a weekly plan is built against. */
export const DEFAULT_PLANNER_DAYS = 14;

export interface PlannerDay {
  iso: string;
  /** Short column heading, e.g. "Mon 9". */
  label: string;
  /** Saturday or Sunday. The grid shades these; it does not refuse work on them. */
  weekend: boolean;
}

export interface PlannerItem {
  node_id: string;
  kind: "task" | "delivery";
  label: string;
  owner: string;
  /** Flagged blocked (tasks), which the grid marks so a blocker is visible in the plan. */
  blocked: boolean;
  /** Received (deliveries). Distinct from a past date, which only means it is late. */
  received: boolean;
  /** Sheet citation when the card is pinned — the link to the job-site map. */
  sheet: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface PlannerRow {
  owner: string;
  /** One bucket per day in {@link PlannerGrid.days}, same order. */
  cells: PlannerItem[][];
}

export interface PlannerGrid {
  days: PlannerDay[];
  rows: PlannerRow[];
  /** Cards with no date — the tray the planner is filled from. */
  unassigned: PlannerItem[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The Monday of `iso`'s week.
 *
 * UTC getters throughout, matching the UTC-midnight reading of a date-only
 * string everywhere else in this app. Local getters would put the week boundary
 * a day out west of Greenwich — the class of bug the repo's test runner, pinned
 * to UTC, cannot catch.
 */
export function plannerWeekStart(iso: string): string | null {
  const date = parseDateUTC(iso);
  if (!date) return null;
  // getUTCDay: 0 = Sunday. Monday-start weeks put Sunday six days after Monday.
  const offset = (date.getUTCDay() + 6) % 7;
  return addDaysIso(iso, -offset);
}

export function plannerDays(startIso: string, count = DEFAULT_PLANNER_DAYS): PlannerDay[] {
  const days: PlannerDay[] = [];
  for (let i = 0; i < Math.max(0, count); i += 1) {
    const iso = addDaysIso(startIso, i);
    const date = parseDateUTC(iso);
    if (!iso || !date) break;
    const weekday = date.getUTCDay();
    days.push({
      iso,
      label: `${DAY_NAMES[weekday]} ${date.getUTCDate()}`,
      weekend: weekday === 0 || weekday === 6,
    });
  }
  return days;
}

/** Who is responsible: a task's crew, a delivery's vendor. */
export function plannerOwner(node: BoardNode): string {
  if (isTaskNode(node)) return node.owner.trim();
  if (isDeliveryNode(node)) return node.vendor.trim();
  return "";
}

function sheetFor(doc: BoardDoc, node: BoardNode): string | null {
  if (!node.anchor) return null;
  const overlay = findOverlay(doc, node.anchor.overlay_id);
  if (!overlay) return null;
  return overlay.sheet_number.trim() || overlay.name.trim() || null;
}

/** The planner's view of a node, or null when it is not plannable. */
export function toPlannerItem(doc: BoardDoc, node: BoardNode): PlannerItem | null {
  if (isTaskNode(node)) {
    return {
      node_id: node.id,
      kind: "task",
      label: node.text.trim() || "Untitled task",
      owner: plannerOwner(node),
      blocked: node.blocked,
      received: false,
      sheet: sheetFor(doc, node),
      start_date: node.start_date,
      end_date: node.end_date,
    };
  }
  if (isDeliveryNode(node)) {
    const label = [node.material.trim(), node.vendor.trim()].filter(Boolean).join(" — ");
    return {
      node_id: node.id,
      kind: "delivery",
      label: label || "Untitled delivery",
      owner: plannerOwner(node),
      blocked: false,
      received: node.received,
      sheet: sheetFor(doc, node),
      // A delivery is a point in time, so both ends are the day it is needed.
      start_date: node.needed_by,
      end_date: node.needed_by,
    };
  }
  return null;
}

/** The days an item occupies within the planner window. */
function occupiedDays(item: PlannerItem, days: readonly PlannerDay[]): number[] {
  const { start_date: start, end_date: end } = item;
  if (!start || !end) return [];
  // An inverted window is a broken row, not a backwards span — it occupies
  // nothing rather than filling the grid in reverse.
  if (durationFromDates(start, end) === null) return [];
  const indices: number[] = [];
  days.forEach((day, index) => {
    if (day.iso >= start && day.iso <= end) indices.push(index);
  });
  return indices;
}

/**
 * Build the grid for `days` days from `startIso`.
 *
 * Rows are the owners with work in the window, alphabetically, with the
 * unowned row last. An owner whose every item falls outside the window gets no
 * row — a planner showing thirty empty crew rows hides the week it is meant to
 * show.
 */
export function buildPlannerGrid(
  doc: BoardDoc,
  startIso: string,
  dayCount = DEFAULT_PLANNER_DAYS,
): PlannerGrid {
  const days = plannerDays(startIso, dayCount);
  const items = doc.nodes
    .map((node) => toPlannerItem(doc, node))
    .filter((item): item is PlannerItem => item !== null);

  const unassigned: PlannerItem[] = [];
  const byOwner = new Map<string, PlannerItem[][]>();

  const ensureRow = (owner: string): PlannerItem[][] => {
    const existing = byOwner.get(owner);
    if (existing) return existing;
    const cells: PlannerItem[][] = days.map<PlannerItem[]>(() => []);
    byOwner.set(owner, cells);
    return cells;
  };

  for (const item of items) {
    if (!item.start_date || !item.end_date) {
      unassigned.push(item);
      continue;
    }
    const indices = occupiedDays(item, days);
    // Dated, but outside the window (or an inverted window): not in the tray —
    // the tray means "needs a date", and this one has one.
    if (indices.length === 0) continue;
    const cells = ensureRow(item.owner);
    for (const index of indices) cells[index].push(item);
  }

  const owners = Array.from(byOwner.keys())
    .filter((owner) => owner !== UNASSIGNED_OWNER)
    .sort((a, b) => a.localeCompare(b));
  const rows: PlannerRow[] = owners.map((owner) => ({ owner, cells: byOwner.get(owner) ?? [] }));
  const unowned = byOwner.get(UNASSIGNED_OWNER);
  if (unowned) rows.push({ owner: UNASSIGNED_OWNER, cells: unowned });

  return { days, rows, unassigned };
}

/**
 * What dropping a card into a cell does.
 *
 * Returns the actions rather than applying them, so the caller dispatches them
 * through the one write path and they land in the history and the sync queue
 * like any other change.
 *
 * A dated task keeps its duration and moves to start on the dropped day — the
 * gesture says "this crew starts it Tuesday", not "this is now a one-day task".
 * An undated one becomes a single day, the same reading the timeline lane gives
 * a tap: the user has said when, not how long.
 */
export function assignmentActions(
  doc: BoardDoc,
  nodeId: string,
  owner: string,
  dateIso: string,
): BoardAction[] {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node || !parseDateUTC(dateIso)) return [];

  if (isDeliveryNode(node)) {
    const patch: BoardAction = {
      type: "update_delivery",
      id: nodeId,
      patch: { needed_by: dateIso, vendor: owner },
    };
    return [patch];
  }

  if (!isTaskNode(node)) return [];

  const days = durationFromDates(node.start_date, node.end_date) ?? 1;
  const end = finishFromDuration(dateIso, days);
  if (!end) return [];
  return [
    {
      type: "update_task",
      id: nodeId,
      patch: { start_date: dateIso, end_date: end, owner },
    },
  ];
}

/** Every owner named anywhere on the board — the rows a drop can target. */
export function knownOwners(doc: BoardDoc): string[] {
  const owners = new Set<string>();
  for (const node of doc.nodes) {
    const owner = plannerOwner(node);
    if (owner) owners.add(owner);
  }
  return Array.from(owners).sort((a, b) => a.localeCompare(b));
}

export interface PlannerLoad {
  owner: string;
  /** Days in the window on which this owner has at least one item. */
  committed_days: number;
  /** Items that are blocked or overdue-unreceived — what to look at first. */
  attention: PlannerItem[];
}

/**
 * Per-owner load for the window.
 *
 * `attention` deliberately counts a delivery as needing attention only when its
 * date has passed **and** it is not marked received. A future date is a plan; a
 * past one that has landed is done. Only the pair is a problem.
 */
export function plannerLoad(grid: PlannerGrid, today: string): PlannerLoad[] {
  return grid.rows.map((row) => {
    let committed = 0;
    const attention: PlannerItem[] = [];
    const seen = new Set<string>();
    row.cells.forEach((cell, index) => {
      if (cell.length > 0) committed += 1;
      for (const item of cell) {
        if (seen.has(item.node_id)) continue;
        seen.add(item.node_id);
        const day = grid.days[index]?.iso ?? "";
        const overdue = item.kind === "delivery" && !item.received && day < today;
        if (item.blocked || overdue) attention.push(item);
      }
    });
    return { owner: row.owner, committed_days: committed, attention };
  });
}
