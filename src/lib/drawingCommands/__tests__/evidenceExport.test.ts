import { describe, expect, it } from 'vitest';
import { readDrawingEvidence, type DrawingSourceObservation, type DrawingEvidenceClient } from '../evidenceExport';

export const projectId = '11111111-1111-4111-8111-111111111111';
export const observation = (i = 1): DrawingSourceObservation => ({
  receipt_id: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  drawing_id: '88888888-8888-4888-8888-888888888888', project_id: projectId,
  drawing_set_id: '77777777-7777-4777-8777-777777777777', parent_file_url: 'org/uploads/prior.pdf',
  parent_pdf_page: 3, parent_revision_number: null, parent_updated_at: null,
  observed_current_revision_id: null, observed_current_revision_version: null,
  extracted_text: null, callouts: null, callouts_is_sql_null: true, recorded_at: '2026-10-15T00:00:00Z',
});
const token = 'a'.repeat(64);
const cursor = (row: ReturnType<typeof observation>) => ({ receipt_id: row.receipt_id, drawing_id: row.drawing_id });
function client(rows = [observation()], changeAt = -1): DrawingEvidenceClient {
  let calls = 0;
  return { rpc: async (name: string, args: Record<string, unknown>) => {
    expect(name).toBe('get_drawing_source_observations');
    expect(args.p_project_id).toBe(projectId);
    expect(args.p_limit).toBe(500);
    const start = args.p_after_receipt ? rows.findIndex(r => r.receipt_id === args.p_after_receipt && r.drawing_id === args.p_after_drawing) + 1 : 0;
    const page = rows.slice(start, start + 500);
    return { error: null, data: { version: 1, rows: page, snapshot_token: calls++ === changeAt ? 'b'.repeat(64) : token,
      next_cursor: start + page.length < rows.length ? cursor(page[page.length - 1]) : null } };
  } };
}
describe('drawing evidence export', () => {
  it('exports1001ObservationsWithoutCapLoss', async () => {
    const extension = await readDrawingEvidence(client(Array.from({ length: 1001 }, (_, i) => observation(i + 1))), projectId);
    expect(extension.observations).toHaveLength(1001);
    expect(extension.version).toBe(1);
  });
  it('uses both immutable cursor identities for observations sharing a receipt', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ ...observation(1), drawing_id: `80000000-0000-4000-8000-${String(i).padStart(12, '0')}` }));
    expect((await readDrawingEvidence(client(rows), projectId)).observations).toEqual(rows);
  });
  it('exportRosterChangeFailsClosed on subsequent and final verification pages', async () => {
    await expect(readDrawingEvidence(client([observation()], 1), projectId)).rejects.toThrow(/snapshot|changed|conflict/i);
  });
  it('preserves unavailable, inspected-empty, SQL NULL and JSON null', async () => {
    const rows = [observation(1), { ...observation(2), extracted_text: '', callouts: [], callouts_is_sql_null: false },
      { ...observation(3), callouts_is_sql_null: false }];
    expect((await readDrawingEvidence(client(rows), projectId)).observations).toEqual(rows);
    expect((await readDrawingEvidence(client([]), projectId)).observations).toEqual([]);
  });
  it('preserves legacy JSON own __proto__, constructor and prototype keys without prototype mutation', async () => {
    const callouts = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":"__proto__"},"prototype":["__proto__"]}');
    const rows = [{ ...observation(), callouts, callouts_is_sql_null: false }];
    const result = (await readDrawingEvidence(client(rows), projectId)).observations[0].callouts;
    expect(Object.hasOwn(result as object, '__proto__')).toBe(true);
    expect(JSON.stringify(result)).toBe(JSON.stringify(callouts));
    expect('polluted' in {}).toBe(false);
  });
  it('preserves legacy scalar callouts and integer observations without treating them as reviewed page assignments', async () => {
    for (const callouts of ['__proto__', 42, false, null]) {
      const rows = [{ ...observation(), callouts, callouts_is_sql_null: false, parent_pdf_page: 0, observed_current_revision_version: -1 }];
      expect((await readDrawingEvidence(client(rows), projectId)).observations).toEqual(rows);
    }
  });
  it.each([null, { version: 2 }, { version: 1, rows: [], snapshot_token: token },
    { version: 1, rows: [observation(), observation()], snapshot_token: token, next_cursor: null },
    { version: 1, rows: [{ ...observation(), actor_id: 'private' }], snapshot_token: token, next_cursor: null },
    { version: 1, rows: [{ ...observation(), project_id: '22222222-2222-4222-8222-222222222222' }], snapshot_token: token, next_cursor: null },
    { version: 1, rows: [observation()], snapshot_token: token, next_cursor: { receipt_id: 'bad', drawing_id: 'bad' } },
  ])('rejects missing or malformed reader contract %j', async data => {
    await expect(readDrawingEvidence({ rpc: async () => ({ data, error: null }) }, projectId)).rejects.toThrow();
  });
  it('foreignExportDenied and missing reader never become inspected-empty', async () => {
    for (const message of ['NOT_AUTHORIZED', 'function does not exist']) {
      await expect(readDrawingEvidence({ rpc: async () => ({ data: null, error: { message } }) }, projectId)).rejects.toThrow(message);
    }
  });
});
