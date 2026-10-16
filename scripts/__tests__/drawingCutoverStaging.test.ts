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
import type { SetupTransports, SetupCheckpoint, SetupObservation, SetupSession, SetupActor, SetupIntent } from '../../e2e/drawing-cutover-setup.ts';
import { runSetupEntitlementCases } from '../../supabase/tests/drawing-set-revision-transaction/setupEntitlementCases.ts';
import * as entitlementFixtures from '../../supabase/tests/drawing-set-revision-transaction/setupEntitlementCases.ts';
import { selectDrawingIntakeProject } from '../../e2e/drawingCutoverIntakeBindings.ts';

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
  it('isolated entitlement fixtures conform to the actual shared actor, plan and receipt contracts', () => {
    const now = Date.parse('2026-10-16T12:00:00Z');
    const { plan, receipt } = entitlementFixtures.entitlementInputs(now);
    expect(entitlementFixtures.ENTITLEMENT_STAGE_REF).toBe(setup.STAGE_REF);
    expect(entitlementFixtures.ENTITLEMENT_ACTORS).toEqual(setup.ACTORS);
    expect(plan.roster.map(actor => actor.alias)).toEqual(setup.ACTORS);
    expect(receipt.actors.map(actor => actor.alias)).toEqual(setup.ACTORS);
    expect(setup.validateSetupPlan(JSON.stringify(plan), receipt.planSha256, plan.context, now)).toEqual(plan);
    expect(setup.validateFoundationReceipt(receipt, plan)).toEqual(receipt);
    expect(plan.prerequisiteDetails!.sideEffects.activeCostCodeTemplates.map(template => ({
      amount: template.default_budget_amount, order: template.sort_order,
    }))).toEqual([{ amount: '9007199254740993.01', order: -2147483648 }, { amount: null, order: 2147483647 }]);
  });
  it('all 46 isolated malformed template fixtures fail the real shared plan validator with fresh bindings', () => {
    const now = Date.parse('2026-10-16T12:00:00Z');
    const baseline = entitlementFixtures.entitlementInputs(now), original = structuredClone(baseline);
    const cases = entitlementFixtures.malformedTemplateInputs(baseline);
    expect(cases).toHaveLength(46);
    expect(new Set(cases.map(fixture => fixture.name)).size).toBe(46);
    for (const { name, plan, receipt } of cases) {
      const effectsHash = setup.digest(JSON.stringify(plan.prerequisiteDetails!.sideEffects));
      expect(plan.prerequisites.sideEffectsSha256, name).toBe(effectsHash);
      expect(receipt.census!.sideEffectsSha256, name).toBe(effectsHash);
      expect(receipt.planSha256, name).toBe(setup.digest(JSON.stringify(plan)));
      expect(() => setup.validateSetupPlan(JSON.stringify(plan), receipt.planSha256, plan.context, now), name).toThrow();
    }
    const second = structuredClone(cases[1]);
    cases[0].plan.prerequisiteDetails!.sideEffects.activeCostCodeTemplates.splice(0);
    cases[0].receipt.actors.splice(0);
    expect(cases[1]).toEqual(second);
    expect(baseline).toEqual(original);
    expect(entitlementFixtures.malformedTemplateInputs(baseline)[1]).toEqual(second);
    expect(setup.validateFoundationReceipt(baseline.receipt, baseline.plan)).toEqual(original.receipt);
  });
  it('legacy CLI preflight stays optional but cannot infer an acceptance scenario project', () => {
    const config = prepareRun(inputs());
    expect(config.phase).toBe('preflight');
    expect(config.manifest.intakeBindings).toBeUndefined();
    expect(() => selectDrawingIntakeProject(config.manifest)).toThrow('INTAKE_BINDINGS_REQUIRED');
    const run = inputs(); const fixture = { ...manifest(), intakeBindings: null };
    run.fixtureText = JSON.stringify(fixture); run.env.DRAWING_CUTOVER_MANIFEST_SHA256 = setup.digest(run.fixtureText);
    expect(() => prepareRun(run)).toThrow('INTAKE_BINDINGS_INVALID');
  });
  it('foundation owner projects select reviewed A1 with PM caller and retain independent parent observers and mutation stop', async () => {
    const fixture = manifest();
    fixture.projects.forEach(p => { if (p.orgId === id(2)) p.createdBy = id(13); });
    const payload = { project_id: id(4), revision_label: '0', file_path: fixture.storage[0].path,
      source_objects: [{ path: fixture.storage[0].path, token: '4'.repeat(64) }], set_name: 'E2E new set', set_number: null,
      discipline: null, issued_date: null, issued_by: null, notes: null,
      sheets: [{ action: 'added', sheet_number: 'S1', sheet_title: 'Synthetic', revision_code: '0', file_path: fixture.storage[0].path,
        pdf_page: 1, reviewed: true, extraction: { text: { state: 'unavailable' }, callouts: { state: 'unavailable' } } }] };
    const bound = { ...fixture, entities: [...fixture.entities, { table: 'drawing_sets', id: id(31), projectId: id(4) }],
      intakeBindings: { version: 1, projects: { A1: fixture.projects[0], A2: fixture.projects[1], B1: fixture.projects[2], B2: fixture.projects[3] }, commands: {
        newSet: { requestId: id(41), actor: 'pm', operation: 'create_set', payload },
        manualIntake: { requestId: id(42), actor: 'pm', operation: 'create_set', payload: { ...payload, set_name: 'E2E manual set' } },
        revision: { requestId: id(43), actor: 'pm', operation: 'revise_set', payload: { project_id: id(4), revision_label: '1',
          file_path: payload.file_path, source_objects: payload.source_objects, set_id: id(31), expected_set_updated_at: '2026-10-16T12:00:00Z',
          expected_set_revision: '0', issued_date: '2026-10-16',
          sheets: [{ action: 'same', drawing_id: id(30), expected_updated_at: '2026-10-16T12:00:00Z', expected_revision_id: null, sheet_number: 'S1' }] } },
      } } };
    bound.projects.reverse();
    const run = inputs(); run.fixtureText = JSON.stringify(bound); run.env.DRAWING_CUTOVER_MANIFEST_SHA256 = setup.digest(run.fixtureText);
    const config = prepareRun(run); const project = selectDrawingIntakeProject(config.manifest);
    expect(config.phase).toBe('preflight'); expect(project).toEqual({ id: id(4), orgId: id(2), createdBy: id(13) });
    const observations: { projectId: string; authorization: string | null }[] = [];
    let writes = 0;
    const network: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/')) {
        const email = (JSON.parse(String(init?.body)) as { email: string }).email;
        const actor = fixture.actors.find(a => `${a.alias}@example.invalid` === email)!;
        return Response.json({ access_token: `offline-${actor.alias}`, refresh_token: 'offline', user: { id: actor.id } });
      }
      if (url.includes('/projects?')) {
        const projectId = new URL(url).searchParams.get('id')!.slice(3);
        observations.push({ projectId, authorization: new Headers(init?.headers).get('Authorization') });
        const parent = fixture.projects.find(p => p.id === projectId)!;
        return Response.json([{ id: parent.id, org_id: parent.orgId, created_by: parent.createdBy }]);
      }
      writes++; return Response.json({});
    };
    const runtime = new DrawingCutoverTransport(config, network);
    for (const actor of ['pm', 'admin', 'foreign'] as const) await runtime.signIn(actor);
    expect(await runtime.verifyParents([id(4), id(5), id(6), id(7)])).toHaveLength(4);
    expect(observations).toEqual([
      { projectId: id(4), authorization: 'Bearer offline-admin' }, { projectId: id(5), authorization: 'Bearer offline-admin' },
      { projectId: id(6), authorization: 'Bearer offline-foreign' }, { projectId: id(7), authorization: 'Bearer offline-foreign' },
    ]);
    config.phase = 'acceptance';
    await expect(runtime.request({ actor: 'pm', method: 'PATCH', path: `/rest/v1/drawings?id=eq.${id(30)}`, body: { notes: 'E2E reviewed' } }))
      .rejects.toThrow('MUTATION_PREREQUISITES_UNPROVED');
    expect(writes).toBe(0);
  });
  it('manualEntitlementFixtureRejectsNonemptyDatabaseBeforeDDL', async () => {
    let writes = 0;
    const db: Parameters<typeof runSetupEntitlementCases>[0] = {
      exec: async () => { writes++; throw new Error('A nonempty database must never reach fixture DDL'); },
      query: async <T extends Record<string, unknown>>(sql: string) => ({ rows: (sql.includes('count(*)') ? [{ n: 1 }] : []) as unknown as T[] }),
    };
    await expect(runSetupEntitlementCases(db)).rejects.toThrow('Entitlement cases require an empty disposable database');
    expect(writes).toBe(0);
  });
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
function completeInitialRecoveryFixture(): PrivateRecoveryPayload {
  const prior = bootstrapRecoveryFixture();
  const plan: SetupPlan = { ...structuredClone(prior.plan), context: { ...prior.plan.context, phase: 'setup-complete', workflowRunId: '123457' },
    prior: { receiptSha256: testHash(JSON.stringify(prior.receipt)), artifact: artifactFixture() } };
  return { plan, receipt: { ...structuredClone(prior.receipt), context: { ...plan.context }, planSha256: testHash(JSON.stringify(plan)),
    status: 'STOPPED', operations: [] }, credentials: structuredClone(prior.credentials) };
}
function appendSuccessfulOperation(receipt: FoundationReceipt,
  fields: Omit<Extract<FoundationReceipt['operations'][number], { kind: 'intent' }>, 'sequence' | 'kind' | 'operationId'>, observedId: string): void {
  const sequence = receipt.operations.length + 1; const operationId = id(1800 + sequence);
  receipt.operations.push({ ...fields, sequence, operationId, kind: 'intent' },
    { sequence: sequence + 1, operationId, kind: 'result', outcome: 'SUCCEEDED', observedId });
  receipt.context.checkpointSequence = receipt.operations.length;
}
function resequenceReceipt(receipt: FoundationReceipt): void {
  receipt.operations.forEach((operation, index) => { operation.sequence = index + 1; });
  receipt.context.checkpointSequence = receipt.operations.length;
}
function enrolledRecoveryFixture(verified: boolean): PrivateRecoveryPayload {
  const payload = completeInitialRecoveryFixture();
  appendSuccessfulOperation(payload.receipt, { action: 'enroll-mfa', actor: 'mfa' }, id(1900));
  payload.credentials.find(c => c.alias === 'mfa')!.mfa = { factorId: id(1900), secret: 'ABCDEFGHIJKLMNOP' };
  if (verified) {
    appendSuccessfulOperation(payload.receipt, { action: 'challenge-mfa', actor: 'mfa', factorId: id(1900) }, id(1901));
    appendSuccessfulOperation(payload.receipt, { action: 'verify-mfa', actor: 'mfa', factorId: id(1900), challengeId: id(1901) }, id(1900));
    payload.receipt.actors.find(a => a.alias === 'mfa')!.mfa = { factorId: id(1900), verified: true };
  }
  return payload;
}

