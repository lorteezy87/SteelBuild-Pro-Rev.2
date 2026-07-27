/**
 * Pure derivations for the Detailing Process Board.
 *
 * No React, no network — reshapes the hub's `setPackages` + `submittals` read
 * models into the stage-bucketed board items the on-skin `ProcessBoardPanel`
 * renders. Every value here is byte-identical to what the legacy
 * `SubmittalVisualBoard.jsx` computes inline today (buildBoardItems /
 * filterItems / stage bucketing / summary), so the conversion is
 * behavior-preserving. Independently typed + unit-tested so it stays strict-null
 * / no-implicit-any clean.
 *
 * ⚠ Working-day due display (`submittal_workday_dues`, Phase 5): the
 * `useWorkdays` flag is threaded in exactly as the legacy board did — only
 * SUBMITTAL-governed dues switch to working days (`useWorkdays && !!submittalDue`
 * for set packages; always for unlinked submittals). Drawing-set/sheet dues stay
 * calendar-day. This mirrors the shared `dueInfoFor` dispatcher so the Process
 * Board, Control Board, and Approval Matrix all agree.
 */
import {
  derivedSetStage,
  isRRStatus,
  pickMostRecentSubmittal,
  submittalStatusToStage,
} from "@/lib/submittalStageMapping";
import { formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import {
  computeSubmittalRiskAging,
  type SubmittalRiskAssessment,
} from "@/lib/submittalRiskAging";
import { dueInfoFor } from "@/pages/drawingSubmittalHub/format";
import type { DueInfo } from "@/pages/drawingSubmittalHub/types";

const ACTION_STATUSES = new Set(["Rejected", "Revise and Resubmit"]);
const CLOSED_SUBMITTAL_STATUSES = new Set(["Released for Fabrication", "Void"]);

/** One board card — the shape the legacy `buildBoardItems` produces. */
export interface BoardItem {
  id: string;
  kind: string;
  title: string;
  stage: string;
  setNumber: string;
  submittalNumber: string;
  status: string;
  owner: string;
  dueDate: string | null;
  due: DueInfo;
  linked: boolean;
  needsAction: boolean;
  isRR: boolean;
  sheetCount: number;
  submittalCount: number;
  discipline: string;
  routeTab: string;
  /** Slice 7 — R&R/OFS/BFA aging risk (null when stage is not scored). */
  risk: SubmittalRiskAssessment | null;
}

export interface BoardSummary {
  total: number;
  overdue: number;
  dueSoon: number;
  needsAction: number;
  unlinked: number;
  released: number;
  criticalRisk: number;
}

export type BoardFilter = "all" | "overdue" | "needs-action" | "unlinked" | "critical";

function riskForBoardStage(
  stage: string | null | undefined,
  dueDate: string | null,
  submittal: any,
  useWorkdays: boolean,
): SubmittalRiskAssessment | null {
  return computeSubmittalRiskAging({
    stage,
    dueDate,
    statusChangedAt:
      submittal?.returned_date ||
      submittal?.approved_date ||
      submittal?.updated_at ||
      submittal?.submitted_date ||
      null,
    useWorkdays,
  });
}

// ── Local date helpers (byte-identical to SubmittalVisualBoard.jsx) ──────────

function toLocalDay(input: any): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) return null;
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  if (typeof input === "string") {
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function daysUntil(input: any): number | null {
  const due = toLocalDay(input);
  if (!due) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function getSubmittalDueDate(submittal: any): string | null {
  return submittal?.required_date || submittal?.due_date || submittal?.date_required || null;
}

function getDrawingDueDate(drawing: any): string | null {
  return drawing?.due_date || drawing?.required_date || drawing?.target_date || null;
}

function compareDueDates(a: any, b: any): number {
  const ad = daysUntil(a);
  const bd = daysUntil(b);
  if (ad === null && bd === null) return 0;
  if (ad === null) return 1;
  if (bd === null) return -1;
  return ad - bd;
}

function earliestDate(values: any[]): any {
  return values.filter(Boolean).sort(compareDueDates)[0] || null;
}

function getOwner(submittal: any, sheets: any[]): string {
  return (
    submittal?.ball_in_court ||
    submittal?.assigned_to ||
    submittal?.reviewer ||
    sheets.find((drawing) => drawing.ball_in_court || drawing.assigned_to || drawing.reviewer)?.ball_in_court ||
    sheets.find((drawing) => drawing.assigned_to)?.assigned_to ||
    sheets.find((drawing) => drawing.reviewer)?.reviewer ||
    "Unassigned"
  );
}

function getLatestStageSubmittal(submittals: any[]): any {
  const usable = (submittals || []).filter(
    (submittal) =>
      submittal &&
      !submittal.is_deleted &&
      submittalStatusToStage(submittal.status, submittal.ball_in_court, submittal.approved_date),
  );
  return pickMostRecentSubmittal(usable) || pickMostRecentSubmittal(submittals);
}

// ── Board build / filter / bucket / summary (byte-identical to the .jsx) ─────

/**
 * Build the flat board-item list from set packages + submittals.
 * Pure over its input; mirrors the legacy `buildBoardItems`.
 */
export function buildBoardItems(setPackages: any[], submittals: any[], useWorkdays = false): BoardItem[] {
  const packageItems = (setPackages || []).map((pkg) => {
    const latestSubmittal = getLatestStageSubmittal(pkg.submittals);
    const stage = latestSubmittal
      ? submittalStatusToStage(
          latestSubmittal.status,
          latestSubmittal.ball_in_court,
          latestSubmittal.approved_date,
        ) || derivedSetStage(pkg.submittals, pkg.sheets)
      : derivedSetStage(pkg.submittals, pkg.sheets);
    // Prefer the governing submittal's due; only fall back to the earliest sheet
    // due when no submittal governs. Working-day counting applies ONLY to the
    // submittal-governed case (a drawing-set/sheet due stays calendar-day).
    const submittalDue = getSubmittalDueDate(latestSubmittal);
    const dueDate = submittalDue || earliestDate((pkg.sheets || []).map(getDrawingDueDate));
    const closed = stage === "Released" || CLOSED_SUBMITTAL_STATUSES.has(latestSubmittal?.status);
    const due = dueInfoFor(dueDate, { closed, useWorkdays: useWorkdays && !!submittalDue });
    const setNumber = pkg.parent ? formatDrawingSetNumber(pkg.parent) : "";
    const submittalNumber = latestSubmittal?.submittal_number || "";
    return {
      id: `set-${pkg.key}`,
      kind: "Drawing Set",
      title: pkg.name || "Unnamed drawing set",
      stage,
      setNumber,
      submittalNumber,
      status: latestSubmittal?.status || (stage === "Not Started" ? "No submittal" : stage),
      owner: getOwner(latestSubmittal, pkg.sheets || []),
      dueDate,
      due,
      linked: !!latestSubmittal,
      needsAction:
        ACTION_STATUSES.has(latestSubmittal?.status) ||
        (pkg.sheets || []).some((drawing: any) => ["Rejected", "Revise and Resubmit", "Returned"].includes(drawing.stage)),
      isRR: isRRStatus(latestSubmittal?.status),
      sheetCount: (pkg.sheets || []).length,
      submittalCount: (pkg.submittals || []).length,
      discipline: pkg.parent?.discipline || latestSubmittal?.discipline || "",
      routeTab: latestSubmittal ? "submittals" : "drawings",
      risk: riskForBoardStage(stage, dueDate, latestSubmittal, useWorkdays && !!submittalDue),
    };
  });

  const linkedSubmittalIds = new Set(
    (setPackages || []).flatMap((pkg) => (pkg.submittals || []).map((submittal: any) => submittal.id).filter(Boolean)),
  );
  const unlinkedItems = (submittals || [])
    .filter((submittal) => submittal && !submittal.is_deleted && !linkedSubmittalIds.has(submittal.id))
    .map((submittal) => {
      const stage =
        submittalStatusToStage(submittal.status, submittal.ball_in_court, submittal.approved_date) ||
        "Not Started";
      const dueDate = getSubmittalDueDate(submittal);
      // Always a submittal due date → working-day-aware when the flag is on.
      const due = dueInfoFor(dueDate, { closed: CLOSED_SUBMITTAL_STATUSES.has(submittal.status), useWorkdays });
      return {
        id: `submittal-${submittal.id}`,
        kind: "Unlinked Submittal",
        title:
          [submittal.submittal_number, submittal.title || submittal.description]
            .filter(Boolean)
            .join(" - ") || "Untitled submittal",
        stage,
        setNumber: "",
        submittalNumber: submittal.submittal_number || "",
        status: submittal.status || "Draft",
        owner: submittal.ball_in_court || submittal.assigned_to || submittal.reviewer || "Unassigned",
        dueDate,
        due,
        linked: false,
        needsAction: ACTION_STATUSES.has(submittal.status),
        isRR: isRRStatus(submittal.status),
        sheetCount: 0,
        submittalCount: 1,
        discipline: submittal.discipline || submittal.submittal_type || "",
        routeTab: "submittals",
        risk: riskForBoardStage(stage, dueDate, submittal, useWorkdays),
      };
    });

  return [...packageItems, ...unlinkedItems].sort((a, b) => {
    const aCrit = a.risk?.tier === "critical" ? 1 : 0;
    const bCrit = b.risk?.tier === "critical" ? 1 : 0;
    if (aCrit !== bCrit) return bCrit - aCrit;
    if (a.due.overdue !== b.due.overdue) return a.due.overdue ? -1 : 1;
    if (a.needsAction !== b.needsAction) return a.needsAction ? -1 : 1;
    return a.due.sort - b.due.sort || a.title.localeCompare(b.title);
  });
}

/** Filter board items by the active quick-filter + search query. Mirrors the
 *  legacy `filterItems`. */
export function filterItems(items: BoardItem[], filter: BoardFilter, search: string): BoardItem[] {
  const q = search.trim().toLowerCase();
  return items.filter((item) => {
    if (filter === "overdue" && !item.due.overdue) return false;
    if (filter === "needs-action" && !item.needsAction) return false;
    if (filter === "unlinked" && item.linked) return false;
    if (filter === "critical" && item.risk?.tier !== "critical") return false;
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.status.toLowerCase().includes(q) ||
      item.owner.toLowerCase().includes(q) ||
      item.discipline.toLowerCase().includes(q) ||
      item.submittalNumber.toLowerCase().includes(q) ||
      item.setNumber.toLowerCase().includes(q)
    );
  });
}

/** Bucket the (already filtered) board items by stage, keyed to `stageOrder`.
 *  Non-matching stages fall into "Not Started". Mirrors the legacy `stageBuckets`
 *  memo (order provided by the caller so the derive stays free of UI config). */
export function bucketByStage(items: BoardItem[], stageOrder: string[]): Record<string, BoardItem[]> {
  const buckets: Record<string, BoardItem[]> = {};
  for (const stage of stageOrder) buckets[stage] = [];
  for (const item of items) {
    const key = stageOrder.includes(item.stage) ? item.stage : "Not Started";
    (buckets[key] ?? (buckets[key] = [])).push(item);
  }
  return buckets;
}

/** Board summary counts over the UNFILTERED item list. Mirrors the legacy
 *  `summary` memo. */
export function summarizeBoard(allItems: BoardItem[]): BoardSummary {
  return {
    total: allItems.length,
    overdue: allItems.filter((item) => item.due.overdue).length,
    dueSoon: allItems.filter((item) => item.due.dueSoon).length,
    needsAction: allItems.filter((item) => item.needsAction).length,
    unlinked: allItems.filter((item) => !item.linked).length,
    released: allItems.filter((item) => item.stage === "Released").length,
    criticalRisk: allItems.filter((item) => item.risk?.tier === "critical").length,
  };
}
