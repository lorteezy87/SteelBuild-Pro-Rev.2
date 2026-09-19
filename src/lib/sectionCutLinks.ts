/**
 * sectionCutLinks.ts — the typed deterministic boundary for Section Cut ↔ Sheet
 * cross-references, in BOTH directions.
 *
 * `calloutDetection` finds the references printed on a sheet and
 * `drawings.callouts` stores them. That is the FORWARD direction only: given a
 * sheet, what does it point at. `CalloutOverlay` answers it by scanning the
 * whole drawing list once per callout per render.
 *
 * This module builds both directions once, as indexes, and answers the question
 * the data could never answer before: *what references THIS sheet?*
 *
 * Three rules it will not bend, each one a bug this repo has already shipped:
 *
 *  1. **Resolution is by sheet NUMBER, at build time from the live register —
 *     never a stored id.** A callout pointing at S-401 must start resolving the
 *     moment S-401 is uploaded, with no rebuild job, because that is how sets
 *     actually arrive. A materialized `target_drawing_id` written at import
 *     would sit NULL forever. It also means a RENUMBERED sheet correctly goes
 *     unresolved: the issued PDF still says "3/S-401", and quietly retargeting
 *     it at the renamed sheet would route a detailer to a sheet the drawing
 *     never pointed at.
 *
 *  2. **An empty result is not "nothing references this sheet".** The register
 *     read is row-capped (EFFECTIVE_LIST_CAP), and a sheet past the cap is a
 *     sheet whose callouts were never read. `incoming()` therefore returns a
 *     `complete` flag beside the links, and the UI must say "none found" only
 *     when it is true. Same rule as *Absence is not evidence*.
 *
 *  3. **A sheet with no `callouts` value has not been harvested.** `null` /
 *     `undefined` means nobody looked (the column had no producer for a year);
 *     `[]` means the page was read and carried no references. `sourceHarvested`
 *     keeps the two apart so the UI never reports an unscanned sheet as clean.
 *
 * Pure: no React, no Supabase, no pdfjs. Takes plain rows.
 */

/** Canonical sheet-number key. Identical to `calloutSheetKey` in
 * calloutDetection and `normalizeSN` in drawingViewerUtils — the three must
 * agree or a link resolves in one place and not another. A test pins them. */
export function sheetKey(value: string | null | undefined): string {
  return String(value ?? "").toUpperCase().replace(/[\s\-_.]/g, "");
}

