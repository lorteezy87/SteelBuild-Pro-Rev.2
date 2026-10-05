// Cleanup authorization survives database erasure in data_erasure_log. It is
// append-only and writable only by the erasure RPCs, never by user metadata.
interface ReadResult {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}
interface ReadQuery extends PromiseLike<ReadResult> {
  eq(column: string, value: string): ReadQuery;
  gt(column: string, value: string): ReadQuery;
  in(column: string, values: string[]): ReadQuery;
  order(column: string, options: { ascending: boolean }): ReadQuery;
  limit(count: number): ReadQuery;
}
export interface ErasureReader {
  from(table: string): { select(columns: string): ReadQuery };
}
export class CleanupReadError extends Error {
  constructor(detail: string) { super(detail); this.name = 'CleanupReadError'; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requireId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new CleanupReadError('Invalid erasure scope ID');
  return value;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Keyset pagination never relies on the API row cap or silently accepts a
// missing response as an empty census. The ordering column must be unique.
export async function readScopedRows(
  admin: ErasureReader, table: string, columns: string, filters: Record<string, string>, cursorColumn = 'id',
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  while (true) {
    let query = admin.from(table).select(columns).order(cursorColumn, { ascending: true }).limit(500);
    for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
    if (cursor) query = query.gt(cursorColumn, cursor);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new CleanupReadError(`Cannot verify ${table}: ${error?.message ?? 'missing rows'}`);
    if (data.length === 0) return rows;
    for (const row of data) {
      const next = requireId(row[cursorColumn]);
      if (cursor && next <= cursor) throw new CleanupReadError(`Invalid ${table} census order`);
      cursor = next;
      rows.push(row);
    }
  }
}

interface ErasedScopes { orgIds: string[]; projectIds: string[] }

export async function recoverErasedWorkspaceScopes(
  admin: ErasureReader, callerId: string, expected: ErasedScopes, onlyOrgId?: string,
): Promise<ErasedScopes> {
  requireId(callerId);
  const filters: Record<string, string> = { requested_by: callerId, kind: 'organization' };
  if (onlyOrgId) filters.org_id = requireId(onlyOrgId);
  const journal = await readScopedRows(admin, 'data_erasure_log', 'id,kind,org_id,requested_by,row_counts', filters);
  const orgIds = new Set<string>();
  const projectIds = new Set<string>();
  for (const entry of journal) {
    if (entry.requested_by !== callerId || entry.kind !== 'organization') throw new CleanupReadError('Unverified erasure journal owner');
    const orgId = requireId(entry.org_id);
    if (onlyOrgId && orgId !== onlyOrgId) throw new CleanupReadError('Unexpected erasure journal workspace');
    const counts = entry.row_counts;
    if (!record(counts) || !Number.isSafeInteger(counts.projects) || (counts.projects as number) < 0 || !record(counts.per_project)) {
      throw new CleanupReadError('Incomplete erasure journal project census');
    }
    const projects = Object.keys(counts.per_project).map(requireId);
    if (projects.length !== counts.projects) throw new CleanupReadError('Incomplete erasure journal project census');
    orgIds.add(orgId);
    for (const projectId of projects) projectIds.add(projectId);
  }
  // A successful new erase must be present in the same durable journal. Do not
  // allow an unexpectedly empty/missing journal to silently skip fresh scopes.
  if (expected.orgIds.some(id => !orgIds.has(requireId(id))) || expected.projectIds.some(id => !projectIds.has(requireId(id)))) {
    throw new CleanupReadError('New workspace erasure is missing from the durable journal');
  }
  // A historical journal is not permission to delete files from a recreated
  // workspace/project. Validate ALL recovered scopes before touching Storage.
  for (const [table, ids] of [['organizations', [...orgIds]], ['projects', [...projectIds]]] as const) {
    for (let offset = 0; offset < ids.length; offset += 100) {
      const { data, error } = await admin.from(table).select('id').in('id', ids.slice(offset, offset + 100));
      if (error || !Array.isArray(data) || data.length > 0) throw new CleanupReadError(`Cannot verify erased ${table} remain absent`);
    }
  }
  return { orgIds: [...orgIds], projectIds: [...projectIds] };
}
