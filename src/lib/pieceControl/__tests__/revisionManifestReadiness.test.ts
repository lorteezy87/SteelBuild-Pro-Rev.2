import { describe, expect, it } from 'vitest';
import { isGoverningDrawingReleaseReady } from '../drawingReleaseReady';
const drawing = { id: 'd', project_id: 'p', drawing_set_id: 'set', stage: 'IFC' };
const submittal = { id: 's', submittal_type: 'Shop Drawing', status: 'Released for Fabrication', drawing_set_ids: ['set'], current_round_id: 'r' };
const coverage = { submittal_id: 's', round_id: 'r', ok: true, current_revision_ids: ['revision1'], captured_revision_ids: ['revision1'], missing_revision_ids: [], stale_revision_ids: [], missing_current_drawing_ids: [], foreign_drawing_set_ids: [], empty_drawing_set_ids: [] };
describe('exact revision readiness', () => {
  it('blocks a legacy Released status without immutable evidence', () => {
    const result = isGoverningDrawingReleaseReady(drawing, { submittals: [submittal] });
    expect(result.ready).toBe(false);
    expect(result.reason).toMatch(/revision evidence/i);
  });
  it('accepts complete current-round coverage and blocks newly published revisions', () => {
    expect(isGoverningDrawingReleaseReady(drawing, { submittals: [{ ...submittal, revision_coverage: coverage }] }).ready).toBe(true);
    expect(isGoverningDrawingReleaseReady(drawing, { submittals: [{ ...submittal, revision_coverage: { ...coverage, ok: false, missing_revision_ids: ['revision2'], stale_revision_ids: ['revision1'] } }] }).ready).toBe(false);
  });
  it('rejects a coverage record from another submittal or historical round', () => {
    for (const patch of [{ submittal_id: 'other' }, { round_id: 'older' }]) expect(isGoverningDrawingReleaseReady(drawing, { submittals: [{ ...submittal, revision_coverage: { ...coverage, ...patch } }] }).ready).toBe(false);
  });
});
