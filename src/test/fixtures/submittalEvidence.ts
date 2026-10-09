import type { RevisionCoverageSummary } from '@/lib/submittalRevisionEvidence';
/** Complete persisted manifest fixture; callers can remove/change evidence to model blockers. */
export function verifiedSubmittalEvidence(submittalId: string, roundId = 'review-round', revisionId = 'pdf-revision') {
  const coverage: RevisionCoverageSummary = { submittal_id: submittalId, round_id: roundId, ok: true, current_revision_ids: [revisionId], captured_revision_ids: [revisionId], missing_revision_ids: [], stale_revision_ids: [], missing_current_drawing_ids: [], foreign_drawing_set_ids: [], empty_drawing_set_ids: [] };
  return { current_round_id: roundId, revision_coverage: coverage };
}
