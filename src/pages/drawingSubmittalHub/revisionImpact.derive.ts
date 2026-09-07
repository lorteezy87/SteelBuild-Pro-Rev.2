/**
 * Pure derivations for the canonical Detailing Revision Impact board.
 * No React, no network. The board's rows arrive PRE-ENRICHED from the hub
 * (joined to work packages / RFIs / fab-blocked / affected pieces), so the only
 * derivation is the search filter + the severity → downstream-label/tone
 * mapping. The canonical panel owns the presentation.
 */

/** Downstream severity → { label, kit Pill tone }. Uses the canonical
 *  REV_DOWNSTREAM map + `severityTone` helper. */
export interface DownstreamMeta {
  label: string;
  tone: "danger" | "review" | "warn" | "neutral";
  title?: string;
}

const DOWNSTREAM: Record<string, DownstreamMeta> = {
  critical: { label: "In field", tone: "danger" },
  high: { label: "Delivered", tone: "danger" },
  medium: { label: "Fabricated", tone: "review" },
  // "Not downstream" is a POSITIVE claim and is only earned when the sheet
  // actually carries downstream dates and none has been reached.
  low: { label: "Not downstream", tone: "neutral" },
  // No fabrication / delivery / install date is recorded on the sheet, so the
  // downstream state is genuinely unknown. Saying "Not downstream" here told
  // the user this revision was caught pre-fab on steel that may already be
  // erected — never present an absence of data as an all-clear.
  unknown: {
    label: "Unknown",
    tone: "warn",
    title: "No fabrication, delivery, or install date is recorded on this sheet, so its downstream state can't be determined. Set those dates on the sheet to track revision exposure.",
  },
};

/** Resolve a row's severity to its downstream label + Pill tone. An
 *  unrecognized severity falls back to "unknown" — never to an all-clear. */
export function downstreamFor(severity: string | null | undefined): DownstreamMeta {
  return DOWNSTREAM[severity ?? ""] || DOWNSTREAM.unknown;
}

/** Filter the pre-enriched rows by the search query (sheet / set / WP names).
 *  Shared by the canonical revision-impact panel's table and grid. */
export function filterRevisionImpactRows<T extends { sheetNumber?: string; setName?: string; wpNames?: string[] }>(
  rows: T[],
  search: string,
): T[] {
  if (!search) return rows;
  const q = search.toLowerCase();
  return rows.filter((r) =>
    (r.sheetNumber || "").toLowerCase().includes(q) ||
    (r.setName || "").toLowerCase().includes(q) ||
    (r.wpNames || []).join(" ").toLowerCase().includes(q));
}

/** Above this many filtered rows, render the virtualized grid instead of a full
 *  table (same threshold used by the canonical panel). */
export const REVISION_VIRTUALIZE_THRESHOLD = 100;

export function shouldVirtualizeRevisionImpact(rowCount: number): boolean {
  return rowCount > REVISION_VIRTUALIZE_THRESHOLD;
}
