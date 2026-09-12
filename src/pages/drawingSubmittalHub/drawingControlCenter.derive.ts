/**
 * Pure derivations for the canonical Detailing Control Board.
 *
 * No React, no network — reshapes the hub's already-computed `triage` read-model
 * into the queues/focus the `ControlBoardPanel` renders. Every value here
 * remains derived from the hub read model.
 * (triageBoard.tsx focusItem / criticalItems / topStatuses / dueSoon / noDate),
 * so the conversion is behavior-preserving. Independently typed + unit-tested so
 * it stays strict-null / no-implicit-any clean.
 */
import {
  canWriteDetailingState,
  canWriteDueDate,
  canWriteOwner,
  canWriteReadinessFlags,
  itemUrgency,
} from "./format";
import type { TriageItem, TriageModel } from "./types";

export interface ControlBoardModel {
  /** The single most-urgent open exception, or null when nothing is flagged. */
  focusItem: TriageItem | null;
  /** Overdue + needs-action + due-soon, deduped by id, urgency-sorted, capped 12. */
  criticalItems: TriageItem[];
  /** Due in the next 7 days, capped at 8. */
  dueSoon: TriageItem[];
  /** Open items with no due date, capped at 8. */
  noDate: TriageItem[];
  /** Top pipeline statuses [status, count], count-desc, capped at 6. */
  topStatuses: [string, number][];
  /** Total open items (openItems.length). */
  openCount: number;
}

export interface ControlBoardWriteAccess {
  owner: boolean;
  dueDate: boolean;
  detailingState: boolean;
  readinessFlags: boolean;
}

export interface ControlBoardFocus {
  item: TriageItem;
  ownerLabel: string;
  canCreateSubmittal: boolean;
  writeAccess: ControlBoardWriteAccess;
}

/** Adapt runtime-only triage fields into the explicit focus-card view model. */
export function adaptControlBoardFocus(item: TriageItem | null): ControlBoardFocus | null {
  if (!item) return null;
  return {
    item,
    ownerLabel: item._ownerScope || "Owner",
    canCreateSubmittal: item.kind === "Drawing Set"
      && Boolean(item._drawingSetId)
      && Boolean(item._canDraft || item._needsUnlinkedHint),
    writeAccess: {
      owner: canWriteOwner(item),
      dueDate: canWriteDueDate(item),
      detailingState: canWriteDetailingState(item),
      readinessFlags: canWriteReadinessFlags(item),
    },
  };
}

/**
 * Reshape `triage` into the Control Board's focus card + capped queues.
 * Pure over its input; shared by the canonical Control Board.
 */
export function buildControlBoardModel(triage: TriageModel): ControlBoardModel {
  const focusItem: TriageItem | null =
    triage.overdue[0] || triage.dueSoon[0] || triage.needsAction[0] || triage.noDate[0] || null;

  const criticalItems = Array.from(
    new Map(
      [...triage.overdue, ...triage.needsAction, ...triage.dueSoon]
        .sort(itemUrgency)
        .map((it) => [it.id, it] as const),
    ).values(),
  ).slice(0, 12);

  const topStatuses = (Object.entries(triage.pipelineCounts) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return {
    focusItem,
    criticalItems,
    dueSoon: triage.dueSoon.slice(0, 8),
    noDate: triage.noDate.slice(0, 8),
    topStatuses,
    openCount: triage.openItems.length,
  };
}
