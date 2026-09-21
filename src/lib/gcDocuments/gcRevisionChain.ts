import { normNum } from "@/lib/fabReleaseGate";

/**
 * gcRevisionChain — work out which other GC rows are versions of the sheet the
 * user is looking at, so two of them can be compared.
 *
 * Why this is not just `superseded_by_id`
 * ---------------------------------------
 * GC documents have no `drawing_revisions` table. The shop-drawing side gets a
 * clean per-sheet history from the slip-sheet flow; the GC side has only two
 * self-referential columns, and as of 2026-09-19 they are populated on **0 of
 * 146** production rows. A candidate list built on the link alone would be
 * empty on every real project — the feature would ship dead.
 *
 * So the chain is built from two sources and says which one it used:
 *   - the explicit `superseded_by_id` link, walked both ways, when present;
 *   - otherwise, other rows in the same project carrying the same sheet number.
 *
 * Number matching uses the canonical `normNum` from fabReleaseGate rather than
 * a local variant. CLAUDE.md records two shipped bugs from hand-rolled
 * normalizers that split differently, and a third would be on us.
 *
 * What it will not do
 * -------------------
 * Guess. A sheet whose number failed extraction ("2 SE303" is a real row in
 * production, from "SE303") does not normalize onto its sibling, and that is
 * correct: silently pairing it would show a PM a diff between two unrelated
 * sheets and let them act on it. An unnumbered row matches nothing at all —
 * without the empty-key guard, every untitled sheet would become a "version" of
 * every other untitled sheet.
 */

export interface GcChainSheet {
  id: string;
  project_id?: string | null;
  gc_drawing_set_id?: string | null;
  drawing_number?: string | null;
  title?: string | null;
  revision?: string | null;
  file_url?: string | null;
  pdf_page?: number | null;
  is_superseded?: boolean | null;
  superseded_by_id?: string | null;
}

export interface GcChainSet {
  id: string;
  set_name?: string | null;
  doc_type?: string | null;
  doc_number?: string | null;
  issued_date?: string | null;
  received_date?: string | null;
}

export interface GcCompareCandidate {
  /** The gc_drawings id. */
  key: string;
  /** What the issuance was, as a PM names it: "ASI 012 · 2026-09-01". */
  label: string;
  fileUrl: string;
  pdfPage: number;
  /** Issuance date used for ordering, or null when the set carries no date. */
  issuedOn: string | null;
  isSuperseded: boolean;
  /** True when this row was reached through an explicit supersession link. */
  linked: boolean;
  /** True for the row the viewer currently has open. */
  isActive: boolean;
}

/**
 * Why no comparison is on offer. `null` means candidates are available.
 * Each value is a genuinely different situation and the UI must not collapse
 * them — "nothing to compare" reads as a broken feature, "we have only one
 * version of this sheet" reads as the fact it is.
 */
export type GcCompareUnavailable =
  | "no-sheet"
  | "no-file"
  | "single-version"
  | "versions-without-files";

export interface GcCompareModel {
  /** Comparable versions (file present), newest issuance first. */
  candidates: GcCompareCandidate[];
  /** Versions of this sheet found, whether or not a PDF is attached. */
  versionCount: number;
  /** Of those, how many are logged but have no PDF to render. */
  withoutFile: number;
  /** True when at least one candidate came from an explicit supersession link. */
  usedLinks: boolean;
  unavailable: GcCompareUnavailable | null;
}

/** The date an issuance reached us. Issued wins; received is the fallback. */
function issuanceDate(set: GcChainSet | undefined): string | null {
  const raw = set?.issued_date || set?.received_date || null;
  return raw ? String(raw).slice(0, 10) : null;
}

function issuanceLabel(sheet: GcChainSheet, set: GcChainSet | undefined): string {
  const name = set?.doc_number || set?.set_name || "Unfiled";
  const date = issuanceDate(set);
  // The GC's own revision string, when they gave one. Free text on purpose —
  // an ASI carries whatever the architect stamped, not our stage ladder.
  const rev = sheet.revision && String(sheet.revision).trim() ? `Rev ${sheet.revision}` : null;
  return [name, rev, date].filter(Boolean).join(" · ");
}

