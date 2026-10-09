import { ORG, PROJECT, STAGING, hash, revisionRecord, setRecord, sheetRecord, submittalRecord, syntheticPdf, workflowPatch, type Fixture } from './fixture.js';

const canonical = (value: unknown): string => JSON.stringify(value, (_key, node) => node && typeof node === 'object' && !Array.isArray(node)
  ? Object.fromEntries(Object.entries(node).sort(([a], [b]) => a.localeCompare(b))) : node);
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const isUuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const timestamp = (value: unknown) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
const keys = (body: Record<string, unknown>, expected: string[]) => same(Object.keys(body).sort(), expected.sort());
function urlFor(raw: string): URL | null {
  try { const url = new URL(raw); return url.username || url.password || url.hash || /%2f|%5c/i.test(url.pathname) ? null : url; } catch { return null; }
}

/** API transport policy is separate from browser routing. No provider/function routes. */
export function allowsApi(f: Fixture | null, raw: string, method: string, body?: unknown): boolean {
  const url = urlFor(raw); if (!url || url.origin !== STAGING) return false;
  if (method === 'POST' && url.pathname === '/auth/v1/token' && url.search === '?grant_type=password' && !f) {
    return !!body && typeof body === 'object' && !Array.isArray(body)
      && keys(body as Record<string, unknown>, ['email', 'password'])
      && Object.values(body).every(value => typeof value === 'string' && value.length > 0);
  }
  const table = /^\/rest\/v1\/(projects|organizations|drawing_sets|drawings|drawing_revisions|submittals|submittal_rounds|submittal_round_revision_evidence)$/.exec(url.pathname)?.[1];
  if (method === 'GET' && table) {
    if (url.searchParams.get('limit') !== '100' || url.searchParams.has('or') || url.searchParams.has('not')) return false;
    if (table === 'projects') return url.searchParams.get('id') === `eq.${PROJECT}`;
    if (table === 'organizations') return url.searchParams.get('id') === `eq.${ORG}`;
    return url.searchParams.get('project_id') === `eq.${PROJECT}`;
  }
  if (!f || !body || typeof body !== 'object' || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  if (method === 'POST' && !url.search && table) {
    return (table === 'drawing_sets' && same(record, setRecord(f)))
      || (table === 'drawings' && same(record, sheetRecord(f)))
      || (table === 'submittals' && same(record, submittalRecord(f)))
      || (table === 'drawing_revisions' && (same(record, revisionRecord(f, 'A')) || same(record, revisionRecord(f, 'B'))));
  }
  if (method === 'PATCH' && table && ['drawing_sets', 'drawings', 'submittals'].includes(table)) {
    const id = table === 'drawing_sets' ? f.set : table === 'drawings' ? f.sheet : f.submittal;
    if (url.search !== `?id=eq.${id}&project_id=eq.${PROJECT}`) return false;
    if (keys(record, ['is_deleted', 'deleted_at']) && record.is_deleted === true && timestamp(record.deleted_at)) return true;
    return (table === 'drawing_sets' && same(record, { current_submittal_id: f.submittal }))
      || (table === 'drawings' && same(record, { file_url: f.paths.B, pdf_page: 1, revision_number: 'B' }));
  }
  if (method !== 'POST' || url.search) return false;
  switch (url.pathname) {
    case '/rest/v1/rpc/get_my_project_role': return same(record, { p_project_id: PROJECT });
    case '/rest/v1/rpc/get_submittal_revision_coverage': return same(record, { p_submittal_id: f.submittal });
    case '/rest/v1/rpc/evaluate_fab_release_set': return same(record, { p_project_id: PROJECT, p_drawing_set_id: f.set });
    case '/rest/v1/rpc/publish_drawing_revision': return ['A', 'B'].some(rev => same(record, { p_revision_id: f.revisions[rev as 'A' | 'B'], p_release_status: 'reviewed' }));
    case '/rest/v1/rpc/apply_submittal_round_workflow': {
      if (!keys(record, ['p_submittal_id', 'p_request_id', 'p_expected_updated_at', 'p_expected_status', 'p_expected_current_round_id', 'p_expected_revision_ids', 'p_patch', 'p_new_round'])
        || record.p_submittal_id !== f.submittal || record.p_new_round !== false || !timestamp(record.p_expected_updated_at)
        || !(record.p_expected_current_round_id === null || isUuid(record.p_expected_current_round_id))) return false;
      const action = (Object.keys(f.requests) as Array<keyof Fixture['requests']>).find(key => f.requests[key] === record.p_request_id);
      if (!action || !same(record.p_patch, workflowPatch(f, action))) return false;
      if (action === 'void') return ['Draft', 'Submitted', 'Approved'].includes(String(record.p_expected_status))
        && [[], [f.revisions.A], [f.revisions.B]].some(ids => same(ids, record.p_expected_revision_ids));
      return record.p_expected_status === (action === 'submit' ? 'Draft' : action === 'approve' ? 'Submitted' : 'Approved')
        && same(record.p_expected_revision_ids, [action === 'stale' ? f.revisions.B : f.revisions.A]);
    }
    default: return false;
  }
}

export function allowsStorage(f: Fixture, raw: string, method: string, bytes?: Uint8Array): boolean {
  const url = urlFor(raw); if (!url || url.origin !== STAGING || url.search) return false;
  return (['A', 'B'] as const).some(revision =>
    (method === 'POST' && url.pathname === `/storage/v1/object/app-files/${f.paths[revision]}`
      && !!bytes && bytes.byteLength < 10_000 && hash(bytes) === hash(syntheticPdf(revision, f.run)))
    || (method === 'GET' && url.pathname === `/storage/v1/object/authenticated/app-files/${f.paths[revision]}`));
}

export { allowsStagingBrowserRequest as allowsBrowser, installStagingNetworkGuard as installBrowserGuard } from '../stagingNetworkGuard.js';

export class ScopedTransport {
  private requests = 0;
  private fixture: Fixture | null;
  private key: string;
  private bearer?: string;
  private network: typeof fetch;
  constructor(fixture: Fixture | null, key: string, bearer?: string, network: typeof fetch = fetch) {
    this.fixture = fixture;
    this.key = key;
    this.bearer = bearer;
    this.network = network;
  }
  async send(path: string, method = 'GET', body?: unknown, bytes?: Uint8Array): Promise<Response> {
    const url = `${STAGING}${path}`;
    if (++this.requests > 180 || !(bytes || path.startsWith('/storage/')
      ? this.fixture && allowsStorage(this.fixture, url, method, bytes)
      : allowsApi(this.fixture, url, method, body))) throw new Error('Blocked out-of-scope synthetic request');
    const response = await this.network(url, {
      method, redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { apikey: this.key, ...(this.bearer ? { Authorization: `Bearer ${this.bearer}` } : {}), 'Content-Type': bytes ? 'application/pdf' : 'application/json', ...(bytes ? { 'x-upsert': 'false' } : {}), Prefer: 'return=representation' },
      body: bytes ? Buffer.from(bytes) : body === undefined ? undefined : JSON.stringify(body),
    });
    return response;
  }
}
