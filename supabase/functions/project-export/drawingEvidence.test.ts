import { expect, it } from 'vitest';
import { buildProjectExport } from './exportShape';
import { readDrawingEvidence } from './drawingEvidence';

it('v2EnvelopeAndFileRefsPreserved', async () => {
  const extension = await readDrawingEvidence({ rpc: async () => ({ error: null, data: { version: 1, rows: [], next_cursor: null, snapshot_token: 'a'.repeat(64) } }) }, '11111111-1111-4111-8111-111111111111');
  const envelope = buildProjectExport({ project: {}, exportedBy: 'Fixture', tableResults: [{ table: 'drawings', rows: [{ id: 'd', file_url: 'old.pdf' }] }], storageFiles: [{ bucket: 'app-files', path: 'old.pdf', size: 10 }], drawingEvidence: extension });
  expect(envelope.export_version).toBe(2);
  expect(envelope.extensions?.drawing_evidence).toEqual(extension);
  expect(envelope.files).toEqual([{ table: 'drawings', row_id: 'd', column: 'file_url', path: 'old.pdf' }]);
  expect(envelope.storage_files).toEqual([{ bucket: 'app-files', path: 'old.pdf', size: 10 }]);
});

it('includes historical PDF references verbatim without treating them as retrieval authority', () => {
  const envelope = buildProjectExport({ project: {}, exportedBy: 'Fixture', tableResults: [], drawingEvidence: {
    version: 1, snapshot_token: 'a'.repeat(64), observations: [{
      receipt_id: '10000000-0000-4000-8000-000000000001', drawing_id: '88888888-8888-4888-8888-888888888888',
      project_id: '11111111-1111-4111-8111-111111111111', drawing_set_id: '77777777-7777-4777-8777-777777777777',
      parent_file_url: 'https://legacy.example.invalid/prior.pdf', parent_pdf_page: null, parent_revision_number: null,
      parent_updated_at: null, observed_current_revision_id: null, observed_current_revision_version: null,
      extracted_text: null, callouts: null, callouts_is_sql_null: true, recorded_at: '2026-10-15T00:00:00Z',
    }],
  } });
  expect(envelope.files).toEqual([{ table: 'drawing_source_observations', row_id: '88888888-8888-4888-8888-888888888888', column: 'parent_file_url', path: 'https://legacy.example.invalid/prior.pdf' }]);
  expect(envelope.file_count).toBe(1);
  expect(envelope.storage_files).toEqual([]);
});
