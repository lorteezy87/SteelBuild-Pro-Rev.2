import { STAGE_ORIGIN, PREVIEW_ORIGIN, requireCondition } from './drawing-cutover-setup.ts';
import type { ActorAlias, RunConfig } from './drawing-cutover-setup.ts';
import type { BrowserContext } from '@playwright/test';

export interface GuardedRequest { actor: ActorAlias; method: string; path: string; body?: unknown; representation?: boolean; single?: boolean }
export interface ParentProof { id: string; org_id: string; created_by: string }
export interface RequestContext { token: string; ownership: (projectIds: string[]) => Promise<ParentProof[]> }
const projectReads = new Set(['get_drawing_command_capabilities', 'get_drawing_revision_sources', 'get_drawing_source_observations']);
const commands = new Set(['create_drawing_set_from_review', 'apply_drawing_set_revision', 'get_drawing_command_receipt']);
function object(value: unknown): Record<string, unknown> {
  requireCondition(value && typeof value === 'object' && !Array.isArray(value), 'REQUEST_BODY_REQUIRED');
  return value as Record<string, unknown>;
}
/** Validates scope only. SQL still arbitrates the actor's actual authorization. */
export function classifyRequest(config: RunConfig, request: GuardedRequest): { mutation: boolean; projectIds: string[] } {
  requireCondition(config.manifest.actors.some(a => a.alias === request.actor), 'ACTOR_NOT_DECLARED');
  requireCondition(request.path.startsWith('/') && !request.path.startsWith('//') && !/[\\#]/.test(request.path), 'REQUEST_PATH_REFUSED');
  const url = new URL(request.path, STAGE_ORIGIN);
  requireCondition(url.origin === STAGE_ORIGIN && !url.pathname.includes('%') && !request.path.split('?')[0].includes('..'), 'REQUEST_ROUTE_REFUSED');
  requireCondition(new Set(url.searchParams.keys()).size === [...url.searchParams.keys()].length, 'DUPLICATE_QUERY_REFUSED');
  const projection = url.searchParams.get('select');
  requireCondition(!projection || projection === '*' || /^[a-z_]+(?:,[a-z_]+)*$/.test(projection), 'EMBEDDED_SELECT_REFUSED');
  const limit = url.searchParams.get('limit');
  requireCondition(!limit || (/^[1-9][0-9]*$/.test(limit) && Number(limit) <= 1000), 'READ_LIMIT_REFUSED');
  const order = url.searchParams.get('order');
  requireCondition(!order || /^(id|created_at|updated_at)\.(asc|desc)$/.test(order), 'READ_ORDER_REFUSED');
  const table = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)?.[1];
  if (table) {
    requireCondition(['GET', 'HEAD', 'PATCH', 'POST'].includes(request.method), 'REQUEST_METHOD_REFUSED');
    if (table === 'fab_release_log' && request.method === 'POST') {
      const body = object(request.body);
      requireCondition(Object.keys(body).every(k => ['project_id', 'package_kind', 'package_name', 'drawing_ids', 'drawing_count', 'override_reason'].includes(k)), 'FAB_FIELDS_REFUSED');
      requireCondition(body.package_kind === 'fab_release' && Array.isArray(body.drawing_ids) && body.drawing_ids.length > 0
        && body.drawing_ids.length <= 2 && body.drawing_count === body.drawing_ids.length
        && body.drawing_ids.every(id => config.manifest.entities.some(e => e.table === 'drawings' && e.id === id && e.projectId === body.project_id)), 'FAB_FIXTURE_REQUIRED');
      requireCondition(typeof body.project_id === 'string' && config.manifest.projects.some(p => p.id === body.project_id), 'UNKNOWN_FIXTURE_PROJECT');
      requireCondition(typeof body.package_name === 'string' && body.package_name.startsWith('E2E ') && body.package_name.length < 100
        && (body.override_reason === null || (typeof body.override_reason === 'string' && body.override_reason.startsWith('E2E:') && body.override_reason.length < 200)), 'FAB_SYNTHETIC_TEXT_REQUIRED');
      requireCondition([...url.searchParams.keys()].every(k => k === 'select'), 'QUERY_REFUSED');
      return { mutation: true, projectIds: [body.project_id] };
    }
    requireCondition([...url.searchParams.keys()].every(k => ['id', 'project_id', 'org_id', 'select', 'limit', 'order'].includes(k)), 'QUERY_REFUSED');
    const exactId = url.searchParams.get('id')?.replace(/^eq\./, '');
    const exactProject = url.searchParams.get('project_id')?.replace(/^eq\./, '');
    requireCondition(!url.searchParams.get('id') || url.searchParams.get('id') === `eq.${exactId}`, 'QUERY_REFUSED');
    requireCondition(!url.searchParams.get('project_id') || url.searchParams.get('project_id') === `eq.${exactProject}`, 'QUERY_REFUSED');
    if (table === 'projects' && ['GET', 'HEAD'].includes(request.method)) {
      requireCondition(config.manifest.projects.some(p => p.id === exactId), 'UNKNOWN_FIXTURE_PROJECT');
      return { mutation: false, projectIds: [exactId!] };
    }
    if (table === 'organizations' && ['GET', 'HEAD'].includes(request.method)) {
      requireCondition(config.manifest.organizations.includes(exactId ?? ''), 'UNKNOWN_FIXTURE_ORG');
      return { mutation: false, projectIds: [] };
    }
    const matching = config.manifest.entities.filter(e => e.table === table && (exactId ? e.id === exactId : e.projectId === exactProject));
    requireCondition(matching.length > 0 && (exactId || exactProject), 'UNKNOWN_FIXTURE_ENTITY');
    if (request.method === 'PATCH') {
      requireCondition(table === 'drawings' && exactId && !exactProject, 'MUTATION_SCOPE_REFUSED');
      const body = object(request.body);
      requireCondition(Object.keys(body).length > 0 && Object.keys(body).every(k => ['notes', 'markup_scale', 'revision_number', 'pdf_page', 'file_url', 'drawing_set_id'].includes(k)), 'PATCH_FIELDS_REFUSED');
      for (const [key, value] of Object.entries(body)) {
        if (key === 'drawing_set_id') requireCondition(config.manifest.entities.some(e => e.table === 'drawing_sets' && e.id === value && e.projectId === matching[0].projectId), 'UNKNOWN_FIXTURE_ENTITY');
        else if (key === 'file_url') requireCondition(config.manifest.storage.some(s => s.path === value && s.projectId === matching[0].projectId), 'UNKNOWN_FIXTURE_SOURCE');
        else requireCondition(value === null || (typeof value === 'string' && value.length <= 200) || (typeof value === 'number' && Number.isFinite(value)), 'PATCH_VALUE_REFUSED');
      }
    } else requireCondition(['GET', 'HEAD'].includes(request.method), 'MUTATION_SCOPE_REFUSED');
    return { mutation: request.method === 'PATCH', projectIds: [...new Set(matching.map(e => e.projectId))] };
  }
  requireCondition(!url.search && request.method === 'POST', 'REQUEST_ROUTE_REFUSED');
  const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname)?.[1];
  requireCondition(rpc && (projectReads.has(rpc) || commands.has(rpc)), 'REQUEST_ROUTE_REFUSED');
  const body = object(request.body);
  const payload = commands.has(rpc) ? object(body.p_request) : body;
  const projectId = payload.project_id ?? payload.p_project_id;
  requireCondition(typeof projectId === 'string' && config.manifest.projects.some(p => p.id === projectId), 'UNKNOWN_FIXTURE_PROJECT');
  // Commands require separately bound exact review payloads; no generic JSON write allowance.
  requireCondition(!commands.has(rpc), 'COMMAND_REVIEW_BINDINGS_REQUIRED');
  if (rpc === 'get_drawing_command_capabilities') requireCondition(Object.keys(body).length === 1, 'RPC_FIELDS_REFUSED');
  if (rpc === 'get_drawing_revision_sources') requireCondition(Object.keys(body).every(k => ['p_project_id', 'p_paths'].includes(k))
    && Array.isArray(body.p_paths) && body.p_paths.length > 0 && body.p_paths.length <= 250
    && body.p_paths.every(path => config.manifest.storage.some(s => s.path === path && s.projectId === projectId)), 'UNKNOWN_FIXTURE_SOURCE');
  if (rpc === 'get_drawing_source_observations') requireCondition(Object.keys(body).every(k => ['p_project_id', 'p_limit'].includes(k))
    && (body.p_limit === undefined || body.p_limit === 500), 'OBSERVATION_CURSOR_BINDINGS_REQUIRED');
  return { mutation: false, projectIds: [projectId] };
}
export async function guardRequest(config: RunConfig, request: GuardedRequest, transport: typeof fetch, context?: RequestContext): Promise<Response> {
  const classification = classifyRequest(config, request);
  if (classification.mutation) {
    requireCondition(config.phase === 'acceptance' && context?.token && context.ownership, 'LIVE_OWNERSHIP_PROOF_REQUIRED');
    const parents = await context.ownership(classification.projectIds);
    requireCondition(parents.length === classification.projectIds.length && new Set(parents.map(p => p.id)).size === parents.length, 'OWNERSHIP_CHANGED');
    for (const id of classification.projectIds) {
      const expected = config.manifest.projects.find(p => p.id === id)!;
      const current = parents.find(p => p.id === id);
      requireCondition(current && current.org_id === expected.orgId && current.created_by === expected.createdBy, 'OWNERSHIP_CHANGED');
    }
  }
  const response = await transport(`${STAGE_ORIGIN}${request.path}`, {
    method: request.method, body: request.body === undefined ? undefined : JSON.stringify(request.body), redirect: 'error',
    headers: { apikey: config.anonKey, 'content-type': 'application/json', ...(context?.token ? { Authorization: `Bearer ${context.token}` } : {}), ...(request.representation ? { Prefer: 'return=representation' } : {}), ...(request.single ? { Accept: 'application/vnd.pgrst.object+json' } : {}) },
  });
  requireCondition(!response.redirected && !(response.status >= 300 && response.status < 400), 'REDIRECT_OR_TRANSPORT_REFUSED');
  return response;
}

