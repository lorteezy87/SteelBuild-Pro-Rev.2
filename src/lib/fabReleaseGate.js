/**
 * fabReleaseGate.js — deterministic guard that blocks a Fab Release export
 * while OPEN RFIs still reference sheets in the package.
 *
 * Releasing a sheet to the shop while an RFI against it is unanswered is the
 * classic rework trap — the fabricator builds to a detail the engineer is
 * about to change. This engine surfaces that exposure so the export can be
 * blocked (with an explicit PM override).
 *
 * LINK MODEL: `drawings.linked_rfi_ids` is a COMMA-SEPARATED STRING of RFI
 * *numbers* (e.g. "RFI-001, RFI #002"), NOT an id array — matching how the
 * Drawings grid / drawingsUtils read it. We match those numbers against the
 * project's RFIs by a normalized rfi_number (upper-cased, non-alphanumerics
 * stripped) so "RFI #001" links to "RFI-001". "Open" reuses the canonical
 * isRfiOpen predicate so this gate agrees with every other open-RFI rollup.
 *
 * Pure + side-effect free (no fetching, no `new Date()`).
 */
import { isRfiOpen } from "@/lib/entityPredicates";

/** Normalize an RFI number for matching: "RFI #001" → "RFI001". */
function normNum(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Parse a drawing's linked RFI numbers (CSV string; array tolerated defensively). */
export function linkedRfiNumbers(drawing) {
  const raw = drawing?.linked_rfi_ids;
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(",");
  return parts.map((s) => String(s).trim()).filter(Boolean);
}

/**
 * The OPEN RFIs that reference a sheet in the package (deduped).
 * @param {{ drawings?: any[], rfis?: any[] }} args
 * @returns {any[]} open blocking RFIs
 */
export function findBlockingRfis({ drawings = [], rfis = [] } = {}) {
  // Index OPEN, non-deleted RFIs by normalized number.
  const openByNum = new Map();
  for (const r of rfis || []) {
    if (!r || r.is_deleted || !isRfiOpen(r)) continue;
    const key = normNum(r.rfi_number);
    if (key) openByNum.set(key, r);
  }
  if (openByNum.size === 0) return [];

  const blocking = new Map(); // dedupe by id (fallback rfi_number)
  for (const d of drawings || []) {
    for (const num of linkedRfiNumbers(d)) {
      const r = openByNum.get(normNum(num));
      if (r) blocking.set(r.id ?? r.rfi_number, r);
    }
  }
  return Array.from(blocking.values());
}

/**
 * Fab-release gate decision for a package.
 * @param {{ drawings?: any[], rfis?: any[] }} args
 * @returns {{ blocked: boolean, blockingRfis: any[], affectedSheets: any[], blockingCount: number }}
 */
export function computeFabReleaseGate({ drawings = [], rfis = [] } = {}) {
  const blockingRfis = findBlockingRfis({ drawings, rfis });
  const blockingNums = new Set(blockingRfis.map((r) => normNum(r.rfi_number)));
  const affectedSheets = (drawings || []).filter((d) =>
    linkedRfiNumbers(d).some((num) => blockingNums.has(normNum(num))),
  );
  return {
    blocked: blockingRfis.length > 0,
    blockingRfis,
    affectedSheets,
    blockingCount: blockingRfis.length,
  };
}
