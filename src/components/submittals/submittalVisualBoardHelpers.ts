/**
 * Pure board item builders + stage buckets for SubmittalVisualBoard.
 */
import { STAGE_MAP } from "@/components/drawings/drawingsConfig";
import {
  derivedSetStage,
  isRRStatus,
  pickMostRecentSubmittal,
  submittalStatusToStage,
} from "@/lib/submittalStageMapping";
import { formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import { formatShortDate } from "@/utils/dates";
import { dueInfoFor } from "@/pages/drawingSubmittalHub/format";

const textMuted = "var(--text-muted)";


export function bucketBoardItemsByStage(boardItems, stageOrder, fallbackStage = "Not Started") {
  const buckets = Object.fromEntries(stageOrder.map((stage) => [stage, []]));
  for (const item of boardItems) {
    const key = stageOrder.includes(item.stage) ? item.stage : fallbackStage;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(item);
  }
  return buckets;
}

export function summarizeBoardItems(allItems) {
  return {
    total: allItems.length,
    overdue: allItems.filter((item) => item.due?.overdue).length,
    dueSoon: allItems.filter((item) => item.due?.dueSoon).length,
    needsAction: allItems.filter((item) => item.needsAction).length,
    unlinked: allItems.filter((item) => !item.linked).length,
    released: allItems.filter((item) => item.stage === "Released").length,
  };
}

export const ACTION_STATUSES = new Set(["Rejected", "Revise and Resubmit"]);
export const CLOSED_SUBMITTAL_STATUSES = new Set(["Released for Fabrication", "Void"]);

export const STAGE_CAPTIONS = {
  "Not Started": "Not started",
  IFA: "In for approval",
  OFA: "Out for approval",
  BFA: "Back from approval",
  OFS: "OFS — Out for Scrub",
  IFC: "Issued for construction",
  Released: "Released for fab",
};

export function toLocalDay(input) {
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

export function daysUntil(input) {
  const due = toLocalDay(input);
  if (!due) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

// Timezone-safe (matches the toLocalDay-based daysUntil above): a bare
// new Date("2026-06-10") is UTC midnight and renders a day early in MST.
export const fmtDate = (input) => formatShortDate(input);

// NOTE: the calendar/working-day due chip now comes from the shared, tested
// `dueInfoFor` engine in drawingSubmittalHub/format.ts (imported above) so the
// Process Board, Control Board, and Approval Matrix all agree. `daysUntil`
// stays — it still backs compareDueDates / earliestDate for the sheet-date
// fallback.

export function getSubmittalDueDate(submittal) {
  return submittal?.required_date || submittal?.due_date || submittal?.date_required || null;
}

export function getDrawingDueDate(drawing) {
  return drawing?.due_date || drawing?.required_date || drawing?.target_date || null;
}

export function compareDueDates(a, b) {
  const ad = daysUntil(a);
  const bd = daysUntil(b);
  if (ad === null && bd === null) return 0;
  if (ad === null) return 1;
  if (bd === null) return -1;
  return ad - bd;
}

export function earliestDate(values) {
  return values.filter(Boolean).sort(compareDueDates)[0] || null;
}

export function getOwner(submittal, sheets) {
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

export function getLatestStageSubmittal(submittals) {
  const usable = (submittals || []).filter(
    (submittal) =>
      submittal &&
      !submittal.is_deleted &&
      submittalStatusToStage(submittal.status, submittal.ball_in_court, submittal.approved_date),
  );
  return pickMostRecentSubmittal(usable) || pickMostRecentSubmittal(submittals);
}

export function getStageColor(stage) {
  return STAGE_MAP[stage]?.color || textMuted;
}

export function buildBoardItems(setPackages, submittals, useWorkdays = false) {
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
        (pkg.sheets || []).some((drawing) => ["Rejected", "Revise and Resubmit", "Returned"].includes(drawing.stage)),
      isRR: isRRStatus(latestSubmittal?.status),
      sheetCount: (pkg.sheets || []).length,
      submittalCount: (pkg.submittals || []).length,
      discipline: pkg.parent?.discipline || latestSubmittal?.discipline || "",
      routeTab: latestSubmittal ? "submittals" : "drawings",
    };
  });

  const linkedSubmittalIds = new Set(
    (setPackages || []).flatMap((pkg) => (pkg.submittals || []).map((submittal) => submittal.id).filter(Boolean)),
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
      };
    });

  return [...packageItems, ...unlinkedItems].sort((a, b) => {
    if (a.due.overdue !== b.due.overdue) return a.due.overdue ? -1 : 1;
    if (a.needsAction !== b.needsAction) return a.needsAction ? -1 : 1;
    return a.due.sort - b.due.sort || a.title.localeCompare(b.title);
  });
}

export function filterItems(items, filter, search) {
  const q = search.trim().toLowerCase();
  return items.filter((item) => {
    if (filter === "overdue" && !item.due.overdue) return false;
    if (filter === "needs-action" && !item.needsAction) return false;
    if (filter === "unlinked" && item.linked) return false;
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

export const BOARD_MONO = "var(--font-mono)";
export const BOARD_SUCCESS = "var(--status-success)";
export const BOARD_WARNING = "var(--status-warning)";
export const BOARD_ERROR = "var(--status-error)";
export const BOARD_REVIEW = "var(--status-review)";
export const BOARD_ACCENT = "var(--accent)";

export const BOARD_SURFACE_LOW = "var(--bg-surface-low)";
export const BOARD_SURFACE_HIGH = "var(--bg-surface-high)";
export const BOARD_BORDER = "var(--border-default)";
export const BOARD_TEXT_PRIMARY = "var(--text-primary)";
export const BOARD_TEXT_MUTED = "var(--text-muted)";

