import { describe, expect, it, vi } from 'vitest';
import type { BrowserContext } from '@playwright/test';
import { APP, PROJECT, STAGING, assertPublicKey, assertRuntime, fixtureFor, hash, revisionRecord, setRecord, sheetRecord, submittalRecord, syntheticPdf, workflowPatch } from '../../e2e/synthetic-pdf/fixture';
import { allowsApi, allowsBrowser, allowsStorage, installBrowserGuard, ScopedTransport } from '../../e2e/synthetic-pdf/guard';

const f = fixtureFor('12345678', '1', new Date('2026-10-09T12:00:00Z'));
const goodEnv = { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', SYNTHETIC_PDF_ACCEPTANCE: 'reviewed-staging-only', E2E_TARGET: 'staging', E2E_SUPABASE_URL: STAGING, E2E_BASE_URL: APP, ACCEPTANCE_CANDIDATE_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '12345678', GITHUB_RUN_ATTEMPT: '1' };
const rpcBody = (action: keyof typeof f.requests) => ({ p_submittal_id: f.submittal, p_request_id: f.requests[action], p_expected_updated_at: '2026-10-09T12:00:00.123456Z', p_expected_status: action === 'submit' ? 'Draft' : action === 'approve' ? 'Submitted' : 'Approved', p_expected_current_round_id: action === 'submit' ? null : f.requests.submit, p_expected_revision_ids: [action === 'stale' || action === 'void' ? f.revisions.B : f.revisions.A], p_patch: workflowPatch(f, action), p_new_round: false });

describe('bounded synthetic PDF request policy', () => {
  it('rejects privileged keys before sign-in without echoing credential values', () => {
    const token = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
    expect(() => assertPublicKey(token('anon'))).not.toThrow();
    expect(() => assertPublicKey('sb_publishable_fixture')).not.toThrow();
    for (const key of [token('service_role'), 'sb_secret_fixture', 'malformed']) {
      expect(() => assertPublicKey(key)).toThrow('requires a public');
      try { assertPublicKey(key); } catch (error) { expect(String(error)).not.toContain(key); }
    }
  });
  it('requires protected main dispatch with an exact staging target and run identity', () => {
    expect(() => assertRuntime(goodEnv)).not.toThrow();
    for (const [key, value] of Object.entries({ GITHUB_ACTIONS: 'false', GITHUB_REF: 'refs/heads/feature', GITHUB_EVENT_NAME: 'pull_request', SYNTHETIC_PDF_ACCEPTANCE: '', E2E_TARGET: 'production', E2E_SUPABASE_URL: 'https://kjrwqagyeswwoxpjkcko.supabase.co', E2E_BASE_URL: 'https://www.steelbuild-pro.com', ACCEPTANCE_CANDIDATE_SHA: 'main', GITHUB_RUN_ID: '../run', GITHUB_RUN_ATTEMPT: '' })) {
      expect(() => assertRuntime({ ...goodEnv, [key]: value })).toThrow();
    }
    expect(fixtureFor('12345678', '2').set).not.toBe(f.set);
  });
  it.each(['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'])('denies provider, email, billing and all Edge routes for %s', method => {
    for (const url of ['https://api.stripe.com/v1/checkout/sessions', 'https://api.resend.com/emails', 'https://graph.microsoft.com/v1.0/me/sendMail', 'https://api.openai.com/v1/responses', `${STAGING}/functions/v1/stripe-billing`, `${STAGING}/functions/v1/email-send`, `${STAGING}/functions/v1/llm-proxy`, `${STAGING}/rest/v1/rpc/soft_delete_project`, `${STAGING}/auth/v1/admin/users`]) {
      expect(allowsApi(f, url, method, {})).toBe(false);
      expect(allowsBrowser(url, method)).toBe(false);
    }
  });
  it('allows only complete reserved fixture insert templates', () => {
    for (const [table, body] of [['drawing_sets', setRecord(f)], ['drawings', sheetRecord(f)], ['submittals', submittalRecord(f)], ['drawing_revisions', revisionRecord(f, 'A')], ['drawing_revisions', revisionRecord(f, 'B')]] as const) {
      const url = `${STAGING}/rest/v1/${table}`;
      expect(allowsApi(f, url, 'POST', body)).toBe(true);
      for (const changed of [{ ...body, project_id: f.set }, { ...body, id: f.sheet }, { ...body, extra: 'unexpected' }, [body]]) {
        if (JSON.stringify(changed) !== JSON.stringify(body)) expect(allowsApi(f, url, 'POST', changed)).toBe(false);
      }
      expect(allowsApi(f, `${url}?on_conflict=id`, 'POST', body)).toBe(false);
    }
  });
  it('permits reviewed lifecycle transitions but no overrides, foreign records, or invented evidence', () => {
    const url = `${STAGING}/rest/v1/rpc/apply_submittal_round_workflow`;
    for (const action of ['submit', 'approve', 'stale', 'void'] as const) {
      const body = rpcBody(action);
      expect(allowsApi(f, url, 'POST', body)).toBe(true);
      for (const changed of [{ ...body, p_submittal_id: f.sheet }, { ...body, p_new_round: true }, { ...body, p_expected_revision_ids: [f.sheet] }, { ...body, p_patch: { ...body.p_patch, gate_override_reason: 'skip' } }, { ...body, p_attestation: 'invented' }, { ...body, p_expected_updated_at: 'yesterday' }]) {
        expect(allowsApi(f, url, 'POST', changed)).toBe(false);
      }
    }
    expect(allowsApi(f, `${STAGING}/rest/v1/rpc/reconcile_submittal_round_evidence`, 'POST', rpcBody('approve'))).toBe(false);
    expect(allowsApi(f, `${STAGING}/rest/v1/rpc/publish_drawing_revision`, 'POST', { p_revision_id: f.revisions.A, p_release_status: 'released_for_shop' })).toBe(false);
  });
  it('archives only three new records and never deletes retained history or shared projects', () => {
    for (const [table, id] of [['drawing_sets', f.set], ['drawings', f.sheet], ['submittals', f.submittal]]) {
      const url = `${STAGING}/rest/v1/${table}?id=eq.${id}&project_id=eq.${PROJECT}`;
      const archive = { is_deleted: true, deleted_at: '2026-10-09T12:10:00Z' };
      expect(allowsApi(f, url, 'PATCH', archive)).toBe(true);
      expect(allowsApi(f, url.replace(id, PROJECT), 'PATCH', archive)).toBe(false);
      expect(allowsApi(f, url, 'PATCH', { ...archive, is_deleted: false })).toBe(false);
      expect(allowsApi(f, url, 'DELETE')).toBe(false);
    }
    for (const table of ['projects', 'organizations', 'submittal_rounds', 'submittal_round_revision_evidence', 'drawing_revisions']) {
      expect(allowsApi(f, `${STAGING}/rest/v1/${table}?id=eq.${f.set}&project_id=eq.${PROJECT}`, 'PATCH', { is_deleted: true, deleted_at: '2026-10-09T12:10:00Z' })).toBe(false);
    }
  });
  it('checks exact source bytes and refuses overwrites, deletion, signed URLs, other buckets and paths', () => {
    for (const revision of ['A', 'B'] as const) {
      const url = `${STAGING}/storage/v1/object/app-files/${f.paths[revision]}`;
      const bytes = syntheticPdf(revision, f.run);
      expect(allowsStorage(f, url, 'POST', bytes)).toBe(true);
      expect(allowsStorage(f, url, 'POST', syntheticPdf(revision === 'A' ? 'B' : 'A', f.run))).toBe(false);
      for (const method of ['PUT', 'PATCH', 'DELETE']) expect(allowsStorage(f, url, method, bytes)).toBe(false);
      expect(allowsStorage(f, url.replace('app-files/', 'other/'), 'POST', bytes)).toBe(false);
      expect(allowsStorage(f, `${url}?upsert=true`, 'POST', bytes)).toBe(false);
      expect(allowsStorage(f, url.replace(f.paths[revision], 'legacy.pdf'), 'POST', bytes)).toBe(false);
    }
  });
  it('blocks forbidden transport calls before network and prevents redirected credentials', async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]'));
    const api = new ScopedTransport(f, 'public-test-key', 'test-session', network);
    await expect(api.send('/functions/v1/email-send', 'POST', {})).rejects.toThrow('Blocked');
    expect(network).not.toHaveBeenCalled();
    await api.send(`/rest/v1/projects?id=eq.${PROJECT}&limit=100`);
    expect(network).toHaveBeenCalledWith(expect.stringContaining(STAGING), expect.objectContaining({ redirect: 'error' }));
    for (let count = 1; count < 179; count++) await api.send(`/rest/v1/projects?id=eq.${PROJECT}&limit=100`);
    await expect(api.send(`/rest/v1/projects?id=eq.${PROJECT}&limit=100`)).rejects.toThrow('Blocked');
  });
  it('covers popup HTTP requests at context level and never forwards any websocket', async () => {
    let routeHandler: (route: unknown) => Promise<void> = async () => {};
    let socketHandler: (socket: unknown) => void = () => {};
    const context = { route: vi.fn(async (_glob, handler) => { routeHandler = handler; }), routeWebSocket: vi.fn(async (_glob, handler) => { socketHandler = handler; }) };
    const guard = await installBrowserGuard(context as unknown as BrowserContext);
    const route = { request: () => ({ url: () => 'https://api.stripe.com/v1/customers', method: () => 'GET' }), continue: vi.fn(), abort: vi.fn().mockResolvedValue(undefined) };
    await routeHandler(route); expect(route.abort).toHaveBeenCalled(); expect(route.continue).not.toHaveBeenCalled();
    expect(() => guard.assertHealthy()).toThrow('forbidden');
    for (const url of [`${STAGING.replace('https:', 'wss:')}/realtime/v1/websocket`, 'wss://external.example/events']) {
      const socket = { url: () => url, connectToServer: vi.fn(), close: vi.fn() };
      socketHandler(socket); expect(socket.close).toHaveBeenCalled(); expect(socket.connectToServer).not.toHaveBeenCalled();
    }
  });
  it('uses real parseable one-page PDFs with distinct revision markers', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const hashes: string[] = [];
    for (const revision of ['A', 'B'] as const) {
      const bytes = syntheticPdf(revision, f.run); hashes.push(hash(bytes));
      const document = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true }).promise;
      expect(document.numPages).toBe(1);
      const content = await (await document.getPage(1)).getTextContent();
      const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');
      expect(text).toContain('SYNTHETIC - NOT FOR CONSTRUCTION');
      expect(text).toContain(`Revision ${revision}`);
      await document.destroy();
    }
    expect(hashes[0]).not.toBe(hashes[1]);
  });
});
