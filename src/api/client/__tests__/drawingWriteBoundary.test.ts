import { beforeEach, describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ writes: vi.fn(), filters: [] as unknown[][], row: { id: 'd', markup_scale: 48 } as Record<string, unknown> | null }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn(), from(table: string) {
  const query = { insert: (patch: unknown) => { backend.writes(table, patch); return query; }, update: (patch: unknown) => { backend.writes(table, patch); return query; }, delete: () => { backend.writes(table, 'delete'); return query; }, eq: (key: string, value: unknown) => { backend.filters.push(['eq', key, value]); return query; }, is: (key: string, value: unknown) => { backend.filters.push(['is', key, value]); return query; }, in: () => query, select: () => query, single: async () => ({ data: backend.row, error: null }), maybeSingle: async () => ({ data: backend.row, error: null }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: backend.row ? [backend.row] : [], error: null }).then(resolve) };
  return query;
} } }));
import { entities } from '../entities';
beforeEach(() => { backend.writes.mockClear(); backend.filters = []; backend.row = { id: 'd', markup_scale: 48 }; });
describe('core drawing API write boundary', () => {
  it.each(['Drawing', 'DrawingSet', 'DrawingRevision'] as const)('holds %s source creation and lifecycle CRUD before any request', async name => {
    const client = entities[name];
    for (const operation of [() => client.create({} as never), () => client.bulkCreate([{}] as never), () => client.delete('d'), () => client.bulkDelete(['d'])]) await expect(operation()).rejects.toThrow(/held|reviewed/i);
    expect(backend.writes).not.toHaveBeenCalled();
  });
  it.each(['file_url','title','stage','revision_number','metadata','is_deleted','unexpected_future_column'])('rejects mixed metadata plus protected %s before any write', async field => {
    await expect(entities.Drawing.update('d', { notes: 'safe', [field]: 'protected' })).rejects.toThrow(/protected|held/i);
    expect(backend.writes).not.toHaveBeenCalled();
  });
  it('safeCalibrationStillSaves without caller timestamps', async () => {
    await entities.Drawing.update('d', { markup_scale: 48 });
    expect(backend.writes).toHaveBeenCalledWith('drawings', { markup_scale: 48 });
  });
  it('permits set rectangles but rejects protected bulk patches and all history metadata', async () => {
    await entities.DrawingSet.update('s', { titleblock_title_rect: { x: 0.2 } });
    expect(backend.writes).toHaveBeenCalledWith('drawing_sets', { titleblock_title_rect: { x: 0.2 } });
    backend.writes.mockClear();
    await expect(entities.Drawing.bulkUpdate(['d'], { stage: 'IFC' })).rejects.toThrow(/protected|held/i);
    await expect(entities.DrawingRevision.update('r', { revision_notes: 'note' })).rejects.toThrow(/protected|held/i);
    expect(backend.writes).not.toHaveBeenCalled();
  });
});
describe('source-bound calibration', () => {
  const source = { id: 'd', project_id: 'p', file_url: 'old.pdf', pdf_page: 2, revision_number: 'A', updated_at: '2026-10-15T12:00:00.123456+00:00', markup_scale: null };
  it('writes scale in one request with every source/version/prior-scale predicate', async () => {
    await entities.Drawing.updateCalibration('d', 48, source);
    expect(backend.writes).toHaveBeenCalledExactlyOnceWith('drawings', { markup_scale: 48 });
    expect(backend.filters).toEqual([['eq','id','d'], ['eq','project_id','p'], ['eq','file_url','old.pdf'], ['eq','pdf_page',2], ['eq','revision_number','A'], ['eq','updated_at','2026-10-15T12:00:00.123456+00:00'], ['is','markup_scale',null]]);
  });
  it('rejects a stale or inaccessible source without retry', async () => {
    backend.row = null;
    await expect(entities.Drawing.updateCalibration('d', 48, source)).rejects.toThrow(/changed|access|reload/i);
    expect(backend.writes).toHaveBeenCalledTimes(1);
  });
  it.each([{ file_url: 'new.pdf' }, { pdf_page: 3 }, { revision_number: 'B' }, { updated_at: '2026-10-15T12:00:01.123456+00:00' }, { markup_scale: 96 }])('includes a rejecting predicate for replacement or new manual scale %j', async change => {
    await entities.Drawing.updateCalibration('d', null, { ...source, markup_scale: 48 });
    const newer: Record<string, unknown> = { ...source, markup_scale: 48, ...change };
    // Predicate-shape proof only: PostgreSQL concurrency evidence belongs to Task 13.
    expect(backend.filters.every(([, key, value]) => newer[String(key)] === value)).toBe(false);
    expect(backend.writes).toHaveBeenCalledTimes(1);
  });
  it('uses IS NULL for known nullable source values and exact numeric prior scale for Undo', async () => {
    await entities.Drawing.updateCalibration('d', null, { ...source, file_url: null, pdf_page: null, revision_number: null, markup_scale: 48 });
    expect(backend.filters).toContainEqual(['is','file_url',null]);
    expect(backend.filters).toContainEqual(['is','pdf_page',null]);
    expect(backend.filters).toContainEqual(['is','revision_number',null]);
    expect(backend.filters).toContainEqual(['eq','markup_scale',48]);
  });
  it.each([{ updated_at: undefined }, { updated_at: '1' }, { updated_at: '2026-10-15' }, { project_id: '' }, { file_url: undefined }, { pdf_page: 0 }, { markup_scale: undefined }, { markup_scale: '48' }, { id: 'other' }])('rejects incomplete or malformed expected source %j before a request', async change => {
    await expect(entities.Drawing.updateCalibration('d', 48, { ...source, ...change } as never)).rejects.toThrow(/source|reload/i);
    expect(backend.writes).not.toHaveBeenCalled();
  });
});
