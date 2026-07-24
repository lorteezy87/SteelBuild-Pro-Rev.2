/**
 * fabReleaseGate.js — the deterministic "Ready for Fab?" gate. Blocks a Fab
 * Release while a package isn't truly ready, across every readiness dimension —
 * not just status:
 *
 *   1. Open RFIs       — an unanswered RFI references a sheet (the classic rework
 *                        trap: the shop builds to a detail the engineer may change).
 *   2. Rejected sheets — a sheet came back Rejected / Revise-and-Resubmit.
 *   3. Revision conflict — a sheet is superseded by a newer revision.
 *   4. Required sign-offs (opt-in) — an approved sheet lacks its fab sign-off.
 *
 * "Approved status" is enforced upstream by the export's approved-filter (only
 * approved sheets ship); this gate then checks the rest. Any failing check blocks
 * the release, with an explicit, audited PM override as the escape hatch (e.g. a
 * deliberate partial release).
 *
 * LINK MODEL: `drawings.linked_rfi_ids` is a COMMA-SEPARATED STRING of RFI
 * *numbers* (e.g. "RFI-001, RFI #002"), NOT an id array. We match those numbers
 * against the project's RFIs by a normalized rfi_number (upper-cased,
 * non-alphanumerics stripped) so "RFI #001" links to "RFI-001". "Open" reuses the
 * canonical isRfiOpen predicate so this gate agrees with every open-RFI rollup.
 *
 * Pure + side-effect free (no fetching, no `new Date()`).
 */
import { isRfiOpen } from "@/lib/entityPredicates";
import { isApprovedForFab } from "@/lib/exports/fabRelease";

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
 * A sheet whose review came back Rejected / Revise-and-Resubmit / Returned —
 * checked across the status fields we persist (stage / set_approval_status /
 * ifc_status), so it's robust to the exact vocabulary.
 */
export function isRejectedSheet(d) {
  if (!d || d.is_deleted) return false;
  const sig = `${d.stage || ""} ${d.set_approval_status || ""} ${d.ifc_status || ""}`.toLowerCase();
  return /reject|revise|resubmit|\breturned\b|r&r/.test(sig);
}

/** A sheet superseded by a newer revision — a live revision conflict for release. */
export function isSupersededSheet(d) {
  return !!d && d.is_deleted !== true && d.is_superseded === true;
}

/**
 * Current revision is missing or not fabrication-usable (on hold / void /
 * pending review). Callers may populate `current_revision_missing` or
 * `current_release_status` from drawing_register_view / revision joins.
 */
export function isUnresolvedCurrentRevision(d) {
  if (!d || d.is_deleted === true || d.is_superseded === true) return false;
  if (d.current_revision_missing === true) return true;
  if (d.current_revision_id == null && d.has_revision_ledger === true) return true;
  const status = String(d.current_release_status || d.current_revision_status || "").toLowerCase();
  return status === "on_hold" || status === "void" || status === "pending_review";
}

/** A non-voided fab/construction-approval sign-off that satisfies the sign-off gate. */
function isFabSignoff(s) {
  if (!s || s.is_voided) return false;
  const t = String(s.stamp_type || s.status || "").toLowerCase();
  return t.includes("approved_for_fabrication") || t.includes("approved_as_noted") || t === "approved";
}

const plural = (n) => (n === 1 ? "" : "s");

/**
 * "Ready for Fab?" gate for a package (the sheet membership of the drawing sets
 * being released). Returns structured `reasons` for the UI plus the legacy
 * RFI-only fields so existing callers (Dashboard KPI, etc.) keep working.
 *
 * @param {{ drawings?: any[], rfis?: any[], signoffs?: any[], requireSignoffs?: boolean }} args
 * @returns {{ blocked: boolean, reasons: Array<{kind:string,title:string,sheets:any[],rfis?:any[]}>,
 *   blockingRfis: any[], affectedSheets: any[], blockingCount: number }}
 */
export function computeFabReleaseGate({ drawings = [], rfis = [], signoffs = [], requireSignoffs = false } = {}) {
  const live = (drawings || []).filter((d) => d && d.is_deleted !== true);

  // 1. Open RFIs.
  const blockingRfis = findBlockingRfis({ drawings: live, rfis });
  const blockingNums = new Set(blockingRfis.map((r) => normNum(r.rfi_number)));
  const affectedSheets = live.filter((d) =>
    linkedRfiNumbers(d).some((num) => blockingNums.has(normNum(num))),
  );

  // 2/3. Rejected + superseded sheets (a superseded sheet that's also flagged
  // rejected is reported once, under "rejected").
  const rejected = live.filter(isRejectedSheet);
  const superseded = live.filter((d) => isSupersededSheet(d) && !isRejectedSheet(d));
  const unresolved = live.filter(
    (d) => isUnresolvedCurrentRevision(d) && !isRejectedSheet(d) && !isSupersededSheet(d),
  );

  const reasons = [];
  if (rejected.length) {
    reasons.push({ kind: "rejected_sheets", title: `${rejected.length} rejected / revise-and-resubmit sheet${plural(rejected.length)}`, sheets: rejected });
  }
  if (superseded.length) {
    reasons.push({ kind: "revision_conflict", title: `${superseded.length} sheet${plural(superseded.length)} with a superseded revision`, sheets: superseded });
  }
  if (unresolved.length) {
    reasons.push({
      kind: "unresolved_revision",
      title: `${unresolved.length} sheet${plural(unresolved.length)} with an unresolved current revision`,
      sheets: unresolved,
      action: "Publish or clear the current revision before releasing for fabrication.",
    });
  }
  if (blockingRfis.length) {
    reasons.push({ kind: "open_rfis", title: `${blockingRfis.length} open RFI${plural(blockingRfis.length)} reference this package`, rfis: blockingRfis, sheets: affectedSheets });
  }
  // 4. Required sign-offs (opt-in via project setting). Only approved sheets need
  // one — an in-progress sheet isn't expected to be signed off yet.
  if (requireSignoffs) {
    const signed = new Set((signoffs || []).filter(isFabSignoff).map((s) => s.drawing_id));
    const missing = live.filter((d) => isApprovedForFab(d) && !signed.has(d.id));
    if (missing.length) {
      reasons.push({ kind: "missing_signoffs", title: `${missing.length} approved sheet${plural(missing.length)} missing a fab sign-off`, sheets: missing });
    }
  }

  return {
    blocked: reasons.length > 0,
    reasons,
    // Legacy RFI-only fields (Dashboard "RFIs Blocking Fab" KPI + existing callers).
    blockingRfis,
    affectedSheets,
    blockingCount: blockingRfis.length,
  };
}
