import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { load } from 'js-yaml';
import { prepareRun, safeFailure, assertFabBindings, sealBuild, verifyBuild } from '../drawing-cutover-staging.ts';
import { createClient } from '@supabase/supabase-js';
import { guardRequest, classifyRequest, verifyRequestOwnership, DrawingCutoverTransport, installDrawingBrowserGuard } from '../../e2e/drawingCutoverNetworkGuard.ts';
import type { BrowserContext, Route } from '@playwright/test';
import { summarizeCases } from '../../e2e/drawingCutoverReporter.ts';

const sha = '1'.repeat(40);
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const origin = 'https://ndyfjffsulfbwpmwdmic.supabase.co';
const manifest = () => ({
  version: 1, projectRef: 'ndyfjffsulfbwpmwdmic', candidateSha: sha, runId: id(1),
  expiresAt: '2099-01-01T00:00:00Z', review: { reviewer: 'independent-owner', evidenceSha256: '2'.repeat(64) },
  publicKeySha256: createHash('sha256').update('sb_publishable_offline_placeholder').digest('hex'),
  organizations: [id(2), id(3)],
  projects: [4, 5, 6, 7].map((n) => ({ id: id(n), orgId: id(n < 6 ? 2 : 3), createdBy: id(n < 6 ? 10 : 14) })),
  actors: ['pm', 'viewer', 'field', 'admin', 'foreign', 'removed', 'mfa'].map((alias, n) => ({
    alias, id: id(10 + n), orgId: id(alias === 'foreign' ? 3 : 2),
    emailSha256: createHash('sha256').update(`${alias}@example.invalid`).digest('hex'),
  })),
  entities: [{ table: 'drawings', id: id(30), projectId: id(4) }],
  storage: [{ projectId: id(4), path: `${id(2)}/uploads/${id(4)}/synthetic.pdf`, sha256: '3'.repeat(64), pages: 1 }],
});
const credentials = Object.fromEntries(['pm', 'viewer', 'field', 'admin', 'foreign', 'removed', 'mfa'].map(alias => [alias, { email: `${alias}@example.invalid`, password: 'offline-placeholder-only' }]));
function inputs() {
  const fixture = manifest(); const text = JSON.stringify(fixture);
  return {
    args: ['--target=staging', `--expected-ref=${fixture.projectRef}`, `--candidate-sha=${sha}`, '--phase=preflight', '--fixture=fixture.json'],
    head: sha, fixtureText: text,
    env: { E2E_SUPABASE_URL: origin, E2E_SUPABASE_ANON_KEY: 'sb_publishable_offline_placeholder',
      DRAWING_CUTOVER_MANIFEST_SHA256: createHash('sha256').update(text).digest('hex'),
      DRAWING_CUTOVER_ACTORS: JSON.stringify(credentials) },
  };
}

