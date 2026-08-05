/**
 * revisionSummary.js — deterministic "Revision Summary" digest for a drawing set.
 *
 * When a revision is uploaded, this produces an instant, free digest of what
 * changed and what it threatens: sheets changed, high-risk (already-downstream)
 * changes, affected work packages, a likely-RFI flag, and a qualitative
 * cost/schedule impact level. The expensive AI per-sheet visual diff is NOT run
 * here — it stays the one-click deep-dive (RevisionImpactReportModal).
 *
 * Pure + side-effect-free. Composes the existing engines (computeRevisionImpact +
 * buildRevisionImpactRows) and aggregates; `today` is injected for tests.
 */
import { computeRevisionImpact } from "@/lib/detailingRevisionImpact";
import { buildRevisionImpactRows } from "@/lib/revisionImpactBoard";
import { todayLocalISO } from "@/lib/dateMath";

// computeRevisionImpact severity → human downstream label + qualitative impact.
// critical = in field > high = delivered > medium = fabricated > low = none yet.
const SEV_LABEL = { critical: "in the field", high: "delivered", medium: "fabricated", low: null };
const SEV_TO_IMPACT = { critical: "high", high: "medium", medium: "medium", low: "low" };
const IMPACT_RANK = { none: 0, low: 1, medium: 2, high: 3 };
const RANK_IMPACT = ["none", "low", "medium", "high"];

/**
 * @param {object} args
 * @param {object} args.set            a set package { setId, name, parent, sheets }
 * @param {Array}  [args.revisions]    drawing_revisions (project-wide; scoped here to the set)
 * @param {Array}  [args.rfis]         project RFIs
 * @param {Array}  [args.drawingSets]  drawing_sets (for WP resolution)
 * @param {Array}  [args.workPackages] work_packages
 * @param {Array}  [args.modelElements] model_elements
 * @param {string} [args.today]        YYYY-MM-DD override
 */
export function buildRevisionSummary({
  set, revisions = [], rfis = [], drawingSets = [], workPackages = [], modelElements = [], today,
} = {}) {
  const ref = today || todayLocalISO();
  const sheets = set?.sheets || [];
  const setId = set?.setId || set?.parent?.id || null;
  const setName = set?.name || set?.parent?.set_name || "Set";
  const flagged = !!(set?.parent?.material_impacted || set?.parent?.long_lead_impact);
  const flagReason = [
    set?.parent?.material_impacted && "material impact",
    set?.parent?.long_lead_impact && "long-lead impact",
  ].filter(Boolean).join(" + ");

  const sheetIds = new Set(sheets.map((s) => String(s.id)));
  const setRevisions = (revisions || []).filter((r) => r && sheetIds.has(String(r.drawing_id)));
  const drawingsById = new Map(sheets.map((s) => [String(s.id), s]));
  const impact = computeRevisionImpact({ revisions: setRevisions, drawingsById, today: ref });
  const rows = buildRevisionImpactRows(impact, { drawings: sheets, drawingSets, workPackages, rfis, modelElements });

  const isDownstream = (r) => r.severity !== "low";

  const changedSheets = rows.map((r) => ({
    drawingId: r.drawingId,
    sheetNumber: r.sheetNumber,
    revisionCode: r.revisionCode,
    downstream: SEV_LABEL[r.severity] || null,
    severity: r.severity,
  }));

  const highRisk = rows
    .filter((r) => isDownstream(r) || flagged)
    .map((r) => ({
      drawingId: r.drawingId,
      sheetNumber: r.sheetNumber,
      reason: isDownstream(r) ? `already ${SEV_LABEL[r.severity]}` : flagReason,
    }));

  const affectedWorkPackages = [...new Set(rows.flatMap((r) => r.wpNames || []))];

  // Likely RFI: a high-risk changed sheet that has no open RFI yet.
  const likelyRfiSheets = rows
    .filter((r) => (isDownstream(r) || flagged) && (r.openRfiCount || 0) === 0)
    .map((r) => r.sheetNumber)
    .filter(Boolean);
  const likelyRfi = {
    needed: likelyRfiSheets.length > 0,
    reason: likelyRfiSheets.length ? "High-risk change on a sheet with no open RFI" : "",
    sheets: likelyRfiSheets,
  };

  // Impact level: worst severity→impact across changed sheets, bumped by a flag.
  let level = "none";
  for (const r of rows) {
    const lvl = SEV_TO_IMPACT[r.severity] || "low";
    if (IMPACT_RANK[lvl] > IMPACT_RANK[level]) level = lvl;
  }
  if (rows.length && level === "none") level = "low";
  if (flagged && rows.length) level = RANK_IMPACT[Math.min(3, IMPACT_RANK[level] + 1)];

  const downstreamCount = rows.filter(isDownstream).length;
  const note = !rows.length
    ? "No material changes detected"
    : downstreamCount
    ? `${downstreamCount} sheet${downstreamCount === 1 ? "" : "s"} already downstream — rework likely${flagged ? ` (${flagReason})` : ""}`
    : flagged
    ? `Changes on a ${flagReason} set`
    : "Changes upstream of fabrication";

  return {
    setId,
    setName,
    generatedAt: ref,
    sheetsChanged: rows.length,
    changedSheets,
    highRisk,
    highRiskCount: highRisk.length,
    affectedWorkPackages,
    likelyRfi,
    impact: { level, note },
    openRfiCount: rows.reduce((s, r) => s + (r.openRfiCount || 0), 0),
    fabBlocked: rows.some((r) => r.fabBlocked),
  };
}
