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


export interface ProductionReadinessRow {
  id: string;
  package: string;
  currentStage: string;
  requiredIfc: string | null;
  fabStart: string | null;
  floatDays: number | null;
  blocker: string;
  ready: boolean;
  item: TriageItem;
}

function readinessBlockers(item: TriageItem): string[] {
  const readiness = item._readiness;
  if (!readiness) return ["Readiness evidence unavailable"];
  const blockers: string[] = [];
  if (readiness.rfiBlocked) blockers.push("Open RFI");
  if (readiness.revisionImpacted) blockers.push("Revision impact");
  if (readiness.materialImpacted) blockers.push("Material impact");
  if (readiness.longLeadImpact) blockers.push("Long lead impact");
  if (readiness.scheduleRisk?.atRisk && readiness.scheduleRisk.reasons?.length) {
    blockers.push(readiness.scheduleRisk.reasons[0]);
  }
  if (!readiness.fabricationReady && blockers.length === 0) blockers.push("Not fabrication ready");
  return blockers;
}

/**
 * Production-facing detailing queue. This only reshapes readiness evidence the
 * hub already computed; it does not derive new schedule dates, float, or release
 * authority. Unknown fields stay null so the UI renders them explicitly as
 * unknown instead of implying a date or healthy state.
 */
export function buildProductionReadinessQueue(triage: TriageModel): ProductionReadinessRow[] {
  return triage.setItems
    .filter((item) => !item.closed)
    .map((item) => {
      const readiness = item._readiness;
      const blockers = readinessBlockers(item);
      return {
        id: item.id,
        package: item.title,
        currentStage: item.detailingState || item.status || "Unknown",
        requiredIfc: readiness?.backwardDates?.fabReleaseRequiredBy || null,
        // The detailing read-model does not currently expose an authoritative
        // fabrication-start date or calculated float. Preserve unknown.
        fabStart: null,
        floatDays: null,
        blocker: readiness?.fabricationReady ? "Clear" : blockers.join(" · "),
        ready: Boolean(readiness?.fabricationReady),
        item,
      };
    })
    .sort((a, b) => {
      if (a.ready !== b.ready) return a.ready ? 1 : -1;
      const aDue = a.requiredIfc || "9999-12-31";
      const bDue = b.requiredIfc || "9999-12-31";
      if (aDue !== bDue) return aDue.localeCompare(bDue);
      return a.package.localeCompare(b.package, undefined, { numeric: true });
    })
    .slice(0, 12);
}
