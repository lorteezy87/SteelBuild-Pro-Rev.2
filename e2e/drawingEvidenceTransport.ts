import { APP_ORIGIN, STAGING_ORIGIN } from './stagingNetworkGuard.js';

export const DRAWING_PROJECT_ID = '6573ede6-e29d-4d15-8855-403029735231';
export const DRAWING_ORG_ID = 'b0d853ce-2ad7-470e-bf23-c962cf72699f';
export const DRAWING_STATE_PATH = 'e2e/.auth/drawing-evidence.json';
export const PROJECT_READ = `/rest/v1/projects?id=eq.${DRAWING_PROJECT_ID}&limit=1&select=id,name,project_number,org_id,is_deleted,on_hold`;
export const ORG_READ = `/rest/v1/organizations?id=eq.${DRAWING_ORG_ID}&limit=1&select=id,name`;
const PASSWORD_PATH = '/auth/v1/token?grant_type=password';
const STAGING_REF = 'ndyfjffsulfbwpmwdmic';
type Environment = Record<string, string | undefined>;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function assertDrawingEvidenceEnvironment(env: Environment = process.env): void {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || !/^[a-f0-9]{40}$/.test(env.ACCEPTANCE_CANDIDATE_SHA || '') || env.E2E_TARGET !== 'staging'
    || env.E2E_BASE_URL !== APP_ORIGIN || env.E2E_SUPABASE_URL !== STAGING_ORIGIN
    || env.E2E_EXPECTED_SUPABASE_REF !== STAGING_REF
    || (env.E2E_PROJECT_ID && env.E2E_PROJECT_ID !== DRAWING_PROJECT_ID)
    || !env.E2E_USER || !env.E2E_PASS || !env.E2E_SUPABASE_ANON_KEY) {
    throw new Error('Drawing evidence requires the protected main-only staging workflow and fixed project');
  }
  assertStagingPublicKey(env.E2E_SUPABASE_ANON_KEY);
}

export function assertStagingPublicKey(key: string): void {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return;
  try {
    const parts = key.split('.');
    const payload: unknown = parts.length === 3 ? JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) : null;
    if (isRecord(payload) && payload.role === 'anon' && payload.ref === STAGING_REF) return;
  } catch { /* Credentials never enter diagnostics. */ }
  throw new Error('Drawing evidence requires a public staging anon or publishable key');
}

export function allowsDrawingSetupRequest(path: string, method: string, authenticated: boolean, body?: unknown): boolean {
  if (method === 'POST' && path === PASSWORD_PATH && !authenticated) {
    return isRecord(body) && Object.keys(body).sort().join(',') === 'email,password'
      && typeof body.email === 'string' && !!body.email && typeof body.password === 'string' && !!body.password;
  }
  return authenticated && method === 'GET' && body === undefined && [PROJECT_READ, ORG_READ].includes(path);
}

/** Separate from browser routing: only password sign-in and two fixed reads.
 * No SDK retries, redirects, administrative token, or arbitrary query escape.
 */
export class DrawingEvidenceTransport {
  private requests = 0;
  private key: string;
  private bearer?: string;
  private network: typeof fetch;
  constructor(key: string, bearer?: string, network: typeof fetch = fetch) {
    assertStagingPublicKey(key);
    this.key = key;
    this.bearer = bearer;
    this.network = network;
  }
  async send(path: string, method = 'GET', body?: unknown): Promise<Response> {
    if (++this.requests > 3 || !allowsDrawingSetupRequest(path, method, !!this.bearer, body)) {
      throw new Error('Blocked out-of-scope drawing setup request');
    }
    try {
      const response = await this.network(STAGING_ORIGIN + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: { apikey: this.key, ...(this.bearer ? { Authorization: `Bearer ${this.bearer}` } : {}), 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Rejected response');
      return response;
    } catch { throw new Error('Protected drawing setup request failed'); }
  }
}

export interface DrawingSession extends Record<string, unknown> {
  access_token: string;
  refresh_token: string;
  user: { id: string };
  expires_at: number;
}
export function validateDrawingSession(value: unknown, now = Date.now()): DrawingSession {
  if (!isRecord(value) || typeof value.access_token !== 'string' || !value.access_token
    || typeof value.refresh_token !== 'string' || !value.refresh_token || !isRecord(value.user)
    || typeof value.user.id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.user.id)
    || typeof value.expires_in !== 'number' || !Number.isFinite(value.expires_in) || value.expires_in <= 0) {
    throw new Error('Incomplete protected staging session');
  }
  const expiresAt = value.expires_at ?? Math.floor(now / 1000) + value.expires_in;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= now / 1000) throw new Error('Expired protected staging session');
  return { ...value, expires_at: expiresAt } as DrawingSession;
}

export function assertDrawingParent(projects: unknown, organizations: unknown): void {
  if (!Array.isArray(projects) || projects.length !== 1 || !isRecord(projects[0])
    || projects[0].id !== DRAWING_PROJECT_ID || projects[0].org_id !== DRAWING_ORG_ID
    || projects[0].name !== 'STAGING — Warehouse Expansion' || projects[0].project_number !== 'STG-0001'
    || projects[0].is_deleted !== false || projects[0].on_hold !== false
    || !Array.isArray(organizations) || organizations.length !== 1 || !isRecord(organizations[0])
    || organizations[0].id !== DRAWING_ORG_ID || organizations[0].name !== 'Example Fabrication (staging)') {
    throw new Error('Drawing acceptance parent identity or active state mismatch');
  }
}
