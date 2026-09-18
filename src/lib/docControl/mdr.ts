/**
 * docControl/mdr.ts — cross-reference an incoming sheet against the Master
 * Document Register (the project's live `drawings` rows).
 *
 * Matching is EXACT on sheet number, reusing `exactSheetNumber` from
 * drawingUploadUtils so intake and the revision-upload diff can never disagree
 * about what "the same sheet" means. Fuzzy matching is not an option here: a
 * near-match that pairs S-101 with S-1.01 silently overwrites the wrong sheet's
 * revision history.
 *
 * Pure. No React, no Supabase.
 */

import { exactSheetNumber } from "@/lib/drawingUploadUtils";
import type { MdrEntry, RegisterCrossReference } from "./types";

export type CrossReferenceInput = {
  /** The incoming sheet number, as read from the title block. */
  sheetNumber: string | null;
  /** Live register rows to match against. */
  register: MdrEntry[];
  /**
   * False when the register rows were capped by the row limit. A miss against a
   * truncated register is NOT evidence the sheet is new — compare the row count
   * against `EFFECTIVE_LIST_CAP` (not LIST_ROW_CAP, which is only what the
   * request asked for) at the call site and pass the answer here.
   */
  registerComplete: boolean;
};

/**
 * Place an incoming sheet in the register.
 *
 * Superseded rows are excluded: the register question is "what is live on this
 * job right now", and a superseded sheet is by definition not.
 */
export function crossReferenceRegister(input: CrossReferenceInput): RegisterCrossReference {
  const key = exactSheetNumber(input.sheetNumber);

  if (!key) {
    return {
      status: "unidentified",
      matched: null,
      candidates: [],
      note: "No sheet number was read from the title block — the document cannot be placed in the register.",
    };
  }

  const live = (input.register || []).filter(
    (entry) => entry && !entry.isSuperseded && exactSheetNumber(entry.sheetNumber) === key,
  );

  if (live.length === 1) {
    return {
      status: "revision-of-record",
      matched: live[0],
      candidates: live,
      note: `Matches live register sheet ${key}${live[0].revisionNumber ? ` at revision ${live[0].revisionNumber}` : ""}.`,
    };
  }

  if (live.length > 1) {
    return {
      status: "duplicate-in-register",
      matched: null,
      candidates: live,
      note: `${live.length} live register rows share sheet number ${key}. Resolve the duplicate before ingesting — no automatic pairing.`,
    };
  }

  if (!input.registerComplete) {
    return {
      status: "register-incomplete",
      matched: null,
      candidates: [],
      note: `Sheet ${key} was not found, but the register read was truncated by the row cap. Cannot conclude the sheet is new.`,
    };
  }

  return {
    status: "new-to-register",
    matched: null,
    candidates: [],
    note: `Sheet ${key} is not in the live register — this is a new sheet.`,
  };
}

/**
 * Map raw `drawings` rows to register entries.
 *
 * Kept here so callers never hand the engine a half-mapped row: every field the
 * engine reads is named once, in one place.
 */
export function toMdrEntry(row: {
  id?: string | null;
  sheet_number?: string | null;
  title?: string | null;
  revision_number?: string | null;
  drawing_set_name?: string | null;
  stage?: string | null;
  is_superseded?: boolean | null;
  callouts?: unknown;
  extracted_text?: string | null;
}): MdrEntry {
  return {
    id: row.id ?? null,
    sheetNumber: row.sheet_number ?? null,
    title: row.title ?? null,
    revisionNumber: row.revision_number ?? null,
    drawingSetName: row.drawing_set_name ?? null,
    stage: row.stage ?? null,
    isSuperseded: row.is_superseded ?? null,
    callouts: normalizeCallouts(row.callouts),
    extractedText: row.extracted_text ?? null,
  };
}

/** `drawings.callouts` is JSONB — narrow it without trusting its shape. */
export function normalizeCallouts(value: unknown): MdrEntry["callouts"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> =>
      !!item && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      targetSheetNumber:
        typeof item.targetSheetNumber === "string" ? item.targetSheetNumber : null,
      text: typeof item.text === "string" ? item.text : null,
    }));
}
