import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/ios-verify-upload.mjs');
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

interface Build {
  id: string;
  type: string;
  attributes: { version: string; processingState: string };
  relationships: { preReleaseVersion: { data: { type: string; id: string } } };
}

interface Localization {
  id: string;
  attributes: { locale: string; whatsNew: string };
}

interface RequestRecord {
  path: string;
  query: Record<string, string>;
  method: string;
  body: {
    data: {
      id?: string;
      type: string;
      attributes: { locale?: string; whatsNew: string };
      relationships?: { build: { data: { type: string; id: string } } };
    };
  } | null;
}

function build(id: string, version = '42', marketingId = 'marketing-current', processingState = 'VALID'): Build {
  return {
    id, type: 'builds', attributes: { version, processingState },
    relationships: { preReleaseVersion: { data: { type: 'preReleaseVersions', id: marketingId } } },
  };
}

function runVerifier(builds: Build[], localizations: Localization[] = []) {
  const cwd = mkdtempSync(join(tmpdir(), 'steelbuild-upload-verifier-'));
  directories.push(cwd);
  mkdirSync(join(cwd, 'ios/App/output'), { recursive: true });
  const keyPath = join(cwd, 'synthetic-key.p8');
  // A new, local-only test key has no Apple account access.
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const fixturePath = join(cwd, 'fixture.json');
  const callsPath = join(cwd, 'calls.jsonl');
  writeFileSync(fixturePath, JSON.stringify({
    builds, localizations,
    included: [
      { type: 'preReleaseVersions', id: 'marketing-old', attributes: { version: '1.0.0' } },
      { type: 'preReleaseVersions', id: 'marketing-current', attributes: { version: '2.3.4' } },
    ],
  }));
  writeFileSync(callsPath, '');
  const preloadPath = join(cwd, 'mock-fetch.mjs');
  writeFileSync(preloadPath, `
import { appendFileSync, readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(process.env.FIXTURE_PATH, 'utf8'));
// Never delegate to the original fetch: even unexpected requests stay offline.
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  if (url.origin !== 'https://api.appstoreconnect.apple.com') throw new Error('Unexpected API origin');
  const method = options.method || 'GET';
  const path = url.pathname.replace('/v1/', '');
  const body = options.body ? JSON.parse(options.body) : null;
  appendFileSync(process.env.CALLS_PATH, JSON.stringify({ path, query: Object.fromEntries(url.searchParams), method, body }) + '\\n');
  let response;
  if (method === 'GET' && path === 'apps') response = { data: [{ id: 'steelbuild-app' }] };
  else if (method === 'GET' && path === 'builds') response = { data: fixture.builds, included: fixture.included };
  else if (method === 'GET' && /^builds\\/[^/]+\\/betaBuildLocalizations$/.test(path)) response = { data: fixture.localizations };
  else if (method === 'PATCH' && path.startsWith('betaBuildLocalizations/')) response = { data: body.data };
  else if (method === 'POST' && path === 'betaBuildLocalizations') response = { data: body.data };
  else throw new Error('Unexpected mock request: ' + method + ' ' + path);
  return new Response(JSON.stringify(response), { status: 200 });
};
// Exercise the bounded not-found polling branch without waiting ten minutes.
globalThis.setTimeout = callback => { queueMicrotask(callback); return 0; };
`);
  const result = spawnSync(process.execPath, ['--import', preloadPath, script], {
    cwd, encoding: 'utf8', timeout: 5000,
    // Do not inherit real credentials or NODE_OPTIONS from the parent process.
    env: {
      ASC_KEY_ID: 'synthetic-test-key', ASC_ISSUER_ID: 'synthetic-test-issuer', ASC_KEY_PATH: keyPath,
      IOS_BUILD_NUMBER: '42', IOS_VERSION: '2.3.4', FIXTURE_PATH: fixturePath, CALLS_PATH: callsPath,
    },
  });
  const calls = readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as RequestRecord);
  const receiptPath = join(cwd, 'ios/App/output/app-store-receipt.json');
  const receipt = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')) as Record<string, unknown> : null;
  return { result, calls, receipt };
}

describe('App Store upload receipt verification (offline CLI)', () => {
  it('matches both marketing version and build number, then changes only en-US', () => {
    const { result, calls, receipt } = runVerifier([
      build('wrong-marketing', '42', 'marketing-old'),
      build('wrong-build', '41'),
      build('correct-build'),
    ], [
      { id: 'fr-localization', attributes: { locale: 'fr-FR', whatsNew: 'Conserver ce texte.' } },
      { id: 'us-localization', attributes: { locale: 'en-US', whatsNew: 'Old test instructions.' } },
      { id: 'gb-localization', attributes: { locale: 'en-GB', whatsNew: 'Keep these instructions.' } },
    ]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(calls.find(call => call.path === 'apps')?.query['filter[bundleId]']).toBe('com.steelbuildpro.app');
    expect(calls.find(call => call.path === 'builds')?.query).toMatchObject({
      'filter[app]': 'steelbuild-app', 'filter[version]': '42', include: 'preReleaseVersion',
    });
    expect(calls.filter(call => call.path.startsWith('builds/')).map(call => call.path))
      .toEqual(['builds/correct-build/betaBuildLocalizations']);
    const mutations = calls.filter(call => call.method !== 'GET');
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({
      method: 'PATCH', path: 'betaBuildLocalizations/us-localization',
      body: { data: { id: 'us-localization', type: 'betaBuildLocalizations' } },
    });
    expect(mutations[0]?.body?.data.attributes.whatsNew).toContain('Verify sign-in and project access');
    expect(receipt).toMatchObject({ version: '2.3.4', buildNumber: '42', processingState: 'VALID', whatToTestUpdated: true });
  });

  it('creates en-US for the matching build without modifying another locale', () => {
    const { result, calls, receipt } = runVerifier([build('correct-build', '42', 'marketing-current', 'PROCESSING')], [
      { id: 'gb-localization', attributes: { locale: 'en-GB', whatsNew: 'Keep these instructions.' } },
    ]);
    expect(result.status).toBe(0);
    const mutations = calls.filter(call => call.method !== 'GET');
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({
      method: 'POST', path: 'betaBuildLocalizations',
      body: { data: {
        type: 'betaBuildLocalizations', attributes: { locale: 'en-US' },
        relationships: { build: { data: { type: 'builds', id: 'correct-build' } } },
      } },
    });
    expect(receipt?.processingState).toBe('PROCESSING');
  });

  it('rejects a response with no exact marketing and build match without changing metadata', () => {
    const { result, calls, receipt } = runVerifier([
      build('wrong-marketing', '42', 'marketing-old'), build('wrong-build', '41'),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Upload receipt is not yet visible');
    expect(calls.filter(call => call.path === 'builds')).toHaveLength(30);
    expect(calls.every(call => call.method === 'GET')).toBe(true);
    expect(calls.some(call => call.path.includes('betaBuildLocalizations'))).toBe(false);
    expect(receipt).toBeNull();
  });

  it.each(['FAILED', 'INVALID'])('rejects Apple processing state %s before changing metadata', processingState => {
    const { result, calls, receipt } = runVerifier([build('correct-build', '42', 'marketing-current', processingState)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Apple processing state: ' + processingState);
    expect(calls.every(call => call.method === 'GET')).toBe(true);
    expect(calls.some(call => call.path.includes('betaBuildLocalizations'))).toBe(false);
    expect(receipt).toBeNull();
  });
});
