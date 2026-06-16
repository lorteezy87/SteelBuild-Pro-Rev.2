/**
 * revisionPackageReport.js — pure aggregation for the package-level
 * "Revision Impact Report".
 *
 * Given a drawing set's sheets + their drawing_revisions, pick the sheets that
 * actually changed in the latest revision round, and (after the per-sheet AI
 * diffs run) roll the deltas up into one package summary. No I/O, no React —
 * the modal does the rendering/AI orchestration and feeds results back here.
 */

import { daysBetween, todayLocalISO } from "@/lib/dateMath";

const SEVERITIES = ["critical", "high", "medium", "low", "info"];

/**
 * How far downstream a sheet already is — the "expensive to change" signal.
 * Same fields/semantics as detailingRevisionImpact.
 */
export function downstreamStatus(drawing, today) {
  const ref = today || todayLocalISO();
  const reached = (d) => !!d && daysBetween(d, ref) >= 0;
  if (!drawing) return null;
  if (reached(drawing.ready_for_install_date)) return "in the field";
  if (reached(drawing.final_delivery_date)) return "delivered";
  if (reached(drawing.fabrication_finish_date)) return "fabricated";
  return null;
}

/**
 * Pick the CHANGED sheets in a set and resolve the from/to revision pair +
 * file snapshots each diff needs. A sheet "changed" when its current revision
 * supersedes a prior one (or version_number > 1). `renderable` is false when we
 * can't form a real pair to diff (no prior revision row, or a missing file).
 *
 * Returns entries sorted downstream-impacted first (rework risk), then by sheet
 * number (numeric-aware).
 */
export function selectChangedSheets(sheets = [], revisions = [], { today } = {}) {
  const ref = today || todayLocalISO();
  const byDrawing = new Map();
  for (const r of revisions || []) {
    if (!r || !r.drawing_id) continue;
    const k = String(r.drawing_id);
    if (!byDrawing.has(k)) byDrawing.set(k, []);
    byDrawing.get(k).push(r);
  }

  const out = [];
  for (const sheet of sheets || []) {
    if (!sheet || !sheet.id) continue;
    const revs = byDrawing.get(String(sheet.id)) || [];
    const current = revs.find((r) => r.is_current);
    if (!current) continue; // no revision tracking on this sheet yet
    const isChange = !!current.supersedes_revision_id || (Number(current.version_number) || 0) > 1;
    if (!isChange) continue; // unchanged in the latest round

    const prior = current.supersedes_revision_id
      ? revs.find((r) => r.id === current.supersedes_revision_id) || null
      : null;
    const toFile = {
      fileUrl: current.file_url || sheet.file_url || null,
      pdfPage: current.pdf_page ?? sheet.pdf_page ?? 1,
    };
    const fromFile = prior ? { fileUrl: prior.file_url || null, pdfPage: prior.pdf_page ?? 1 } : null;
    const renderable = !!(prior && prior.id && fromFile.fileUrl && toFile.fileUrl);

    out.push({
      drawing: sheet,
      sheetNumber: sheet.sheet_number || current.sheet_number || null,
      fromRevisionId: prior?.id || null,
      toRevisionId: current.id,
      fromFile,
      toFile,
      renderable,
      downstream: downstreamStatus(sheet, ref),
    });
  }

  return out.sort((a, b) => {
    const ad = a.downstream ? 0 : 1;
    const bd = b.downstream ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return String(a.sheetNumber || "").localeCompare(String(b.sheetNumber || ""), undefined, { numeric: true });
  });
}

/**
 * Roll per-sheet diff results into one package summary.
 * Each result: { sheetNumber, downstream, renderable, error?, deltas: [...] }.
 * Only non-dismissed deltas count toward the rollups.
 */
export function summarizePackageReport(perSheetResults = []) {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const byDeltaType = {};
  let totalDeltas = 0;
  let sheetsDiffed = 0;
  let sheetsRenderable = 0;
  let sheetsBlocked = 0;
  let errorCount = 0;
  let downstreamExposure = 0;

  for (const r of perSheetResults || []) {
    if (!r) continue;
    if (r.renderable) sheetsRenderable += 1; else sheetsBlocked += 1;
    if (r.error) errorCount += 1;
    if (Array.isArray(r.deltas) && !r.error) sheetsDiffed += 1;

    const kept = (r.deltas || []).filter((d) => d && !d.dismissed);
    let hasHot = false;
    for (const d of kept) {
      totalDeltas += 1;
      const sev = SEVERITIES.includes(d.severity) ? d.severity : "info";
      bySeverity[sev] += 1;
      const t = d.delta_type || "other";
      byDeltaType[t] = (byDeltaType[t] || 0) + 1;
      if (sev === "critical" || sev === "high") hasHot = true;
    }
    if (r.downstream && hasHot) downstreamExposure += 1;
  }

  return {
    sheetsChanged: (perSheetResults || []).length,
    sheetsDiffed,
    sheetsRenderable,
    sheetsBlocked,
    totalDeltas,
    bySeverity,
    byDeltaType,
    downstreamExposure,
    errorCount,
  };
}
