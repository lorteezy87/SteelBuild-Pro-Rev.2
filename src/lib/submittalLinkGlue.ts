/**
 * submittalLinkGlue — pure helpers for Detailing CC event glue:
 * open-link discovery, create-from-set prefill, post-status suggest patches,
 * and unlinked-package hints.
 *
 * Open-for-link aligns with Drawings `buildSubmittalsBySetId`: not deleted and
 * status not in TERMINAL_STATUSES (Approved / AAN / RFF / Void).
 */
import {
  CLOSED_SUBMITTAL_STATUSES,
  TERMINAL_STATUSES,
  isRRStatus,
} from "@/lib/submittalStageMapping";

export interface LinkableSubmittal {
  id?: string;
  status?: string | null;
  ball_in_court?: string | null;
  submitted_date?: string | null;
  returned_date?: string | null;
  approved_date?: string | null;
  drawing_set_ids?: string[] | null;
  is_deleted?: boolean | null;
  submittal_number?: string | null;
  title?: string | null;
}

export interface StatusSuggestPatch {
  ball_in_court?: string | null;
  submitted_date?: string;
  returned_date?: string;
  approved_date?: string;
}

export interface CreateFromSetInitial {
  drawing_set_ids: string[];
  requireLinkedSet: true;
  status?: string;
}

const SENT_STATUSES = new Set(["Submitted", "Under Review"]);
const VERDICT_STATUSES = new Set([
  "Approved",
  "Approved as Noted",
  "Revise and Resubmit",
  "Rejected",
  "Released for Fabrication",
]);

/** True when a submittal can still receive revision attach / counts as open link. */
export function isOpenForLink(submittal: LinkableSubmittal | null | undefined): boolean {
  if (!submittal || submittal.is_deleted) return false;
  const status = submittal.status || "Draft";
  return !TERMINAL_STATUSES.has(status);
}

/**
 * Open submittals that list `setId` in `drawing_set_ids`.
 * Order preserved from input (callers may sort by number/date).
 */
export function openLinkedSubmittalsForSet<T extends LinkableSubmittal>(
  setId: string | null | undefined,
  submittals: T[] | null | undefined,
): T[] {
  if (!setId || !Array.isArray(submittals) || submittals.length === 0) return [];
  return submittals.filter((s) => {
    if (!isOpenForLink(s)) return false;
    const ids = Array.isArray(s.drawing_set_ids) ? s.drawing_set_ids : [];
    return ids.includes(setId);
  });
}

/**
 * After a status mutation, suggest BIC / dates that often lag behind an inline
 * status edit. Returns null when nothing would change vs the pre-mutation row
 * interpreted under the *new* status (caller merges onto the updated row).
 *
 * Does not write sheet stage — boards recompute from SoT.
 */
export function buildStatusSuggestPatch(
  before: LinkableSubmittal | null | undefined,
  nextStatus: string,
  opts?: { today?: string },
): StatusSuggestPatch | null {
  if (!nextStatus) return null;
  const today = opts?.today;
  const prevBic = before?.ball_in_court ?? null;
  const patch: StatusSuggestPatch = {};

  if (CLOSED_SUBMITTAL_STATUSES.has(nextStatus)) {
    if (prevBic != null) patch.ball_in_court = null;
  } else if (isRRStatus(nextStatus) && prevBic !== "Detailer") {
    // Failed cycle → detailer owns rework.
    patch.ball_in_court = "Detailer";
  } else if (SENT_STATUSES.has(nextStatus) && prevBic === "Detailer") {
    // First outbound send from internal prep → EOR (matches OFA default).
    patch.ball_in_court = "EOR";
  } else if (nextStatus === "Draft" && prevBic !== "Detailer") {
    patch.ball_in_court = "Detailer";
  }
  // Approved / AAN: leave BIC alone here — scrub/IFC verb CTAs own those moves.

  if (today) {
    if (SENT_STATUSES.has(nextStatus) && !before?.submitted_date) {
      patch.submitted_date = today;
    }
    if (VERDICT_STATUSES.has(nextStatus) && !before?.returned_date) {
      patch.returned_date = today;
    }
    if (
      (nextStatus === "Approved" || nextStatus === "Approved as Noted") &&
      !before?.approved_date
    ) {
      patch.approved_date = today;
    }
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/** Compact hub/process chip: in-flight package with no open linked submittal. */
export function needsUnlinkedSubmittalHint(input: {
  hasInFlightWork: boolean;
  openLinkedCount: number;
}): boolean {
  return !!input.hasInFlightWork && Number(input.openLinkedCount || 0) === 0;
}

/** Seed create-modal initial fields when navigating from a set context. */
export function buildCreateInitialFromSet(
  setId: string,
  extras?: { prefilledStatus?: string | null },
): CreateFromSetInitial {
  const out: CreateFromSetInitial = {
    drawing_set_ids: [setId],
    requireLinkedSet: true,
  };
  if (extras?.prefilledStatus) out.status = extras.prefilledStatus;
  return out;
}

/** Idempotent union of set id into drawing_set_ids. */
export function ensureSetLinked(
  drawingSetIds: string[] | null | undefined,
  setId: string,
): string[] {
  const ids = Array.isArray(drawingSetIds) ? drawingSetIds.filter(Boolean) : [];
  if (ids.includes(setId)) return ids;
  return [...ids, setId];
}

/**
 * Drop suggest fields already present on the post-mutation row (e.g. advance
 * already stamped BIC/dates) so the strip only asks for remaining confirms.
 */
export function filterSuggestAgainstCurrent(
  patch: StatusSuggestPatch | null | undefined,
  current: LinkableSubmittal | null | undefined,
): StatusSuggestPatch | null {
  if (!patch) return null;
  const out: StatusSuggestPatch = {};
  if (
    "ball_in_court" in patch &&
    (patch.ball_in_court ?? null) !== (current?.ball_in_court ?? null)
  ) {
    out.ball_in_court = patch.ball_in_court ?? null;
  }
  if (patch.submitted_date && !current?.submitted_date) out.submitted_date = patch.submitted_date;
  if (patch.returned_date && !current?.returned_date) out.returned_date = patch.returned_date;
  if (patch.approved_date && !current?.approved_date) out.approved_date = patch.approved_date;
  return Object.keys(out).length > 0 ? out : null;
}
