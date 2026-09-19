/**
 * pageTextFormat.ts — the shared contract for harvested PDF page text.
 *
 * Deliberately dependency-free. The producer (`pdfSheetExtractor`, which pulls
 * in pdfjs and the LLM client) and the consumer (`docControl/changeSummary`,
 * which is a pure engine with no React and no Supabase) both need to agree on
 * this format. Importing one from the other would drag pdfjs and the Supabase
 * client into the pure module and into every test that touches it, so the
 * agreement lives here instead, where it costs nothing to import.
 */

/**
 * Appended to a page whose text was cut at the per-page character cap.
 *
 * The stored text is later DIFFED. Two capped pages whose visible parts match
 * say nothing about what lies past the cap — it was never captured on either
 * side — so a consumer must not read that as "unchanged".
 */
export const PAGE_TEXT_TRUNCATION_MARKER = " …[truncated]";

/** True when this page text was cut at the harvest cap. */
export function isTruncatedPageText(text: string | null | undefined): boolean {
  return typeof text === "string" && text.endsWith(PAGE_TEXT_TRUNCATION_MARKER);
}
