/**
 * calloutDetection.ts — find cross-sheet references in a drawing's text.
 *
 * A callout is a reference printed on one sheet that points at another:
 * "SEE S-401", "3/S-401", "SECTION 2/S-301". Detecting them is what lets the
 * viewer draw clickable jump targets and lets Document Control report that a
 * revision now leans on a detail sheet it did not reference before.
 *
 * This is the producer for `drawings.callouts`, which — exactly like
 * `extracted_text` before it — the upload helper has always read off
 * `sheet.callouts` and which nothing ever set, leaving the column empty on
 * every row the app had written.
 *
 * Two things this module refuses to do, both because a wrong callout is worse
 * than no callout:
 *
 *  1. It never emits a reference without coordinates. `CalloutOverlay` skips a
 *     callout that has no `coords`, so a coordinate-less record is an entry
 *     that shows in the context list and can never be found on the sheet.
 *     Detection therefore runs on POSITIONED text items, not on joined lines.
 *
 *  2. It never guesses. Every pattern requires an explicit cue — a "SEE"-class
 *     verb, a detail-bubble slash, or a "DETAIL"/"SECTION" label — and a target
 *     shaped like a real sheet number (letters then digits). A bare token that
 *     merely looks like a sheet number is left alone: drawings are full of
 *     grid marks, bar marks and dimensions that would otherwise become false
 *     jump targets pointing at the wrong steel.
 *
 * Pure. No pdfjs, no React, no Supabase — it takes plain positioned items so
 * it can be tested without a PDF.
 */

/** A positioned run of text, as the PDF text layer reports it. */
export type PositionedTextItem = {
  str: string;
  /** Left edge, PDF user units. */
  x: number;
  /** Text BASELINE, PDF user units, measured up from the page bottom. */
  y: number;
  width: number;
  /** Glyph height in PDF user units; falls back to DEFAULT_ITEM_HEIGHT. */
  height?: number;
};

/** Box on the page, PDF user units, measured DOWN from the page top. */
export type CalloutCoords = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DetectedCallout = {
  targetSheetNumber: string;
  /** The reference exactly as printed. */
  text: string;
  coords: CalloutCoords;
};

/** Used when the text layer reports no usable glyph height. */
const DEFAULT_ITEM_HEIGHT = 8;

/**
 * Most callouts a single sheet can carry.
 *
 * A pathological page — a drawing index, a revision log — can mention hundreds
 * of sheets, and every one would be written into a JSONB column and rendered
 * as an overlay button. The cap keeps one bad page from bloating the row.
 */
export const MAX_CALLOUTS_PER_SHEET = 60;

/**
 * A sheet number as printed: one to three letters, an optional separator, one
 * to three digits, and an optional decimal. Shared by every pattern below so
 * "what counts as a sheet number" is defined once.
 */
const SHEET = "[A-Z]{1,3}[-.]?\\d{1,3}(?:\\.\\d{1,2})?";

/**
 * The cues that make a token a reference rather than a coincidence. Ordered
 * most explicit first; the first pattern that matches an item wins.
 */
const PATTERNS: RegExp[] = [
  // "SEE SHEET S-401", "REFER TO DWG S401", "PER S-401"
  new RegExp(`\\b(?:SEE|REFER(?:\\s+TO)?|REF\\.?|PER)\\s+(?:SHEET\\s+|DWG\\.?\\s+|DRAWING\\s+)?(${SHEET})\\b`, "i"),
  // "DETAIL A/S-401", "SECTION 2/S301", "ELEVATION B / S-201"
  new RegExp(`\\b(?:DETAIL|SECTION|ELEV(?:ATION)?|TYP\\.?)\\s+[A-Z0-9]{1,3}\\s*/\\s*(${SHEET})\\b`, "i"),
  // Bare detail-bubble form: "3/S-401", "A/S301". The slash IS the cue.
  new RegExp(`\\b[A-Z0-9]{1,3}\\s*/\\s*(${SHEET})\\b`, "i"),
];

