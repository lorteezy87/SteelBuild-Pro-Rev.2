/**
 * rfiDedup — deterministic duplicate-RFI detector (slice 2 of the RFI
 * workflow backbone). Pure, no AI, no I/O.
 *
 * Addresses the recurring "we asked this already / RFI 007 vs 008" pain:
 * given an in-progress RFI draft and the project's existing RFIs, it returns
 * likely duplicates ranked by a token-overlap (Jaccard) similarity of the
 * title+question, boosted when both RFIs cite the same drawing/spec
 * reference. Surfaced as a non-blocking warning in the composer so the author
 * can link to the prior RFI instead of re-asking.
 */

// Construction-RFI filler words that carry no disambiguating signal — dropped
// before similarity so "Please confirm the bolt grade" and "Confirm bolt
// grade?" still match strongly.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "is", "are", "be", "on",
  "in", "at", "with", "this", "that", "what", "which", "how", "do", "does",
  "can", "we", "i", "should", "please", "confirm", "clarify", "provide",
  "need", "needed", "rfi", "regarding", "re", "per", "see", "detail",
]);

export function normalizeQuestion(text: unknown): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function tokenSet(text: unknown): Set<string> {
  return new Set(normalizeQuestion(text));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function normRef(r: Record<string, any>): string | null {
  return String(r?.drawing_reference || r?.spec_section || "").trim().toLowerCase() || null;
}

export interface DuplicateMatch {
  rfi: Record<string, any>;
  /** 0–1 confidence. */
  score: number;
  reasons: string[];
}

export interface DedupOptions {
  /** Minimum confidence to surface a match (default 0.4). */
  threshold?: number;
  /** Max matches returned (default 5). */
  limit?: number;
}

export function findDuplicateRfis(
  draft: Record<string, any>,
  existing: Array<Record<string, any>> = [],
  opts: DedupOptions = {},
): DuplicateMatch[] {
  const threshold = opts.threshold ?? 0.4;
  const limit = opts.limit ?? 5;
  const draftTokens = tokenSet(`${draft?.title || ""} ${draft?.question || ""}`);
  // Not enough signal to judge similarity yet — don't cry wolf on a 1-word draft.
  if (draftTokens.size < 2) return [];
  const draftRef = normRef(draft);

  const matches: DuplicateMatch[] = [];
  for (const r of existing) {
    if (!r || r.id === draft?.id || r.is_deleted) continue;
    const rTokens = tokenSet(`${r.title || ""} ${r.question || ""}`);
    let score = jaccard(draftTokens, rTokens);
    const reasons: string[] = [];
    if (score >= 0.2) reasons.push(`${Math.round(score * 100)}% wording overlap`);

    const rRef = normRef(r);
    if (draftRef && rRef && draftRef === rRef) {
      score = Math.min(1, score + 0.2);
      reasons.push(`Same reference (${r.drawing_reference || r.spec_section})`);
    }

    if (score >= threshold) matches.push({ rfi: r, score, reasons });
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
