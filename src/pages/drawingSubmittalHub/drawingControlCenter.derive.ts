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

/** A navigation prompt from known queue evidence, never a release decision. */
export function nextActionForTriageItem(item: TriageItem): string {
  if (item._readiness?.rfiBlocked) return "Resolve linked RFI";
  if (item._readiness?.revisionImpacted) return "Review revised sheet impact";
  if (item._readiness?.materialImpacted) return "Resolve material impact";
  if (item._readiness?.longLeadImpact) return "Review long-lead impact";
  if (item.isRR || item.detailingState === "R&R") return "Resolve returned comments";
  if (!item._releaseEvidence?.governingStage && item._releaseEvidence?.relatedSubmittalCount) {
    return "Verify linked submittal type or create/link Shop Drawing";
  }
  if (item._needsUnlinkedHint) return "Create or relink submittal";
  if (item.dueDate === null) return "Set due date";
  if (item.due?.overdue) return "Follow up on overdue response";
  if (!item._readiness) return "Open record and review evidence";
  return "Open record";
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
  item: TriageItem;
}

function readinessBlockers(item: TriageItem): string[] {
  const readiness = item._readiness;
  const blockers: string[] = [];
  const release = item._releaseEvidence;
  if (!release) {
    blockers.push("Release evidence unavailable");
  } else {
    if (!item._drawingSetId) blockers.push("Drawing set link unverified");
    if (release.sheetCount === 0) blockers.push("No sheets in package");
    if (release.supersededSheetCount > 0) blockers.push(`${release.supersededSheetCount} superseded sheet`);
    if (!release.governingStage) {
      blockers.push(release.relatedSubmittalCount
        ? "No governing Shop Drawing submittal; linked record type needs verification"
        : "No set-ID-linked governing submittal");
    }
    else if (release.governingStage !== "IFC" && release.governingStage !== "Released") {
      blockers.push(`Governing submittal at ${release.governingStage}`);
    }
    if (release.missingPdfCount > 0) blockers.push(`${release.missingPdfCount} sheet PDF missing`);
    if (release.activeHoldCount === null) blockers.push("Hold evidence unavailable");
    else if (release.activeHoldCount > 0) blockers.push(`Active drawing hold (${release.activeHoldCount})`);
  }
  if (!readiness) {
    blockers.push("Readiness evidence unavailable");
  } else {
    if (readiness.rfiBlocked) blockers.push("Open RFI");
    if (readiness.revisionImpacted) blockers.push("Revision impact");
    if (readiness.materialImpacted) blockers.push("Material impact");
    if (readiness.longLeadImpact) blockers.push("Long lead impact");
    if (readiness.scheduleRisk?.atRisk && readiness.scheduleRisk.reasons?.length) {
      blockers.push(readiness.scheduleRisk.reasons[0]);
    }
  }
  // The client cannot declare release clearance; only the server gate can.
  if (blockers.length === 0) blockers.push("Server fab-release check required");
  return blockers;
}

/**
 * Drawing release review. Every set remains visible, including workflow-closed
 * sets, because this client model has no authoritative release result. Known
 * blockers are shown; a clean local read still requires the server gate.
 */
export function buildProductionReadinessQueue(triage: TriageModel): ProductionReadinessRow[] {
  return triage.setItems
    .map((item) => {
      const readiness = item._readiness;
      const blockers = readinessBlockers(item);
      const row: ProductionReadinessRow = {
        id: item.id,
        package: item.title,
        currentStage: item.detailingState || item.status || "Unknown",
        requiredIfc: readiness?.backwardDates?.fabReleaseRequiredBy || null,
        // The detailing read-model does not currently expose an authoritative
        // fabrication-start date or calculated float. Preserve unknown.
        fabStart: null,
        floatDays: null,
        blocker: blockers.join(" · "),
        item,
      };
      return row;
    })
    .sort((a, b) => {
      const aDue = a.requiredIfc || "9999-12-31";
      const bDue = b.requiredIfc || "9999-12-31";
      if (aDue !== bDue) return aDue.localeCompare(bDue);
      return a.package.localeCompare(b.package, undefined, { numeric: true });
    })
    .slice(0, 12);
}

// ── Needs-action list and stage pipeline (Steel Document Control layout) ──

/** Which slice of open work the Needs-action list shows. */
export type NeedsActionFilter = "all" | "overdue" | "dueSoon" | "needsAction" | "noDate";

/**
 * Every open item, most urgent first, optionally narrowed to one triage queue.
 * Unlike the old Critical Work Queue there is no cap: a capped list read as
 * "that's everything" on a busy project.
 */