/**
 * Canonical comparison key for a sheet number.
 *
 * Matches `normalizeSN` in `src/pages/drawingViewer/drawingViewerUtils.js`,
 * which is what the viewer and the context panel use to resolve a callout
 * against the project's drawings. Detection and resolution must agree, or a
 * callout is detected here and never matches anything there.
 */
export function calloutSheetKey(value: string | null | undefined): string {
  return String(value ?? "").toUpperCase().replace(/[\s\-_.]/g, "");
}

export type DetectCalloutsOptions = {
  /** Page height in PDF user units — needed to flip baselines to top-down. */
  pageHeight: number;
  /** This sheet's own number, so it is never reported as referencing itself. */
  selfSheetNumber?: string | null;
  /** Override for tests. */
  maxCallouts?: number;
};

/**
 * Detect cross-sheet callouts among a page's positioned text items.
 *
 * Coordinates come back measured DOWN from the page top, which is what
 * `CalloutOverlay` positions with; PDF baselines measure UP from the bottom,
 * so they are flipped here rather than in the renderer.
 *
 * Duplicates (the same target referenced by the same words) collapse to the
 * first occurrence — a sheet that says "SEE S-401" eleven times references
 * S-401 once.
 */
export function detectCallouts(
  items: readonly PositionedTextItem[] | null | undefined,
  options: DetectCalloutsOptions,
): DetectedCallout[] {
  const pageHeight = Number(options?.pageHeight);
  if (!Number.isFinite(pageHeight) || pageHeight <= 0) return [];

  const limit = Number.isFinite(options?.maxCallouts)
    ? Math.max(0, Number(options.maxCallouts))
    : MAX_CALLOUTS_PER_SHEET;
  const selfKey = calloutSheetKey(options?.selfSheetNumber);

  const out: DetectedCallout[] = [];
  const seen = new Set<string>();

  for (const item of items || []) {
    if (out.length >= limit) break;
    const str = typeof item?.str === "string" ? item.str : "";
    if (!str.trim()) continue;

    const target = firstMatch(str);
    if (!target) continue;

    const key = calloutSheetKey(target);
    // A sheet referencing itself is a detail bubble pointing at this very
    // page, not a cross-sheet jump. Rendering it would be a button that goes
    // nowhere.
    if (!key || key === selfKey) continue;
    // Dedupe on target AND wording, so "SEE S-401" and "3/S-401" both survive
    // — they are different references a reviewer may want to find separately.
    const dedupeKey = `${key}::${str.trim().toUpperCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      targetSheetNumber: target.toUpperCase(),
      text: str.trim(),
      coords: toTopDownBox(item, pageHeight),
    });
  }

  return out;
}

function firstMatch(str: string): string | null {
  for (const pattern of PATTERNS) {
    const m = pattern.exec(str);
    if (m && m[1]) return m[1];
  }
  return null;
}

/**
 * Convert a text item's baseline box to a top-down box.
 *
 * PDF user space puts the origin at the page's bottom-left and reports a text
 * run's baseline; CSS puts it at the top-left. The glyph box sits ABOVE its
 * baseline, so the top edge is `pageHeight - (baseline + height)`.
 */
function toTopDownBox(item: PositionedTextItem, pageHeight: number): CalloutCoords {
  const height = Number.isFinite(item?.height) && Number(item.height) > 0
    ? Number(item.height)
    : DEFAULT_ITEM_HEIGHT;
  const width = Number.isFinite(item?.width) && Number(item.width) > 0
    ? Number(item.width)
    : Math.max(12, String(item?.str ?? "").length * 5);
  const x = Number.isFinite(item?.x) ? Number(item.x) : 0;
  const baseline = Number.isFinite(item?.y) ? Number(item.y) : 0;

  return {
    x: round2(Math.max(0, x)),
    y: round2(Math.max(0, pageHeight - (baseline + height))),
    width: round2(width),
    height: round2(height),
  };
}

/** Keep the stored JSON small and stable; sub-point precision is noise. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
