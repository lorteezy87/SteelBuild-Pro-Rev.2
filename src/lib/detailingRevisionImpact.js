/**
 * detailingRevisionImpact.js — "Revision Impact Tracker": when a revision lands,
 * how far downstream has the affected sheet already gone? A revision on steel
 * that's already fabricated / delivered / in the field is the expensive case
 * (rework, back-charges, CO exposure) — surface it loudest.
 *
 * Pure + deterministic. No React, no Supabase. Downstream status is derived from
 * the per-sheet date fields already on `drawings` (fabrication_finish_date,
 * final_delivery_date, ready_for_install_date) — no extra joins. Only CHANGE
 * revisions (those that superseded a prior, or version > 1) are tracked; the
 * initial issue of a sheet is not an "impact".
 */

import { daysBetween, todayLocalISO } from "@/lib/dateMath";

/** A date counts as reached when it is set and today-or-earlier (local). */
function reached(dateStr, today) {
  if (!dateStr) return false;
  return daysBetween(dateStr, today) >= 0;
}

// "unknown" outranks "low": a sheet we cannot place downstream deserves more
// attention than one we have positively confirmed is still upstream of fab.
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, unknown: 3, low: 4 };

/**
 * @param {object} args
 * @param {Array} args.revisions       — drawing_revisions rows
 * @param {Map<string, any>} args.drawingsById — drawing id → drawing row (for downstream dates)
 * @param {string} [args.today]        — YYYY-MM-DD override (tests)
 * @returns {Array<{ revisionId, drawingId, sheetNumber, revisionCode, issuedAt,
 *   drawingSetName, fabricated, delivered, inField, severity, downstreamKnown }>}
 *   severity: critical (in field) > high (delivered) > medium (fabricated)
 *           > unknown (no downstream dates recorded — we cannot tell)
 *           > low (dates recorded, none reached: genuinely still upstream)
 */
export function computeRevisionImpact({ revisions = [], drawingsById = new Map(), today } = {}) {
  const ref = today || todayLocalISO();
  const out = [];

  for (const rev of revisions || []) {
    if (!rev || rev.archived_at) continue;
    // Only CHANGE revisions — superseded a prior, or not the first version.
    const isChange = !!rev.supersedes_revision_id || (Number(rev.version_number) || 0) > 1;
    if (!isChange) continue;

    const dwg = drawingsById.get(String(rev.drawing_id)) || null;
    const fabricated = reached(dwg?.fabrication_finish_date, ref);
    const delivered = reached(dwg?.final_delivery_date, ref);
    const inField = reached(dwg?.ready_for_install_date, ref);

    // ABSENCE IS NOT EVIDENCE. All three inputs are optional, NULL-by-default
    // `drawings` columns whose only writer is four date inputs in SheetFormModal,
    // so on any project that does not hand-key them every revision looked
    // "caught pre-fab" — an affirmative negative asserted from missing data, on
    // steel the shop may already have fabricated. When we know nothing, say so.
    const downstreamKnown = !!(dwg?.fabrication_finish_date || dwg?.final_delivery_date || dwg?.ready_for_install_date);
    const severity = inField ? "critical"
      : delivered ? "high"
      : fabricated ? "medium"
      : downstreamKnown ? "low"
      : "unknown";

    out.push({
      revisionId: rev.id || null,
      drawingId: rev.drawing_id || null,
      sheetNumber: rev.sheet_number || dwg?.sheet_number || null,
      revisionCode: rev.revision_code || rev.revision_name || (rev.version_number != null ? `v${rev.version_number}` : "Rev"),
      issuedAt: rev.issued_at || rev.created_at || null,
      drawingSetName: dwg?.drawing_set_name || null,
      fabricated, delivered, inField, severity, downstreamKnown,
    });
  }

  return out.sort((a, b) =>
    (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) ||
    String(b.issuedAt || "").localeCompare(String(a.issuedAt || ""))
  );
}
