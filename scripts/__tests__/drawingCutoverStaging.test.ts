import { describe, expect, it, vi } from 'vitest';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync, linkSync, readdirSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { load } from 'js-yaml';
import { prepareRun, safeFailure, assertFabBindings, sealBuild, verifyBuild } from '../drawing-cutover-staging.ts';
import { createClient } from '@supabase/supabase-js';
import { guardRequest, classifyRequest, verifyRequestOwnership, DrawingCutoverTransport, installDrawingBrowserGuard } from '../../e2e/drawingCutoverNetworkGuard.ts';
import type { BrowserContext, Route } from '@playwright/test';
import { summarizeCases } from '../../e2e/drawingCutoverReporter.ts';
import * as setup from '../../e2e/drawing-cutover-setup.ts';
import type { SetupContext, SetupPlan, PrivateRecoveryPayload, ArtifactBinding, FoundationReceipt, SetupResume } from '../../e2e/drawing-cutover-setup.ts';

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

// Synthetic keys only. No real custody location or configured credentials are read.
const recoveryKeys = generateKeyPairSync('rsa', { modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const testHash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const recipient = testHash(Buffer.from(recoveryKeys.publicKey.replace(/-----[^-]+-----|\s/g, ''), 'base64'));
const setupNow = Date.parse('2026-10-16T12:00:00Z');
function recoveryFixture(): PrivateRecoveryPayload {
  const context: SetupContext = { version: 1, projectRef: 'ndyfjffsulfbwpmwdmic', candidateSha: sha, runId: id(101),
    workflowRunId: '123456', workflowRunAttempt: '1', phase: 'setup-bootstrap', checkpointSequence: 0, recipientSha256: recipient };
  const plan: SetupPlan = { context, createdAt: '2026-10-16T11:00:00Z', expiresAt: '2026-10-17T11:00:00Z',
    roster: setup.ACTORS.map(alias => ({ alias, email: `${alias}@example.invalid` })),
    organizations: [{ alias: 'A', name: 'Synthetic A', slug: 'synthetic-a' }, { alias: 'B', name: 'Synthetic B', slug: 'synthetic-b' }],
    projects: (['A1', 'A2', 'B1', 'B2'] as const).map(alias => ({ alias, organization: alias[0] as 'A' | 'B', name: `Synthetic ${alias}`, number: `TEST-${alias}` })),
    keyReview: { publicKeySha256: '2'.repeat(64), setupKeySha256: '3'.repeat(64), setupKeyIdentifier: 'synthetic-key-id', ownerAttestationSha256: '4'.repeat(64) },
    prerequisites: { scenarioSourceSha256: '5'.repeat(64), sourceJobsSha256: '5'.repeat(64), immutableBuildSha256: '5'.repeat(64),
      packageSha256: '5'.repeat(64), ownershipSha256: '5'.repeat(64), sideEffectsSha256: '5'.repeat(64), healthSha256: '5'.repeat(64),
      noEmailSha256: '5'.repeat(64), settingsAuthoritySha256: '5'.repeat(64) } };
  return { plan, receipt: { context, planSha256: testHash(JSON.stringify(plan)), status: 'STOPPED', operations: [],
    actors: [], organizations: [], projects: [], memberships: [] },
  credentials: setup.ACTORS.map(alias => ({ alias, email: `${alias}@example.invalid`, password: `synthetic-password-${alias}-0123456789` })) };
}
function artifactFixture(): ArtifactBinding {
  return { artifactId: '777', repository: 'lorteezy87/SteelBuild-Pro-Rev.2', workflow: '.github/workflows/drawing-cutover-staging.yml',
    workflowRunId: '123456', workflowRunAttempt: '1', candidateSha: sha, archiveSha256: 'a'.repeat(64), ciphertextSha256: 'b'.repeat(64) };
}
function bootstrapRecoveryFixture(): PrivateRecoveryPayload {
  const payload = recoveryFixture(); const receipt = payload.receipt;
  receipt.status = 'AWAITING_ENTITLEMENT_REVIEW';
  receipt.actors = setup.ACTORS.map((alias, n) => ({ alias, id: id(600 + n), emailSha256: testHash(`${alias}@example.invalid`), authenticated: true }));
  receipt.organizations = (['A', 'B'] as const).map((alias, n) => {
    const owner = receipt.actors.find(a => a.alias === (alias === 'A' ? 'admin' : 'foreign'))!;
    return { alias, id: id(700 + n), createdBy: owner.id, ownerId: owner.id };
  });
  receipt.memberships = receipt.organizations.map((org, n) => ({ id: id(800 + n), actor: org.alias === 'A' ? 'admin' : 'foreign', userId: org.ownerId, orgId: org.id, role: 'owner' }));
  for (const actor of receipt.actors) {
    for (const action of ['create-user', 'authenticate-user'] as const) {
      const number = receipt.operations.length + 1; const operationId = id(900 + number);
      receipt.operations.push({ sequence: number, kind: 'intent', operationId, action, actor: actor.alias },
        { sequence: number + 1, kind: 'result', operationId, outcome: 'SUCCEEDED', observedId: actor.id });
    }
  }
  for (const org of receipt.organizations) {
    const number = receipt.operations.length + 1; const operationId = id(900 + number);
    receipt.operations.push({ sequence: number, kind: 'intent', operationId, action: 'create-organization', actor: org.alias === 'A' ? 'admin' : 'foreign', organization: org.alias },
      { sequence: number + 1, kind: 'result', operationId, outcome: 'SUCCEEDED', observedId: org.id });
  }
  receipt.context = { ...receipt.context, checkpointSequence: receipt.operations.length };
  return payload;
}
const psLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;
const recoveryWrapper = resolve('scripts/drawing-cutover-recovery-local.ps1');
function runRecoveryPs(script: string): string {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; . ${psLiteral(recoveryWrapper)}; ${script}`], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH, TEMP: process.env.TEMP },
  });
}
function privateTemp(): string {
  const directory = mkdtempSync(join(tmpdir(), 'drawing-recovery-test-'));
  try { if (process.platform === 'win32') runRecoveryPs(`Protect-RecoveryLeaf ${psLiteral(directory)}`); }
  catch (error) { removeRecoveryTemp(directory); throw error; }
  return directory;
}
function removeRecoveryTemp(directory: string): void {
  const absolute = resolve(directory);
  if (!absolute.startsWith(`${resolve(tmpdir())}${sep}drawing-recovery-test-`)) throw new Error('TEMP_SCOPE_REFUSED');
  rmSync(absolute, { recursive: true, force: true });
}

describe('private staging recovery', () => {
  it('recoveryRejectsWrongRunArtifactRecipient', async () => {
    const recovery = await import('../drawing-cutover-recovery.ts');
    const payload = recoveryFixture(); const context = payload.receipt.context;
    const envelope = recovery.encryptRecovery(payload, recoveryKeys.publicKey, context);
    expect(recovery.decryptRecovery(envelope, recoveryKeys.privateKey, context)).toEqual(payload);
    for (const patch of [{ runId: id(999) }, { candidateSha: '9'.repeat(40) }, { workflowRunId: '2' }, { workflowRunAttempt: '2' },
      { phase: 'setup-complete' }, { checkpointSequence: 1 }, { projectRef: 'kjrwqagyeswwoxpjkcko' }, { recipientSha256: '9'.repeat(64) }]) {
      expect(() => recovery.decryptRecovery(envelope, recoveryKeys.privateKey, { ...context, ...patch } as SetupContext)).toThrow();
    }
    const wrong = generateKeyPairSync('rsa', { modulusLength: 3072, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    expect(() => recovery.decryptRecovery(envelope, wrong.privateKey, context)).toThrow();
    expect(() => recovery.encryptRecovery(payload, wrong.publicKey, context)).toThrow();
    const binding = artifactFixture();
    expect(setup.validateArtifactBinding(binding, { ...binding })).toEqual(binding);
    // Authenticated encryption succeeds above; provenance must still independently match.
    for (const field of Object.keys(binding) as (keyof ArtifactBinding)[]) {
      expect(() => setup.validateArtifactBinding({ ...binding, [field]: field.endsWith('Sha256') ? 'c'.repeat(64) : 'substituted' }, binding)).toThrow();
    }
  });
  it('recoveryTamperHasNoPartialPlaintext', async () => {
    const recovery = await import('../drawing-cutover-recovery.ts'); const payload = recoveryFixture();
    const envelope = recovery.encryptRecovery(payload, recoveryKeys.publicKey, payload.receipt.context);
    for (const field of ['wrappedKey', 'nonce', 'tag', 'ciphertext'] as const) {
      const bytes = Buffer.from(envelope[field], 'base64'); bytes[0] ^= 1;
      expect(() => recovery.decryptRecovery({ ...envelope, [field]: bytes.toString('base64') }, recoveryKeys.privateKey, payload.receipt.context)).toThrow('RECOVERY_REFUSED');
      expect(() => recovery.decryptRecovery({ ...envelope, [field]: envelope[field].slice(4) }, recoveryKeys.privateKey, payload.receipt.context)).toThrow('RECOVERY_REFUSED');
    }
    for (const patch of [{ version: 2 }, { algorithm: 'none' }, { extra: 'untrusted' }, { nonce: `${envelope.nonce}\n` }]) {
      expect(() => recovery.decryptRecovery({ ...envelope, ...patch }, recoveryKeys.privateKey, payload.receipt.context)).toThrow('RECOVERY_REFUSED');
    }
    const directory = privateTemp();
    try {
      await expect((async () => recovery.writePrivateJson(join(directory, 'plaintext.json'),
        recovery.decryptRecovery({ ...envelope, tag: Buffer.alloc(16).toString('base64') }, recoveryKeys.privateKey, payload.receipt.context)))()).rejects.toThrow();
      expect(readdirSync(directory)).toEqual([]);
    } finally { removeRecoveryTemp(directory); }
  });
  it('recoveryBoundedStrictSchema', async () => {
    const recovery = await import('../drawing-cutover-recovery.ts'); const payload = recoveryFixture();
    const raw = JSON.stringify(payload.plan);
    expect(setup.validateSetupPlan(raw, testHash(raw), payload.plan.context, setupNow)).toEqual(payload.plan);
    expect(() => setup.validateSetupPlan(raw, '0'.repeat(64), payload.plan.context, setupNow)).toThrow();
    for (const now of [Date.parse(payload.plan.createdAt) - 1, Date.parse(payload.plan.expiresAt)]) {
      expect(() => setup.validateSetupPlan(raw, testHash(raw), payload.plan.context, now)).toThrow();
    }
    for (const change of [
      (p: SetupPlan) => { p.expiresAt = '2026-10-18T11:00:00Z'; },
      (p: SetupPlan) => { p.roster[1] = p.roster[0]; },
      (p: SetupPlan) => { p.projects[1].organization = 'B'; },
      (p: SetupPlan) => { p.organizations[1].slug = p.organizations[0].slug; },
    ]) {
      const invalid = structuredClone(payload.plan); change(invalid); const text = JSON.stringify(invalid);
      expect(() => setup.validateSetupPlan(text, testHash(text), payload.plan.context, setupNow)).toThrow();
    }
    for (const field of ['setupKey', 'deploymentPat', 'privateKey', 'access_token', 'refresh_token']) {
      expect(() => recovery.encryptRecovery({ ...payload, [field]: 'forbidden' }, recoveryKeys.publicKey, payload.receipt.context)).toThrow();
      expect(() => recovery.encryptRecovery({ ...payload, receipt: { ...payload.receipt, [field]: 'forbidden' } }, recoveryKeys.publicKey, payload.receipt.context)).toThrow();
    }
    expect(() => recovery.encryptRecovery({ ...payload, credentials: [{ ...payload.credentials[0], password: 'x'.repeat(1_048_577) }] }, recoveryKeys.publicKey, payload.receipt.context)).toThrow();
    expect(() => recovery.decryptRecovery({ ciphertext: 'x'.repeat(1_500_000) }, recoveryKeys.privateKey, payload.receipt.context)).toThrow();
    const directory = privateTemp();
    try {
      writeFileSync(join(directory, 'large.json'), 'x'.repeat(1_048_577));
      await expect(recovery.readPrivateJson(join(directory, 'large.json'))).rejects.toThrow();
    } finally { removeRecoveryTemp(directory); }
  });
  it('reviewedPlanAndReceiptPreserveSerializationForDownstreamDigests', () => {
    const payload = recoveryFixture();
    const reversedPlan = Object.fromEntries(Object.entries(payload.plan).reverse()) as SetupPlan;
    const raw = JSON.stringify(reversedPlan);
    const validated = setup.validateSetupPlan(raw, testHash(raw), payload.plan.context, setupNow);
    expect(JSON.stringify(validated) === raw).toBe(true);
    const reversedReceipt = Object.fromEntries(Object.entries({ ...payload.receipt, planSha256: testHash(raw) }).reverse());
    expect(JSON.stringify(setup.validateFoundationReceipt(reversedReceipt, validated)) === JSON.stringify(reversedReceipt)).toBe(true);
    const pretty = JSON.stringify(reversedPlan, null, 2);
    expect(() => setup.validateSetupPlan(pretty, testHash(pretty), payload.plan.context, setupNow)).toThrow();
    const duplicate = `${raw.slice(0, -1)},"createdAt":"${payload.plan.createdAt}"}`;
    expect(() => setup.validateSetupPlan(duplicate, testHash(duplicate), payload.plan.context, setupNow)).toThrow();
  });
  it('recoveryRoundtripUsesFreshRandomness', async () => {
    const recovery = await import('../drawing-cutover-recovery.ts'); const payload = recoveryFixture();
    const first = recovery.encryptRecovery(payload, recoveryKeys.publicKey, payload.receipt.context);
    const second = recovery.encryptRecovery(payload, recoveryKeys.publicKey, payload.receipt.context);
    for (const key of ['wrappedKey', 'nonce', 'tag', 'ciphertext'] as const) expect(first[key]).not.toBe(second[key]);
    expect(Buffer.from(first.wrappedKey, 'base64')).toHaveLength(384);
    expect(Buffer.from(first.nonce, 'base64')).toHaveLength(12); expect(Buffer.from(first.tag, 'base64')).toHaveLength(16);
    expect(recovery.decryptRecovery(second, recoveryKeys.privateKey, payload.receipt.context)).toEqual(payload);
    expect(JSON.stringify(first)).not.toContain('synthetic-password'); expect(JSON.stringify(first)).not.toContain('example.invalid');
  });
  it('receiptJournalRejectsAmbiguousCompleteAndResumeRequiresExternalReview', () => {
    const payload = recoveryFixture();
    expect(setup.validateFoundationReceipt(payload.receipt, payload.plan)).toEqual(payload.receipt);
    const intent = { sequence: 1, kind: 'intent' as const, operationId: id(501), action: 'create-user' as const, actor: 'admin' as const };
    const unknown = { ...payload.receipt, context: { ...payload.receipt.context, checkpointSequence: 1 }, status: 'UNKNOWN_COMMIT_STATE' as const, operations: [intent] };
    expect(setup.validateFoundationReceipt(unknown, payload.plan).status).toBe('UNKNOWN_COMMIT_STATE');
    for (const status of ['STOPPED', 'AWAITING_ENTITLEMENT_REVIEW', 'FOUNDATION_PREPARED']) {
      expect(() => setup.validateFoundationReceipt({ ...unknown, status }, payload.plan)).toThrow();
    }
    expect(() => setup.validateFoundationReceipt({ ...unknown, operations: [{ ...intent, sequence: 2 }] }, payload.plan)).toThrow();
    const stopped = { ...unknown, context: { ...unknown.context, checkpointSequence: 2 }, status: 'STOPPED',
      operations: [intent, { sequence: 2, kind: 'result', operationId: id(501), outcome: 'REJECTED' }] };
    expect(setup.validateFoundationReceipt(stopped, payload.plan).status).toBe('STOPPED');
    expect(() => setup.validateFoundationReceipt({ ...stopped, operations: [intent, { ...stopped.operations[1], operationId: id(502) }] }, payload.plan)).toThrow();
    expect(() => setup.validateFoundationReceipt({ ...payload.receipt, status: 'FOUNDATION_PREPARED' }, payload.plan)).toThrow();
    const raw = JSON.stringify({ context: payload.plan.context, recovery: payload, artifact: artifactFixture(),
      receiptSha256: testHash(JSON.stringify(payload.receipt)), reviewedAt: '2026-10-16T12:00:00Z', reviewSha256: 'e'.repeat(64), entitlements: [] });
    expect(() => setup.validateSetupResume(raw, testHash(raw), payload.plan, artifactFixture(), setupNow)).toThrow();
  });
  it('reviewedResumePreservesOriginalContextAndExactEntitlementReadback', () => {
    const prior = bootstrapRecoveryFixture(); const artifact = artifactFixture();
    prior.plan = Object.fromEntries(Object.entries(prior.plan).reverse()) as SetupPlan;
    prior.receipt.planSha256 = testHash(JSON.stringify(prior.plan));
    const receiptSha256 = testHash(JSON.stringify(prior.receipt));
    expect(setup.validateFoundationReceipt(prior.receipt, prior.plan)).toEqual(prior.receipt);
    const plan: SetupPlan = { ...structuredClone(prior.plan), context: { ...prior.plan.context, workflowRunId: '123457', phase: 'setup-complete' }, prior: { receiptSha256, artifact } };
    const resume: SetupResume = { context: plan.context, planSha256: testHash(JSON.stringify(plan)), recovery: prior, artifact, receiptSha256,
      reviewedAt: '2026-10-16T12:00:00Z', reviewSha256: 'e'.repeat(64), entitlements: prior.receipt.organizations.map(org => ({ organization: org.alias, orgId: org.id,
        createdBy: org.createdBy, plan: 'pro', observedAt: '2026-10-16T11:30:00Z', readbackSha256: 'f'.repeat(64) })) };
    const validate = (value: SetupResume, expected = artifact) => { const raw = JSON.stringify(value); return setup.validateSetupResume(raw, testHash(raw), plan, expected, setupNow); };
    expect(validate(resume)).toEqual(resume);
    for (const change of [
      (r: SetupResume) => { r.entitlements[0].orgId = id(999); },
      (r: SetupResume) => { r.entitlements[0].createdBy = id(999); },
      (r: SetupResume) => { r.entitlements[0].observedAt = '2026-10-15T11:30:00Z'; },
      (r: SetupResume) => { r.recovery.receipt.context.phase = 'setup-complete'; },
      (r: SetupResume) => { r.recovery.receipt.status = 'UNKNOWN_COMMIT_STATE'; },
      (r: SetupResume) => { r.receiptSha256 = 'c'.repeat(64); },
    ]) { const invalid = structuredClone(resume); change(invalid); expect(() => validate(invalid)).toThrow(); }
    expect(() => validate(resume, { ...artifact, artifactId: '999' })).toThrow();
    const incomplete: FoundationReceipt = { ...prior.receipt, context: { ...plan.context, checkpointSequence: 0 }, operations: [], status: 'FOUNDATION_PREPARED', planSha256: testHash(JSON.stringify(plan)) };
    expect(() => setup.validateFoundationReceipt(incomplete, plan)).toThrow();
  });
  it('receiptClaimsRequireMatchingOperationResultsAndMfaFactor', async () => {
    const payload = bootstrapRecoveryFixture();
    const noJournal = structuredClone(payload.receipt); noJournal.operations = []; noJournal.context.checkpointSequence = 0;
    expect(() => setup.validateFoundationReceipt(noJournal, payload.plan)).toThrow();
    const missingId = structuredClone(payload.receipt);
    if (missingId.operations[1].kind === 'result') delete missingId.operations[1].observedId;
    expect(() => setup.validateFoundationReceipt(missingId, payload.plan)).toThrow();
    const wrongActor = structuredClone(payload.receipt);
    if (wrongActor.operations[28].kind === 'intent') wrongActor.operations[28].actor = 'viewer';
    expect(() => setup.validateFoundationReceipt(wrongActor, payload.plan)).toThrow();
    const recovery = await import('../drawing-cutover-recovery.ts');
    payload.credentials.find(c => c.alias === 'mfa')!.mfa = { factorId: id(999), secret: 'ABCDEFGHIJKLMNOP' };
    expect(() => recovery.encryptRecovery(payload, recoveryKeys.publicKey, payload.receipt.context)).toThrow();
  });
  it('completeReceiptIsRepresentableWithoutRecreatingBootstrapActors', async () => {
    const prior = bootstrapRecoveryFixture(); const artifact = artifactFixture();
    const plan: SetupPlan = { ...structuredClone(prior.plan), context: { ...prior.plan.context, phase: 'setup-complete', workflowRunId: '123457' },
      prior: { receiptSha256: testHash(JSON.stringify(prior.receipt)), artifact } };
    const receipt: FoundationReceipt = { ...structuredClone(prior.receipt), context: { ...plan.context }, planSha256: testHash(JSON.stringify(plan)),
      status: 'FOUNDATION_PREPARED', operations: [], organizations: prior.receipt.organizations.map(org => ({ ...org, memberDefaultProjectRole: null })) };
    type Intent = Extract<FoundationReceipt['operations'][number], { kind: 'intent' }>;
    const operation = (fields: Omit<Intent, 'sequence' | 'kind' | 'operationId'>, observedId: string) => {
      const sequence = receipt.operations.length + 1; const operationId = id(1200 + sequence);
      receipt.operations.push({ ...fields, sequence, operationId, kind: 'intent' }, { kind: 'result', sequence: sequence + 1, operationId, outcome: 'SUCCEEDED', observedId });
    };
    for (const org of receipt.organizations) operation({ action: 'configure-organization', actor: org.alias === 'A' ? 'admin' : 'foreign', organization: org.alias }, org.id);
    const orgA = receipt.organizations.find(o => o.alias === 'A')!;
    for (const actor of receipt.actors.filter(a => !['admin', 'foreign'].includes(a.alias))) {
      const membership = { id: id(1300 + receipt.memberships.length), actor: actor.alias, userId: actor.id, orgId: orgA.id, role: 'member' as const };
      receipt.memberships.push(membership); operation({ action: 'add-organization-member', actor: actor.alias, organization: 'A' }, membership.id);
    }
    for (const project of plan.projects) {
      const org = receipt.organizations.find(o => o.alias === project.organization)!;
      const observed = { alias: project.alias, id: id(1400 + receipt.projects.length), orgId: org.id, createdBy: org.ownerId };
      receipt.projects.push(observed); operation({ action: 'create-project', actor: org.alias === 'A' ? 'admin' : 'foreign', organization: org.alias, project: project.alias }, observed.id);
    }
    const roles = { pm: 'pm', viewer: 'viewer', field: 'field', removed: 'field', mfa: 'pm' } as const;
    for (const alias of ['pm', 'viewer', 'field', 'removed', 'mfa'] as const) {
      const membership = { id: id(1500 + receipt.memberships.length), actor: alias, userId: receipt.actors.find(a => a.alias === alias)!.id,
        orgId: orgA.id, projectId: receipt.projects.find(p => p.alias === 'A1')!.id, role: roles[alias] };
      receipt.memberships.push(membership); operation({ action: 'assign-project-role', actor: alias, organization: 'A', project: 'A1' }, membership.id);
    }
    receipt.actors.find(a => a.alias === 'mfa')!.mfa = { factorId: id(1600), verified: true };
    operation({ action: 'enroll-mfa', actor: 'mfa' }, id(1600)); operation({ action: 'verify-mfa', actor: 'mfa' }, id(1600));
    receipt.context.checkpointSequence = receipt.operations.length;
    expect(setup.validateFoundationReceipt(receipt, plan).status).toBe('FOUNDATION_PREPARED');
    const payload: PrivateRecoveryPayload = { plan, receipt, credentials: structuredClone(prior.credentials) };
    payload.credentials.find(c => c.alias === 'mfa')!.mfa = { factorId: id(1600), secret: 'ABCDEFGHIJKLMNOP' };
    const recovery = await import('../drawing-cutover-recovery.ts');
    expect(recovery.decryptRecovery(recovery.encryptRecovery(payload, recoveryKeys.publicKey, receipt.context), recoveryKeys.privateKey, receipt.context)).toEqual(payload);
    receipt.memberships.find(m => m.role === 'viewer')!.projectId = receipt.projects.find(p => p.alias === 'A2')!.id;
    expect(() => setup.validateFoundationReceipt(receipt, plan)).toThrow();
  });
  it('verifiedRecoveryRejectsArchiveCiphertextConfusionAndCheckpointNamesNeverRelabel', async () => {
    const recovery = await import('../drawing-cutover-recovery.ts'); const payload = bootstrapRecoveryFixture(); const context = payload.receipt.context;
    const raw = JSON.stringify(recovery.encryptRecovery(payload, recoveryKeys.publicKey, context));
    const artifact = { ...artifactFixture(), ciphertextSha256: testHash(raw) };
    expect(recovery.decryptVerifiedRecovery(raw, recoveryKeys.privateKey, context, artifact, { ...artifact })).toEqual(payload);
    expect(() => recovery.decryptVerifiedRecovery(raw, recoveryKeys.privateKey, context, artifact, { ...artifact, artifactId: '778' })).toThrow();
    expect(() => recovery.decryptVerifiedRecovery(raw, recoveryKeys.privateKey, context, { ...artifact, ciphertextSha256: artifact.archiveSha256 }, { ...artifact, ciphertextSha256: artifact.archiveSha256 })).toThrow();
    expect(() => recovery.decryptVerifiedRecovery(`${raw} `, recoveryKeys.privateKey, context, artifact, artifact)).toThrow();
    const first = recovery.checkpointFilename(context, 'result'); const next = recovery.checkpointFilename({ ...context, checkpointSequence: 33 }, 'intent');
    expect(first).toBe(`${id(101)}-setup-bootstrap-123456-1-000000032-result.json`);
    expect(next).toBe(`${id(101)}-setup-bootstrap-123456-1-000000033-intent.json`);
  });
  it.skipIf(process.platform !== 'win32')('windowsRecoveryRejectsReparseAndBroadAcl', () => {
    const directory = privateTemp();
    try {
      expect(runRecoveryPs(`Assert-RecoveryPrivatePath ${psLiteral(directory)}; 'PRIVATE_OK'`).trim()).toBe('PRIVATE_OK');
      const leaf = join(directory, 'junction'); const target = join(directory, 'target'); mkdirSync(target);
      symlinkSync(target, leaf, 'junction');
      expect(() => runRecoveryPs(`Assert-RecoveryPrivatePath ${psLiteral(leaf)}`)).toThrow();
      // Remove only the junction entry, never traverse it during recursive cleanup.
      rmdirSync(leaf);
      // Native DACL-only edit avoids Windows PowerShell's SACL privilege path.
      execFileSync('icacls.exe', [directory, '/grant', '*S-1-1-0:(OI)(CI)RX'], { windowsHide: true, stdio: 'pipe' });
      expect(() => runRecoveryPs(`Assert-RecoveryPrivatePath ${psLiteral(directory)}`)).toThrow();
    } finally { removeRecoveryTemp(directory); }
  });
  it('privateWriteRefusesExistingOrLinkedFile', async () => {
    const recovery = await import('../drawing-cutover-recovery.ts'); const directory = privateTemp();
    try {
      const destination = join(directory, 'checkpoint-0000000000.json');
      await recovery.writePrivateJson(destination, { sequence: 0 });
      expect(await recovery.readPrivateJson(destination)).toEqual({ sequence: 0 });
      await expect(recovery.writePrivateJson(destination, { sequence: 1 })).rejects.toThrow();
      expect(JSON.parse(readFileSync(destination, 'utf8'))).toEqual({ sequence: 0 });
      const linked = join(directory, 'hardlink.json'); linkSync(destination, linked);
      await expect(recovery.readPrivateJson(linked)).rejects.toThrow();
      await expect(recovery.writePrivateJson(linked, {})).rejects.toThrow(); rmSync(linked);
      const target = join(directory, 'target'); mkdirSync(target); const redirected = join(directory, 'redirected'); symlinkSync(target, redirected, process.platform === 'win32' ? 'junction' : 'dir');
      await expect(recovery.writePrivateJson(join(redirected, 'escaped.json'), {})).rejects.toThrow();
      expect(readdirSync(target)).toEqual([]);
      if (process.platform === 'win32') rmdirSync(redirected); else rmSync(redirected);
      const concurrent = await Promise.allSettled([recovery.writePrivateJson(join(directory, 'race.json'), { winner: 1 }), recovery.writePrivateJson(join(directory, 'race.json'), { winner: 2 })]);
      expect(concurrent.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect([1, 2]).toContain((await recovery.readPrivateJson(join(directory, 'race.json')) as { winner: number }).winner);
      expect(readdirSync(directory).filter(name => name.includes('.tmp'))).toEqual([]);
    } finally { removeRecoveryTemp(directory); }
  }, 60_000);
});
