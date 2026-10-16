import type { Json } from '../../types/supabase.ts';

/** Observed parent values, not engineering approval or proof of original PDF bytes. */
export interface DrawingSourceObservation {
  receipt_id: string;
  drawing_id: string;
  project_id: string;
  drawing_set_id: string;
  parent_file_url: string | null;
  parent_pdf_page: number | null;
  parent_revision_number: string | null;
  parent_updated_at: string | null;
  observed_current_revision_id: string | null;
  observed_current_revision_version: number | null;
  extracted_text: string | null;
  callouts: Json;
  recorded_at: string;
  callouts_is_sql_null: boolean;
}
export interface DrawingEvidenceExtension {
  version: 1;
  observations: DrawingSourceObservation[];
  snapshot_token: string;
}
export interface DrawingEvidenceClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}
type Cursor = { receipt_id: string; drawing_id: string };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const tokenValid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const columns = ['receipt_id', 'drawing_id', 'project_id', 'drawing_set_id', 'parent_file_url', 'parent_pdf_page', 'parent_revision_number', 'parent_updated_at', 'observed_current_revision_id', 'observed_current_revision_version', 'extracted_text', 'callouts', 'recorded_at', 'callouts_is_sql_null'];
function invalid(): never { throw new Error('Invalid or unavailable drawing evidence export contract'); }
function json(value: unknown): value is Json {
  return value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
    || (Array.isArray(value) ? value.every(json) : record(value) && Object.values(value).every(json));
}
function observation(value: unknown, projectId: string): DrawingSourceObservation {
  if (!record(value) || Object.keys(value).length !== columns.length || columns.some(key => !Object.hasOwn(value, key))) return invalid();
  if (!['receipt_id', 'drawing_id', 'project_id', 'drawing_set_id'].every(key => uuid(value[key])) || value.project_id !== projectId) return invalid();
  for (const key of ['parent_file_url', 'parent_revision_number', 'extracted_text']) if (value[key] !== null && typeof value[key] !== 'string') return invalid();
  // These are observed historical columns, not a new reviewed command. Retain
  // legacy integer values verbatim; never invent a positive page/version.
  for (const key of ['parent_pdf_page', 'observed_current_revision_version']) if (value[key] !== null && !Number.isInteger(value[key])) return invalid();
  if (value.observed_current_revision_id !== null && !uuid(value.observed_current_revision_id)) return invalid();
  if (typeof value.recorded_at !== 'string' || !Number.isFinite(Date.parse(value.recorded_at))
    || (value.parent_updated_at !== null && (typeof value.parent_updated_at !== 'string' || !Number.isFinite(Date.parse(value.parent_updated_at))))) return invalid();
  if (typeof value.callouts_is_sql_null !== 'boolean' || !json(value.callouts) || (value.callouts_is_sql_null && value.callouts !== null)) return invalid();
  return value as unknown as DrawingSourceObservation;
}
const key = (value: Cursor) => `${value.receipt_id}:${value.drawing_id}`;

/** Complete caller-JWT read. A final token check is required even for zero rows. */
export async function readDrawingEvidence(client: DrawingEvidenceClient, projectId: string): Promise<DrawingEvidenceExtension> {
  if (!uuid(projectId)) return invalid();
  const observations: DrawingSourceObservation[] = [];
  let cursor: Cursor | null = null;
  let snapshotToken: string | null = null;
  let verifying = false;
  for (;;) {
    const { data, error } = await client.rpc('get_drawing_source_observations', {
      p_project_id: projectId, p_after_receipt: cursor?.receipt_id ?? null,
      p_after_drawing: cursor?.drawing_id ?? null, p_snapshot_token: snapshotToken, p_limit: 500,
    });
    if (error) throw new Error(error.message);
    if (!record(data) || data.version !== 1 || !Array.isArray(data.rows) || data.rows.length > 500
      || !Object.hasOwn(data, 'next_cursor') || !tokenValid(data.snapshot_token)) return invalid();
    if (snapshotToken !== null && snapshotToken !== data.snapshot_token) throw new Error('Drawing evidence snapshot changed; export conflict');
    snapshotToken = data.snapshot_token;
    let last: Cursor | null = cursor;
    const page = data.rows.map(value => observation(value, projectId));
    for (const row of page) {
      if (last && key(row) <= key(last)) return invalid();
      last = { receipt_id: row.receipt_id, drawing_id: row.drawing_id };
    }
    if (data.next_cursor !== null) {
      if (!record(data.next_cursor) || Object.keys(data.next_cursor).length !== 2 || !uuid(data.next_cursor.receipt_id)
        || !uuid(data.next_cursor.drawing_id) || !last || page.length === 0
        || key(data.next_cursor as Cursor) !== key(last)) return invalid();
    }
    if (verifying) {
      if (page.length !== 0 || data.next_cursor !== null) throw new Error('Drawing evidence snapshot changed; export conflict');
      return { version: 1, observations, snapshot_token: snapshotToken };
    }
    observations.push(...page);
    cursor = last;
    if (data.next_cursor === null) verifying = true;
  }
}