/**
 * Collect the ids reachable from `activeId` through explicit supersession
 * links, in both directions. Cycle-safe: a bad link that points back into the
 * chain must not hang the viewer.
 */
function linkedIds(active: GcChainSheet, byId: Map<string, GcChainSheet>): Set<string> {
  const seen = new Set<string>([active.id]);

  // Forward: this sheet was superseded by X, which was superseded by Y…
  let cursor: GcChainSheet | undefined = active;
  while (cursor?.superseded_by_id) {
    const next: string = cursor.superseded_by_id;
    if (seen.has(next)) break;
    seen.add(next);
    cursor = byId.get(next);
    if (!cursor) break;
  }

  // Backward: repeatedly pull in anything pointing at a row already in the set.
  // One pass per row is the worst case, so cap the sweeps at the table size.
  const rows = Array.from(byId.values());
  for (let sweep = 0; sweep < rows.length; sweep++) {
    let grew = false;
    for (const row of rows) {
      if (row.superseded_by_id && seen.has(row.superseded_by_id) && !seen.has(row.id)) {
        seen.add(row.id);
        grew = true;
      }
    }
    if (!grew) break;
  }

  return seen;
}

export interface BuildGcCompareModelArgs {
  active: GcChainSheet | null | undefined;
  /** Every GC sheet loaded for the project. */
  sheets: readonly GcChainSheet[];
  /** The issuances those sheets belong to, for labels and ordering. */
  sets: readonly GcChainSet[];
}

export function buildGcCompareModel({
  active,
  sheets,
  sets,
}: BuildGcCompareModelArgs): GcCompareModel {
  const empty: GcCompareModel = {
    candidates: [],
    versionCount: 0,
    withoutFile: 0,
    usedLinks: false,
    unavailable: "no-sheet",
  };
  if (!active) return empty;

  const setsById = new Map(sets.map((s) => [s.id, s]));
  const byId = new Map(sheets.map((s) => [s.id, s]));

  const links = linkedIds(active, byId);
  const activeKey = normNum(active.drawing_number);

  // An unnumbered sheet has an empty key. Matching on it would pool every
  // unnumbered row in the project into one bogus revision chain.
  const versions = sheets.filter((s) => {
    if (s.id === active.id) return true;
    if (links.has(s.id)) return true;
    if (!activeKey) return false;
    return normNum(s.drawing_number) === activeKey;
  });

  const withFile = versions.filter((s) => !!s.file_url);
  const withoutFile = versions.length - withFile.length;

  const candidates: GcCompareCandidate[] = withFile
    .map((sheet) => {
      const set = sheet.gc_drawing_set_id ? setsById.get(sheet.gc_drawing_set_id) : undefined;
      return {
        key: sheet.id,
        label: issuanceLabel(sheet, set),
        fileUrl: String(sheet.file_url),
        pdfPage: Number(sheet.pdf_page) || 1,
        issuedOn: issuanceDate(set),
        isSuperseded: !!sheet.is_superseded,
        linked: sheet.id !== active.id && links.has(sheet.id),
        isActive: sheet.id === active.id,
      };
    })
    .sort((a, b) => {
      // Newest issuance first, so the default pair is "latest vs the one before".
      // A set with no date sorts last: unknown is not "oldest", it is unknown,
      // and pretending otherwise would put an undated reissue under the original.
      if (a.issuedOn !== b.issuedOn) {
        if (!a.issuedOn) return 1;
        if (!b.issuedOn) return -1;
        return a.issuedOn < b.issuedOn ? 1 : -1;
      }
      // Two issuances on the same date cannot be ordered by date. Fall back to
      // the id purely so the list is stable between renders; the label carries
      // the date, so the ambiguity stays visible to the reader.
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });

  let unavailable: GcCompareUnavailable | null = null;
  if (!active.file_url) unavailable = "no-file";
  else if (candidates.length < 2) {
    unavailable = versions.length > 1 ? "versions-without-files" : "single-version";
  }

  return {
    candidates,
    versionCount: versions.length,
    withoutFile,
    usedLinks: candidates.some((c) => c.linked),
    unavailable,
  };
}