/** Box on the page, PDF user units, measured DOWN from the page top. */
export interface LinkCoords {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A callout as `drawings.callouts` stores it. Every field is optional because
 * the column is jsonb written by more than one generation of the app. */
export interface StoredCallout {
  targetSheetNumber?: string | null;
  text?: string | null;
  coords?: LinkCoords | null;
  /** Present on rows a human added rather than the detector. */
  origin?: string | null;
}

/** The register rows this engine reads. Deliberately narrow. */
export interface LinkableDrawing {
  id: string;
  sheet_number?: string | null;
  title?: string | null;
  /** jsonb. `null`/`undefined` = never harvested; `[]` = harvested, none found. */
  callouts?: StoredCallout[] | null;
}

export type LinkOrigin = "detected" | "manual";

export interface SectionCutLink {
  sourceDrawingId: string;
  sourceSheetNumber: string;
  sourceSheetTitle: string | null;
  /** Canonical key of the sheet the callout points AT. */
  targetKey: string;
  /** The target sheet number exactly as printed on the source sheet. */
  targetAsPrinted: string;
  /** The detail/section bubble number — the "3" in "3/S-401". Null when the
   * reference carried none ("SEE S-401"). */
  detailNumber: string | null;
  /** The reference exactly as printed. */
  rawText: string;
  coords: LinkCoords | null;
  origin: LinkOrigin;
}

/** A link whose target is in the register. */
export interface ResolvedSectionCutLink extends SectionCutLink {
  targetDrawingId: string;
  targetSheetNumber: string;
  targetSheetTitle: string | null;
}

/** A link whose target is NOT in the register — the sheet has not been
 * uploaded, or was renumbered after this sheet was issued. Never dropped: a
 * dangling reference is a coordination finding, not noise. */
export type UnresolvedSectionCutLink = SectionCutLink;

export interface OutgoingLinks {
  resolved: ResolvedSectionCutLink[];
  unresolved: UnresolvedSectionCutLink[];
  /** False when this sheet's `callouts` was null/undefined — nobody harvested
   * it. An empty `resolved`+`unresolved` then means UNKNOWN, not "none". */
  sourceHarvested: boolean;
}

export interface IncomingLinks {
  links: ResolvedSectionCutLink[];
  /** False when the register these were built from was row-capped, so a
   * referencing sheet may simply not have been read. */
  complete: boolean;
}

export interface SectionCutLinkIndex {
  /** What this sheet points AT. */
  outgoing(drawingId: string): OutgoingLinks;
  /** What points AT this sheet. */
  incoming(drawingId: string): IncomingLinks;
  /** Every link in the project, source order then target order. */
  all(): SectionCutLink[];
  /** Drawing ids that reference the given sheet — for register filtering. */
  sourcesReferencing(drawingId: string): string[];
  /** Drawing ids the given sheet references (resolved only) — for filtering. */
  targetsReferencedBy(drawingId: string): string[];
  /** Whether the register this index was built from was complete. */
  readonly registerComplete: boolean;
}

export interface BuildLinkIndexOptions {
  /**
   * False when the drawings read hit the row cap. Defaults to true, but a
   * caller reading a capped list MUST pass the real value — every
   * "nothing references this" claim downstream depends on it.
   */
  registerComplete?: boolean;
}

/**
 * Pull the detail/section number out of a printed reference.
 *
 * Handles the bubble forms a detailer actually writes:
 *   "3/S-401"        → "3"
 *   "SECTION 2/A201" → "2"
 *   "A/S-401"        → "A"       (lettered details are common on sections)
 *   "SEE S-401"      → null      (no bubble number)
 *
 * Returns null rather than guessing. The number is part of the link's identity
 * for dedupe, so a wrong one splits one link into two.
 */
export function parseDetailNumber(rawText: string | null | undefined, targetAsPrinted: string): string | null {
  const text = String(rawText ?? "").trim();
  if (!text) return null;
  const target = String(targetAsPrinted ?? "").trim();
  if (!target) return null;
  // Find the printed target inside the reference, then look immediately left
  // for "<token>/". Anchoring on the target keeps "3" from being read out of a
  // sheet number like "A-301".
  const idx = text.toUpperCase().lastIndexOf(target.toUpperCase());
  if (idx <= 0) return null;
  const before = text.slice(0, idx).trimEnd();
  if (!before.endsWith("/")) return null;
  const token = before.slice(0, -1).trimEnd().split(/[\s(]+/).pop() ?? "";
  // A bubble number is short and alphanumeric: "3", "12", "A", "2A".
  return /^[A-Za-z0-9]{1,3}$/.test(token) ? token.toUpperCase() : null;
}

function readOrigin(value: string | null | undefined): LinkOrigin {
  return value === "manual" ? "manual" : "detected";
}

/** Identity for dedupe: one link per (source, target, detail). Two printings of
 * the same reference on one sheet are ONE link — the spec's "prevent duplicate
 * links" — but "3/S-401" and "4/S-401" are two different links. */
function linkIdentity(link: SectionCutLink): string {
  return `${link.sourceDrawingId}\u0000${link.targetKey}\u0000${link.detailNumber ?? ""}`;
}

/**
 * Build both directions in one O(links) pass.
 *
 * Replaces `CalloutOverlay`'s per-callout `drawings.find(...)`, which is
 * O(callouts × sheets) on every render — ~226 sheets today, and the spec calls
 * for thousands.
 */
export function buildSectionCutLinkIndex(
  drawings: readonly LinkableDrawing[] | null | undefined,
  options: BuildLinkIndexOptions = {},
): SectionCutLinkIndex {
  const registerComplete = options.registerComplete !== false;
  const rows = drawings ?? [];

  // key → the sheet that owns it. First writer wins so a duplicate sheet
  // number resolves deterministically instead of by array order luck.
  const byKey = new Map<string, LinkableDrawing>();
  for (const row of rows) {
    if (!row?.id) continue;
    const key = sheetKey(row.sheet_number);
    if (key && !byKey.has(key)) byKey.set(key, row);
  }

  const outgoingBySource = new Map<string, OutgoingLinks>();
  const incomingByTarget = new Map<string, ResolvedSectionCutLink[]>();
  const everyLink: SectionCutLink[] = [];

  for (const row of rows) {
    if (!row?.id) continue;
    const harvested = Array.isArray(row.callouts);
    const bucket: OutgoingLinks = { resolved: [], unresolved: [], sourceHarvested: harvested };
    outgoingBySource.set(row.id, bucket);
    if (!harvested) continue;

    const seen = new Set<string>();
    const sourceSheetNumber = String(row.sheet_number ?? "");
    const sourceSheetTitle = row.title ?? null;

    for (const callout of row.callouts as StoredCallout[]) {
      const targetAsPrinted = String(callout?.targetSheetNumber ?? "").trim();
      const targetKey = sheetKey(targetAsPrinted);
      if (!targetKey) continue;
      // A sheet never references itself; a self-callout is a detection artifact.
      if (targetKey === sheetKey(sourceSheetNumber)) continue;

      const rawText = String(callout?.text ?? targetAsPrinted);
      const link: SectionCutLink = {
        sourceDrawingId: row.id,
        sourceSheetNumber,
        sourceSheetTitle,
        targetKey,
        targetAsPrinted,
        detailNumber: parseDetailNumber(rawText, targetAsPrinted),
        rawText,
        coords: callout?.coords ?? null,
        origin: readOrigin(callout?.origin),
      };

      const identity = linkIdentity(link);
      if (seen.has(identity)) continue;
      seen.add(identity);
      everyLink.push(link);

      const target = byKey.get(targetKey);
      if (!target) {
        bucket.unresolved.push(link);
        continue;
      }
      const resolved: ResolvedSectionCutLink = {
        ...link,
        targetDrawingId: target.id,
        targetSheetNumber: String(target.sheet_number ?? ""),
        targetSheetTitle: target.title ?? null,
      };
      bucket.resolved.push(resolved);
      const inbound = incomingByTarget.get(target.id);
      if (inbound) inbound.push(resolved);
      else incomingByTarget.set(target.id, [resolved]);
    }
  }

  const bySheetThenDetail = (a: SectionCutLink, b: SectionCutLink) =>
    a.sourceSheetNumber.localeCompare(b.sourceSheetNumber, undefined, { numeric: true })
    || String(a.detailNumber ?? "").localeCompare(String(b.detailNumber ?? ""), undefined, { numeric: true });

  for (const list of incomingByTarget.values()) list.sort(bySheetThenDetail);

  const EMPTY_OUTGOING: OutgoingLinks = { resolved: [], unresolved: [], sourceHarvested: false };
  const NO_INCOMING: ResolvedSectionCutLink[] = [];

  return {
    registerComplete,
    outgoing: (drawingId) => outgoingBySource.get(drawingId) ?? EMPTY_OUTGOING,
    incoming: (drawingId) => ({
      links: incomingByTarget.get(drawingId) ?? NO_INCOMING,
      complete: registerComplete,
    }),
    all: () => everyLink.slice(),
    sourcesReferencing: (drawingId) => {
      const seen = new Set<string>();
      for (const link of incomingByTarget.get(drawingId) ?? NO_INCOMING) seen.add(link.sourceDrawingId);
      return [...seen];
    },
    targetsReferencedBy: (drawingId) => {
      const seen = new Set<string>();
      for (const link of (outgoingBySource.get(drawingId) ?? EMPTY_OUTGOING).resolved) seen.add(link.targetDrawingId);
      return [...seen];
    },
  };
}

/**
 * The label a reference should carry in a list: "3/S-401" when it has a bubble
 * number, the printed sheet number when it does not. Never the raw text, which
 * can be a whole sentence ("SEE SECTION 3/S-401 FOR TYP.").
 */
export function linkLabel(link: SectionCutLink): string {
  return link.detailNumber ? `${link.detailNumber}/${link.targetAsPrinted}` : link.targetAsPrinted;
}

/**
 * Tooltip text. Carries sheet number, sheet title and the section cut
 * identifier, per the cross-reference spec, and says plainly when the target is
 * not in the register rather than rendering a dead link.
 */
export function linkTooltip(link: SectionCutLink | ResolvedSectionCutLink): string {
  const resolved = (link as ResolvedSectionCutLink).targetDrawingId
    ? (link as ResolvedSectionCutLink)
    : null;
  if (!resolved) {
    return `${link.rawText} — no sheet ${link.targetAsPrinted} in this register (not uploaded, or renumbered since this sheet was issued)`;
  }
  const title = resolved.targetSheetTitle ? ` · ${resolved.targetSheetTitle}` : "";
  const detail = link.detailNumber ? `Detail ${link.detailNumber} · ` : "";
  return `${detail}${resolved.targetSheetNumber}${title}`;
}

/** Tooltip for the reverse direction — shown on a "Referenced by" entry. */
export function backLinkTooltip(link: ResolvedSectionCutLink): string {
  const title = link.sourceSheetTitle ? ` · ${link.sourceSheetTitle}` : "";
  const detail = link.detailNumber ? ` (detail ${link.detailNumber})` : "";
  return `Referenced by ${link.sourceSheetNumber}${title}${detail}`;
}
