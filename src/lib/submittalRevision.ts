/**
 * submittalRevision.ts — pure revision-bump logic for the submittal moat.
 *
 * Phase 2 of the phased submittal-logic integration. When a Revise & Resubmit
 * (or Rejected) verdict opens a NEW round, the drawing revision should advance
 * to its next value — e.g. "0" → "1", "A" → "B", "Rev 2" → "Rev 3". Today the
 * `submittals.revision` text column is set by hand; this module supplies the
 * deterministic next-value logic so the round-creation path can auto-bump it,
 * behind the `submittal_revision_autobump` feature flag.
 *
 * `bumpRevision` is ported verbatim from the S&H Submittal Tracker
 * (src/lib/lifecycle.ts) so the two apps agree on the sequence. It is PURE —
 * no React, no Supabase, no clock — and unit-tested against the tracker's cases
 * (see src/lib/__tests__/submittalRevision.test.ts).
 */

import { isRRStatus } from "@/lib/submittalStageMapping";

/**
 * Bump a drawing revision to its next value. Numeric revisions increment
 * ("0" → "1", "9" → "10"), single letters advance ("A" → "B", "Z" → "AA"),
 * labels with a trailing number increment that number ("Rev 2" → "Rev 3"), and
 * an empty/null/undefined revision starts at "1".
 */
export function bumpRevision(rev: string | null | undefined): string {
  const r = (rev ?? "").trim();
  if (r === "") return "1";
  if (/^\d+$/.test(r)) return String(Number(r) + 1);
  if (/^[A-Za-z]$/.test(r)) {
    if (r === "Z") return "AA";
    if (r === "z") return "aa";
    return String.fromCharCode(r.charCodeAt(0) + 1);
  }
  const m = r.match(/^(.*?)(\d+)$/);
  if (m) return `${m[1]}${Number(m[2]) + 1}`;
  return `${r}1`;
}

/**
 * Decide whether a round-creation should auto-bump the text revision.
 *
 * Pure gating predicate so the "resubmit + flag" decision is unit-testable
 * without React or Supabase. Returns true only when BOTH:
 *   - the flag is on, AND
 *   - the PRIOR disposition was a genuine resubmit (Revise and Resubmit /
 *     Rejected) — i.e. this new round exists because the reviewer sent it back,
 *     not because it's the first submission or a plain forward move.
 *
 * `priorStatus` is the submittal's status BEFORE this move. When the flag is
 * off, this is always false, so revision is left untouched (today's manual
 * behavior — no change for anyone without the flag). "Genuine resubmit" reuses
 * the canonical `isRRStatus` predicate so we never disagree with the rest of
 * the moat on what counts as an R&R (loop-back) outcome.
 */
export function shouldBumpRevisionOnResubmit(
  priorStatus: string | null | undefined,
  flagOn: boolean,
): boolean {
  if (!flagOn) return false;
  return isRRStatus(priorStatus);
}
