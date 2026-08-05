/**
 * rfiDedup — deterministic duplicate-RFI detector (slice 2 of the RFI workflow
 * backbone). Pure, no AI, no I/O.
 *
 * Addresses the recurring "we asked this already / RFI 007 vs 008" pain: given
 * an in-progress RFI draft and the project's existing RFIs, it returns likely
 * duplicates ranked by a blend of token-overlap (Jaccard) on title+question and
 * STRUCTURAL signals — same drawing reference, spec section, drawing set, work
 * package, area/sequence, or overlapping piece marks. Each signal adds a
 * weighted boost and a human-readable reason. Surfaced as a non-blocking
 * warning in the composer so the author links the prior RFI instead of
 * re-asking.
 *
 * Semantic / embedding-based matching is a deliberate FUTURE enhancement; this
 * layer stays deterministic so it's unit-testable and never calls out.
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

const norm = (v: unknown): string => String(v ?? "").trim().toLowerCase();

/** Piece marks → set of normalized tokens (comma / space / semicolon separated). */
function markSet(r: Record<string, any>): Set<string> {
  return new Set(norm(r?.piece_marks).split(/[\s,;]+/).filter(Boolean));
}

function sharedMarks(a: Set<string>, b: Set<string>): string[] {
  if (!a.size || !b.size) return [];
  const out: string[] = [];
  for (const x of a) if (b.has(x)) out.push(x);
  return out;
}

// Structural-signal weights — how much each shared attribute boosts confidence
// on top of the wording overlap. Specific signals (a sheet, a piece mark) weigh
// more than broad ones (a whole drawing set). A single broad signal can't reach
// the surface threshold (0.4) alone — it takes real wording overlap or a second
// signal — which keeps false positives down.
const WEIGHT = {
  drawingReference: 0.25,
  pieceMarks: 0.2,
  specSection: 0.2,
  workPackage: 0.15,
  areaSequence: 0.12,
  drawingSet: 0.1,
};

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

  const dRef = norm(draft?.drawing_reference);
  const dSpec = norm(draft?.spec_section);
  const dSet = draft?.drawing_set_id || null;
  const dWp = draft?.work_package_id || null;
  const dArea = norm(draft?.area_sequence);
  const dMarks = markSet(draft);

  const matches: DuplicateMatch[] = [];
  for (const r of existing) {
    if (!r || r.id === draft?.id || r.is_deleted) continue;
    const rTokens = tokenSet(`${r.title || ""} ${r.question || ""}`);
    let score = jaccard(draftTokens, rTokens);
    const reasons: string[] = [];
    if (score >= 0.2) reasons.push(`${Math.round(score * 100)}% wording overlap`);

    if (dRef && norm(r.drawing_reference) === dRef) {
      score += WEIGHT.drawingReference;
      reasons.push(`Same drawing (${r.drawing_reference})`);
    }
    if (dSpec && norm(r.spec_section) === dSpec) {
      score += WEIGHT.specSection;
      reasons.push(`Same spec (${r.spec_section})`);
    }
    if (dSet && r.drawing_set_id === dSet) {
      score += WEIGHT.drawingSet;
      reasons.push("Same drawing set");
    }
    if (dWp && r.work_package_id === dWp) {
      score += WEIGHT.workPackage;
      reasons.push("Same work package");
    }
    if (dArea && norm(r.area_sequence) === dArea) {
      score += WEIGHT.areaSequence;
      reasons.push(`Same area/sequence (${r.area_sequence})`);
    }
    const shared = sharedMarks(dMarks, markSet(r));
    if (shared.length) {
      score += WEIGHT.pieceMarks;
      reasons.push(`Shared piece mark${shared.length > 1 ? "s" : ""} (${shared.slice(0, 3).map((m) => m.toUpperCase()).join(", ")})`);
    }

    score = Math.min(1, score);
    if (score >= threshold) matches.push({ rfi: r, score, reasons });
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
