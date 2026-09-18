/**
 * docControl/titleBlock.ts — normalise whatever the extractor saw into the
 * five Document Control title-block fields.
 *
 * Pure. No React, no Supabase, no `Date` arithmetic on date-only strings.
 *
 * The contract every function here keeps: a field is `observed` only when a
 * source that COULD have carried it was actually inspected. A scanned
 * (image-only) PDF has no text layer, so nothing read from the text layer is
 * observed on one — the fields come back unknown rather than blank, and the
 * intake UI asks a human instead of asserting the EOR left the box empty.
 */

import type { DocControlTitleBlock, DocField, FieldProvenance } from "./types";

/** A field nobody inspected. The canonical "we do not know" value. */
export function unobserved(): DocField {
  return { value: null, provenance: "not-observed", observed: false };
}

/**
 * Build a field from a source that WAS inspected. An empty / whitespace-only
 * string becomes `value: null` but stays `observed: true` — that is the real
 * "the title block does not state this" finding.
 */
export function observedField(
  raw: string | null | undefined,
  provenance: FieldProvenance,
): DocField {
  const trimmed = String(raw ?? "").trim();
  return { value: trimmed || null, provenance, observed: true };
}

/**
 * Pick the first field that carries an actual value; otherwise the first field
 * that was at least observed; otherwise unknown.
 *
 * Order matters — pass sources most-trusted first. Never promotes an
 * unobserved field over an observed one.
 */
export function coalesceField(...fields: Array<DocField | null | undefined>): DocField {
  const present = fields.filter((f): f is DocField => !!f);
  const withValue = present.find((f) => f.observed && f.value !== null);
  if (withValue) return withValue;
  const observedOnly = present.find((f) => f.observed);
  if (observedOnly) return observedOnly;
  return unobserved();
}

/**
 * Normalise a printed date to an ISO `YYYY-MM-DD` date-only string.
 *
 * Built by string surgery, never by `new Date(...)`: parsing "11/04/25" through
 * the Date constructor and formatting it back lands a day early for anyone west
 * of UTC, and the test runner is pinned to `TZ=UTC` so that bug would ship
 * green. Returns null for anything it cannot read confidently — a wrong issue
 * date on a transmittal is worse than a blank one.
 *
 * Accepts: YYYY-MM-DD, MM/DD/YYYY, MM/DD/YY, MM-DD-YYYY, and D Month YYYY.
 */
export function normalizeIssueDate(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return buildIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const us = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (us) {
    const yearRaw = Number(us[3]);
    // Two-digit years on drawings are this century — a 1925 issue date is not
    // a thing anyone is fabricating from.
    const year = us[3].length === 2 ? 2000 + yearRaw : yearRaw;
    return buildIso(year, Number(us[1]), Number(us[2]));
  }

  const spelled = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/);
  if (spelled) {
    const month = MONTHS[spelled[2].slice(0, 3).toLowerCase()];
    if (month) return buildIso(Number(spelled[3]), month, Number(spelled[1]));
  }

  const spelledFirst = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (spelledFirst) {
    const month = MONTHS[spelledFirst[1].slice(0, 3).toLowerCase()];
    if (month) return buildIso(Number(spelledFirst[3]), month, Number(spelledFirst[2]));
  }

  return null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function buildIso(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2200) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Strip a leading REV / REVISION label and upper-case, matching the existing
 * titleblock OCR normaliser so a rect-read "REV 2" and a text-layer "Rev 2"
 * compare equal.
 */
export function normalizeRevisionCode(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const stripped = s.replace(/^REV(?:ISION)?\.?\s*/i, "").trim().toUpperCase();
  return stripped || null;
}

/** What the extractor produced for one document. `undefined` = field not inspected. */
export type TitleBlockSource = {
  /** True when the PDF had no text layer — nothing text-derived is observed. */
  scanned: boolean;
  /** Set-level metadata from the cover sheet. */
  setMeta?: {
    projectName?: string;
    revision?: string;
    issueDate?: string;
    issuedBy?: string;
    /** Present only once the extractor schema asks for it. */
    authorizingEngineer?: string;
  } | null;
  /** The individual sheet's own title-block row. */
  sheet?: {
    sheetNumber?: string;
    revision?: string;
    date?: string;
  } | null;
  /** True when the set's marked titleblock rectangle supplied the revision. */
  revisionFromRect?: boolean;
  /** The existing `drawing_sets` row, used only as a fallback. */
  existingSet?: {
    project_name?: string | null;
    revision?: string | null;
    issued_date?: string | null;
    eor_reviewer?: string | null;
  } | null;
};

/**
 * Read the five Document Control fields out of an extraction.
 *
 * Precedence, most trusted first:
 *   sheet title block → marked rect → set cover metadata → existing set row.
 * The existing set row is a fallback for context, never evidence about THIS
 * document, so it is tagged `drawing-set` and a reader can discount it.
 */
export function readTitleBlock(source: TitleBlockSource): DocControlTitleBlock {
  const { scanned } = source;
  const setMeta = source.setMeta ?? null;
  const sheet = source.sheet ?? null;
  const existing = source.existingSet ?? null;

  // On a scanned PDF the text layer is empty by construction. Treating its
  // silence as "the field is blank" is the exact false-negative this module
  // exists to prevent.
  const fromText = (
    raw: string | null | undefined,
    provided: boolean,
    provenance: FieldProvenance = "pdf-text",
  ): DocField => {
    if (scanned || !provided) return unobserved();
    return observedField(raw, provenance);
  };

  const sheetNumber = coalesceField(
    fromText(sheet?.sheetNumber, sheet ? "sheetNumber" in sheet : false),
  );

  const rawRevision = coalesceField(
    fromText(
      sheet?.revision,
      sheet ? "revision" in sheet : false,
      source.revisionFromRect ? "titleblock-rect" : "pdf-text",
    ),
    fromText(setMeta?.revision, setMeta ? "revision" in setMeta : false),
    existing?.revision != null ? observedField(existing.revision, "drawing-set") : null,
  );
  const revisionNumber: DocField = {
    ...rawRevision,
    value: normalizeRevisionCode(rawRevision.value),
  };

  const rawIssueDate = coalesceField(
    fromText(sheet?.date, sheet ? "date" in sheet : false),
    fromText(setMeta?.issueDate, setMeta ? "issueDate" in setMeta : false),
    existing?.issued_date != null ? observedField(existing.issued_date, "drawing-set") : null,
  );
  const issueDate: DocField = {
    ...rawIssueDate,
    // An unparseable printed date is NOT a blank title-block box — it stays
    // observed, so the finding reads "could not be read" rather than "absent".
    value: normalizeIssueDate(rawIssueDate.value),
  };

  const projectName = coalesceField(
    fromText(setMeta?.projectName, setMeta ? "projectName" in setMeta : false),
    existing?.project_name != null ? observedField(existing.project_name, "drawing-set") : null,
  );

  // `issuedBy` is the ISSUING FIRM. A firm is not a person and cannot sign a
  // seal, so it is never promoted into authorizingEngineer — only a dedicated
  // engineer field or the set's recorded EOR counts.
  const authorizingEngineer = coalesceField(
    fromText(
      setMeta?.authorizingEngineer,
      setMeta ? "authorizingEngineer" in setMeta : false,
    ),
    existing?.eor_reviewer != null ? observedField(existing.eor_reviewer, "drawing-set") : null,
  );

  return { projectName, sheetNumber, revisionNumber, issueDate, authorizingEngineer };
}