interface Session { access_token: string; refresh_token: string; user: { id: string }; [key: string]: unknown }
/** One shared guarded transport for CLI, Node Supabase clients, and browser routes. */
export class DrawingCutoverTransport {
  readonly config: RunConfig;
  private readonly network: typeof fetch;
  private readonly sessions = new Map<ActorAlias, Session>();
  readonly outcomes: { kind: 'forwarded'; status: number; mutation: boolean }[] = [];
  constructor(config: RunConfig, network: typeof fetch = fetch) { this.config = config; this.network = network; }
  session(actor: ActorAlias): Session {
    const session = this.sessions.get(actor); requireCondition(session, 'ACTOR_NOT_AUTHENTICATED'); return session;
  }
  async signIn(actor: ActorAlias): Promise<Session> {
    const credential = this.config.actors[actor];
    const response = await this.fetchFor(actor)(`${STAGE_ORIGIN}/auth/v1/token?grant_type=password`, {
      method: 'POST', body: JSON.stringify({ email: credential.email, password: credential.password }),
    });
    requireCondition(response.ok, 'SYNTHETIC_AUTH_FAILED');
    return this.session(actor);
  }
  async verifyParents(ids: string[]): Promise<ParentProof[]> {
    const proofs: ParentProof[] = [];
    for (const id of ids) {
      const project = this.config.manifest.projects.find(p => p.id === id);
      requireCondition(project, 'UNKNOWN_FIXTURE_PROJECT');
      const observer = this.config.manifest.actors.find(a => a.id === project.createdBy);
      requireCondition(observer, 'FIXTURE_OBSERVER_REQUIRED');
      const response = await this.request({ actor: observer.alias, method: 'GET', path: `/rest/v1/projects?id=eq.${id}&select=id,org_id,created_by` });
      requireCondition(response.ok, 'OWNERSHIP_READ_FAILED');
      const rows: unknown = await response.json();
      requireCondition(Array.isArray(rows) && rows.length === 1, 'OWNERSHIP_READ_FAILED');
      const row = object(rows[0]);
      requireCondition(row.id === id && row.org_id === project.orgId && row.created_by === project.createdBy, 'OWNERSHIP_CHANGED');
      proofs.push({ id, org_id: project.orgId, created_by: project.createdBy });
    }
    return proofs;
  }
  async request(request: GuardedRequest): Promise<Response> {
    const classification = classifyRequest(this.config, request);
    const response = await guardRequest(this.config, request, this.network, {
      token: this.session(request.actor).access_token, ownership: async ids => {
        const parents = await this.verifyParents(ids);
        await this.verifyMutationEntities(request);
        return parents;
      },
    });
    this.outcomes.push({ kind: 'forwarded', status: response.status, mutation: classification.mutation });
    return response;
  }
  private async verifyMutationEntities(request: GuardedRequest): Promise<void> {
    const url = new URL(request.path, STAGE_ORIGIN);
    const body = object(request.body);
    const target = url.searchParams.get('id')?.slice(3);
    const entityIds = new Set<unknown>([target, body.drawing_set_id, ...(Array.isArray(body.drawing_ids) ? body.drawing_ids : [])].filter(Boolean));
    requireCondition(entityIds.size > 0, 'ENTITY_OWNERSHIP_REQUIRED');
    for (const entityId of entityIds) {
      const entity = this.config.manifest.entities.find(e => e.id === entityId);
      requireCondition(entity, 'UNKNOWN_FIXTURE_ENTITY');
      const parent = this.config.manifest.projects.find(p => p.id === entity.projectId)!;
      const observer = this.config.manifest.actors.find(a => a.id === parent.createdBy)!;
      const response = await this.request({ actor: observer.alias, method: 'GET', path: `/rest/v1/${entity.table}?id=eq.${entity.id}&select=id,project_id` });
      requireCondition(response.ok, 'ENTITY_OWNERSHIP_READ_FAILED');
      const rows: unknown = await response.json();
      requireCondition(Array.isArray(rows) && rows.length === 1, 'ENTITY_OWNERSHIP_CHANGED');
      const row = object(rows[0]);
      requireCondition(row.id === entity.id && row.project_id === entity.projectId, 'ENTITY_OWNERSHIP_CHANGED');
    }
  }
  fetchFor(actor: ActorAlias): typeof fetch {
    return async (input, init) => {
      const incoming = new Request(input, init);
      const url = new URL(incoming.url);
      requireCondition(url.origin === STAGE_ORIGIN && !url.username && !url.password && !url.hash, 'STAGING_ORIGIN_REQUIRED');
      const text = ['GET', 'HEAD'].includes(incoming.method) ? undefined : await incoming.text();
      requireCondition(!text || Buffer.byteLength(text) <= 1_048_576, 'REQUEST_SIZE_REFUSED');
      let body: unknown;
      try { body = text ? JSON.parse(text) : undefined; } catch { throw new Error('JSON_REQUEST_REQUIRED'); }
      if (url.pathname === '/auth/v1/token') {
        requireCondition(incoming.method === 'POST' && url.search === '?grant_type=password', 'AUTH_OPERATION_REFUSED');
        const supplied = object(body); const expected = this.config.actors[actor];
        requireCondition(Object.keys(supplied).every(k => ['email', 'password', 'gotrue_meta_security'].includes(k))
          && supplied.email === expected.email && supplied.password === expected.password, 'ACTOR_CREDENTIAL_BINDING');
        const response = await this.network(`${STAGE_ORIGIN}/auth/v1/token?grant_type=password`, { method: 'POST', redirect: 'error',
          headers: { apikey: this.config.anonKey, 'content-type': 'application/json' }, body: JSON.stringify({ email: expected.email, password: expected.password }) });
        requireCondition(!response.redirected && !(response.status >= 300 && response.status < 400), 'AUTH_REDIRECT_REFUSED');
        requireCondition(response.ok, 'SYNTHETIC_AUTH_FAILED');
        const session = object(await response.clone().json()); const user = object(session.user);
        requireCondition(user.id === this.config.manifest.actors.find(a => a.alias === actor)?.id
          && typeof session.access_token === 'string' && typeof session.refresh_token === 'string', 'AUTH_IDENTITY_MISMATCH');
        this.sessions.set(actor, session as Session);
        return response;
      }
      const token = this.session(actor).access_token;
      requireCondition(incoming.headers.get('Authorization') === `Bearer ${token}`, 'ACTOR_TOKEN_MISMATCH');
      if (url.pathname === '/auth/v1/user') {
        requireCondition(incoming.method === 'GET' && !url.search, 'AUTH_OPERATION_REFUSED');
        const response = await this.network(incoming.url, { method: 'GET', redirect: 'error', headers: { apikey: this.config.anonKey, Authorization: `Bearer ${token}` } });
        requireCondition(!response.redirected && !(response.status >= 300 && response.status < 400), 'AUTH_REDIRECT_REFUSED');
        return response;
      }
      return this.request({ actor, method: incoming.method, path: `${url.pathname}${url.search}`, body,
        representation: incoming.headers.get('Prefer')?.split(',').includes('return=representation'), single: incoming.headers.get('Accept') === 'application/vnd.pgrst.object+json' });
    };
  }
}

