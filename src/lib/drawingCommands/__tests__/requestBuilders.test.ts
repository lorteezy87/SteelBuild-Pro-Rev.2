import { describe, expect, it } from 'vitest';
import { buildCreateSetRequest, buildReviseSetRequest } from '../requestBuilders';
import { DrawingCommandPreflightError } from '../errors';
import type { DrawingJson } from '../types';

export const project = '11111111-1111-4111-8111-111111111111';
export const org = '22222222-2222-4222-8222-222222222222';
export const path = `${org}/uploads/${project}/review.pdf`;
export const createReview = () => ({
  project_id: project, set_name: 'Steel Rev A', set_number: null as string | null, revision_label: 'A',
  discipline: null as string | null, issued_date: null as string | null, issued_by: null as string | null, notes: null as string | null, file_path: path,
  source_objects: [{ path, token: 'a'.repeat(64) }],
  sheets: [{ action: 'added' as const, sheet_number: 'S1', sheet_title: 'Framing', revision_code: 'A',
    file_path: path, pdf_page: 2, reviewed: true as const,
    extraction: { text: { state: 'unavailable' as const }, callouts: { state: 'unavailable' as const } } }],
});
export const reviseReview = () => ({
  project_id: project, set_id: '33333333-3333-4333-8333-333333333333',
  expected_set_updated_at: '2026-10-15T12:00:00Z', expected_set_revision: 'A', revision_label: 'B',
  issued_date: '2026-10-15', file_path: path, source_objects: [{ path, token: 'a'.repeat(64) }],
  sheets: [{ ...createReview().sheets[0], action: 'revised' as const,
    drawing_id: '44444444-4444-4444-8444-444444444444', expected_updated_at: '2026-10-15T12:00:00Z',
    expected_revision_id: '55555555-5555-4555-8555-555555555555' }],
});