export function buildNeedsActionRows(triage: TriageModel, filter: NeedsActionFilter = "all"): TriageItem[] {
  const source: TriageItem[] =
    filter === "overdue" ? triage.overdue
      : filter === "dueSoon" ? triage.dueSoon
        : filter === "needsAction" ? triage.needsAction
          : filter === "noDate" ? triage.noDate
            : triage.openItems;
  return Array.from(new Map(source.filter((it) => !it.closed).map((it) => [it.id, it] as const)).values()).sort(itemUrgency);
}

/** The seven drawing-package lanes, in workflow order. */
export const PIPELINE_LANES = ["NS", "IFA", "OFA", "BFA", "OFS", "IFC", "REL"] as const;
export type PipelineLane = (typeof PIPELINE_LANES)[number];

export const PIPELINE_LANE_LABEL: Record<PipelineLane, string> = {
  NS: "Not Started / detailing",
  IFA: "Issued for Approval",
  OFA: "Out for Approval",
  BFA: "Back from Approval (incl. R&R)",
  OFS: "Out for Scrub",
  IFC: "Issued for Construction",
  REL: "Released",
};

/**
 * Lane for an operational (effective) detailing state. Drafting states sit in
 * NS, R&R is a BFA return, and every release state is REL. An unrecognised
 * state is reported separately, never silently counted as Not Started.
 */
export function pipelineLaneFor(state: string | null | undefined): PipelineLane | null {
  switch (state) {
    case "Not Started":
    case "In Detailing":
    case "Internal Review":
    case "Ready to Submit":
      return "NS";
    case "IFA": return "IFA";
    case "OFA": return "OFA";
    case "BFA":
    case "R&R":
      return "BFA";
    case "OFS": return "OFS";
    case "IFC": return "IFC";
    case "Released":
    case "Partially Released":
    case "Released for Erection":
      return "REL";
    default:
      return null;
  }
}

export interface StagePipeline {
  lanes: Array<{ lane: PipelineLane; label: string; count: number }>;
  /** Packages whose state maps to no lane (shown as "unclassified"). */
  unclassified: number;
  total: number;
}

/**
 * Drawing-set counts per lane. A closed package that is not in a release lane
 * is a dead (Void-only) set: nobody will work it again, so it is left out
 * rather than padding Not Started.
 */
export function buildStagePipeline(setItems: readonly TriageItem[]): StagePipeline {
  const counts = new Map<PipelineLane, number>(PIPELINE_LANES.map((l) => [l, 0]));
  let unclassified = 0;
  let total = 0;
  for (const item of setItems) {
    const lane = pipelineLaneFor(item.detailingState ?? null);
    if (item.closed && lane !== "REL") continue;
    total += 1;
    if (lane) counts.set(lane, (counts.get(lane) ?? 0) + 1);
    else unclassified += 1;
  }
  return {
    lanes: PIPELINE_LANES.map((lane) => ({ lane, label: PIPELINE_LANE_LABEL[lane], count: counts.get(lane) ?? 0 })),
    unclassified,
    total,
  };
}

export interface BoardRfi {
  id: string;
  number: string;
  title: string;
  dueDate: string | null;
  overdue: boolean;
}

interface RfiLike {
  id?: string | null;
  rfi_number?: string | null;
  title?: string | null;
  question?: string | null;
  status?: string | null;
  due_date?: string | null;
  date_required?: string | null;
  is_deleted?: boolean | null;
}

const RFI_CLOSED = new Set(["answered", "closed", "void", "cancelled"]);

/**
 * Open RFIs for the board's side list, earliest due first; undated last.
 * `today` is the viewer's local calendar day (YYYY-MM-DD) so "overdue" flips
 * at local midnight, not UTC midnight.
 */
export function openRfisForBoard(rfis: readonly RfiLike[], today: string, limit = 8): { rows: BoardRfi[]; total: number } {
  const open = rfis
    .filter((r) => r.id && !r.is_deleted && !RFI_CLOSED.has(String(r.status ?? "").trim().toLowerCase()))
    .map((r) => {
      const due = (r.due_date || r.date_required || "").slice(0, 10) || null;
      return {
        id: String(r.id),
        number: r.rfi_number || "RFI",
        title: r.title || r.question || "Untitled RFI",
        dueDate: due,
        overdue: !!due && due < today,
      };
    })
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.number.localeCompare(b.number, undefined, { numeric: true }));
  return { rows: open.slice(0, limit), total: open.length };
}