/** All contexts must install this before navigation; no service-worker or WS escape. */
export async function installDrawingBrowserGuard(context: BrowserContext, runtime: DrawingCutoverTransport, actor: ActorAlias) {
  const refusals: string[] = [];
  await context.routeWebSocket('**/*', socket => { refusals.push('WEBSOCKET_REFUSED'); socket.close(); });
  await context.route('**/*', async route => {
    try {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin === PREVIEW_ORIGIN) {
        requireCondition(request.method() === 'GET' && !url.username && !url.password
          && (/^\/assets\/[A-Za-z0-9_.-]+$/.test(url.pathname) || /^\/(?:|Drawings|DrawingSubmittalHub|Login|drawing-cutover-build\.json|favicon\.ico)$/.test(url.pathname)), 'LOCAL_PATH_REFUSED');
        await route.continue(); return;
      }
      requireCondition(url.origin === STAGE_ORIGIN, 'EXTERNAL_ORIGIN_REFUSED');
      const response = await runtime.fetchFor(actor)(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() ?? undefined });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => { if (!['content-length', 'content-encoding', 'set-cookie'].includes(key)) headers[key] = value; });
      await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
    } catch {
      refusals.push('UNBOUND_BROWSER_REQUEST');
      await route.abort('blockedbyclient');
    }
  });
  return { assertNoRefusals() { requireCondition(refusals.length === 0, 'BROWSER_REQUEST_BINDINGS_REQUIRED'); } };
}