describe('drawing staging executable safety boundary', () => {
  it('refusesProductionUrlAndRef', async () => {
    const outbound = vi.fn(async () => new Response('{}'));
    const run = inputs(); run.env.E2E_SUPABASE_URL = 'https://kjrwqagyeswwoxpjkcko.supabase.co';
    await expect(async () => { const config = prepareRun(run); await guardRequest(config, { actor: 'pm', method: 'POST', path: '/rest/v1/rpc/get_drawing_command_capabilities', body: { p_project_id: id(4) } }, outbound); }).rejects.toThrow();
    expect(outbound).not.toHaveBeenCalled();
    run.env.E2E_SUPABASE_URL = origin; run.args[1] = '--expected-ref=kjrwqagyeswwoxpjkcko';
    expect(() => prepareRun(run)).toThrow();
  });
  it('refusesUnknownFixture', async () => {
    const outbound = vi.fn(async () => new Response('{}'));
    const config = prepareRun(inputs());
    await expect(guardRequest(config, { actor: 'pm', method: 'POST', path: '/rest/v1/rpc/create_drawing_set_from_review', body: { p_request_id: id(31), p_request: { project_id: id(999) } } }, outbound)).rejects.toThrow();
    expect(outbound).not.toHaveBeenCalled();
  });
  it('missingCredentialsIsFailureNotSkip', () => {
    const run = inputs(); run.env.DRAWING_CUTOVER_ACTORS = '{}';
    expect(() => prepareRun(run)).toThrow();
  });
  it('networkGuardRejectsProductionAndProviderSpend', async () => {
    const outbound = vi.fn(async () => new Response('{}'));
    const config = prepareRun(inputs());
    for (const path of ['https://kjrwqagyeswwoxpjkcko.supabase.co/rest/v1/drawings', 'https://api.openai.com/v1/responses', '/functions/v1/llm-proxy', '/functions/v1/email-send']) {
      await expect(guardRequest(config, { actor: 'pm', method: 'POST', path, body: {} }, outbound)).rejects.toThrow();
    }
    expect(outbound).not.toHaveBeenCalled();
  });
  it('forwards a declared synthetic read and returns the actual server response', async () => {
    const outbound = vi.fn<typeof fetch>(async () => new Response('{"contract_version":1}', { status: 200 }));
    const response = await guardRequest(prepareRun(inputs()), { actor: 'pm', method: 'POST', path: '/rest/v1/rpc/get_drawing_command_capabilities', body: { p_project_id: id(4) } }, outbound);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contract_version: 1 });
    expect(outbound).toHaveBeenCalledOnce();
    expect(String(outbound.mock.calls[0]?.[0])).toBe(`${origin}/rest/v1/rpc/get_drawing_command_capabilities`);
  });
  it('underlying classification preserves declared removed-actor probes without granting readiness', () => {
    const config = prepareRun(inputs()); config.phase = 'acceptance';
    expect(classifyRequest(config, { actor: 'removed', method: 'PATCH', path: `/rest/v1/drawings?id=eq.${id(30)}`, body: { revision_number: 'NEGATIVE-PROBE' } })).toEqual({ mutation: true, projectIds: [id(4)] });
  });
  it('changed fixture ownership blocks the write and is rechecked for every attempt', async () => {
    const config = prepareRun(inputs()); config.phase = 'acceptance';
    let calls = 0;
    const ownership = async () => { calls++; return [{ id: id(4), org_id: id(calls === 1 ? 2 : 3), created_by: id(10) }]; };
    await verifyRequestOwnership(config, [id(4)], { ownership, token: 'offline-user-token' });
    await expect(verifyRequestOwnership(config, [id(4)], { ownership, token: 'offline-user-token' })).rejects.toThrow('OWNERSHIP_CHANGED');
    expect(calls).toBe(2);
  });
  it('refuses redirect responses rather than following a server-selected endpoint', async () => {
    const network = vi.fn<typeof fetch>(async () => new Response(null, { status: 302, headers: { location: 'https://api.openai.com' } }));
    await expect(guardRequest(prepareRun(inputs()), { actor: 'pm', method: 'POST', path: '/rest/v1/rpc/get_drawing_command_capabilities', body: { p_project_id: id(4) } }, network)).rejects.toThrow();
    expect(network.mock.calls[0]?.[1]?.redirect).toBe('error');
  });
  it('a moved drawing blocks a mutation even when its declared parent remains unchanged', async () => {
    const config = prepareRun(inputs()); config.phase = 'acceptance';
    const writes = vi.fn();
    const network: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/')) return Response.json({ access_token: 'offline', refresh_token: 'offline', user: { id: id(10) } });
      if (init?.method === 'PATCH') { writes(); return Response.json([]); }
      if (url.includes('/projects?')) return Response.json([{ id: id(4), org_id: id(2), created_by: id(10) }]);
      return Response.json([{ id: id(30), project_id: id(999) }]);
    };
    const runtime = new DrawingCutoverTransport(config, network); await runtime.signIn('pm');
    // Exercise the underlying observer independently of the now-closed readiness gate.
    await expect(runtime['verifyMutationEntities']({ actor: 'pm', method: 'PATCH', path: `/rest/v1/drawings?id=eq.${id(30)}`, body: { notes: 'synthetic' } })).rejects.toThrow('ENTITY_OWNERSHIP_CHANGED');
    expect(writes).not.toHaveBeenCalled();
  });
  it('refuses service-role credentials before any authentication', () => {
    const run = inputs(); run.env.E2E_SUPABASE_ANON_KEY = `x.${Buffer.from(JSON.stringify({ role: 'service_role', ref: 'ndyfjffsulfbwpmwdmic' })).toString('base64url')}.x`;
    expect(() => prepareRun(run)).toThrow('PUBLIC_KEY_REQUIRED');
  });
  it('an opaque public key must match the independently reviewed fixture binding', () => {
    const run = inputs(); run.env.E2E_SUPABASE_ANON_KEY = 'sb_publishable_other_project';
    expect(() => prepareRun(run)).toThrow('PUBLIC_KEY_BINDING_REQUIRED');
  });
  it('refuses duplicate flags, wrong source, forged manifest and expired fixture', () => {
    const duplicate = inputs(); duplicate.args.push('--phase=acceptance'); expect(() => prepareRun(duplicate)).toThrow();
    const wrong = inputs(); wrong.head = '9'.repeat(40); expect(() => prepareRun(wrong)).toThrow();
    const forged = inputs(); forged.fixtureText = forged.fixtureText.replace(id(4), id(999)); expect(() => prepareRun(forged)).toThrow();
    const expired = inputs(); expired.fixtureText = expired.fixtureText.replace('2099-01-01', '2000-01-01'); expired.env.DRAWING_CUTOVER_MANIFEST_SHA256 = createHash('sha256').update(expired.fixtureText).digest('hex'); expect(() => prepareRun(expired)).toThrow();
  });
  it('rejects credential mismatch before fetch and wrong authenticated identity before reads', async () => {
    const network = vi.fn<typeof fetch>(async () => Response.json({ access_token: 'private-access', refresh_token: 'private-refresh', user: { id: id(999) } }));
    const runtime = new DrawingCutoverTransport(prepareRun(inputs()), network);
    await expect(runtime.fetchFor('pm')(`${origin}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: 'sb_publishable_offline_placeholder' }, body: JSON.stringify({ email: 'unknown@example.invalid', password: 'private' }) })).rejects.toThrow('ACTOR_CREDENTIAL_BINDING');
    expect(network).not.toHaveBeenCalled();
    await expect(runtime.signIn('pm')).rejects.toThrow('AUTH_IDENTITY_MISMATCH');
    expect(network).toHaveBeenCalledOnce();
    expect(() => runtime.session('pm')).toThrow();
  });
  it('a runtime Node client cannot replace the captured actor token or call a provider', async () => {
    const network = vi.fn<typeof fetch>(async () => Response.json({ access_token: 'private-access', refresh_token: 'private-refresh', user: { id: id(10) } }));
    const runtime = new DrawingCutoverTransport(prepareRun(inputs()), network); await runtime.signIn('pm');
    await expect(runtime.fetchFor('pm')(`${origin}/rest/v1/projects?id=eq.${id(4)}`, { headers: { apikey: 'sb_publishable_offline_placeholder', Authorization: 'Bearer other-user' } })).rejects.toThrow('ACTOR_TOKEN_MISMATCH');
    await expect(runtime.fetchFor('pm')('https://api.openai.com/v1/responses', { method: 'POST', body: '{}' })).rejects.toThrow('STAGING_ORIGIN_REQUIRED');
    expect(network).toHaveBeenCalledOnce();
  });
  it('duplicate filters and embedded selects cannot widen a fixture read', async () => {
    const network = vi.fn<typeof fetch>(async () => new Response('[]'));
    for (const path of [`/rest/v1/drawings?id=eq.${id(30)}&id=neq.${id(30)}`, `/rest/v1/drawings?id=eq.${id(30)}&select=*,projects(*)`, `/rest/v1/drawings?project_id=eq.${id(999)}`]) {
      await expect(guardRequest(prepareRun(inputs()), { actor: 'pm', method: 'GET', path }, network)).rejects.toThrow();
    }
    expect(network).not.toHaveBeenCalled();
  });
  it('an encoded plain projection remains usable without widening scope', async () => {
    const network = vi.fn<typeof fetch>(async () => new Response('[]'));
    const response = await guardRequest(prepareRun(inputs()), { actor: 'pm', method: 'GET', path: `/rest/v1/drawings?id=eq.${id(30)}&select=id%2Cproject_id` }, network);
    expect(response.status).toBe(200); expect(network).toHaveBeenCalledOnce();
  });
  it('partial and skipped cases cannot become acceptance and unknown private titles are removed', () => {
    const summary = summarizeCases([{ id: 'drawing:preflight', status: 'passed', durationMs: 2 }]);
    expect(summary.status).toBe('INCOMPLETE'); expect(summary.missing).toContain('drawing:mfa');
    const privateTitle = 'Authorization: Bearer private-token https://example.invalid/signed?token=private';
    const invalid = summarizeCases([{ id: privateTitle, status: 'passed', durationMs: 1 }]);
    expect(invalid.status).toBe('FAIL'); expect(JSON.stringify(invalid)).not.toContain('private-token');
    expect(summarizeCases([{ id: 'fab:viewer', status: 'skipped', durationMs: 0 }]).status).toBe('INCOMPLETE');
  });
  it('browser adapter forwards actual bounded responses and aborts provider requests without fetch', async () => {
    const network = vi.fn<typeof fetch>(async input => String(input).includes('/auth/')
      ? Response.json({ access_token: 'offline', refresh_token: 'offline', user: { id: id(10) } })
      : Response.json({ actual: 'server-response' }, { status: 403 }));
    const runtime = new DrawingCutoverTransport(prepareRun(inputs()), network); await runtime.signIn('pm');
    let routeHandler: (route: Route) => Promise<void> = async () => { throw new Error('not installed'); };
    const context = { routeWebSocket: vi.fn(), route: async (_pattern: string, handler: typeof routeHandler) => { routeHandler = handler; } } as unknown as BrowserContext;
    const guard = await installDrawingBrowserGuard(context, runtime, 'pm');
    const fulfill = vi.fn(); const abort = vi.fn();
    const route = (url: string) => ({ request: () => ({ url: () => url, method: () => 'POST', headers: () => ({ apikey: 'sb_publishable_offline_placeholder', Authorization: 'Bearer offline' }), postData: () => JSON.stringify({ p_project_id: id(4) }) }), fulfill, abort }) as unknown as Route;
    await routeHandler(route(`${origin}/rest/v1/rpc/get_drawing_command_capabilities`));
    expect(fulfill.mock.calls[0][0].status).toBe(403);
    expect(fulfill.mock.calls[0][0].body.toString()).toBe('{"actual":"server-response"}');
    guard.assertNoRefusals();
    await routeHandler(route('https://api.openai.com/v1/responses'));
    expect(abort).toHaveBeenCalledWith('blockedbyclient'); expect(network).toHaveBeenCalledTimes(2);
    expect(() => guard.assertNoRefusals()).toThrow('BROWSER_REQUEST_BINDINGS_REQUIRED');
  });
  it('the original fab suite cannot be entered with missing viewer or unbound disposable IDs', () => {
    const config = prepareRun(inputs()); config.phase = 'acceptance';
    expect(() => assertFabBindings(config, {})).toThrow('FAB_RUNNER_BINDINGS_REQUIRED');
    expect(safeFailure(new Error('password=private Authorization: Bearer private'))).toBe('RUNNER_REFUSED');
  });
  it('executes the workflow gate: main ancestor and all four checks must pass in the same exact push run', async () => {
    const workflow = load(readFileSync('.github/workflows/drawing-cutover-staging.yml', 'utf8')) as { jobs: { verify: { steps: { with: { script: string } }[] } } };
    const source = workflow.jobs.verify.steps[0].with.script;
    const execute = new Function('context', 'github', 'core', 'process', `return (async()=>{${source}})();`) as (...args: unknown[]) => Promise<void>;
    const expected = ['Lint + Typecheck + Test + Build', 'Secret scan (gitleaks)', 'Release Edge Function typecheck', 'Commercial SQL + concurrent PostgreSQL acceptance'];
    let jobs = expected.slice(0, 3).map(name => ({ name, conclusion: 'success' }));
    const output = vi.fn();
    const github = { rest: { repos: { compareCommitsWithBasehead: async () => ({ data: { merge_base_commit: { sha } } }) }, actions: { listWorkflowRuns: 'runs', listJobsForWorkflowRun: 'jobs' } },
      paginate: async (method: string) => method === 'runs' ? [{ head_sha: sha, event: 'push', status: 'completed', id: 1 }] : jobs };
    const context = { ref: 'refs/heads/main', eventName: 'workflow_dispatch', repo: {}, sha };
    const env = { CANDIDATE_SHA: sha, MANIFEST_SHA: '2'.repeat(64), PHASE: 'acceptance' };
    await expect(execute({ ...context, ref: 'refs/heads/feature' }, github, { setOutput: output }, { env })).rejects.toThrow('MAIN_DISPATCH_REQUIRED');
    await expect(execute(context, github, { setOutput: output }, { env })).rejects.toThrow('EXACT_SOURCE_CHECKS_REQUIRED');
    expect(output).not.toHaveBeenCalled();
    jobs = expected.map(name => ({ name, conclusion: 'success' }));
    await execute(context, github, { setOutput: output }, { env });
    expect(output).toHaveBeenCalledWith('candidate_sha', sha);
  });
  it('R1 direct acceptance runtime refuses append-only fab writes before any mutation forwarding', async () => {
    const config = prepareRun(inputs()); config.phase = 'acceptance';
    const writes = vi.fn();
    const network: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/')) return Response.json({ access_token: 'offline', refresh_token: 'offline', user: { id: id(10) } });
      if (url.includes('/fab_release_log')) { writes(); return Response.json({ id: id(40) }); }
      if (url.includes('/projects?')) return Response.json([{ id: id(4), org_id: id(2), created_by: id(10) }]);
      return Response.json([{ id: id(30), project_id: id(4) }]);
    };
    const runtime = new DrawingCutoverTransport(config, network); await runtime.signIn('pm');
    await expect(runtime.request({ actor: 'pm', method: 'POST', path: '/rest/v1/fab_release_log', body: {
      project_id: id(4), package_kind: 'fab_release', package_name: 'E2E clean package', drawing_ids: [id(30)], drawing_count: 1, override_reason: null,
    } })).rejects.toThrow('MUTATION_PREREQUISITES_UNPROVED');
    expect(writes).not.toHaveBeenCalled();
  });
  it('R1 dedicated config refuses otherwise valid fixture/build inputs before enabling mutations', async () => {
    const config = prepareRun(inputs()); config.phase = 'acceptance';
    config.manifest.entities.push({ table: 'drawings', id: id(31), projectId: id(4) });
    config.manifest.fab = { projectId: id(4), blockedDrawingId: id(30), cleanDrawingId: id(31) };
    vi.stubEnv('DRAWING_CUTOVER_ENABLED', 'true'); vi.stubEnv('E2E_MUTATIONS_ENABLED', 'false');
    const actual = await vi.importActual<typeof import('../drawing-cutover-staging.ts')>('../drawing-cutover-staging.ts');
    // Only external fixture/build-loading boundaries are supplied as valid here.
    // The dedicated config and its readiness behavior remain the real code.
    vi.doMock('../drawing-cutover-staging.ts', () => ({ ...actual, loadRunConfig: () => config, verifyBuild: () => undefined }));
    try {
      await expect(import('../../playwright.drawing-cutover.config.ts').then(() => 'CONFIG_ALLOWED')).rejects.toThrow('MUTATION_PREREQUISITES_UNPROVED');
      expect(process.env.E2E_MUTATIONS_ENABLED).toBe('false');
    } finally { vi.doUnmock('../drawing-cutover-staging.ts'); vi.unstubAllEnvs(); vi.resetModules(); }
  });
  it('R1 final mutation guard cannot be opened by disposable environment flags or valid parent proofs', async () => {
    const config = prepareRun(inputs()); config.phase = 'acceptance';
    const ownership = vi.fn(async () => [{ id: id(4), org_id: id(2), created_by: id(10) }]);
    const network = vi.fn<typeof fetch>(async () => Response.json([]));
    vi.stubEnv('E2E_MUTATIONS_ENABLED', 'true'); vi.stubEnv('E2E_MUTATION_FIXTURE_KIND', 'disposable');
    try {
      await expect(guardRequest(config, { actor: 'removed', method: 'PATCH', path: `/rest/v1/drawings?id=eq.${id(30)}`, body: { revision_number: 'E2E NEGATIVE' } }, network, { token: 'offline', ownership })).rejects.toThrow('MUTATION_PREREQUISITES_UNPROVED');
      expect(ownership).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });
  it('R1 a sealed A-key build refuses B-key runtime and accepts the actual A-key binding', () => {
    const directory = mkdtempSync(join(tmpdir(), 'drawing-cutover-r1-'));
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const keyA = 'sb_publishable_offline_build_a'; const keyB = 'sb_publishable_offline_runtime_b';
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    try {
      writeFileSync(join(directory, 'index.html'), '<script type="module" src="/app.js"></script>');
      writeFileSync(join(directory, 'app.js'), `const actualEnv={VITE_SUPABASE_URL:${JSON.stringify(origin)},VITE_SUPABASE_ANON_KEY:${JSON.stringify(keyA)},VITE_APP_VERSION:${JSON.stringify(head)}}; globalThis.clientConfig=actualEnv;`);
      // Current sealing environment is deliberately B; proof must come from A bytes.
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', keyB);
      sealBuild(head, directory);
      expect(() => verifyBuild(head, hash(keyB), directory)).toThrow('BUILD_PUBLIC_KEY_MISMATCH');
      expect(() => verifyBuild(head, hash(keyA), directory)).not.toThrow();
      const marker = readFileSync(join(directory, 'drawing-cutover-build.json'), 'utf8');
      expect(marker.includes(keyA) || marker.includes(keyB)).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      if (!resolve(directory).startsWith(`${resolve(tmpdir())}${sep}drawing-cutover-r1-`)) throw new Error('TEMP_SCOPE_REFUSED');
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('R1 Node SDK supplied public key mismatch refuses before auth fetch, matching key forwards', async () => {
    const config = prepareRun(inputs());
    const network = vi.fn<typeof fetch>(async () => Response.json({ access_token: 'offline', refresh_token: 'offline', token_type: 'bearer', expires_in: 3600, user: { id: id(10), aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }));
    const runtime = new DrawingCutoverTransport(config, network);
    const client = (key: string) => createClient(origin, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: runtime.fetchFor('pm') } });
    const denied = await client('sb_publishable_wrong').auth.signInWithPassword(credentials.pm);
    expect(denied.error !== null).toBe(true); expect(network).not.toHaveBeenCalled();
    const allowed = await client(config.anonKey).auth.signInWithPassword(credentials.pm);
    expect(allowed.error === null && allowed.data.user?.id === id(10)).toBe(true); expect(network).toHaveBeenCalledOnce();
    await expect(runtime.fetchFor('pm')(`${origin}/rest/v1/projects?id=eq.${id(4)}`, { headers: { apikey: 'sb_publishable_wrong', Authorization: 'Bearer offline' } })).rejects.toThrow('CLIENT_PUBLIC_KEY_MISMATCH');
    await expect(runtime.fetchFor('pm')(`${origin}/auth/v1/token?grant_type=password`, { method: 'POST', body: JSON.stringify(credentials.pm) })).rejects.toThrow('CLIENT_PUBLIC_KEY_MISMATCH');
    expect(network).toHaveBeenCalledOnce();
  });
  it('R1 browser supplied public key mismatch aborts before auth fetch', async () => {
    const network = vi.fn<typeof fetch>(async () => Response.json({ access_token: 'offline', refresh_token: 'offline', user: { id: id(10) } }));
    const runtime = new DrawingCutoverTransport(prepareRun(inputs()), network);
    let routeHandler: (route: Route) => Promise<void> = async () => { throw new Error('not installed'); };
    const context = { routeWebSocket: vi.fn(), route: async (_pattern: string, handler: typeof routeHandler) => { routeHandler = handler; } } as unknown as BrowserContext;
    const guard = await installDrawingBrowserGuard(context, runtime, 'pm');
    const abort = vi.fn(); const fulfill = vi.fn();
    await routeHandler({ request: () => ({ url: () => `${origin}/auth/v1/token?grant_type=password`, method: () => 'POST', headers: () => ({ apikey: 'sb_publishable_wrong' }), postData: () => JSON.stringify(credentials.pm) }), abort, fulfill } as unknown as Route);
    expect(network).not.toHaveBeenCalled(); expect(abort).toHaveBeenCalledWith('blockedbyclient'); expect(fulfill).not.toHaveBeenCalled();
    expect(() => guard.assertNoRefusals()).toThrow('BROWSER_REQUEST_BINDINGS_REQUIRED');
  });
  it('R1 sealing refuses missing, ambiguous, nonliteral, foreign-origin and wrong-source emitted config', () => {
    const directory = mkdtempSync(join(tmpdir(), 'drawing-cutover-r1-'));
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const env = { VITE_SUPABASE_URL: origin, VITE_SUPABASE_ANON_KEY: 'sb_publishable_offline_a', VITE_APP_VERSION: head };
    const cases = [
      [`const stage=${JSON.stringify(origin)};`, 'BUILD_PUBLIC_CONFIG_REQUIRED'],
      [`const a=${JSON.stringify(env)};const b=${JSON.stringify(env)};`, 'BUILD_PUBLIC_CONFIG_AMBIGUOUS'],
      [`const a={VITE_SUPABASE_URL:${JSON.stringify(origin)},VITE_SUPABASE_ANON_KEY:unknownKey,VITE_APP_VERSION:${JSON.stringify(head)}};`, 'BUILD_CONFIG_LITERAL_REQUIRED'],
      [`const stage=${JSON.stringify(origin)};const a=${JSON.stringify({ ...env, VITE_SUPABASE_URL: 'https://other.supabase.co' })};`, 'STAGING_ORIGIN_REQUIRED'],
      [`const a=${JSON.stringify({ ...env, VITE_APP_VERSION: '9'.repeat(40) })};`, 'BUILD_SOURCE_MISMATCH'],
    ];
    try {
      writeFileSync(join(directory, 'index.html'), '<script type="module" src="/app.js"></script>');
      for (const [code, reason] of cases) {
        writeFileSync(join(directory, 'app.js'), code);
        expect(() => sealBuild(head, directory)).toThrow(reason);
      }
      writeFileSync(join(directory, 'app.js'), `const actualEnv=${JSON.stringify(env)};globalThis.clientConfig=actualEnv;`);
      sealBuild(head, directory);
      const markerPath = join(directory, 'drawing-cutover-build.json');
      const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as Record<string, unknown>;
      marker.publicKeySha256 = '9'.repeat(64);
      writeFileSync(markerPath, JSON.stringify(marker));
      expect(() => verifyBuild(head, createHash('sha256').update(env.VITE_SUPABASE_ANON_KEY).digest('hex'), directory)).toThrow('BUILD_CONFIG_MISMATCH');
    } finally {
      if (!resolve(directory).startsWith(`${resolve(tmpdir())}${sep}drawing-cutover-r1-`)) throw new Error('TEMP_SCOPE_REFUSED');
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

export { inputs, id, sha, manifest };
