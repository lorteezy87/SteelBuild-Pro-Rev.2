/** Server-calculated coverage of the entire submitted package, never one visible set. */
export interface RevisionCoverageSummary {
  submittal_id: string; round_id: string | null; ok: boolean; reason?: string | null;
  current_revision_ids: readonly string[]; captured_revision_ids: readonly string[];
  missing_revision_ids: readonly string[]; stale_revision_ids: readonly string[];
  missing_current_drawing_ids: readonly string[]; foreign_drawing_set_ids: readonly string[];
  empty_drawing_set_ids: readonly string[];
}
export interface SubmittalWithRevisionEvidence {
  id?: string | null; current_round_id?: string | null;
  revision_coverage?: RevisionCoverageSummary | null;
}
const COVERAGE_REASONS: Readonly<Record<string, string>> = {
  not_shop_drawing: 'This record is not a Shop Drawing submission.',
  inactive_submittal: 'This package has not been submitted or is no longer active.',
  foreign_or_inactive_sets: 'A linked drawing set is unavailable or outside this project.',
  empty_package: 'A linked drawing set has no active sheets.',
  missing_current_revision: 'One or more sheets need a current PDF revision.',
  missing_manifest: 'The current round has no verified record of the exact PDFs transmitted.',
  round_roster_changed: 'The drawing sets changed after this review round was submitted.',
  round_status_mismatch: 'The recorded round and submittal status need reconciliation.',
  stale_manifest: 'The current PDFs differ from the revisions captured for this round.',
};
export function revisionCoverageBlockMessage(coverage?: RevisionCoverageSummary | null): string {
  return (coverage?.reason && COVERAGE_REASONS[coverage.reason])
    || 'Exact current-round revision evidence is missing or stale. Review the transmitted PDFs, reconcile eligible legacy evidence, or submit a new review round.';
}
export function hasExactSubmittalRevisionEvidence(submittal: SubmittalWithRevisionEvidence | null | undefined): boolean {
  const coverage = submittal?.revision_coverage;
  if (!coverage || !submittal?.id || !submittal.current_round_id || coverage.ok !== true || coverage.submittal_id !== submittal.id || coverage.round_id !== submittal.current_round_id) return false;
  if (![coverage.current_revision_ids, coverage.captured_revision_ids, coverage.missing_revision_ids, coverage.stale_revision_ids, coverage.missing_current_drawing_ids, coverage.foreign_drawing_set_ids, coverage.empty_drawing_set_ids].every(Array.isArray)) return false;
  if (!coverage.current_revision_ids.length || coverage.missing_revision_ids.length || coverage.stale_revision_ids.length || coverage.missing_current_drawing_ids.length || coverage.foreign_drawing_set_ids.length || coverage.empty_drawing_set_ids.length) return false;
  const captured = new Set(coverage.captured_revision_ids);
  return captured.size === new Set(coverage.current_revision_ids).size && coverage.current_revision_ids.every(id => captured.has(id));
}
export function submittalRevisionEvidenceBlockReason(submittal: SubmittalWithRevisionEvidence | null | undefined): string | null {
  if (hasExactSubmittalRevisionEvidence(submittal)) return null;
  return revisionCoverageBlockMessage(submittal?.revision_coverage);
}
