import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FullResult } from '@playwright/test/reporter';
import { APP, ORG, PROJECT, STAGING, STATE } from '../../e2e/synthetic-pdf/fixture';

const mocks = vi.hoisted(() => ({
  send: vi.fn(), launch: vi.fn(), close: vi.fn(), remove: vi.fn(), write: vi.fn(),
  evaluate: vi.fn(), storageState: vi.fn(), guard: vi.fn(),
}));
vi.mock('node:fs', () => ({ mkdirSync: vi.fn(), rmSync: mocks.remove, writeFileSync: mocks.write }));
vi.mock('../../e2e/synthetic-pdf/guard', () => ({
  ScopedTransport: class { send = mocks.send; }, installBrowserGuard: mocks.guard,
}));
vi.mock('@playwright/test', () => {
  const assertion = () => ({ toBeVisible: vi.fn(), toBe: vi.fn() });
  return { chromium: { launch: mocks.launch }, expect: Object.assign(assertion, { poll: assertion }) };
});
import setup from '../../e2e/synthetic-pdf/setup';
import Reporter from '../../e2e/synthetic-pdf/reporter';

const session = { access_token: 'sensitive-access-token', refresh_token: 'sensitive-refresh-token',
  user: { id: '11111111-1111-4111-a111-111111111111' }, expires_in: 3600 };
const parents = [
  [{ id: PROJECT, org_id: ORG, name: 'STAGING — Warehouse Expansion', project_number: 'STG-0001', is_deleted: false, on_hold: false }],
  [{ id: ORG, name: 'Example Fabrication (staging)' }],
];
function reply(value: unknown) { return { ok: true, json: async () => value }; }

describe('synthetic PDF protected session setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const [key, value] of Object.entries({ GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
      SYNTHETIC_PDF_ACCEPTANCE: 'reviewed-staging-only', E2E_TARGET: 'staging', E2E_SUPABASE_URL: STAGING,
      E2E_EXPECTED_SUPABASE_REF: 'ndyfjffsulfbwpmwdmic', E2E_BASE_URL: APP, ACCEPTANCE_CANDIDATE_SHA: 'a'.repeat(40),
      GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1', E2E_USER: 'test@example.invalid', E2E_PASS: 'sensitive-password',
      E2E_SUPABASE_ANON_KEY: 'sb_publishable_fixture' })) vi.stubEnv(key, value);
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    mocks.send.mockReset().mockResolvedValueOnce(reply(session))
      .mockResolvedValueOnce(reply(parents[0])).mockResolvedValueOnce(reply(parents[1])).mockResolvedValueOnce(reply('pm'));
    const locator = { click: vi.fn(), fill: vi.fn(), first: () => locator, getByRole: () => locator, locator: () => locator };
    const page = { goto: vi.fn(), evaluate: mocks.evaluate, getByRole: () => locator, locator: () => locator };
    mocks.launch.mockResolvedValue({ close: mocks.close, newContext: async () => ({ newPage: async () => page, storageState: mocks.storageState }) });
    mocks.guard.mockResolvedValue({ settle: vi.fn(), assertHealthy: vi.fn() });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('clears previous state before auth and stores a normalized raw GoTrue response', async () => {
    await setup();
    expect(mocks.remove).toHaveBeenCalledWith(STATE, { force: true });
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
    const stored = JSON.parse(mocks.evaluate.mock.calls[0][1].value);
    expect(stored.expires_at).toBe(1_700_003_600);
    expect(session).not.toHaveProperty('expires_at');
    expect(mocks.storageState).toHaveBeenCalledWith({ path: STATE });
  });

  it.each([
    null, { ...session, user: null }, { ...session, user: { id: 'invalid' } },
    { ...session, access_token: 12 }, { ...session, refresh_token: '' },
    { ...session, expires_in: '3600' }, { ...session, expires_in: 0 },
    { ...session, expires_at: 1_699_999_999 }, { ...session, expires_at: 'tomorrow' },
  ])('rejects malformed or expired sign-in response before browser creation', async value => {
    mocks.send.mockReset().mockResolvedValueOnce(reply(value));
    await expect(setup()).rejects.toThrow('Synthetic PDF setup failed: identity');
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.storageState).not.toHaveBeenCalled();
  });

  it('rejects a wrong expected project ref before authentication', async () => {
    vi.stubEnv('E2E_EXPECTED_SUPABASE_REF', 'kjrwqagyeswwoxpjkcko');
    await expect(setup()).rejects.toThrow('Synthetic PDF setup failed: environment');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('reports only a closed setup stage, never the original browser error or credentials', async () => {
    mocks.launch.mockRejectedValueOnce(new Error('sensitive-password https://sensitive.example'));
    await expect(setup()).rejects.toThrow(/^Synthetic PDF setup failed: browser$/);
    const reporter = new Reporter();
    reporter.onError({ message: 'Synthetic PDF setup failed: browser' });
    reporter.onError({ message: 'Synthetic PDF setup failed: sensitive-password' });
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    reporter.onEnd({ status: 'failed' } as FullResult);
    const summary = mocks.write.mock.calls.at(-1)?.[1];
    expect(JSON.parse(summary).setupFailureStages).toEqual(['browser']);
    expect(summary).not.toContain('sensitive-password');
    expect(output.mock.calls.flat().join(' ')).not.toContain('sensitive-password');
  });
});
