/**
 * Pure derivations for the Detailing Revision Impact board (command_ui re-skin,
 * SP3). No React, no network. The board's rows arrive PRE-ENRICHED from the hub
 * (joined to work packages / RFIs / fab-blocked / affected pieces), so the only
 * derivation is the search filter + the severity → downstream-label/tone
 * mapping. Byte-identical to the legacy `revisionImpactBoard.tsx` inline compute.
 */

/** Downstream severity → { label, kit Pill tone }. Mirrors the legacy
 *  REV_DOWNSTREAM map + `severityTone` helper. */
export interface DownstreamMeta {
  label: string;
  tone: "danger" | "review" | "neutral";
}

const DOWNSTREAM: Record<string, DownstreamMeta> = {
  critical: { label: "In field", tone: "danger" },
  high: { label: "Delivered", tone: "danger" },
  medium: { label: "Fabricated", tone: "review" },
  low: { label: "Not downstream", tone: "neutral" },
};

/** Resolve a row's severity to its downstream label + Pill tone. Unknown
 *  severities fall back to "low" exactly as the legacy board did. */
export function downstreamFor(severity: string | null | undefined): DownstreamMeta {
  return DOWNSTREAM[severity ?? ""] || DOWNSTREAM.low;
}

/** Filter the pre-enriched rows by the search query (sheet / set / WP names).
 *  Byte-identical to the legacy `filtered` memo. */
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
 *  table (same threshold the legacy board used). */
export const REVISION_VIRTUALIZE_THRESHOLD = 100;

export function shouldVirtualizeRevisionImpact(rowCount: number): boolean {
  return rowCount > REVISION_VIRTUALIZE_THRESHOLD;
}
