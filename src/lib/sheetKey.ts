/**
 * sheetKey.ts — the one sheet-number key every sheet matcher shares.
 *
 * "S-201", "S201", "s 201" and "S.201" are the same sheet. The same-set
 * replace in the upload wizard (planExistingSetSheetReplace), the cross-set
 * supersede proposal (crossSetSupersede.ts) and the Detailing Validation
 * duplicate-sheet rule all key sheets with normalizeSheetKey, so they can never
 * disagree about whether two sheets share a number.
 *
 * Kept free of imports on purpose: drawingSetUploadHelpers.js pulls in pdf.js,
 * so pure callers import the key from here instead.
 */

/** Uppercase, with '-', '.' and whitespace stripped. Moved unchanged from drawingSetUploadHelpers.js. */
export function normalizeSheetKey(value: unknown): string {
  return String(value || "").toUpperCase().replace(/[-.\s]/g, "");
}

/** Uppercase, whitespace collapsed, trimmed. Exact comparison only — no fuzzy matching. */
export function normalizeSheetTitle(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}