describe('review request builders', () => {
  it('unknownExtractionStaysUnknown', () => {
    const parsed = buildCreateSetRequest(createReview());
    expect(parsed.issued_date).toBeNull();
    expect(parsed.sheets[0].extraction).toEqual({ text: { state: 'unavailable' }, callouts: { state: 'unavailable' } });
  });
  it('clones and freezes the complete reviewed payload without filling optional revision fields', () => {
    const review = reviseReview();
    const parsed = buildReviseSetRequest(review);
    review.sheets[0].sheet_title = 'Changed later';
    expect(parsed.sheets[0]).toMatchObject({ sheet_title: 'Framing' });
    expect(parsed).not.toHaveProperty('notes');
    expect(Object.isFrozen(parsed.sheets[0])).toBe(true);
  });
  it.each([
    { set_name: ' ' }, { issued_date: '2026-02-30' }, { set_number: 'n'.repeat(121) },
    { source_objects: [] }, { sheets: [] }, { file_path: 'https://host/signed.pdf?token=secret' },
    { project_id: '99999999-9999-4999-8999-999999999999' },
    { actor_id: org }, { notes: undefined },
  ])('rejects malformed or incomplete headers: %j', (patch) => {
    expect(() => buildCreateSetRequest({ ...createReview(), ...patch } as never)).toThrow();
  });
  it('rejects missing, foreign and duplicate source snapshots', () => {
    const review = createReview();
    expect(() => buildCreateSetRequest({ ...review, source_objects: [{ path: path.replace('review.pdf', 'other.pdf'), token: 'a'.repeat(64) }] })).toThrow();
    expect(() => buildCreateSetRequest({ ...review, source_objects: [...review.source_objects, ...review.source_objects] })).toThrow();
  });
  it('rejects duplicate sheet marks and 251 reviewed sheets rather than truncating', () => {
    const review = createReview();
    expect(() => buildCreateSetRequest({ ...review, sheets: [...review.sheets, ...review.sheets] })).toThrow();
    expect(() => buildCreateSetRequest({ ...review, sheets: Array.from({ length: 251 }, (_, i) => ({ ...review.sheets[0], sheet_number: `S${i}` })) })).toThrow();
  });
  it.each([0, 1.5, 1000000])('rejects invalid PDF page %s', (pdf_page) => {
    const review = createReview();
    expect(() => buildCreateSetRequest({ ...review, sheets: [{ ...review.sheets[0], pdf_page }] })).toThrow();
  });
  it('distinguishes harvested empty values and rejects fabricated unavailable values', () => {
    const review = createReview();
    const extraction = { text: { state: 'harvested' as const, value: '' }, callouts: { state: 'harvested' as const, value: [] as DrawingJson[] } };
    expect(buildCreateSetRequest({ ...review, sheets: [{ ...review.sheets[0], extraction }] }).sheets[0].extraction).toEqual(extraction);
    expect(() => buildCreateSetRequest({ ...review, sheets: [{ ...review.sheets[0], extraction: { ...extraction, text: { state: 'unavailable', value: '' } } }] } as never)).toThrow();
  });
  it('enforces UTF-8 extraction and whole request bounds', () => {
    const review = createReview();
    const text = { state: 'harvested' as const, value: 'é'.repeat(32769) };
    expect(() => buildCreateSetRequest({ ...review, sheets: [{ ...review.sheets[0], extraction: { ...review.sheets[0].extraction, text } }] })).toThrow();
    expect(() => buildCreateSetRequest({ ...review, notes: 'x'.repeat(1048576) })).toThrow();
  });
  it('retains the complete 250-sheet roster and exact 65536-byte harvested text', () => {
    const review = createReview();
    const sheets = Array.from({ length: 250 }, (_, index) => ({ ...review.sheets[0], sheet_number: `S${index}` }));
    expect(buildCreateSetRequest({ ...review, sheets }).sheets).toHaveLength(250);
    const extraction = { ...review.sheets[0].extraction, text: { state: 'harvested' as const, value: 'é'.repeat(32768) } };
    expect(buildCreateSetRequest({ ...review, sheets: [{ ...review.sheets[0], extraction }] }).sheets[0].extraction.text).toEqual(extraction.text);
  });
  it('rejects non-JSON values rather than silently dropping reviewed fields', () => {
    expect(() => buildReviseSetRequest({ ...reviseReview(), notes: undefined })).toThrow(DrawingCommandPreflightError);
    const review = createReview();
    expect(() => buildCreateSetRequest({ ...review, sheets: [{ ...review.sheets[0], discipline: undefined }] })).toThrow(DrawingCommandPreflightError);
  });
  it('deep clones harvested callouts so later caller edits cannot alter a request', () => {
    const review = createReview();
    const callouts = [{ text: 'W12', coordinates: [1, 2] }];
    const parsed = buildCreateSetRequest({ ...review, sheets: [{ ...review.sheets[0], extraction: {
      ...review.sheets[0].extraction, callouts: { state: 'harvested', value: callouts },
    } }] });
    callouts[0].coordinates[0] = 999;
    expect(parsed.sheets[0].extraction.callouts).toEqual({ state: 'harvested', value: [{ text: 'W12', coordinates: [1, 2] }] });
  });
  it('requires explicit existing sheet observations and forbids added history identity', () => {
    const review = reviseReview();
    expect(() => buildReviseSetRequest({ ...review, sheets: [{ ...review.sheets[0], expected_revision_id: null }] } as never)).toThrow();
    expect(() => buildCreateSetRequest({ ...createReview(), sheets: [{ ...createReview().sheets[0], drawing_id: org }] } as never)).toThrow();
    const same = { action: 'same' as const, drawing_id: org, expected_updated_at: '2026-10-15T12:00:00Z', expected_revision_id: null as string | null, sheet_number: 'S1' };
    expect(buildReviseSetRequest({ ...review, sheets: [same] }).sheets).toEqual([same]);
  });
});
