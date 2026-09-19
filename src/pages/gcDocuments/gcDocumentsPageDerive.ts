/**
 * gcDocumentsPageDerive.ts — pure derivation for the GC Documents register.
 *
 * No React, no queries, no side effects: everything here is a function of the
 * rows handed in, so it is unit-testable and the page's data hook stays a
 * list of useQuery calls.
 *
 * Domain shape: one `gc_drawing_sets` row is one ISSUANCE — a CD set, an ASI,
 * an addendum, a contract document. Its `gc_drawings` rows are the sheets that
 * came with it. The register lists issuances; sheets expand underneath.
 */

import type { RowWithAliases } from "@/api/supabaseClient";
import { daysBetween } from "@/lib/dateMath";
import {
  POST_AWARD_GC_DOC_TYPES,
  coerceGcDocType,
  coerceSteelImpact,
  steelImpactNeedsReview,
  type GcDocType,
  type SteelImpact,
} from "@/lib/gcDocuments/gcDocTypes";

export type GcDrawingSetRow = RowWithAliases<"gc_drawing_sets">;
export type GcDrawingRow = RowWithAliases<"gc_drawings">;

/** Sentinel for the "no filter" position of a dropdown. */
export const ALL = "ALL";
/** Impact filter pseudo-value: anything a person has not yet decided. */
export const NEEDS_REVIEW = "_needsReview";

export interface GcDocumentsPageFilters {
  search: string;
  docType: string;
  impact: string;
}

export interface GcIssuance {
  set: GcDrawingSetRow;
  id: string;
  /** Every non-tombstoned sheet in the issuance, current and superseded. */
  sheets: GcDrawingRow[];
  /** Sheets still of record. */
  currentSheets: GcDrawingRow[];
  supersededCount: number;
  docType: GcDocType;
  steelImpact: SteelImpact;
  /** Nobody has decided the steel question yet. */
  needsReview: boolean;
  /** Arrived after award, so it carries cost/schedule exposure. */
  isPostAward: boolean;
  /**
   * Calendar days between the date on the document and the day we logged
   * receiving it. NULL when either date is missing — that is *unknown* notice,
   * not zero notice, and callers must not print it as a number.
   */
  noticeDays: number | null;
  /** Date the register sorts and groups by; null when the issuance has none. */
  effectiveDate: string | null;
  /** Display label: "ASI 012" where a number exists, else the set name. */
  label: string;
}

export interface GcDocumentsPageStats {
  total: number;
  needsReview: number;
  impacted: number;
  postAward: number;
  sheetCount: number;
  supersededCount: number;
}

