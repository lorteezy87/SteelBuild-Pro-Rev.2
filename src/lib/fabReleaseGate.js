/**
 * fabReleaseGate.js — deterministic guard that blocks a Fab Release export
 * while OPEN RFIs still reference sheets in the package.
 *
 * Releasing a sheet to the shop while an RFI against it is unanswered is the
 * classic rework trap — the fabricator builds to a detail the engineer is
 * about to change. This engine surfaces that exposure so the export can be
 * blocked (with an explicit PM override).
 *
 * Primary link signal is `drawings.linked_rfi_ids` (the per-sheet RFI links the
 * app already maintains). "Open" reuses the canonical predicate in
 * entityPredicates.js so this gate agrees with every other open-RFI rollup.
 *
 * Pure + side-effect free (no fetching, no `new Date()`); callers pass the
 * package's drawings + the project's RFIs.
 */
import { isRfiOpen } from "@/lib/entityPredicates";

/** Set of RFI ids (as strings) linked from any sheet in the package. */
function collectLinkedRfiIds(drawings) {
  const ids = new Set();
  for (const d of drawings || []) {
    const arr = Array.isArray(d?.linked_rfi_ids) ? d.linked_rfi_ids : [];
    for (const id of arr) if (id != null && id !== "") ids.add(String(id));
  }
  return ids;
}

/**
 * The OPEN RFIs that reference a sheet in the package (deduped by id).
 * @param {{ drawings?: any[], rfis?: any[] }} args
 * @returns {any[]} open blocking RFIs
 */
export function findBlockingRfis({ drawings = [], rfis = [] } = {}) {
  const linkedIds = collectLinkedRfiIds(drawings);
  if (linkedIds.size === 0) return [];
  const byId = new Map();
  for (const r of rfis || []) {
    if (r && r.id != null) byId.set(String(r.id), r);
  }
  const blocking = [];
  for (const id of linkedIds) {
    const rfi = byId.get(id);
    if (rfi && !rfi.is_deleted && isRfiOpen(rfi)) blocking.push(rfi);
  }
  return blocking;
}

/**
 * Fab-release gate decision for a package.
 * @param {{ drawings?: any[], rfis?: any[] }} args
 * @returns {{ blocked: boolean, blockingRfis: any[], affectedSheets: any[], blockingCount: number }}
 */
export function computeFabReleaseGate({ drawings = [], rfis = [] } = {}) {
  const blockingRfis = findBlockingRfis({ drawings, rfis });
  const blockingIds = new Set(blockingRfis.map((r) => String(r.id)));
  const affectedSheets = (drawings || []).filter(
    (d) =>
      Array.isArray(d?.linked_rfi_ids) &&
      d.linked_rfi_ids.some((id) => blockingIds.has(String(id))),
  );
  return {
    blocked: blockingRfis.length > 0,
    blockingRfis,
    affectedSheets,
    blockingCount: blockingRfis.length,
  };
}
