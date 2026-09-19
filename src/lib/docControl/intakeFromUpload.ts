/**
 * docControl/intakeFromUpload.ts — adapt the revision-upload wizard's sheet
 * diff into Document Control records.
 *
 * The wizard has already matched incoming sheets against the drawing set using
 * `matchSheets` (exact sheet number, no guessing). This module reuses that
 * verdict rather than re-deriving it: the register scope inside the wizard IS
 * the drawing set it just diffed, and running a second, differently-scoped
 * match would let the review panel and the apply step disagree about which
 * sheet is which.
 *
 * Pure. No React, no Supabase.
 */

import { buildDocControlRecord } from "./record";
import { toMdrEntry } from "./mdr";
import type {
  DocControlAttestations,
  DocControlRecord,
  MdrEntry,
  RegisterCrossReference,
} from "./types";
import type { TitleBlockSource } from "./titleBlock";

/** An existing set sheet, as the wizard maps it out of a `drawings` row. */
export type UploadOldSheet = {
  id?: string | null;
  sheetNumber?: string | null;
  sheetTitle?: string | null;
  revisionNumber?: string | null;
  drawingSetName?: string | null;
  stage?: string | null;
  isSuperseded?: boolean | null;
  callouts?: unknown;
  extractedText?: string | null;
};

/** An incoming sheet, as the extractor produces it. */
export type UploadNewSheet = {
  sheetNumber?: string | null;
  sheetTitle?: string | null;
  revision?: string | null;
  date?: string | null;
  pdfPage?: unknown;
};

/** One row of the wizard's `matchSheets` output. */
export type UploadMatch = {
  sheetNumber?: string | null;
  change?: string | null;
  oldSheet?: UploadOldSheet | null;
  newSheet?: UploadNewSheet | null;
  ambiguousReason?: string | null;
};

export type IntakeInput = {
  matches: UploadMatch[];
  /** Cover-sheet metadata from the same extraction. */
  setMeta?: TitleBlockSource["setMeta"];
  /** True when the uploaded PDF had no text layer. */
  scanned: boolean;
  /** True when the set's marked titleblock rect supplied the revision. */
  revisionFromRect?: boolean;
  existingSet?: TitleBlockSource["existingSet"];
  projectId: string | null;
  /** Per-page text keyed by 1-indexed PDF page, when the caller harvested it. */
  pageTextByPdfPage?: Record<number, string> | null;
  /**
   * Reviewer attestations, keyed by exact incoming sheet number.
   *
   * Keyed by sheet number on purpose: a document with no readable sheet number
   * cannot be attested, because the attestation would not be attached to any
   * identifiable sheet. Such a document is already a blocker for exactly that
   * reason, and the fix is to key the number in, not to sign for it blind.
   */
  attestationsBySheetNumber?: Record<string, Partial<DocControlAttestations>>;
  now?: Date;
};

/**
 * Build one Document Control record per INCOMING sheet.
 *
 * "removed" matches are skipped — a sheet that is in the set but not in this
 * upload is a supersede decision the wizard already owns, not a document
 * arriving for control.
 */
export function buildIntakeRecords(input: IntakeInput): DocControlRecord[] {
  const out: DocControlRecord[] = [];

  for (const match of input.matches || []) {
    const incoming = match?.newSheet;
    if (!incoming) continue;

    const pdfPage = Number(incoming.pdfPage);
    const pageText =
      input.pageTextByPdfPage && Number.isFinite(pdfPage)
        ? input.pageTextByPdfPage[pdfPage] ?? null
        : null;

    out.push(
      buildDocControlRecord({
        projectId: input.projectId,
        titleBlock: {
          scanned: input.scanned,
          setMeta: input.setMeta,
          sheet: {
            sheetNumber: incoming.sheetNumber ?? "",
            revision: incoming.revision ?? "",
            date: incoming.date ?? "",
          },
          revisionFromRect: input.revisionFromRect,
          existingSet: input.existingSet,
        },
        attestationSource: { scanned: input.scanned, pageText },
        attestationOverrides: attestationsFor(input, incoming.sheetNumber),
        registerOverride: registerFromMatch(match),
        incoming: {
          title: incoming.sheetTitle ?? null,
          // The wizard does not harvest per-sheet text, so this stays null and
          // the change summary says the text layer is not comparable rather
          // than reporting a clean diff it never ran.
          extractedText: null,
          callouts: [],
        },
        now: input.now,
      }),
    );
  }

  return out;
}

/**
 * Translate one `matchSheets` verdict into a register cross-reference.
 *
 * The mapping is deliberately lossless about uncertainty: an "ambiguous" match
 * becomes a duplicate or an unidentified document — never a quiet "new sheet".
 */
export function registerFromMatch(match: UploadMatch): RegisterCrossReference {
  const sheetNumber = String(match?.sheetNumber ?? "").trim();
  const change = String(match?.change ?? "").trim();

  if (change === "revised" && match.oldSheet) {
    const matched = toEntry(match.oldSheet);
    return {
      status: "revision-of-record",
      matched,
      candidates: [matched],
      note: `Matches sheet ${sheetNumber} in this set${
        matched.revisionNumber ? ` at revision ${matched.revisionNumber}` : ""
      }.`,
    };
  }

  if (change === "added") {
    return {
      status: "new-to-register",
      matched: null,
      candidates: [],
      note: `Sheet ${sheetNumber} is not in this set — it arrives as a new sheet.`,
    };
  }

  if (change === "ambiguous") {
    if (!sheetNumber) {
      return {
        status: "unidentified",
        matched: null,
        candidates: [],
        note: match.ambiguousReason || "The incoming sheet carries no sheet number.",
      };
    }
    return {
      status: "duplicate-in-register",
      matched: null,
      candidates: match.oldSheet ? [toEntry(match.oldSheet)] : [],
      note: match.ambiguousReason || `Sheet number ${sheetNumber} is ambiguous in this set.`,
    };
  }

  // Any other verdict is one this adapter has not been taught. Refusing to
  // guess is the whole point of the module.
  return {
    status: "unidentified",
    matched: null,
    candidates: [],
    note: `Unrecognised match verdict "${change || "(none)"}" — review this sheet by hand.`,
  };
}

function attestationsFor(
  input: IntakeInput,
  sheetNumber: string | null | undefined,
): Partial<DocControlAttestations> | undefined {
  const key = String(sheetNumber ?? "").trim();
  if (!key) return undefined;
  return input.attestationsBySheetNumber?.[key];
}

function toEntry(old: UploadOldSheet): MdrEntry {
  return toMdrEntry({
    id: old.id ?? null,
    sheet_number: old.sheetNumber ?? null,
    title: old.sheetTitle ?? null,
    revision_number: old.revisionNumber ?? null,
    drawing_set_name: old.drawingSetName ?? null,
    stage: old.stage ?? null,
    is_superseded: old.isSuperseded ?? null,
    callouts: old.callouts,
    extracted_text: old.extractedText ?? null,
  });
}