export interface GcDocumentsPageModel {
  issuances: GcIssuance[];
  filtered: GcIssuance[];
  stats: GcDocumentsPageStats;
  docTypeCounts: Map<GcDocType, number>;
  /** Issuances a PM should look at next: post-award first, then oldest. */
  reviewQueue: GcIssuance[];
  /** True when at least one sheet in the project is superseded. */
  hasSupersededSheets: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * The date this issuance is filed under. `received_date` wins because the
 * register answers "what has come in and when" — the date printed on the
 * document is the design team's, not ours. Falls back to issued_date, then to
 * the row's creation timestamp's date part so an issuance with neither date
 * still sorts somewhere stable instead of jumping around.
 */
export function effectiveIssuanceDate(set: GcDrawingSetRow): string | null {
  const received = text(set.received_date).trim();
  if (received) return received;
  const issued = text(set.issued_date).trim();
  if (issued) return issued;
  const created = text(set.created_at).trim();
  // created_at is a timestamptz; take the local calendar day, not the UTC one.
  if (created) {
    const d = new Date(created);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }
  return null;
}

/**
 * Days of notice: issued → received. Null unless BOTH dates are present.
 *
 * daysBetween() returns 0 for a missing input, which would read as "same-day
 * notice" — the opposite of "we don't know". Guard before calling it.
 */
export function noticeDaysFor(set: GcDrawingSetRow): number | null {
  const issued = text(set.issued_date).trim();
  const received = text(set.received_date).trim();
  if (!issued || !received) return null;
  return daysBetween(issued, received);
}

/** "ASI 012" when the GC gave it a number, otherwise the set name. */
export function issuanceLabel(set: GcDrawingSetRow): string {
  const num = text(set.doc_number).trim();
  if (num) return num;
  return text(set.set_name).trim() || "Untitled issuance";
}

// ── Grouping ────────────────────────────────────────────────────────────────

export function buildIssuances(
  sets: readonly GcDrawingSetRow[],
  sheets: readonly GcDrawingRow[],
): GcIssuance[] {
  const bySet = new Map<string, GcDrawingRow[]>();
  for (const sheet of sheets) {
    const key = text(sheet.gc_drawing_set_id);
    if (!key) continue;
    const bucket = bySet.get(key);
    if (bucket) bucket.push(sheet);
    else bySet.set(key, [sheet]);
  }

  const issuances: GcIssuance[] = [];
  for (const set of sets) {
    const id = text(set.id);
    if (!id) continue;
    const own = bySet.get(id) ?? [];
    const currentSheets = own.filter((s) => s.is_superseded !== true);
    const steelImpact = coerceSteelImpact(set.steel_impact);
    const docType = coerceGcDocType(set.doc_type);
    issuances.push({
      set,
      id,
      sheets: sortSheets(own),
      currentSheets: sortSheets(currentSheets),
      supersededCount: own.length - currentSheets.length,
      docType,
      steelImpact,
      needsReview: steelImpactNeedsReview(steelImpact),
      isPostAward: POST_AWARD_GC_DOC_TYPES.has(docType),
      noticeDays: noticeDaysFor(set),
      effectiveDate: effectiveIssuanceDate(set),
      label: issuanceLabel(set),
    });
  }
  return sortIssuances(issuances);
}

/** Sheet order inside an issuance: by drawing number, naturally. */
export function sortSheets(sheets: readonly GcDrawingRow[]): GcDrawingRow[] {
  return [...sheets].sort((a, b) =>
    text(a.drawing_number).localeCompare(text(b.drawing_number), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

/**
 * Newest first. Dates are DATE columns read back as 'YYYY-MM-DD', which sorts
 * correctly as a plain string — no Date parsing, so no UTC/local drift.
 * Undated issuances sink to the bottom rather than pretending to be oldest.
 */
export function sortIssuances(issuances: readonly GcIssuance[]): GcIssuance[] {
  return [...issuances].sort((a, b) => {
    if (a.effectiveDate && b.effectiveDate) {
      if (a.effectiveDate !== b.effectiveDate) {
        return a.effectiveDate < b.effectiveDate ? 1 : -1;
      }
    } else if (a.effectiveDate) {
      return -1;
    } else if (b.effectiveDate) {
      return 1;
    }
    return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
  });
}

// ── Filtering ───────────────────────────────────────────────────────────────

export function matchesSearch(issuance: GcIssuance, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  const set = issuance.set;
  const haystack = [
    set.set_name,
    set.doc_number,
    set.description,
    set.issued_by,
    set.revision,
    set.impact_notes,
    issuance.label,
  ];
  for (const field of haystack) {
    if (text(field).toLowerCase().includes(q)) return true;
  }
  // Searching a sheet number should surface the issuance that carried it —
  // that is how a PM asks "which ASI changed S-301?".
  for (const sheet of issuance.sheets) {
    if (text(sheet.drawing_number).toLowerCase().includes(q)) return true;
    if (text(sheet.title).toLowerCase().includes(q)) return true;
  }
  return false;
}

export function filterIssuances(
  issuances: readonly GcIssuance[],
  filters: GcDocumentsPageFilters,
): GcIssuance[] {
  return issuances.filter((issuance) => {
    if (filters.docType !== ALL && issuance.docType !== filters.docType) return false;
    if (filters.impact === NEEDS_REVIEW) {
      if (!issuance.needsReview) return false;
    } else if (filters.impact !== ALL && issuance.steelImpact !== filters.impact) {
      return false;
    }
    return matchesSearch(issuance, filters.search);
  });
}

// ── Aggregates ──────────────────────────────────────────────────────────────

export function computeStats(issuances: readonly GcIssuance[]): GcDocumentsPageStats {
  let needsReview = 0;
  let impacted = 0;
  let postAward = 0;
  let sheetCount = 0;
  let supersededCount = 0;
  for (const issuance of issuances) {
    if (issuance.needsReview) needsReview++;
    if (issuance.steelImpact === "impacted") impacted++;
    if (issuance.isPostAward) postAward++;
    sheetCount += issuance.sheets.length;
    supersededCount += issuance.supersededCount;
  }
  return {
    total: issuances.length,
    needsReview,
    impacted,
    postAward,
    sheetCount,
    supersededCount,
  };
}

export function computeDocTypeCounts(
  issuances: readonly GcIssuance[],
): Map<GcDocType, number> {
  const counts = new Map<GcDocType, number>();
  for (const issuance of issuances) {
    counts.set(issuance.docType, (counts.get(issuance.docType) ?? 0) + 1);
  }
  return counts;
}

/**
 * What to look at next. Post-award issuances (ASI / bulletin / CCD / revision)
 * come first because they are the ones that turn into change orders; within
 * each band, oldest first — the one that has been sitting longest.
 */
export function buildReviewQueue(issuances: readonly GcIssuance[]): GcIssuance[] {
  return issuances
    .filter((i) => i.needsReview)
    .sort((a, b) => {
      if (a.isPostAward !== b.isPostAward) return a.isPostAward ? -1 : 1;
      if (a.effectiveDate && b.effectiveDate) {
        if (a.effectiveDate !== b.effectiveDate) {
          return a.effectiveDate < b.effectiveDate ? -1 : 1;
        }
      } else if (a.effectiveDate) {
        return -1;
      } else if (b.effectiveDate) {
        return 1;
      }
      return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
    });
}

// ── Supersession ────────────────────────────────────────────────────────────

export interface SupersessionPlan {
  /** Sheets the incoming issuance replaces, keyed by the incoming sheet. */
  replacements: Array<{ priorId: string; priorNumber: string; incomingNumber: string }>;
  /** Incoming sheet numbers with no prior — genuinely new sheets. */
  added: string[];
  /**
   * Incoming numbers matching MORE THAN ONE live prior sheet. Never guessed:
   * the same trap `findExactLiveDrawing` avoids for shop sheets. A human picks.
   */
  ambiguous: string[];
}

function normalizeSheetNumber(value: unknown): string {
  return text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Work out what an incoming issuance supersedes, by exact sheet number.
 *
 * Only LIVE (not already superseded, not deleted) sheets from OTHER issuances
 * are candidates — an issuance never supersedes its own sheets, and a sheet
 * already marked superseded is not of record to begin with.
 *
 * Matching is exact on the normalized number. Two live priors with the same
 * number means the register is already inconsistent; that is reported as
 * ambiguous rather than resolved by picking one.
 */
export function planSupersession(
  incomingSheets: readonly GcDrawingRow[],
  existingSheets: readonly GcDrawingRow[],
  incomingSetId: string,
): SupersessionPlan {
  const liveByNumber = new Map<string, GcDrawingRow[]>();
  for (const sheet of existingSheets) {
    if (text(sheet.gc_drawing_set_id) === incomingSetId) continue;
    if (sheet.is_superseded === true) continue;
    const key = normalizeSheetNumber(sheet.drawing_number);
    if (!key) continue;
    const bucket = liveByNumber.get(key);
    if (bucket) bucket.push(sheet);
    else liveByNumber.set(key, [sheet]);
  }

  const replacements: SupersessionPlan["replacements"] = [];
  const added: string[] = [];
  const ambiguous: string[] = [];

  for (const sheet of incomingSheets) {
    const incomingNumber = text(sheet.drawing_number);
    const key = normalizeSheetNumber(incomingNumber);
    if (!key) continue;
    const priors = liveByNumber.get(key) ?? [];
    if (priors.length === 0) {
      added.push(incomingNumber);
    } else if (priors.length > 1) {
      ambiguous.push(incomingNumber);
    } else {
      replacements.push({
        priorId: text(priors[0].id),
        priorNumber: text(priors[0].drawing_number),
        incomingNumber,
      });
    }
  }

  return { replacements, added, ambiguous };
}

// ── Model ───────────────────────────────────────────────────────────────────

export function deriveGcDocumentsPageModel({
  sets,
  sheets,
  filters,
}: {
  sets: readonly GcDrawingSetRow[];
  sheets: readonly GcDrawingRow[];
  filters: GcDocumentsPageFilters;
}): GcDocumentsPageModel {
  const issuances = buildIssuances(sets, sheets);
  const stats = computeStats(issuances);
  return {
    issuances,
    filtered: filterIssuances(issuances, filters),
    stats,
    docTypeCounts: computeDocTypeCounts(issuances),
    reviewQueue: buildReviewQueue(issuances),
    hasSupersededSheets: stats.supersededCount > 0,
  };
}