function foundationPlan(): SetupPlan {
  const plan = recoveryFixture().plan;
  const now = Date.now(); plan.createdAt = new Date(now - 1000).toISOString(); plan.expiresAt = new Date(now + 600_000).toISOString();
  plan.keyReview.publicKeySha256 = testHash('sb_publishable_synthetic'); plan.keyReview.setupKeySha256 = testHash('sb_secret_synthetic');
  plan.prerequisiteDetails = { sideEffects: { version: 1, projectRef: setup.STAGE_REF, candidateSha: sha,
    reviewedAt: new Date(now - 2000).toISOString(), expiresAt: new Date(now + 700_000).toISOString(), installedClosureSha256: '6'.repeat(64),
    seedSemantics: 'stage-foundation-v1', activeCostCodeTemplates: [{ id: id(2900), cost_code_number: '01', description: 'Synthetic cost',
      category: 'Labor', default_budget_amount: '9007199254740993.01', sort_order: 1, is_active: true }] } };
  plan.prerequisites.sideEffectsSha256 = testHash(JSON.stringify(plan.prerequisiteDetails.sideEffects)); return plan;
}
async function foundationHarness(plan = foundationPlan(), resume: SetupResume | null = null) {
  const provision = await import('../drawing-cutover-provision.ts');
  const state: SetupObservation = { actors: [], profiles: [], organizations: [], projects: [], memberships: [], children: [],
    activeCostCodeTemplates: structuredClone(plan.prerequisiteDetails!.sideEffects.activeCostCodeTemplates) };
  if (resume) {
    state.actors = resume.recovery.receipt.actors.map(a => ({ alias: a.alias, id: a.id, emailSha256: a.emailSha256, confirmed: true, factors: [] }));
    state.organizations = resume.recovery.receipt.organizations.map(o => ({ ...o, plan: 'pro', memberDefaultProjectRole: 'viewer',
      name: plan.organizations.find(p => p.alias === o.alias)!.name, slug: plan.organizations.find(p => p.alias === o.alias)!.slug }));
    state.memberships = structuredClone(resume.recovery.receipt.memberships);
  }
  let next = 3000; const writes: string[] = []; const intents: SetupIntent[] = []; const results: unknown[] = [];
  const sessions = new Map<string, SetupSession>(); const snapshots: SetupObservation[] = [];
  const session = (a: SetupActor, aal: 'aal1' | 'aal2' = 'aal1'): SetupSession => ({ actorId: a.id, emailSha256: a.emailSha256,
    sessionId: id(next++), expiresAt: Math.floor(Date.now() / 1000) + 3600, aal });
  const actor = (alias: setup.ActorAlias) => state.actors.find(a => a.alias === alias)!;
  const transports: SetupTransports = {
    async createActor(alias) { writes.push(`create-user:${alias}`); const a = { alias, id: id(next++), emailSha256: testHash(`${alias}@example.invalid`), confirmed: true, factors: [] }; state.actors.push(a); return structuredClone(a); },
    async readActor(alias, expectedId) { const a = actor(alias); if (a.id !== expectedId) throw new Error('TEST_ID'); return structuredClone(a); },
    async signIn(alias) { writes.push(`authenticate-user:${alias}`); const a = actor(alias); const s = session(a); sessions.set(alias, s);
      if (!state.profiles.some(p => p.id === a.id)) state.profiles.push({ id: a.id, emailSha256: a.emailSha256, role: 'user' }); return s; },
    async currentUser(alias) { return { actor: structuredClone(actor(alias)), session: structuredClone(sessions.get(alias)!) }; },
    async observe(scope) { const snapshot = structuredClone(state); snapshot.organizations = snapshot.organizations.filter(o => scope.organizations.some(s => s.id === o.id));
      snapshot.memberships = snapshot.memberships.filter(m => snapshot.organizations.some(o => o.id === m.orgId)); snapshots.push(snapshot); return snapshot; },
    async createOrganization(_scope, alias) { writes.push(`create-organization:${alias}`); const owner = actor(alias === 'A' ? 'admin' : 'foreign');
      const p = plan.organizations.find(o => o.alias === alias)!; const org = { alias, id: id(next++), createdBy: owner.id, ownerId: owner.id, plan: 'free' as const, name: p.name, slug: p.slug, memberDefaultProjectRole: 'viewer' as const };
      state.organizations.push(org); state.memberships.push({ id: id(next++), actor: owner.alias, userId: owner.id, orgId: org.id, role: 'owner' }); return structuredClone(org); },
    async configureOrganization(_scope, alias) { writes.push(`configure-organization:${alias}`); const org = state.organizations.find(o => o.alias === alias)!; org.memberDefaultProjectRole = null; return structuredClone(org); },
    async addOrganizationMember(_scope, alias) { writes.push(`add-organization-member:${alias}`); const org = state.organizations.find(o => o.alias === 'A')!;
      const m = { id: id(next++), actor: alias, userId: actor(alias).id, orgId: org.id, role: 'member' as const }; state.memberships.push(m); return structuredClone(m); },
    async createProject(_scope, alias) { writes.push(`create-project:${alias}`); const p = plan.projects.find(p => p.alias === alias)!; const org = state.organizations.find(o => o.alias === p.organization)!;
      const project = { alias, id: id(next++), orgId: org.id, createdBy: org.ownerId, name: p.name, number: p.number }; state.projects.push(project);
      state.memberships.push({ id: id(next++), actor: p.organization === 'A' ? 'admin' : 'foreign', userId: org.ownerId, orgId: org.id, projectId: project.id, role: 'owner' });
      for (const recipe of provision.seedRecipes(plan, project)) {
        const childId = id(next++); state.children.push({ ...recipe, id: childId, projectId: project.id });
        if (recipe.table === 'action_items') state.children.push({ table: 'planner_action_events', id: id(next++), projectId: project.id,
          values: { entityId: childId, actorId: project.createdBy, eventType: 'action_created', entityType: 'action_item', title: recipe.values.title, status: 'Open', priority: 'Medium' } });
        if (recipe.table === 'cost_codes') state.children.push({ table: 'pma_audit_logs', id: id(next++), projectId: project.id,
          values: { entityId: childId, actorId: project.createdBy, eventType: 'INSERT', entityType: 'cost_codes' } });
      }
      state.children.push({ table: 'number_sequences', id: id(next++), projectId: project.id, recordType: 'action_item', nextValue: 11 },
        { table: 'number_sequences', id: id(next++), projectId: project.id, recordType: 'handoff_item', nextValue: 37 });
      const creatorMembership = state.memberships.at(-1)!; state.children.push({ table: 'member_activity', id: id(next++), projectId: project.id,
        values: { membershipId: creatorMembership.id, actorId: org.ownerId, targetId: org.ownerId, eventType: 'member_added', role: 'owner' } }); return structuredClone(project); },
    async assignProjectRole(_scope, alias) { writes.push(`assign-project-role:${alias}`); const project = state.projects.find(p => p.alias === 'A1')!;
      const roles = { pm: 'pm', viewer: 'viewer', field: 'field', removed: 'field', mfa: 'pm' } as const;
      const m = { id: id(next++), actor: alias, userId: actor(alias).id, orgId: project.orgId, projectId: project.id, role: roles[alias] };
      state.memberships.push(m); state.children.push({ table: 'member_activity', id: id(next++), projectId: project.id,
        values: { membershipId: m.id, actorId: project.createdBy, targetId: m.userId, eventType: 'member_added', role: m.role } }); return structuredClone(m); },
    async enrollMfa() { writes.push('enroll-mfa'); const factorId = id(next++); actor('mfa').factors.push({ id: factorId, type: 'totp', status: 'unverified' }); return { factorId, secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' }; },
    async challengeMfa(_scope, factorId) { writes.push('challenge-mfa'); return { factorId, challengeId: id(next++), expiresAt: Math.floor(Date.now() / 1000) + 60 }; },
    async verifyMfa(_scope, factorId) { writes.push('verify-mfa'); actor('mfa').factors[0].status = 'verified'; const s = session(actor('mfa'), 'aal2'); sessions.set('mfa', s); return { factorId, session: s }; },
  };
  const checkpoint: SetupCheckpoint = { async assertInitialUploaded(context) { return { ...artifactFixture(), workflowRunId: context.workflowRunId, workflowRunAttempt: context.workflowRunAttempt }; },
    async persistIntent(record) { intents.push(structuredClone(record.intent)); }, async persistResult(record) { results.push(structuredClone(record)); } };
  return { provision, plan, state, transports, checkpoint, writes, intents, results, snapshots };
}
async function completedHarness(bootstrapPlan = foundationPlan()) {
  const h = await foundationHarness(bootstrapPlan); const priorReceipt = await h.provision.runFoundation(h.plan, null, h.transports, h.checkpoint);
  const plan: SetupPlan = { ...structuredClone(h.plan), context: { ...h.plan.context, phase: 'setup-complete', workflowRunId: '123457' },
    prior: { receiptSha256: testHash(JSON.stringify(priorReceipt)), artifact: artifactFixture() } };
  const resume: SetupResume = { context: plan.context, planSha256: testHash(JSON.stringify(plan)), recovery: { plan: h.plan, receipt: priorReceipt, credentials: recoveryFixture().credentials },
    artifact: artifactFixture(), receiptSha256: plan.prior!.receiptSha256, reviewedAt: new Date().toISOString(), reviewSha256: '7'.repeat(64),
    entitlements: priorReceipt.organizations.map(o => ({ organization: o.alias, orgId: o.id, createdBy: o.createdBy, plan: 'pro', observedAt: new Date(Date.now() - 1).toISOString(), readbackSha256: '8'.repeat(64) })) };
  return { ...await foundationHarness(plan, resume), resume };
}

type WorkflowStep = { id?: string; name?: string; if?: string; uses?: string; run?: string; 'continue-on-error'?: boolean; env?: Record<string, string>; with?: Record<string, string | number> };
type WorkflowJob = { if?: string; needs?: string[] | string; environment?: string; env?: Record<string, string>; steps: WorkflowStep[] };
function stagingWorkflow() {
  return load(readFileSync('.github/workflows/drawing-cutover-staging.yml', 'utf8')) as {
    on: { workflow_dispatch: { inputs: Record<string, { required: boolean; options?: string[] }> } };
    env?: Record<string, string>; jobs: Record<string, WorkflowJob>;
  };
}
function workflowGate() {
  const script = stagingWorkflow().jobs.verify.steps[0].with!.script;
  const execute = new Function('context', 'github', 'core', 'process', `return (async()=>{${script}})();`) as (...args: unknown[]) => Promise<void>;
  const checks = ['Lint + Typecheck + Test + Build', 'Secret scan (gitleaks)', 'Release Edge Function typecheck', 'Commercial SQL + concurrent PostgreSQL acceptance'];
  const runs = [{ head_sha: sha, event: 'push', status: 'completed', id: 1 }];
  const jobs = new Map([[1, checks.map(name => ({ name, conclusion: 'success' }))]]);
  let ancestor = sha;
  const github = { rest: { repos: { compareCommitsWithBasehead: async () => ({ data: { merge_base_commit: { sha: ancestor } } }) },
    actions: { listWorkflowRuns: 'runs', listJobsForWorkflowRun: 'jobs' } },
  paginate: async (method: string, args: { run_id: number }) => method === 'runs' ? runs : jobs.get(args.run_id) ?? [] };
  const output = vi.fn();
  return { runs, jobs, output, setAncestor(value: string) { ancestor = value; },
    run: (phase: string, input: Record<string, string> = {}, context = {}, env = {}) => {
      const inputs = { candidate_sha: sha, phase, ...(!phase.startsWith('setup-') ? { fixture_manifest_sha256: '2'.repeat(64) } : {}), ...input };
      return execute({ ref: 'refs/heads/main', eventName: 'workflow_dispatch', repo: {}, sha, runAttempt: 1, payload: { inputs }, ...context }, github,
        { setOutput: output }, { env: { CANDIDATE_SHA: inputs.candidate_sha, PHASE: phase, MANIFEST_SHA: inputs.fixture_manifest_sha256 ?? '', ...env } });
    } };
}
function workflowCondition(condition: string | undefined, phase: string, failed = false, cancelled = false, steps: Record<string, { outcome: string }> = {}): boolean {
  const source = (condition ?? 'success()').replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  return Boolean(new Function('github', 'inputs', 'success', 'cancelled', 'steps', `return (${source});`)(
    { ref: 'refs/heads/main', event_name: 'workflow_dispatch' }, { phase }, () => !failed && !cancelled, () => cancelled, steps));
}
async function executeSetupWorkflowScript(step: WorkflowStep, env: Record<string, string>, github: unknown = {}, overrides: Record<string, unknown> = {}) {
  const writes: { path: string; value: unknown; mode?: number }[] = [];
  const provision = await import('../drawing-cutover-provision.ts');
  const modules: Record<string, unknown> = {
    'node:fs/promises': { mkdir: async (path: string, options: { mode: number }) => { writes.push({ path, value: null, mode: options.mode }); },
      open: async (path: string, flag: string, mode: number) => { expect(flag).toBe('wx'); return { writeFile: async (value: string) => { writes.push({ path, value, mode }); }, sync: async () => {}, close: async () => {} }; } },
    'node:path': await import('node:path'),
    'node:crypto': await import('node:crypto'),
    './scripts/drawing-cutover-provision.ts': provision,
    './e2e/drawing-cutover-setup.ts': setup,
    './scripts/drawing-cutover-recovery.ts': { ...(await import('../drawing-cutover-recovery.ts')),
      writePrivateJson: async (path: string, value: unknown) => { writes.push({ path, value, mode: 0o600 }); },
      readPrivateText: async () => '{"encrypted":"synthetic"}' },
    ...overrides,
  };
  const source = String(step.with!.script).replaceAll('await import(', 'await importModule(');
  const execute = new Function('process', 'github', 'context', 'core', 'Buffer', 'importModule', `return (async()=>{${source}})();`) as (...args: unknown[]) => Promise<void>;
  const outputs = vi.fn();
  await execute({ env: { GITHUB_WORKSPACE: '.', ...env } }, github, { repo: { owner: 'lorteezy87', repo: 'SteelBuild-Pro-Rev.2' }, runId: 123456, runAttempt: 1, sha },
    { setOutput: outputs, setFailed: (message: string) => { throw new Error(message); } }, Buffer, async (name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected import ${name}`); return modules[name];
    });
  return { writes, outputs };
}

describe('approved private workflow handoff', () => {
  it('workflowSetupKeepsExactMainAndFourJobs', async () => {
    for (const phase of ['preflight', 'acceptance']) {
      const h = workflowGate(); await h.run(phase); expect(h.output).toHaveBeenCalledWith('candidate_sha', sha);
      await expect(h.run(phase, { fixture_manifest_sha256: '' })).rejects.toThrow('EXACT_INPUTS_REQUIRED');
    }
    for (const phase of ['setup-bootstrap', 'setup-complete']) {
      const h = workflowGate(); await expect(h.run(phase)).rejects.toThrow('SETUP_PREREQUISITES_UNPROVED'); expect(h.output).not.toHaveBeenCalled();
      await expect(h.run(phase, {}, { ref: 'refs/heads/feature' })).rejects.toThrow('MAIN_DISPATCH_REQUIRED');
      await expect(h.run(phase, {}, { eventName: 'push' })).rejects.toThrow('MAIN_DISPATCH_REQUIRED');
      h.setAncestor('9'.repeat(40)); await expect(h.run(phase)).rejects.toThrow('MAIN_ANCESTOR_REQUIRED'); h.setAncestor(sha);
      h.jobs.set(1, h.jobs.get(1)!.slice(0, 3)); h.runs.push({ head_sha: sha, event: 'push', status: 'completed', id: 2 });
      h.jobs.set(2, [{ name: 'Commercial SQL + concurrent PostgreSQL acceptance', conclusion: 'success' }]);
      await expect(h.run(phase)).rejects.toThrow('EXACT_SOURCE_CHECKS_REQUIRED');
      h.runs[0].head_sha = '9'.repeat(40); await expect(h.run(phase)).rejects.toThrow('EXACT_SOURCE_CHECKS_REQUIRED');
    }
  });
  it('workflowSetupRejectsDispatchDigestsAndReruns', async () => {
    const h = workflowGate();
    for (const phase of ['setup-bootstrap', 'setup-complete']) {
      for (const key of ['setup_plan_sha256', 'setup_resume_sha256', 'unknown']) await expect(h.run(phase, { [key]: 'a'.repeat(64) })).rejects.toThrow('EXACT_INPUTS_REQUIRED');
      await expect(h.run(phase, { fixture_manifest_sha256: 'a'.repeat(64) })).rejects.toThrow('EXACT_INPUTS_REQUIRED');
      await expect(h.run(phase, {}, { runAttempt: 2 })).rejects.toThrow('SETUP_RERUN_REFUSED');
      await expect(h.run(phase, { fixture_manifest_sha256: '' })).rejects.toThrow('SETUP_PREREQUISITES_UNPROVED');
    }
    await expect(h.run('other')).rejects.toThrow('EXACT_INPUTS_REQUIRED'); expect(h.output).not.toHaveBeenCalled();
  });
  it('workflowEnvironmentBindingsArePhaseScoped', () => {
    const workflow = stagingWorkflow(); expect(workflow.env).toBeUndefined();
    expect(workflow.on.workflow_dispatch.inputs.fixture_manifest_sha256.required).toBe(false);
    expect(Object.keys(workflow.on.workflow_dispatch.inputs).sort()).toEqual(['candidate_sha', 'fixture_manifest_sha256', 'phase']);
    const job = workflow.jobs.setup; expect(job.needs).toEqual(['verify', 'build']); expect(job.environment).toBe('staging-backend'); expect(job.env).toBeUndefined();
    expect(job.if).toContain("github.ref == 'refs/heads/main'"); expect(job.if).toContain("github.event_name == 'workflow_dispatch'");
    const privateSteps = job.steps.filter(step => Object.values(step.env ?? {}).some(value => /STAGING_DRAWING_SETUP_(PLAN|RESUME)/.test(value)));
    expect(privateSteps).toHaveLength(2);
    const [bootstrap, complete] = privateSteps;
    expect(bootstrap.if).toBe("inputs.phase == 'setup-bootstrap'"); expect(complete.if).toBe("inputs.phase == 'setup-complete'");
    expect(Object.keys(bootstrap.env!)).not.toContain('SETUP_RESUME'); expect(Object.keys(bootstrap.env!)).not.toContain('SETUP_RESUME_SHA256');
    expect(complete.env!.SETUP_RESUME_SHA256).toBe('${{ secrets.STAGING_DRAWING_SETUP_RESUME_SHA256 }}');
    for (const name of ['verify', 'build', 'evidence']) {
      expect(workflow.jobs[name].env).toBeUndefined();
      expect(workflow.jobs[name].steps.flatMap(step => Object.values(step.env ?? {})).some(value => /STAGING_DRAWING_(SETUP|RECOVERY)/.test(value))).toBe(false);
    }
    expect(workflow.jobs.evidence.if).toContain("inputs.phase == 'preflight'"); expect(workflow.jobs.evidence.if).toContain("inputs.phase == 'acceptance'");
    const keyed = job.steps.filter(step => Object.values(step.env ?? {}).some(value => value.includes('STAGING_DRAWING_SETUP_SECRET_KEY')));
    expect(keyed).toHaveLength(1); expect(keyed[0].id).toBe('server');
    expect(job.steps.findIndex(step => step.run === 'npm ci --ignore-scripts')).toBeLessThan(job.steps.indexOf(bootstrap));
    expect(Object.values(workflow.jobs.verify.steps[0].env ?? {}).some(value => value.includes('secrets.'))).toBe(false);
  });
  it('workflowFailureCannotTurnFoundationIntoAcceptance', async () => {
    const h = workflowGate(); await expect(h.run('setup-complete')).rejects.toThrow('SETUP_PREREQUISITES_UNPROVED'); expect(h.output).not.toHaveBeenCalled();
    const provision = await import('../drawing-cutover-provision.ts'); const network = vi.spyOn(globalThis, 'fetch');
    try { expect(() => provision.runSetupCli(['prepare', '--target=staging', `--expected-ref=${setup.STAGE_REF}`, `--candidate-sha=${sha}`, '--phase=setup-bootstrap', `--plan-sha256=${'1'.repeat(64)}`])).toThrow('SETUP_MUTATION_PREREQUISITES_UNPROVED');
      expect(network).not.toHaveBeenCalled(); } finally { network.mockRestore(); }
    expect(summarizeCases([]).status).toBe('INCOMPLETE');
  });
  it('setupTransportCountsUtf8AndRejectsOverflowBeforeWrites', async () => {
    const provision = await import('../drawing-cutover-provision.ts');
    for (const raw of ['x'.repeat(48_000), 'é'.repeat(24_000)]) expect(() => provision.requireSetupTransportSize(raw)).not.toThrow();
    for (const raw of ['x'.repeat(48_001), 'é'.repeat(24_001), JSON.stringify('\\'.repeat(24_000))]) expect(() => provision.requireSetupTransportSize(raw)).toThrow('SETUP_TRANSPORT_CAPACITY');
    const h = await foundationHarness(); const template = h.plan.prerequisiteDetails!.sideEffects.activeCostCodeTemplates[0];
    h.plan.prerequisiteDetails!.sideEffects.activeCostCodeTemplates = Array.from({ length: 80 }, (_, n) => ({ ...template, id: id(7000 + n), cost_code_number: String(n), description: 'é'.repeat(500) }));
    h.plan.prerequisites.sideEffectsSha256 = testHash(JSON.stringify(h.plan.prerequisiteDetails!.sideEffects));
    await expect(h.provision.runFoundation(h.plan, null, h.transports, h.checkpoint)).rejects.toThrow('SETUP_TRANSPORT_CAPACITY'); expect(h.writes).toEqual([]);
    const complete = await completedHarness(); complete.resume.reviewedAt = complete.resume.reviewedAt.replace('Z', `${'0'.repeat(48_001)}Z`);
    expect(() => provision.initialFoundationReceipt(complete.plan, complete.resume)).toThrow('SETUP_TRANSPORT_CAPACITY');
    expect(() => provision.createSetupTransports(complete.plan, { publicKey: 'sb_publishable_synthetic', setupKey: 'sb_secret_synthetic',
      setupKeyIdentifier: 'synthetic-key-id', credentials: complete.resume.recovery.credentials, resume: complete.resume }, vi.fn())).toThrow('SETUP_TRANSPORT_CAPACITY');
  });
  it('bootstrapResumeBoundCoversOwnerConstruction', async () => {
    const provision = await import('../drawing-cutover-provision.ts');
    const plan = foundationPlan(); plan.context.workflowRunId = '9'.repeat(20); plan.context.workflowRunAttempt = '9'.repeat(20);
    plan.roster = plan.roster.map(a => ({ ...a, email: `${a.alias.padEnd(254 - '@example.invalid'.length, 'e')}@example.invalid` }));
    plan.prerequisiteDetails!.sideEffects.activeCostCodeTemplates[0].description = 'é"\\\n'.repeat(100);
    plan.prerequisites.sideEffectsSha256 = testHash(JSON.stringify(plan.prerequisiteDetails!.sideEffects));
    // Independently construct all successful bootstrap identities/journal/wrappers,
    // never use the estimator or factory to build the expected resume.
    const receipt: FoundationReceipt = { context: { ...plan.context, checkpointSequence: 32 }, planSha256: testHash(JSON.stringify(plan)), status: 'AWAITING_ENTITLEMENT_REVIEW',
      operations: [], actors: plan.roster.map((a, n) => ({ alias: a.alias, id: id(600 + n), emailSha256: testHash(a.email), authenticated: true })),
      organizations: [], projects: [], memberships: [], census: { observedAt: new Date().toISOString(), sideEffectsSha256: plan.prerequisites.sideEffectsSha256, observationSha256: 'f'.repeat(64), children: [] } };
    for (const a of receipt.actors) for (const action of ['create-user', 'authenticate-user'] as const) appendSuccessfulOperation(receipt, { action, actor: a.alias }, a.id);
    for (const [n, alias] of (['A', 'B'] as const).entries()) {
      const actor = receipt.actors.find(a => a.alias === (alias === 'A' ? 'admin' : 'foreign'))!;
      receipt.organizations.push({ alias, id: id(700 + n), createdBy: actor.id, ownerId: actor.id });
      receipt.memberships.push({ id: id(800 + n), actor: actor.alias, userId: actor.id, orgId: id(700 + n), role: 'owner' });
      appendSuccessfulOperation(receipt, { action: 'create-organization', actor: actor.alias, organization: alias }, id(700 + n));
    }
    const artifact = { ...artifactFixture(), artifactId: '9'.repeat(20), workflowRunId: '9'.repeat(20), workflowRunAttempt: '9'.repeat(20) };
    const context: SetupContext = { ...plan.context, phase: 'setup-complete', workflowRunId: '8'.repeat(20) };
    const completePlan: SetupPlan = { ...structuredClone(plan), context, prior: { receiptSha256: testHash(JSON.stringify(receipt)), artifact } };
    const resume: SetupResume = { context, planSha256: testHash(JSON.stringify(completePlan)), recovery: { plan, receipt, credentials: plan.roster.map(a => ({ ...a, password: a.alias.padEnd(43, 'p') })) },
      artifact, receiptSha256: testHash(JSON.stringify(receipt)), reviewedAt: new Date().toISOString(), reviewSha256: 'b'.repeat(64),
      entitlements: receipt.organizations.map(o => ({ organization: o.alias, orgId: o.id, createdBy: o.createdBy, plan: 'pro', observedAt: new Date().toISOString(), readbackSha256: 'c'.repeat(64) })) };
    resume.reviewedAt = new Date().toISOString();
    const resumeRaw = JSON.stringify(resume);
    expect(setup.validateSetupResume(resumeRaw, testHash(resumeRaw), completePlan, artifact)).toEqual(resume);
    expect(Buffer.byteLength(JSON.stringify(resume))).toBeLessThanOrEqual(provision.estimateBootstrapResumeBytes(plan));
    expect(provision.estimateBootstrapResumeBytes(plan)).toBeLessThan(48_000); expect(() => provision.requireFoundationPlan(plan)).not.toThrow();
    const template = plan.prerequisiteDetails!.sideEffects.activeCostCodeTemplates[0];
    plan.prerequisiteDetails!.sideEffects.activeCostCodeTemplates = Array.from({ length: 53 }, (_, n) => ({ ...template, id: id(9000 + n), cost_code_number: String(n), description: 'd'.repeat(500) }));
    plan.prerequisites.sideEffectsSha256 = testHash(JSON.stringify(plan.prerequisiteDetails!.sideEffects));
    expect(Buffer.byteLength(JSON.stringify(plan))).toBeLessThan(48_000); expect(provision.estimateBootstrapResumeBytes(plan)).toBeGreaterThan(48_000);
    expect(() => provision.requireFoundationPlan(plan)).toThrow('SETUP_BOOTSTRAP_RESUME_CAPACITY');
  });
  it('workflowPrivateResumeAndArtifactIdentityBound', async () => {
    const workflow = stagingWorkflow(); const stages = workflow.jobs.setup.steps.filter(s => s.id === 'stage-bootstrap' || s.id === 'stage-complete'); expect(stages).toHaveLength(2);
    for (const complete of [false, true]) {
      const h = complete ? await completedHarness() : { plan: foundationPlan(), resume: null }; const raw = JSON.stringify(h.plan); const resumeRaw = h.resume ? JSON.stringify(h.resume) : '';
      const approved = testHash(raw); const approvedResume = testHash(resumeRaw);
      const env = { RUNNER_TEMP: tmpdir(), GITHUB_RUN_ID: h.plan.context.workflowRunId, GITHUB_RUN_ATTEMPT: '1', GITHUB_REPOSITORY: 'lorteezy87/SteelBuild-Pro-Rev.2',
        CANDIDATE_SHA: sha, PHASE: h.plan.context.phase, SETUP_PLAN: raw, SETUP_PLAN_SHA256: approved, RECOVERY_PUBLIC_KEY: recoveryKeys.publicKey,
        ...(complete ? { SETUP_RESUME: resumeRaw, SETUP_RESUME_SHA256: approvedResume } : {}) };
      const result = await executeSetupWorkflowScript(stages[complete ? 1 : 0], env);
      expect(result.writes.find(w => w.path.endsWith('plan.json'))?.value).toEqual(h.plan); expect(result.outputs).not.toHaveBeenCalled();
      expect(result.writes.find(w => w.path.endsWith('plan.json'))!.mode).toBe(0o600); expect(result.writes[0].mode).toBe(0o700);
      for (const patch of [{ SETUP_PLAN_SHA256: '' }, { SETUP_PLAN_SHA256: 'f'.repeat(64) }, { SETUP_PLAN: raw.replace('Synthetic A', 'Changed A') }, { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_RUN_ID: '765432' }, { CANDIDATE_SHA: '9'.repeat(40) }, { PHASE: complete ? 'setup-bootstrap' : 'setup-complete' }, { RECOVERY_PUBLIC_KEY: '' }]) {
        await expect(executeSetupWorkflowScript(stages[complete ? 1 : 0], { ...env, ...patch })).rejects.toThrow('SETUP_PRIVATE_INPUT_REFUSED');
      }
      if (complete) for (const patch of [{ SETUP_RESUME_SHA256: '' }, { SETUP_RESUME_SHA256: approved }, { SETUP_RESUME: resumeRaw.replace('777', '778') }]) await expect(executeSetupWorkflowScript(stages[1], { ...env, ...patch })).rejects.toThrow('SETUP_PRIVATE_INPUT_REFUSED');
      // Even a freshly approved full-byte fingerprint cannot waive stale context,
      // expiry, recipient or bootstrap artifact source identity.
      const expired = structuredClone(h.plan); expired.expiresAt = expired.createdAt;
      const wrongRecipient = structuredClone(h.plan); wrongRecipient.context.recipientSha256 = 'f'.repeat(64);
      for (const changed of [expired, wrongRecipient]) {
        const changedRaw = JSON.stringify(changed); await expect(executeSetupWorkflowScript(stages[complete ? 1 : 0], { ...env, SETUP_PLAN: changedRaw, SETUP_PLAN_SHA256: testHash(changedRaw) })).rejects.toThrow('SETUP_PRIVATE_INPUT_REFUSED');
      }
      if (h.resume) for (const patch of [{ archiveSha256: 'c'.repeat(64) }, { ciphertextSha256: 'd'.repeat(64) }, { workflowRunAttempt: '2' }]) {
        const changed = structuredClone(h.resume); Object.assign(changed.artifact, patch); const changedRaw = JSON.stringify(changed);
        await expect(executeSetupWorkflowScript(stages[1], { ...env, SETUP_RESUME: changedRaw, SETUP_RESUME_SHA256: testHash(changedRaw) })).rejects.toThrow('SETUP_PRIVATE_INPUT_REFUSED');
      }
    }
  });
  it('workflowSecretScopeAndInitialUploadBarrier', async () => {
    const job = stagingWorkflow().jobs.setup; const steps = job.steps;
    const initial = steps.find(s => s.id === 'initial')!; const bind = steps.find(s => s.id === 'bind-initial')!; const server = steps.find(s => s.id === 'server')!;
    expect(initial.with!.path).toContain('/initial.enc.json'); expect(initial.with!['retention-days']).toBe(1); expect(initial.with!['if-no-files-found']).toBe('error');
    expect(steps.indexOf(initial)).toBeLessThan(steps.indexOf(bind)); expect(steps.indexOf(bind)).toBeLessThan(steps.indexOf(server)); expect(server.if).toBe('success()');
    const env = { RUNNER_TEMP: tmpdir(), GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '1', CANDIDATE_SHA: sha, INITIAL_ARTIFACT_ID: '777', INITIAL_ARCHIVE_SHA256: 'a'.repeat(64) };
    const artifact = { id: 777, name: `drawing-foundation-initial-${sha}-123456-1`, expired: false, digest: `sha256:${'a'.repeat(64)}`, workflow_run: { id: 123456, head_sha: sha, head_branch: 'main' } };
    const github = { rest: { actions: { getArtifact: async () => ({ data: artifact }), getWorkflowRun: async () => ({ data: { id: 123456, run_attempt: 1, event: 'workflow_dispatch', head_branch: 'main', head_sha: sha, path: '.github/workflows/drawing-cutover-staging.yml' } }) } } };
    const result = await executeSetupWorkflowScript(bind, env, github); const binding = result.writes.find(w => w.path.endsWith('initial-upload.json'))!.value as { artifact: ArtifactBinding };
    expect(binding.artifact.archiveSha256).toBe('a'.repeat(64)); expect(binding.artifact.ciphertextSha256).toBe(testHash('{"encrypted":"synthetic"}')); expect(binding.artifact.ciphertextSha256).not.toBe(binding.artifact.archiveSha256);
    for (const patch of [{ INITIAL_ARTIFACT_ID: '' }, { INITIAL_ARCHIVE_SHA256: '' }, { INITIAL_ARCHIVE_SHA256: 'b'.repeat(64) }]) await expect(executeSetupWorkflowScript(bind, { ...env, ...patch }, github)).rejects.toThrow('SETUP_INITIAL_UPLOAD_REFUSED');
    for (const patch of [{ expired: true }, { workflow_run: { id: 2, head_sha: sha, head_branch: 'main' } }, { digest: `sha256:${'b'.repeat(64)}` }]) {
      const bad = { rest: { actions: { ...github.rest.actions, getArtifact: async () => ({ data: { ...artifact, ...patch } }) } } };
      await expect(executeSetupWorkflowScript(bind, env, bad)).rejects.toThrow('SETUP_INITIAL_UPLOAD_REFUSED');
    }
    const final = steps.find(s => s.id === 'final')!; expect(final.if).toContain('!cancelled()'); expect(final.with!.path).toContain('/final.enc.json'); expect(final.with!['retention-days']).toBe(1);
    expect(final.with!['if-no-files-found']).toBe('error'); expect(final['continue-on-error']).toBeUndefined();
    // Execute actual conditions with failed/cancelled callbacks. A failed initial
    // upload/metadata barrier cannot run the server, and final upload never erases
    // a previous failure or fabricates a missing final file.
    for (const failAt of ['initial', 'bind-initial', 'server', 'final', 'cancelled']) {
      let failed = false; let cancelled = false; const calls: string[] = []; const outcomes: Record<string, { outcome: string }> = {};
      for (const step of steps) {
        cancelled ||= failAt === 'cancelled' && step.id === 'server';
        if (!workflowCondition(step.if, 'setup-bootstrap', failed, cancelled, outcomes)) continue;
        if (step.id) { calls.push(step.id); const outcome = step.id === failAt ? 'failure' : 'success'; outcomes[step.id] = { outcome }; failed ||= outcome === 'failure'; }
      }
      if (['initial', 'bind-initial', 'cancelled'].includes(failAt)) expect(calls).not.toContain('server');
      if (failAt === 'cancelled') expect(calls).not.toContain('final');
      if (failAt !== 'cancelled') expect(failed).toBe(true);
    }
    for (const phase of ['setup-bootstrap', 'setup-complete']) {
      expect(workflowCondition(stagingWorkflow().jobs.setup.if, phase)).toBe(true); expect(workflowCondition(stagingWorkflow().jobs.evidence.if, phase)).toBe(false);
    }
    let bindingWrites = 0;
    const recoveryModule = { ...(await import('../drawing-cutover-recovery.ts')), writePrivateJson: async () => { bindingWrites++; } };
    await expect(executeSetupWorkflowScript(bind, env, { rest: { actions: { getArtifact: async () => { throw new Error('metadata unavailable'); } } } },
      { './scripts/drawing-cutover-recovery.ts': recoveryModule })).rejects.toThrow('SETUP_INITIAL_UPLOAD_REFUSED'); expect(bindingWrites).toBe(0);
  });
  it('setupFinalCheckpointRetainsTerminalReceiptAndMfa', async () => {
    const recovery = await import('../drawing-cutover-recovery.ts'); const directory = privateTemp();
    try {
      const h = await completedHarness(); const terminal = await h.provision.runFoundation(h.plan, h.resume, h.transports, h.checkpoint);
      const records = h.results as Parameters<SetupCheckpoint['persistResult']>[0][];
      const beforeMfa = records.filter(r => (r.receipt.operations.at(-2) as SetupIntent).action === 'assign-project-role').at(-1)!;
      const initial = { ...h.provision.prepareFoundation(h.plan, h.resume, recoveryKeys.publicKey).payload, receipt: beforeMfa.receipt };
      const artifact = { ...artifactFixture(), workflowRunId: h.plan.context.workflowRunId };
      const checkpoint = h.provision.createPrivateSetupCheckpoint(initial, recoveryKeys.publicKey, directory, artifact, artifact);
      for (const record of records.filter(r => ['enroll-mfa', 'challenge-mfa', 'verify-mfa'].includes((r.receipt.operations.at(-2) as SetupIntent).action))) await checkpoint.persistResult(record);
      expect(terminal.status).toBe('FOUNDATION_PREPARED');
      const finalPath = await checkpoint.persistFinal(terminal); expect(finalPath).toBe(join(directory, 'final.enc.json'));
      const decrypted = recovery.decryptRecovery(JSON.parse(readFileSync(finalPath, 'utf8')), recoveryKeys.privateKey, terminal.context);
      expect(decrypted.receipt).toEqual(terminal); expect(decrypted.receipt.census).toEqual(terminal.census); expect(decrypted.credentials.find(c => c.alias === 'mfa')!.mfa).toEqual({ factorId: terminal.actors.find(a => a.alias === 'mfa')!.mfa!.factorId, secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' });
      await expect(checkpoint.persistFinal(terminal)).rejects.toThrow(); expect(recovery.decryptRecovery(JSON.parse(readFileSync(finalPath, 'utf8')), recoveryKeys.privateKey, terminal.context).receipt).toEqual(terminal);
      const impossible = structuredClone(terminal); impossible.operations.splice(-6); impossible.context.checkpointSequence -= 6;
      await expect(checkpoint.persistFinal(impossible)).rejects.toThrow();
      const blocked = h.provision.createPrivateSetupCheckpoint(initial, recoveryKeys.publicKey, join(directory, 'absent'), artifact, artifact);
      await expect(blocked.persistFinal(initial.receipt)).rejects.toThrow();
    } finally { removeRecoveryTemp(directory); }
  }, 60_000);
  it('workflowNeverAppliesSqlOrDeploys', () => {
    const workflow = stagingWorkflow();
    for (const job of Object.values(workflow.jobs)) for (const step of job.steps) expect(step.run ?? '').not.toMatch(/supabase (?:db push|migration repair|functions deploy)|wrangler|vercel deploy|psql|apply_migration/);
    expect(workflow.jobs.setup.steps.find(s => s.id === 'prepare')?.run).toContain("'prepare'");
    expect(workflow.jobs.setup.steps.find(s => s.id === 'server')?.run).toContain("'run'");
  });
});

describe('finite foundation factory', () => {
  it('setupFix1I1ExactHttpRangeCannotHideAdditionalRows', async () => {
    const provision = await import('../drawing-cutover-provision.ts'); const body = [{ id: id(1) }, { id: id(2) }];
    const decode = async (range: string | null, value: unknown = body, max = 2) => {
      const response = Response.json(value, { headers: range === null ? {} : { 'Content-Range': range, 'Range-Unit': 'items' } });
      return provision.validateExactSetupRows(await response.json(), response.headers.get('content-range'), max);
    };
    await expect(decode('0-1/2')).resolves.toEqual(body); await expect(decode('*/0', [], 0)).resolves.toEqual([]);
    for (const range of ['0-1/3', '0-1/*', null, '1-2/2', '0-0/2', '0-2/2', '*/2', '0-1/02', '0-1/9007199254740993', 'bad']) {
      await expect(decode(range)).rejects.toThrow('SETUP_EXACT_RANGE_REQUIRED');
    }
    await expect(decode('*/0', body)).rejects.toThrow(); await expect(decode('0-1/2', body, 1)).rejects.toThrow();
  });
  it('setupFix1I2MaximumWidthPlansRefuseBeforeWritesAndNearBoundaryFits', async () => {
    const provision = await import('../drawing-cutover-provision.ts');
    const widePlan = (count: number): SetupPlan => {
      const plan = foundationPlan(); plan.prerequisiteDetails!.sideEffects.activeCostCodeTemplates = Array.from({ length: count }, (_, i) => ({
        id: id(7000 + i), cost_code_number: String(i).padStart(100, 'C'), description: 'd'.repeat(500), category: 'k'.repeat(100),
        default_budget_amount: `${'9'.repeat(30)}.${'9'.repeat(30)}`, sort_order: i, is_active: true as const,
      })); plan.prerequisites.sideEffectsSha256 = testHash(JSON.stringify(plan.prerequisiteDetails!.sideEffects)); return plan;
    };
    // Independent width construction: no seedRecipes() oracle supplies these cost rows.
    const independentCostRows = (plan: SetupPlan) => plan.projects.flatMap((project, projectIndex) => plan.prerequisiteDetails!.sideEffects.activeCostCodeTemplates.map((template, index) => ({
      table: 'cost_codes', id: id(10000 + projectIndex * 256 + index), projectId: id(8000 + projectIndex), values: {
        number: template.cost_code_number, description: template.description, category: template.category, phase: template.category,
        budget: template.default_budget_amount, actual: '0', committed: '0', forecast: '0', projectName: project.name,
        createdBy: id(projectIndex < 2 ? 9000 : 9001), autoSeeded: true, source: 'default_cost_codes',
      },
    })));
    const maximum = widePlan(256);
    expect(Buffer.byteLength(JSON.stringify({ children: independentCostRows(maximum), activeCostCodeTemplates: maximum.prerequisiteDetails!.sideEffects.activeCostCodeTemplates }))).toBeGreaterThan(1_048_576);
    const network = vi.fn();
    expect(() => provision.createSetupTransports(maximum, { publicKey: 'sb_publishable_synthetic', setupKey: 'sb_secret_synthetic',
      setupKeyIdentifier: 'synthetic-key-id', credentials: recoveryFixture().credentials }, network)).toThrow(/CAPACITY/);
    expect(network).not.toHaveBeenCalled();
    let accepted = 0;
    for (let n = 1; n <= 256; n++) { try { provision.requireFoundationPlan(widePlan(n)); accepted = n; } catch { break; } }
    // The later 48,000-byte transport/forward-resume gates deliberately admit
    // fewer templates than the original 1MiB observation-only admission.
    expect(accepted).toBeGreaterThan(0); expect(accepted).toBeLessThan(64);
    expect(() => provision.requireFoundationPlan(widePlan(accepted + 1))).toThrow('SETUP_BOOTSTRAP_RESUME_CAPACITY');
    const near = widePlan(accepted); expect(Buffer.byteLength(JSON.stringify(independentCostRows(near)))).toBeLessThan(1_048_576);
    const h = await completedHarness(near); const receipt = await provision.runFoundation(h.plan, h.resume, h.transports, h.checkpoint);
    expect(receipt.status).toBe('FOUNDATION_PREPARED'); expect(Buffer.byteLength(JSON.stringify(h.snapshots.at(-1)))).toBeLessThan(1_048_576);
    const payload: PrivateRecoveryPayload = { plan: h.plan, receipt, credentials: structuredClone(h.resume.recovery.credentials) };
    payload.credentials.find(c => c.alias === 'mfa')!.mfa = (h.results.find(r => (r as { mfa?: unknown }).mfa) as { mfa: { factorId: string; secret: string } }).mfa;
    const recovery = await import('../drawing-cutover-recovery.ts');
    const envelopeBytes = Buffer.byteLength(JSON.stringify(recovery.encryptRecovery(payload, recoveryKeys.publicKey, receipt.context)));
    expect(envelopeBytes).toBeLessThan(1_048_576);
  }, 60_000);
  it('setupFix1I3ReturnedProjectIdSurvivesFailedReadbackInUnknownCheckpoint', async () => {
    const h = await completedHarness(); const observe = h.transports.observe;
    h.transports.observe = async scope => { if (scope.projects.length) throw new Error('synthetic post-create readback loss'); return observe(scope); };
    const receipt = await h.provision.runFoundation(h.plan, h.resume, h.transports, h.checkpoint);
    const final = h.results.at(-1) as { result: setup.SetupResult; receipt: FoundationReceipt };
    expect(receipt.status).toBe('UNKNOWN_COMMIT_STATE'); expect(h.writes.filter(w => w.startsWith('create-project:'))).toHaveLength(1);
    expect(final.result.outcome).toBe('UNKNOWN'); expect(final.result.observedId).toBe(h.state.projects[0].id);
    expect(final.receipt).toEqual(receipt); expect(final.receipt.projects).toEqual([]);
    expect(final.receipt.census).toEqual((h.results.at(-2) as { receipt: FoundationReceipt }).receipt.census);
    expect(() => setup.validateFoundationReceipt(final.receipt, h.plan)).not.toThrow();
    for (const readbackFails of [false, true]) {
      const loss = await completedHarness(); const persist = loss.checkpoint.persistResult; const observed = loss.transports.observe; let attempts = 0;
      if (readbackFails) loss.transports.observe = async scope => { if (scope.projects.length) throw new Error('readback loss'); return observed(scope); };
      loss.checkpoint.persistResult = async record => {
        const intent = record.receipt.operations.at(-2) as SetupIntent;
        if (intent.action === 'create-project') { attempts++; throw new Error('checkpoint may have persisted'); }
        return persist(record);
      };
      const result = await loss.provision.runFoundation(loss.plan, loss.resume, loss.transports, loss.checkpoint);
      expect(result.status).toBe('UNKNOWN_COMMIT_STATE'); expect(attempts).toBe(1);
      expect(loss.writes.filter(w => w.startsWith('create-project:'))).toHaveLength(1);
    }
  });
  it.each(['none', 'owner', 'expiry'] as const)('setupFix1I4BootstrapTerminal_%s', async defect => {
      const h = await foundationHarness(); const persist = h.checkpoint.persistResult; let snapshotsAtLastCheckpoint = -1;
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        h.checkpoint.persistResult = async record => { await persist(record);
          if (record.receipt.organizations.length === 2) {
            snapshotsAtLastCheckpoint = h.snapshots.length;
            if (defect === 'owner') h.state.organizations[1].ownerId = id(9999);
            if (defect === 'expiry') vi.setSystemTime(Date.parse(h.plan.expiresAt));
          }
        };
        const receipt = await h.provision.runFoundation(h.plan, null, h.transports, h.checkpoint);
        expect(receipt.status).toBe(defect === 'none' ? 'AWAITING_ENTITLEMENT_REVIEW' : 'STOPPED');
        expect(h.writes.filter(w => w.startsWith('create-organization:'))).toHaveLength(2);
        expect(receipt.census).toEqual((h.results.at(-1) as { receipt: FoundationReceipt }).receipt.census);
        if (defect !== 'expiry') expect(h.snapshots.length).toBe(snapshotsAtLastCheckpoint + 1);
      } finally { vi.useRealTimers(); }
  });
  it('setupRfc6238Sha1Vectors', async () => {
    const { computeTotp } = await import('../drawing-cutover-provision.ts'); const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(computeTotp(secret, 59, 8)).toBe('94287082'); expect(computeTotp(secret, 1111111109, 8)).toBe('07081804');
    expect(computeTotp(secret, 59)).toBe('287082'); expect(computeTotp(secret, 1111111109)).toBe('081804');
    expect(() => computeTotp('not a secret', 59)).toThrow(); expect(() => computeTotp(secret, -1)).toThrow();
  });
  it('setupWrongTargetKeyOrEvidenceMakesZeroRequests', async () => {
    const h = await foundationHarness(); const network = vi.fn();
    for (const change of [(p: SetupPlan) => { p.context.projectRef = 'wrong' as typeof setup.STAGE_REF; },
      (p: SetupPlan) => { delete p.prerequisiteDetails; }, (p: SetupPlan) => { p.prerequisiteDetails!.sideEffects.activeCostCodeTemplates[0].description = 'changed'; }]) {
      const p = structuredClone(h.plan); change(p);
      expect(() => h.provision.createSetupTransports(p, { publicKey: 'sb_publishable_synthetic', setupKey: 'sb_secret_synthetic', setupKeyIdentifier: 'synthetic-key-id', credentials: recoveryFixture().credentials }, network)).toThrow();
    }
    expect(network).not.toHaveBeenCalled();
  });
  it('setupAdminKeyNeverReachesCallerTransport', async () => {
    const h = await foundationHarness(); const network = vi.fn();
    expect(() => h.provision.createSetupTransports(h.plan, { publicKey: 'sb_secret_synthetic', setupKey: 'sb_secret_synthetic', setupKeyIdentifier: 'synthetic-key-id', credentials: recoveryFixture().credentials }, network)).toThrow();
    expect(network).not.toHaveBeenCalled();
  });
  it('setupUnknownResponseNeverReposts', async () => {
    const h = await foundationHarness(); h.transports.createActor = async () => { h.writes.push('lost-create'); throw new Error('lost synthetic response'); };
    const receipt = await h.provision.runFoundation(h.plan, null, h.transports, h.checkpoint);
    expect(receipt.status).toBe('UNKNOWN_COMMIT_STATE'); expect(h.writes).toEqual(['lost-create']); expect(receipt.operations).toHaveLength(2);
  });
  it('setupCheckpointLossStopsBeforeNextWrite', async () => {
    for (const barrier of ['initial', 'intent', 'result'] as const) {
      const h = await foundationHarness();
      if (barrier === 'initial') h.checkpoint.assertInitialUploaded = async () => { throw new Error('lost'); };
      if (barrier === 'intent') h.checkpoint.persistIntent = async () => { throw new Error('lost'); };
      if (barrier === 'result') h.checkpoint.persistResult = async () => { throw new Error('lost'); };
      const receipt = await h.provision.runFoundation(h.plan, null, h.transports, h.checkpoint);
      expect(receipt.status).not.toBe('AWAITING_ENTITLEMENT_REVIEW'); expect(h.writes).toHaveLength(barrier === 'result' ? 1 : 0);
    }
  });
  it('setupChangedOwnerOrUnexpectedChildBlocksComplete', async () => {
    for (const change of ['owner', 'child'] as const) {
      const h = await completedHarness();
      if (change === 'owner') h.state.organizations[0].ownerId = id(9999);
      else h.state.children.push({ table: 'number_sequences', id: id(9998), projectId: id(9997), recordType: 'action_item', nextValue: 11 });
      const receipt = await h.provision.runFoundation(h.plan, h.resume, h.transports, h.checkpoint);
      expect(receipt.status).toBe('STOPPED'); expect(h.writes.length).toBeGreaterThan(0); expect(h.writes.every(w => ['authenticate-user:admin', 'authenticate-user:foreign'].includes(w))).toBe(true);
    }
  });
  it('setupExactSevenTwoFourPositive', async () => {
    const h = await completedHarness();
    const receipt = await h.provision.runFoundation(h.plan, h.resume, h.transports, h.checkpoint);
    expect({ status: receipt.status, writes: h.writes }).toEqual({ status: 'FOUNDATION_PREPARED', writes: h.writes }); expect(setup.validateFoundationReceipt(receipt, h.plan)).toEqual(receipt);
    expect(receipt.actors).toHaveLength(7); expect(receipt.organizations).toHaveLength(2); expect(receipt.projects).toHaveLength(4); expect(receipt.memberships).toHaveLength(16);
    expect(h.writes.filter(w => w.startsWith('create-project:'))).toHaveLength(4); expect(h.writes.filter(w => w.startsWith('add-organization-member:'))).toHaveLength(5);
    expect(h.snapshots[0].projects).toEqual([]); expect(h.snapshots.at(-1)!.projects).toHaveLength(4);
    expect(h.state.memberships.filter(m => m.orgId === receipt.organizations[1].id)).toHaveLength(3);
    expect(h.state.children.filter(c => c.table === 'number_sequences')).toHaveLength(8);
    expect(receipt.actors.find(a => a.alias === 'mfa')!.mfa?.verified).toBe(true);
    expect(receipt.census!.children).toHaveLength(273);
    const enrollment = h.results.find(r => (r as { mfa?: unknown }).mfa) as { mfa: { factorId: string; secret: string } };
    const payload: PrivateRecoveryPayload = { plan: h.plan, receipt, credentials: structuredClone(h.resume.recovery.credentials) };
    payload.credentials.find(c => c.alias === 'mfa')!.mfa = enrollment.mfa;
    expect(setup.validatePrivateRecoveryPayload(payload, receipt.context)).toEqual(payload);
    expect(JSON.stringify(receipt)).not.toContain(enrollment.mfa.secret);
    expect(JSON.stringify(h.provision.safeSetupStatus(receipt))).not.toContain('@');
    for (const result of h.results.slice(1) as { result: { outcome: string }; receipt: FoundationReceipt }[]) {
      if (result.result.outcome === 'SUCCEEDED') expect(result.receipt.census).toBeDefined();
    }
  });
  it('setupEveryNonIdempotentResponseAndCheckpointLossStops', async () => {
    const writeMethods = new Set(['createActor', 'signIn', 'createOrganization', 'configureOrganization', 'addOrganizationMember', 'createProject', 'assignProjectRole', 'enrollMfa', 'challengeMfa', 'verifyMfa']);
    for (const phase of ['bootstrap', 'complete'] as const) {
      const count = phase === 'bootstrap' ? 16 : 26;
      for (const boundary of ['response', 'intent', 'result'] as const) for (let failure = 1; failure <= count; failure++) {
        const h = phase === 'bootstrap' ? { ...await foundationHarness(), resume: null } : await completedHarness(); let calls = 0;
        if (boundary === 'response') {
          const original = h.transports;
          h.transports = new Proxy(original, { get(target, key) {
            const method = target[key as keyof SetupTransports]; if (typeof method !== 'function' || !writeMethods.has(String(key))) return method;
            return async (...args: unknown[]) => { const value = await (method as (...values: unknown[]) => Promise<unknown>)(...args);
              if (++calls === failure) throw new Error('synthetic lost response'); return value; };
          } });
        } else if (boundary === 'intent') h.checkpoint.persistIntent = async () => { if (++calls === failure) throw new Error('synthetic lost intent'); };
        else h.checkpoint.persistResult = async () => { if (++calls === failure) throw new Error('synthetic lost result'); };
        const receipt = await h.provision.runFoundation(h.plan, h.resume, h.transports, h.checkpoint);
        expect({ phase, boundary, failure, writes: h.writes.length, status: receipt.status }).toEqual({ phase, boundary, failure,
          writes: boundary === 'intent' ? failure - 1 : failure, status: 'UNKNOWN_COMMIT_STATE' });
        expect(() => setup.validateFoundationReceipt(receipt, h.plan)).not.toThrow();
        await expect(h.provision.runFoundation(h.plan, h.resume, h.transports, h.checkpoint)).rejects.toThrow('SETUP_NO_REPLAY');
        expect(h.writes).toHaveLength(boundary === 'intent' ? failure - 1 : failure);
      }
    }
  }, 60_000);
  it('setupAllRealMutationMethodsAndCliRefuseBeforeFetch', async () => {
    const h = await foundationHarness(); const network = vi.fn(); const runtime = h.provision.createSetupTransports(h.plan,
      { publicKey: 'sb_publishable_synthetic', setupKey: 'sb_secret_synthetic', setupKeyIdentifier: 'synthetic-key-id', credentials: recoveryFixture().credentials }, network);
    const scope = h.provision.initialFoundationReceipt(h.plan, null);
    for (const invoke of [() => runtime.createActor('pm'), () => runtime.signIn('pm', id(1)), () => runtime.createOrganization(scope, 'A'),
      () => runtime.configureOrganization(scope, 'A'), () => runtime.addOrganizationMember(scope, 'pm'), () => runtime.createProject(scope, 'A1'),
      () => runtime.assignProjectRole(scope, 'pm'), () => runtime.enrollMfa(scope), () => runtime.challengeMfa(scope, id(1)),
      () => runtime.verifyMfa(scope, id(1), id(2), '123456')]) await expect(invoke()).rejects.toThrow('SETUP_MUTATION_PREREQUISITES_UNPROVED');
    expect(network).not.toHaveBeenCalled(); expect(() => setup.assertDrawingMutationReadiness()).toThrow('MUTATION_PREREQUISITES_UNPROVED');
    const args = ['prepare', '--target=staging', `--expected-ref=${setup.STAGE_REF}`, `--candidate-sha=${sha}`, '--phase=setup-bootstrap', `--plan-sha256=${'1'.repeat(64)}`];
    expect(() => h.provision.runSetupCli(args)).toThrow('SETUP_MUTATION_PREREQUISITES_UNPROVED');
    for (const extra of ['--setup-key=synthetic-secret', '--output=C:/outside', '--unknown=true']) expect(() => h.provision.parseSetupArguments([...args, extra])).toThrow();
    const child = execFileSync(process.execPath, ['--input-type=module', '-e', `import {runSetupCli} from './scripts/drawing-cutover-provision.ts'; try { runSetupCli(${JSON.stringify(args)}); } catch { process.stdout.write('SETUP_REFUSED'); }`],
      { encoding: 'utf8', windowsHide: true, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH, TEMP: process.env.TEMP } });
    expect(child).toBe('SETUP_REFUSED'); expect(child).not.toContain('synthetic-secret');
  });
  it('setupMfaMissingSecretStaleSessionsAndNotificationEvidenceRefuse', async () => {
    const missing = await completedHarness(); missing.transports.enrollMfa = async () => ({ factorId: id(9990), secret: '' });
    expect((await missing.provision.runFoundation(missing.plan, missing.resume, missing.transports, missing.checkpoint)).status).toBe('UNKNOWN_COMMIT_STATE');
    expect(missing.writes).not.toContain('challenge-mfa'); expect(missing.writes).not.toContain('verify-mfa');
    const stale = await completedHarness(); const current = stale.transports.currentUser;
    stale.transports.currentUser = async (...args) => { const result = await current(...args); result.session.expiresAt = 1; return result; };
    expect((await stale.provision.runFoundation(stale.plan, stale.resume, stale.transports, stale.checkpoint)).status).toBe('UNKNOWN_COMMIT_STATE');
    expect(stale.writes).toEqual(['authenticate-user:admin']);
    const evidence = await foundationHarness(); (evidence.plan.prerequisites as unknown as Record<string, unknown>).noEmailSha256 = true;
    await expect(evidence.provision.runFoundation(evidence.plan, null, evidence.transports, evidence.checkpoint)).rejects.toThrow(); expect(evidence.writes).toEqual([]);
    const old = await completedHarness(); old.resume.artifact.candidateSha = '9'.repeat(40);
    await expect(old.provision.runFoundation(old.plan, old.resume, old.transports, old.checkpoint)).rejects.toThrow(); expect(old.writes).toEqual([]);
  });
  it('setupRealShapedSessionAndProjectProvenance', async () => {
    const h = await foundationHarness(); const actor: SetupActor = { alias: 'admin', id: id(77), emailSha256: testHash('admin@example.invalid'), confirmed: true, factors: [] };
    const now = Math.floor(Date.now() / 1000);
    const jwt = (patch = {}) => `${Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({
      sub: actor.id, email: 'admin@example.invalid', role: 'authenticated', aud: 'authenticated', iss: `${origin}/auth/v1`, exp: now + 3600, iat: now, session_id: id(78), aal: 'aal1', ...patch })).toString('base64url')}.synthetic`;
    const raw = { access_token: jwt(), token_type: 'bearer', expires_in: 3600, refresh_token: 'discard-synthetic-refresh',
      user: { id: actor.id, email: 'admin@example.invalid', email_confirmed_at: new Date().toISOString(), factors: [] } };
    const parsed = h.provision.validateSetupSessionResponse(raw, actor); expect(parsed.session.aal).toBe('aal1'); expect(JSON.stringify(parsed)).not.toContain('discard-synthetic-refresh');
    for (const patch of [{ sub: id(79) }, { email: 'other@example.invalid' }, { role: 'service_role' }, { exp: now - 1 }, { iss: 'https://foreign.invalid/auth/v1' }]) {
      expect(() => h.provision.validateSetupSessionResponse({ ...raw, access_token: jwt(patch) }, actor)).toThrow();
    }
    const org = { alias: 'A' as const, id: id(80), createdBy: actor.id, ownerId: actor.id, name: 'Synthetic A', slug: 'synthetic-a', plan: 'pro' as const, memberDefaultProjectRole: null };
    const project = { id: id(81), org_id: org.id, name: 'Synthetic A1', project_number: 'TEST-A1' };
    expect(h.provision.projectCreateResponse(h.plan, 'A1', project, org, parsed.session).createdBy).toBe(actor.id);
    expect(() => h.provision.projectCreateResponse(h.plan, 'A1', project, org, { ...parsed.session, actorId: id(82) })).toThrow();
    expect(() => h.provision.projectCreateResponse(h.plan, 'A1', { ...project, org_id: id(83) }, org, parsed.session)).toThrow();
    expect(h.provision.decimalIdentity('9007199254740993.0100')).toBe('9007199254740993.01');
  });
  it('setupUnknownMissingDuplicateAndForeignReadbacksFailClosed', async () => {
    for (const defect of ['missing-id', 'duplicate-id', 'wrong-email', 'extra-factor'] as const) {
      const h = await foundationHarness(); const create = h.transports.createActor;
      h.transports.createActor = async alias => { const actor = await create(alias); if (defect === 'missing-id') actor.id = '';
        if (defect === 'wrong-email') actor.emailSha256 = '0'.repeat(64); if (defect === 'extra-factor') actor.factors.push({ id: id(9), type: 'totp', status: 'verified' });
        if (defect === 'duplicate-id' && h.state.actors.length > 1) actor.id = h.state.actors[0].id; return actor; };
      const result = await h.provision.runFoundation(h.plan, null, h.transports, h.checkpoint); expect(result.status).toBe('UNKNOWN_COMMIT_STATE'); expect(h.writes.length).toBeLessThan(4);
    }
    const h = await completedHarness(); const create = h.transports.createProject;
    h.transports.createProject = async (...args) => { const project = await create(...args); h.state.memberships.find(m => m.projectId === project.id)!.userId = id(9999); return project; };
    const result = await h.provision.runFoundation(h.plan, h.resume, h.transports, h.checkpoint); expect(result.status).toBe('UNKNOWN_COMMIT_STATE');
    expect(h.writes.filter(w => w.startsWith('create-project:'))).toHaveLength(1); expect(result.projects).toHaveLength(0);
  });
  it('setupFinalObservationDriftCannotReturnPrepared', async () => {
    const h = await completedHarness(); const persist = h.checkpoint.persistResult;
    h.checkpoint.persistResult = async record => { await persist(record);
      if (record.receipt.operations.at(-2)?.kind === 'intent' && (record.receipt.operations.at(-2) as SetupIntent).action === 'verify-mfa') {
        h.state.children.find(c => c.table === 'number_sequences')!.nextValue = 99;
      }
    };
    const receipt = await h.provision.runFoundation(h.plan, h.resume, h.transports, h.checkpoint);
    expect(receipt.status).toBe('STOPPED'); expect(receipt.census?.children).toHaveLength(273);
    expect(h.writes.filter(w => w === 'verify-mfa')).toHaveLength(1);
  });
  it('setupSafeReadRetriesAreExactIdBoundedAndNewKeysAreNotBearerTokens', async () => {
    const h = await completedHarness(); const actor = h.resume.recovery.receipt.actors[0]; let attempts = 0;
    const response = { id: actor.id, email: `${actor.alias}@example.invalid`, email_confirmed_at: new Date().toISOString(), factors: [], unused: 'discard' };
    const network = vi.fn<typeof fetch>(async () => { if (++attempts === 1) throw new Error('synthetic timeout'); return Response.json(response); });
    const runtime = h.provision.createSetupTransports(h.plan, { publicKey: 'sb_publishable_synthetic', setupKey: 'sb_secret_synthetic',
      setupKeyIdentifier: 'synthetic-key-id', credentials: h.resume.recovery.credentials, resume: h.resume }, network);
    const observed = await runtime.readActor(actor.alias, actor.id); expect(observed.id).toBe(actor.id); expect(observed).not.toHaveProperty('unused');
    expect(network).toHaveBeenCalledTimes(2);
    for (const [url, init] of network.mock.calls) {
      expect(String(url)).toBe(`${origin}/auth/v1/admin/users/${actor.id}`);
      expect(new Headers(init?.headers).get('apikey')).toBe('sb_secret_synthetic'); expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      expect(init?.redirect).toBe('error'); expect(init?.method).toBe('GET');
    }
    await expect(runtime.readActor(actor.alias, id(9999))).rejects.toThrow('SETUP_EXACT_AUTH_ID_REQUIRED'); expect(network).toHaveBeenCalledTimes(2);
    network.mockImplementation(async () => { throw new Error('private server details'); });
    await expect(runtime.readActor(actor.alias, actor.id)).rejects.toThrow('SETUP_REQUEST_FAILED'); expect(network).toHaveBeenCalledTimes(4);
  });
  it('setupSafeReadDeadlineIncludesHungBodyAndHasOnlyTwoAttempts', async () => {
    const h = await completedHarness(); const actor = h.resume.recovery.receipt.actors[0];
    const network = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({ start() { /* synthetic never-ending body */ } })));
    const runtime = h.provision.createSetupTransports(h.plan, { publicKey: 'sb_publishable_synthetic', setupKey: 'sb_secret_synthetic',
      setupKeyIdentifier: 'synthetic-key-id', credentials: h.resume.recovery.credentials, resume: h.resume }, network);
    vi.useFakeTimers();
    try {
      const outcome = runtime.readActor(actor.alias, actor.id).then(() => 'unexpected', error => (error as Error).message);
      await vi.advanceTimersByTimeAsync(20_001); expect(await outcome).toBe('SETUP_REQUEST_FAILED'); expect(network).toHaveBeenCalledTimes(2);
      expect(network.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('setupStrictEvidenceCensusAndChallengeBindingsRejectSubstitution', async () => {
    const h = await completedHarness();
    for (const mutate of [
      (p: SetupPlan) => { p.prerequisiteDetails!.sideEffects.activeCostCodeTemplates.push(p.prerequisiteDetails!.sideEffects.activeCostCodeTemplates[0]); },
      (p: SetupPlan) => { p.prerequisiteDetails!.sideEffects.candidateSha = '9'.repeat(40); },
      (p: SetupPlan) => { p.prerequisiteDetails!.sideEffects.activeCostCodeTemplates[0].default_budget_amount = '1e10'; },
      (p: SetupPlan) => { p.prerequisiteDetails!.sideEffects.expiresAt = new Date(Date.now() - 1).toISOString(); },
    ]) {
      const plan = structuredClone(h.plan); mutate(plan); plan.prerequisites.sideEffectsSha256 = testHash(JSON.stringify(plan.prerequisiteDetails!.sideEffects));
      expect(() => h.provision.requireFoundationPlan(plan)).toThrow();
    }
    const noCensus = structuredClone(h.resume); delete noCensus.recovery.receipt.census;
    noCensus.receiptSha256 = testHash(JSON.stringify(noCensus.recovery.receipt));
    const legacyPlan = structuredClone(h.plan); legacyPlan.prior!.receiptSha256 = noCensus.receiptSha256; noCensus.planSha256 = testHash(JSON.stringify(legacyPlan));
    expect(() => h.provision.initialFoundationReceipt(legacyPlan, noCensus)).toThrow('SETUP_RESUME_CENSUS_REQUIRED');
    const receipt = await h.provision.runFoundation(h.plan, h.resume, h.transports, h.checkpoint);
    for (const change of [
      (r: FoundationReceipt) => { r.census!.children[0].projectId = id(9999); },
      (r: FoundationReceipt) => { r.census!.children[1] = r.census!.children[0]; },
      (r: FoundationReceipt) => { r.census!.sideEffectsSha256 = '0'.repeat(64); },
      (r: FoundationReceipt) => { (r.operations.find(o => o.kind === 'intent' && o.action === 'verify-mfa') as SetupIntent).challengeId = id(9998); },
      (r: FoundationReceipt) => { (r.operations.find(o => o.kind === 'intent' && o.action === 'challenge-mfa') as SetupIntent).factorId = id(9997); },
    ]) { const invalid = structuredClone(receipt); change(invalid); expect(() => setup.validateFoundationReceipt(invalid, h.plan)).toThrow(); }
  });
  it('setupSeedValueAndStableIdDriftStopsBeforeNextWrite', async () => {
    for (const defect of ['counter', 'stamp', 'id', 'template'] as const) {
      const h = await completedHarness(); const persist = h.checkpoint.persistResult;
      h.checkpoint.persistResult = async record => { await persist(record);
        if (record.receipt.projects.length === 1) {
          if (defect === 'counter') h.state.children.find(c => c.table === 'number_sequences')!.nextValue = 99;
          if (defect === 'stamp') h.state.children.find(c => c.table === 'project_handoff_items')!.values!.createdBy = id(9999);
          if (defect === 'id') h.state.children[0].id = id(9998);
          if (defect === 'template') h.state.activeCostCodeTemplates[0].description = 'changed';
        }
      };
      const receipt = await h.provision.runFoundation(h.plan, h.resume, h.transports, h.checkpoint);
      expect(receipt.status).toBe('STOPPED'); expect(h.writes.filter(w => w.startsWith('create-project:'))).toHaveLength(1);
      expect(receipt.census?.children).toHaveLength(67);
    }
  });
  it('setupPreparationAndPrivateDeltaNeverExposeCredentialsInPublicState', async () => {
    const h = await foundationHarness(); const prepared = h.provision.prepareFoundation(h.plan, null, recoveryKeys.publicKey);
    expect(new Set(prepared.payload.credentials.map(c => c.password)).size).toBe(7);
    expect(prepared.payload.credentials.every(c => /^[A-Za-z0-9_-]{43}$/.test(c.password))).toBe(true);
    expect(Object.keys(h.provision.safeSetupStatus(prepared.payload.receipt))).toEqual(['phase', 'status', 'checkpointSequence']);
    for (const credential of prepared.payload.credentials) expect(JSON.stringify(prepared.envelope)).not.toContain(credential.password);
    expect(() => h.provision.setupRunPaths('relative', '123', '1')).toThrow();
    expect(() => h.provision.setupRunPaths(resolve(tmpdir()), '../123', '1')).toThrow();
    expect(h.provision.setupRunPaths(resolve(tmpdir()), '123', '1').run).toBe(join(resolve(tmpdir()), 'drawing-foundation-123-1'));
    const checkpoint = h.provision.createPrivateSetupCheckpoint(prepared.payload, recoveryKeys.publicKey, 'not-accessed', artifactFixture(), artifactFixture());
    await expect(checkpoint.persistResult({ result: { kind: 'result', sequence: 0, operationId: id(9999), outcome: 'SUCCEEDED', observedId: id(9998) },
      receipt: prepared.payload.receipt, mfa: { factorId: id(9998), secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' } })).rejects.toThrow();
  });
  it('setupRlsShapedSelfProfilesArePendingUntilOwnSigninAndAllSevenBeforeAppWrites', async () => {
    const positive = await completedHarness(); const configure = positive.transports.configureOrganization;
    positive.transports.configureOrganization = async (...args) => {
      expect(positive.state.profiles).toHaveLength(7); expect(positive.writes.filter(w => w.startsWith('authenticate-user:'))).toHaveLength(7);
      expect(positive.snapshots.at(-1)!.profiles).toHaveLength(7); return configure(...args);
    };
    expect((await positive.provision.runFoundation(positive.plan, positive.resume, positive.transports, positive.checkpoint)).status).toBe('FOUNDATION_PREPARED');
    expect(positive.snapshots[0].profiles.map(p => p.id)).toEqual([positive.state.actors.find(a => a.alias === 'admin')!.id]);
    expect(positive.snapshots.some(s => s.profiles.length === 2 && s.organizations.length === 2)).toBe(true);
    for (const defect of ['missing-self', 'wrong-role', 'premature-profile'] as const) {
      const h = await completedHarness(); const signIn = h.transports.signIn;
      h.transports.signIn = async (...args) => {
        const session = await signIn(...args);
        if (args[0] === 'pm') {
          if (defect === 'missing-self') h.state.profiles = h.state.profiles.filter(p => p.id !== session.actorId);
          if (defect === 'wrong-role') h.state.profiles.find(p => p.id === session.actorId)!.role = 'admin' as 'user';
        }
        if (args[0] === 'admin' && defect === 'premature-profile') {
          const pending = h.state.actors.find(a => a.alias === 'pm')!;
          h.state.profiles.push({ id: pending.id, emailSha256: pending.emailSha256, role: 'user' });
        }
        return session;
      };
      const receipt = await h.provision.runFoundation(h.plan, h.resume, h.transports, h.checkpoint);
      expect(receipt.status).toBe(defect === 'premature-profile' ? 'STOPPED' : 'UNKNOWN_COMMIT_STATE');
      expect(h.writes).toEqual(defect === 'premature-profile' ? ['authenticate-user:admin'] : ['authenticate-user:admin', 'authenticate-user:foreign', 'authenticate-user:pm']);
      expect(h.writes.some(w => !w.startsWith('authenticate-user:'))).toBe(false);
    }
  });
});
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
      // create_project inserts this owner row itself; it is an exact readback,
      // not a separate assignment operation or an inferred real membership ID.
      receipt.memberships.push({ id: id(1700 + receipt.projects.length), actor: org.alias === 'A' ? 'admin' : 'foreign', userId: org.ownerId,
        orgId: org.id, projectId: observed.id, role: 'owner' });
    }
    const roles = { pm: 'pm', viewer: 'viewer', field: 'field', removed: 'field', mfa: 'pm' } as const;
    for (const alias of ['pm', 'viewer', 'field', 'removed', 'mfa'] as const) {
      const membership = { id: id(1500 + receipt.memberships.length), actor: alias, userId: receipt.actors.find(a => a.alias === alias)!.id,
        orgId: orgA.id, projectId: receipt.projects.find(p => p.alias === 'A1')!.id, role: roles[alias] };
      receipt.memberships.push(membership); operation({ action: 'assign-project-role', actor: alias, organization: 'A', project: 'A1' }, membership.id);
    }
    receipt.actors.find(a => a.alias === 'mfa')!.mfa = { factorId: id(1600), verified: true };
    operation({ action: 'enroll-mfa', actor: 'mfa' }, id(1600)); operation({ action: 'challenge-mfa', actor: 'mfa', factorId: id(1600) }, id(1601));
    operation({ action: 'verify-mfa', actor: 'mfa', factorId: id(1600), challengeId: id(1601) }, id(1600));
    receipt.context.checkpointSequence = receipt.operations.length;
    expect(setup.validateFoundationReceipt(receipt, plan).status).toBe('FOUNDATION_PREPARED');
    expect(receipt.memberships.filter(m => !m.projectId)).toHaveLength(7);
    expect(receipt.memberships.filter(m => m.projectId && m.role === 'owner')).toHaveLength(4);
    expect(receipt.memberships.filter(m => m.projectId && m.role !== 'owner')).toHaveLength(5);
    for (const change of [
      (r: FoundationReceipt) => { r.memberships.splice(r.memberships.findIndex(m => m.projectId && m.role === 'owner'), 1); },
      (r: FoundationReceipt) => { const owner = r.memberships.find(m => m.projectId && m.role === 'owner')!; r.memberships.push({ ...owner, id: id(1990) }); },
      (r: FoundationReceipt) => { r.memberships.find(m => m.projectId && m.role === 'owner')!.projectId = id(1991); },
      (r: FoundationReceipt) => { const owner = r.memberships.find(m => m.projectId && m.role === 'owner')!; owner.actor = 'foreign'; owner.userId = r.actors.find(a => a.alias === 'foreign')!.id; },
      (r: FoundationReceipt) => { const owner = r.memberships.find(m => m.projectId && m.role === 'owner')!; r.memberships.push({ ...owner, id: id(1992), actor: 'pm', userId: r.actors.find(a => a.alias === 'pm')!.id }); },
      (r: FoundationReceipt) => { const owners = r.memberships.filter(m => m.projectId && m.role === 'owner'); owners[0].projectId = owners[1].projectId; },
    ]) { const invalid = structuredClone(receipt); change(invalid); expect(() => setup.validateFoundationReceipt(invalid, plan)).toThrow(); }
    const missingPartialOwner = structuredClone(receipt); missingPartialOwner.status = 'STOPPED';
    missingPartialOwner.memberships.splice(missingPartialOwner.memberships.findIndex(m => m.projectId && m.role === 'owner'), 1);
    expect(() => setup.validateFoundationReceipt(missingPartialOwner, plan)).toThrow();
    for (const project of receipt.projects) {
      const missingCreate = structuredClone(receipt);
      const index = missingCreate.operations.findIndex(op => op.kind === 'intent' && op.action === 'create-project' && op.project === project.alias);
      missingCreate.operations.splice(index, 2); resequenceReceipt(missingCreate);
      expect(() => setup.validateFoundationReceipt(missingCreate, plan)).toThrow();
    }
    for (const org of receipt.organizations) {
      const invalid = structuredClone(receipt);
      const index = invalid.operations.findIndex(op => op.kind === 'intent' && op.action === 'configure-organization' && op.organization === org.alias);
      invalid.operations.splice(index, 2); resequenceReceipt(invalid);
      expect(() => setup.validateFoundationReceipt(invalid, plan)).toThrow();
    }
    const payload: PrivateRecoveryPayload = { plan, receipt, credentials: structuredClone(prior.credentials) };
    payload.credentials.find(c => c.alias === 'mfa')!.mfa = { factorId: id(1600), secret: 'ABCDEFGHIJKLMNOP' };
    const recovery = await import('../drawing-cutover-recovery.ts');
    expect(recovery.decryptRecovery(recovery.encryptRecovery(payload, recoveryKeys.publicKey, receipt.context), recoveryKeys.privateKey, receipt.context)).toEqual(payload);
    const missingCompleteSecret = structuredClone(payload); delete missingCompleteSecret.credentials.find(c => c.alias === 'mfa')!.mfa;
    expect(() => recovery.encryptRecovery(missingCompleteSecret, recoveryKeys.publicKey, receipt.context)).toThrow();
    receipt.memberships.find(m => m.role === 'viewer')!.projectId = receipt.projects.find(p => p.alias === 'A2')!.id;
    expect(() => setup.validateFoundationReceipt(receipt, plan)).toThrow();
  });
  it.each(['A', 'B'] as const)('fix1 configured %s default requires its exact successful journal pair', organization => {
    const payload = completeInitialRecoveryFixture();
    expect(setup.validateFoundationReceipt(payload.receipt, payload.plan).status).toBe('STOPPED');
    for (const org of payload.receipt.organizations) {
      org.memberDefaultProjectRole = null;
      appendSuccessfulOperation(payload.receipt, { action: 'configure-organization', actor: org.alias === 'A' ? 'admin' : 'foreign', organization: org.alias }, org.id);
    }
    expect(setup.validateFoundationReceipt(payload.receipt, payload.plan).status).toBe('STOPPED');
    const removed = payload.receipt.operations.findIndex(op => op.kind === 'intent' && op.action === 'configure-organization' && op.organization === organization);
    payload.receipt.operations.splice(removed, 2); resequenceReceipt(payload.receipt);
    expect(() => setup.validateFoundationReceipt(payload.receipt, payload.plan)).toThrow();
  });
  it.each([false, true])('fix1 MFA recovery secret is required after enrollment, verified=%s', verified => {
    const payload = enrolledRecoveryFixture(verified);
    expect(setup.validatePrivateRecoveryPayload(payload, payload.receipt.context).receipt.status).toBe('STOPPED');
    const noSecret = { ...payload, credentials: payload.credentials.map(c => c.alias === 'mfa' ? { ...c, mfa: { factorId: c.mfa!.factorId } } : c) };
    expect(() => setup.validatePrivateRecoveryPayload(noSecret, payload.receipt.context)).toThrow();
    delete payload.credentials.find(c => c.alias === 'mfa')!.mfa;
    expect(() => setup.validatePrivateRecoveryPayload(payload, payload.receipt.context)).toThrow();
  });
  it('fix1 MFA factor mismatch refuses and ambiguous missing-secret enrollment stays UNKNOWN', () => {
    const payload = enrolledRecoveryFixture(true);
    payload.credentials.find(c => c.alias === 'mfa')!.mfa!.factorId = id(1999);
    expect(() => setup.validatePrivateRecoveryPayload(payload, payload.receipt.context)).toThrow();
    const ambiguous = enrolledRecoveryFixture(false);
    delete ambiguous.credentials.find(c => c.alias === 'mfa')!.mfa;
    const result = ambiguous.receipt.operations[1]; if (result.kind !== 'result') throw new Error('TEST_RESULT_REQUIRED');
    result.outcome = 'UNKNOWN'; ambiguous.receipt.status = 'UNKNOWN_COMMIT_STATE';
    expect(setup.validatePrivateRecoveryPayload(ambiguous, ambiguous.receipt.context).receipt.status).toBe('UNKNOWN_COMMIT_STATE');
    ambiguous.receipt.status = 'FOUNDATION_PREPARED';
    expect(() => setup.validatePrivateRecoveryPayload(ambiguous, ambiguous.receipt.context)).toThrow();
    const initial = completeInitialRecoveryFixture();
    expect(setup.validatePrivateRecoveryPayload(initial, initial.receipt.context).receipt.status).toBe('STOPPED');
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
