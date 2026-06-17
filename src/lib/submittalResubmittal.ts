/**
 * submittalResubmittal.ts — Pure helpers for the "stronger resubmittal"
 * workflow (§20).
 *
 * When a reviewer returns a submittal Revise-and-Resubmit, the detailer
 * owes a fresh round that ADDRESSES every open reviewer comment. The
 * structured reviewer feedback already lives, round-scoped, in
 * `submittal_sheet_responses` (per-sheet `response_status` +
 * `reviewer_comment`). These helpers pick the responses that still require
 * detailer action and carry them forward into the next round so nothing is
 * dropped between rounds — no new schema needed.
 *
 * "Unresolved" = a reviewer disposition that requires another round:
 *   Revise and Resubmit, Rejected, See Comments
 * "No Exception" and "Approved as Noted" are clear-to-fabricate and need no
 * resubmission, so they are never carried forward.
 *
 * Pure: no React, no Supabase, no side effects, no `new Date()`.
 */

export const UNRESOLVED_RESPONSE_STATUSES = new Set<string>([
  "Revise and Resubmit",
  "Rejected",
  "See Comments",
]);

export interface SheetResponse {
  submittal_round_id?: string | null;
  drawing_id?: string | null;
  drawing_set_id?: string | null;
  sheet_number?: string | null;
  response_status?: string | null;
  reviewer_comment?: string | null;
}

export interface RoundLike {
  id: string;
  round_number?: number | null;
}

export interface OpenItem {
  drawing_id: string | null;
  sheet_number: string;
  response_status: string;
  reviewer_comment: string;
}

/**
 * The subset of a returned round's sheet responses that still require
 * detailer action, normalized for display + carry-forward. Order is
 * preserved (reviewers tend to comment top-down through the set).
 */
export function collectOpenItems(
  responses: SheetResponse[] | null | undefined,
): OpenItem[] {
  if (!Array.isArray(responses)) return [];
  return responses
    .filter(
      (r) => r && UNRESOLVED_RESPONSE_STATUSES.has(String(r.response_status)),
    )
    .map((r) => ({
      drawing_id: r.drawing_id ?? null,
      sheet_number: (r.sheet_number || "").trim() || "—",
      response_status: String(r.response_status),
      reviewer_comment: (r.reviewer_comment || "").trim(),
    }));
}

/**
 * Choose which round's responses to carry forward into the next round.
 *
 * The round model logs a row per status event, so the latest round is often
 * the bare status-change event (no per-sheet responses). The reviewer's
 * actual dispositions live on the most recent round that was actually
 * reviewed — so we walk the rounds newest-first and return the first one
 * that carries any sheet responses.
 *
 * @param roundsAsc  rounds for one submittal, ascending by round_number
 * @param responses  all sheet responses for that submittal
 */
export function pickCarryForwardResponses(
  roundsAsc: RoundLike[] | null | undefined,
  responses: SheetResponse[] | null | undefined,
): { round: RoundLike | null; responses: SheetResponse[] } {
  const rounds = Array.isArray(roundsAsc) ? roundsAsc : [];
  const all = Array.isArray(responses) ? responses : [];
  for (let i = rounds.length - 1; i >= 0; i--) {
    const round = rounds[i];
    if (!round?.id) continue;
    const forRound = all.filter((r) => r && r.submittal_round_id === round.id);
    if (forRound.length > 0) return { round, responses: forRound };
  }
  return { round: null, responses: [] };
}

/**
 * Seed text for the new round's response_notes: a checklist of the open
 * items carried from the prior round so the detailer's resubmittal cover
 * note starts with exactly what must be addressed. Returns "" when there
 * is nothing to carry (graceful no-op — the modal behaves as before).
 */
export function formatCarryForwardNotes(
  prevRoundNumber: number | null | undefined,
  openItems: OpenItem[] | null | undefined,
): string {
  const items = Array.isArray(openItems) ? openItems : [];
  if (items.length === 0) return "";
  const rn = Number(prevRoundNumber) || null;
  const count = items.length;
  const noun = count === 1 ? "comment" : "comments";
  const header = rn
    ? `Resubmittal addressing ${count} reviewer ${noun} from Round ${rn}:`
    : `Resubmittal addressing ${count} reviewer ${noun}:`;
  const lines = items.map((it) => {
    const comment = it.reviewer_comment ? ` — ${it.reviewer_comment}` : "";
    return `• Sheet ${it.sheet_number} (${it.response_status})${comment}`;
  });
  return [header, ...lines].join("\n");
}
