import { PROJECT_EXPORT_TABLES } from '../../supabase/functions/project-export/exportShape.ts';

export const ORIGIN = 'https://ndyfjffsulfbwpmwdmic.supabase.co';
export const PUBLIC_STAGE_ORIGIN = 'https://steelbuild-pro-staging.n-lortz1987.workers.dev';
export const PROJECT_ID = '6573ede6-e29d-4d15-8855-403029735231';
export const ORG_ID = 'b0d853ce-2ad7-470e-bf23-c962cf72699f';
export const HANDLERS = ['llm-proxy', 'email-send', 'project-export', 'command-center-read', 'command-center-session-handoff', 'stripe-billing', 'account-delete'] as const;
type Handler = typeof HANDLERS[number];
export type Environment = Record<string, string | undefined>;
type JsonObject = Record<string, unknown>;
const record = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const requireTrue: (condition: unknown, reason?: string) => asserts condition = (condition, reason = 'CONTRACT_REJECTED') => { if (!condition) throw new Error(reason); };
const decode = (token: string): JsonObject => {
  const parts = token.split('.'); requireTrue(parts.length === 3);
  const value: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  requireTrue(record(value)); return value;
};

export function assertEnvironment(env: Environment): void {
  requireTrue(env.GITHUB_ACTIONS === 'true' && env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_EVENT_NAME === 'workflow_dispatch'
    && /^[a-f0-9]{40}$/.test(env.ACCEPTANCE_CANDIDATE_SHA ?? '') && env.E2E_TARGET === 'staging'
    && env.E2E_SUPABASE_URL === ORIGIN && env.E2E_EXPECTED_SUPABASE_REF === 'ndyfjffsulfbwpmwdmic'
    && env.E2E_USER && env.E2E_PASS && env.E2E_SUPABASE_ANON_KEY, 'ENVIRONMENT_REJECTED');
  const key = env.E2E_SUPABASE_ANON_KEY;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return;
  const payload = decode(key);
  requireTrue(payload.role === 'anon' && payload.ref === 'ndyfjffsulfbwpmwdmic', 'PUBLIC_KEY_REQUIRED');
}

export interface Identity { token: string; subject: string; aal: 'aal1' | 'aal2'; verifiedFactors: number }
/** user must be the fresh GET /auth/v1/user response accepting this same token.
 * No metadata, local session, or unverified token alone proves enrollment/AAL.
 */
export function verifyIdentity(session: unknown, user: unknown, email: string, now = Date.now()): Identity {
  requireTrue(record(session) && record(session.user) && typeof session.access_token === 'string'
    && typeof session.expires_in === 'number' && Number.isFinite(session.expires_in) && session.expires_in > 0
    && record(user) && uuid(user.id) && user.id === session.user.id && typeof user.email === 'string'
    && user.email.toLowerCase() === email.toLowerCase());
  const claims = decode(session.access_token);
  requireTrue(claims.sub === user.id && claims.iss === `${ORIGIN}/auth/v1` && claims.role === 'authenticated'
    && (claims.aal === 'aal1' || claims.aal === 'aal2') && typeof claims.exp === 'number'
    && Number.isFinite(claims.exp) && claims.exp * 1000 > now + 30_000);
  const factors: unknown = user.factors === undefined ? [] : user.factors;
  requireTrue(Array.isArray(factors) && factors.length <= 10 && factors.every(factor => record(factor) && ['verified', 'unverified'].includes(String(factor.status))));
  return { token: session.access_token, subject: user.id, aal: claims.aal, verifiedFactors: factors.filter(factor => factor.status === 'verified').length };
}

function assertProject(value: unknown): void {
  requireTrue(record(value) && value.id === PROJECT_ID && value.org_id === ORG_ID
    && value.name === 'STAGING — Warehouse Expansion' && value.project_number === 'STG-0001'
    && value.is_deleted === false && value.on_hold === false);
}
export interface ExportCounts { tables: number; rows: number; files: number; storageFiles: number; mailboxRows: number }
export function validateExport(value: unknown): ExportCounts {
  requireTrue(record(value) && value.export_version === 2 && typeof value.exported_at === 'string'
    && Number.isFinite(Date.parse(value.exported_at)) && typeof value.exported_by === 'string'
    && record(value.tables) && record(value.row_counts));
  assertProject(value.project);
  const expected = [...PROJECT_EXPORT_TABLES, 'note_folder_job_links', 'note_folders'].sort();
  requireTrue(Object.keys(value.tables).sort().join(',') === expected.join(',') && Object.keys(value.row_counts).sort().join(',') === expected.join(','));
  let count = 0;
  for (const [table, rows] of Object.entries(value.tables)) {
    requireTrue(Array.isArray(rows) && rows.length <= 10_000 && rows.length === value.row_counts[table]);
    for (const row of rows) {
      requireTrue(record(row));
      if (table !== 'note_folders') requireTrue(row.project_id === PROJECT_ID);
      else requireTrue(row.org_id === ORG_ID);
      if (row.org_id !== null && row.org_id !== undefined) requireTrue(row.org_id === ORG_ID);
      if (table === 'email_accounts') requireTrue(!('access_token' in row) && !('refresh_token' in row));
    }
    count += rows.length; requireTrue(count <= 10_000);
  }
  requireTrue(count === value.total_rows && Array.isArray(value.files) && value.files.length <= 10_000
    && value.files.length === value.file_count && Array.isArray(value.storage_files) && value.storage_files.length <= 10_000);
  for (const file of value.files) requireTrue(record(file) && expected.includes(String(file.table))
    && typeof file.column === 'string' && typeof file.path === 'string' && file.path.length > 0 && file.path.length <= 4096);
  for (const file of value.storage_files) requireTrue(record(file) && ['app-files', 'email-attachments'].includes(String(file.bucket))
    && typeof file.path === 'string' && (file.path.startsWith(`${PROJECT_ID}/`) || file.path.startsWith(`${ORG_ID}/${PROJECT_ID}/`))
    && !file.path.split('/').includes('..') && typeof file.size === 'number' && Number.isSafeInteger(file.size) && file.size >= 0);
  return { tables: expected.length, rows: count, files: value.files.length, storageFiles: value.storage_files.length, mailboxRows: Number(value.row_counts.email_accounts) };
}

function probeBody(handler: Handler): JsonObject {
  switch (handler) {
    case 'llm-proxy': return { provider: '__acceptance_invalid__', model: '__acceptance_invalid__' };
    case 'email-send': case 'account-delete': return {};
    case 'project-export': return { project_id: PROJECT_ID };
    case 'command-center-read': return { schemaVersion: 1, entityTypes: ['project'], projectIds: [PROJECT_ID], limitPerEntity: 1 };
    case 'command-center-session-handoff': return { action: 'create', state: '', codeChallenge: '', encryptedSession: null };
    case 'stripe-billing': return { action: '__acceptance_invalid__', org_id: ORG_ID };
  }
}
export interface Reply { status: number; body: unknown }
/** No arbitrary URL/method/body/header argument. Each closed profile is usable
 * once, with no retry. Token/password/response bodies stay in process memory.
 * Export is the only operational endpoint reached; its normal audit is retained.
 */
export class BoundedTransport {
  #env: Environment;
  #network: typeof fetch;
  #token?: string;
  #subject?: string;
  #fixture = false;
  #used = new Set<string>();
  #bytes = 0;
  #deadline = Date.now() + 240_000;
  constructor(env: Environment, network: typeof fetch = fetch) {
    assertEnvironment(env);
    this.#env = { E2E_USER: env.E2E_USER, E2E_PASS: env.E2E_PASS, E2E_SUPABASE_ANON_KEY: env.E2E_SUPABASE_ANON_KEY };
    this.#network = network;
  }
  setSession(token: string, subject: string): void {
    requireTrue(!this.#token && token.length > 0 && token.length <= 16_384 && uuid(subject), 'SESSION_REJECTED');
    this.#token = token; this.#subject = subject;
  }
  confirmFixture(projects: unknown, organizations: unknown): void {
    requireTrue(Array.isArray(projects) && projects.length === 1 && Array.isArray(organizations) && organizations.length === 1);
    assertProject(projects[0]);
    requireTrue(record(organizations[0]) && organizations[0].id === ORG_ID && organizations[0].name === 'Example Fabrication (staging)');
    this.#fixture = true;
  }
  async send(caseId: string): Promise<Reply> {
    requireTrue(!this.#used.has(caseId) && this.#used.size < 32 && Date.now() < this.#deadline, 'REQUEST_LIMIT');
    let path: string, method = 'GET', body: JsonObject | undefined;
    let authenticated = true;
    if (caseId === 'sign-in') { path = '/auth/v1/token?grant_type=password'; method = 'POST'; authenticated = false; body = { email: this.#env.E2E_USER, password: this.#env.E2E_PASS }; }
    else if (['auth-user', 'auth-user-final'].includes(caseId)) path = '/auth/v1/user';
    else if (caseId === 'project') path = `/rest/v1/projects?id=eq.${PROJECT_ID}&limit=1&select=id,name,project_number,org_id,is_deleted,on_hold`;
    else if (caseId === 'organization') path = `/rest/v1/organizations?id=eq.${ORG_ID}&limit=1&select=id,name`;
    else if (caseId === 'audit-before' || caseId === 'audit-after') {
      requireTrue(this.#fixture && uuid(this.#subject), 'FIXTURE_REQUIRED');
      path = `/rest/v1/activities?project_id=eq.${PROJECT_ID}&entity_id=eq.${PROJECT_ID}&entity_type=eq.Project&action=eq.exported&performed_by_user_id=eq.${this.#subject}&order=timestamp.desc,id.desc&limit=10&select=id,project_id,entity_id,entity_type,action,performed_by_user_id,metadata`;
    } else {
      const [kind, slug, extra] = caseId.split(':');
      requireTrue(extra === undefined && ['method', 'anonymous', 'probe'].includes(kind) && HANDLERS.includes(slug as Handler), 'REQUEST_BLOCKED');
      if (kind === 'probe' && slug === 'project-export') requireTrue(this.#fixture, 'FIXTURE_REQUIRED');
      path = `/functions/v1/${slug}`;
      authenticated = kind !== 'anonymous';
      if (kind !== 'method') { method = 'POST'; body = probeBody(slug as Handler); }
    }
    requireTrue(!authenticated || this.#token, 'SESSION_REQUIRED');
    this.#used.add(caseId);
    const maximum = caseId === 'probe:project-export' ? 4_194_304 : 131_072;
    try {
      const response = await this.#network(ORIGIN + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(Math.min(caseId === 'probe:project-export' ? 45_000 : 15_000, this.#deadline - Date.now())),
        headers: { apikey: this.#env.E2E_SUPABASE_ANON_KEY!, ...(authenticated ? { Authorization: `Bearer ${this.#token}` } : {}), 'Content-Type': 'application/json', Origin: PUBLIC_STAGE_ORIGIN },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      requireTrue(!response.redirected && !(response.status >= 300 && response.status < 400), 'NETWORK_REJECTED');
      requireTrue(response.body, 'RESPONSE_INVALID');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
      try {
        for (;;) {
          const chunk = await reader.read(); if (chunk.done) break;
          bytes += chunk.value.byteLength; this.#bytes += chunk.value.byteLength;
          if (bytes > maximum || this.#bytes > 8_388_608) { await reader.cancel(); throw new Error('RESPONSE_LIMIT'); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return { status: response.status, body: parsed };
    } catch (error) {
      // Never propagate network/JSON errors containing a credential or payload.
      throw new Error(error instanceof Error && error.message === 'RESPONSE_LIMIT' ? 'RESPONSE_LIMIT' : 'NETWORK_REJECTED');
    }
  }
}

type Stage = 'environment' | 'identity' | 'fixture' | 'probes' | 'export' | 'audit' | 'final-identity' | 'finished';
type Outcome = 'PASS' | 'FAIL' | 'INCOMPLETE';
interface CaseResult { id: string; status: Outcome; reason: string; httpStatus?: number }
export interface AcceptanceReport {
  schemaVersion: 1; candidateSha: string | null; status: 'FAIL' | 'INCOMPLETE'; stage: Stage;
  auth?: { aal: 'aal1' | 'aal2'; verifiedFactors: number };
  exportCounts?: ExportCounts; exportAuditRows?: number; cases: CaseResult[]; limitations: string[];
}
function configurationUnavailable(handler: Handler, reply: Reply): boolean {
  if (reply.status !== 503 || !record(reply.body)) return false;
  return handler === 'stripe-billing' && ['Billing configuration is unavailable. Please contact support.', 'Billing is not configured'].includes(String(reply.body.error))
    || handler === 'command-center-read' && reply.body.error === 'SteelBuild read service is not configured';
}
function validateRead(value: unknown): void {
  requireTrue(record(value) && Array.isArray(value.items) && value.items.length === 1 && record(value.items[0]));
  const item = value.items[0];
  requireTrue(item.id === PROJECT_ID && item.entityType === 'project' && record(item.project) && item.project.id === PROJECT_ID
    && record(item.source) && item.source.sourceType === 'steelbuild' && item.source.sourceId === PROJECT_ID
    && item.source.sourceUrl === item.sourceUrl && typeof item.sourceUrl === 'string'
    && record(value.truncated) && value.truncated.project === false);
  const link = new URL(item.sourceUrl);
  requireTrue(link.origin === PUBLIC_STAGE_ORIGIN && !link.username && !link.password && link.pathname === '/Projects'
    && link.searchParams.get('projectId') === PROJECT_ID && link.searchParams.get('recordId') === PROJECT_ID
    && [...link.searchParams.keys()].length === 2 && !link.hash);
}
function auditRows(value: unknown, subject: string): JsonObject[] {
  requireTrue(Array.isArray(value) && value.length <= 10);
  for (const row of value) requireTrue(record(row) && uuid(row.id) && row.project_id === PROJECT_ID && row.entity_id === PROJECT_ID
    && row.entity_type === 'Project' && row.action === 'exported' && row.performed_by_user_id === subject && record(row.metadata));
  return value as JsonObject[];
}

/** Always incomplete: this bounded runner cannot certify AAL2 lifecycle,
 * erasure, provider operations, concurrent checkout or cross-tenant revocation.
 * Expected rejection results are separate from those untested capabilities.
 */
export async function runAcceptance(env: Environment, network: typeof fetch = fetch): Promise<AcceptanceReport> {
  const report: AcceptanceReport = {
    schemaVersion: 1, candidateSha: /^[a-f0-9]{40}$/.test(env.ACCEPTANCE_CANDIDATE_SHA ?? '') ? env.ACCEPTANCE_CANDIDATE_SHA! : null,
    status: 'INCOMPLETE', stage: 'environment', cases: [], limitations: [
      'AAL2_STEP_UP_AND_SEVEN_HANDLER_MFA_MATRIX_UNTESTED', 'ACCOUNT_AND_WORKSPACE_ERASURE_UNTESTED',
      'PROVIDER_KEYS_PRICES_DELIVERY_AND_CHECKOUT_UNTESTED', 'CROSS_TENANT_AND_REVOKED_SESSION_MATRIX_UNTESTED',
      'STORAGE_FILE_BYTES_AND_RESTORE_UNTESTED', 'HOSTED_BUNDLE_SHA_VERIFIED_SEPARATELY',
    ],
  };
  const result = (id: string, status: Outcome, reason: string, httpStatus?: number) => { report.cases.push({ id, status, reason, ...(httpStatus === undefined ? {} : { httpStatus }) }); if (status === 'FAIL') report.status = 'FAIL'; };
  try {
    assertEnvironment(env); const transport = new BoundedTransport(env, network);
    report.stage = 'identity';
    const session = await transport.send('sign-in'); requireTrue(session.status === 200 && record(session.body) && record(session.body.user)
      && typeof session.body.access_token === 'string' && uuid(session.body.user.id));
    transport.setSession(session.body.access_token, session.body.user.id);
    const user = await transport.send('auth-user'); requireTrue(user.status === 200);
    const identity = verifyIdentity(session.body, user.body, env.E2E_USER!);
    report.auth = { aal: identity.aal, verifiedFactors: identity.verifiedFactors };
    result('fresh-auth', 'PASS', 'CURRENT_AUTH_USER_AND_TOKEN_BOUND');
    const mfaDenied = identity.verifiedFactors > 0 && identity.aal === 'aal1';
    report.stage = 'fixture'; let fixture = false;
    const project = await transport.send('project'); const organization = await transport.send('organization');
    if (project.status === 200 && organization.status === 200) {
      try { transport.confirmFixture(project.body, organization.body); fixture = true; } catch { /* Fail closed; no export for an unconfirmed parent. */ }
    }
    result('synthetic-parent', fixture ? 'PASS' : 'INCOMPLETE', fixture ? 'EXACT_ACTIVE_PARENT' : 'PARENT_NOT_VISIBLE_OR_UNCONFIRMED');
    report.stage = 'probes';
    for (const handler of HANDLERS) {
      const method = await transport.send(`method:${handler}`);
      result(`method:${handler}`, method.status === 405 ? 'PASS' : 'FAIL', method.status === 405 ? 'METHOD_REJECTED' : 'UNEXPECTED_STATUS', method.status);
      const anonymous = await transport.send(`anonymous:${handler}`);
      result(`anonymous:${handler}`, anonymous.status === 401 ? 'PASS' : configurationUnavailable(handler, anonymous) ? 'INCOMPLETE' : 'FAIL',
        anonymous.status === 401 ? 'ANONYMOUS_REJECTED' : configurationUnavailable(handler, anonymous) ? 'CONFIGURATION_PRECEDES_AUTH' : 'UNEXPECTED_STATUS', anonymous.status);
      if (handler === 'project-export') continue;
      if (handler === 'command-center-read' && !fixture && !mfaDenied) { result(`probe:${handler}`, 'INCOMPLETE', 'PARENT_NOT_VISIBLE_OR_UNCONFIRMED'); continue; }
      const reply = await transport.send(`probe:${handler}`);
      if (configurationUnavailable(handler, reply)) { result(`probe:${handler}`, 'INCOMPLETE', 'REQUIRED_CONFIGURATION_UNAVAILABLE', reply.status); continue; }
      if (handler !== 'account-delete' && mfaDenied) {
        const denied = reply.status === 403 && record(reply.body) && reply.body.code === 'mfa_required';
        result(`probe:${handler}`, denied ? 'PASS' : 'FAIL', denied ? 'ENROLLED_AAL1_REJECTED' : 'EXPECTED_MFA_DENIAL_MISSING', reply.status); continue;
      }
      if (handler === 'command-center-read') {
        requireTrue(reply.status === 200); validateRead(reply.body); result(`probe:${handler}`, 'PASS', 'BOUNDED_PROJECT_READ', reply.status); continue;
      }
      const error = record(reply.body) ? reply.body.error : undefined;
      const expected = handler === 'account-delete' ? error === 'org_id is required'
        : handler === 'email-send' ? error === 'project_id is required'
        : handler === 'llm-proxy' ? typeof error === 'string' && error.startsWith('Unknown provider:')
        : handler === 'command-center-session-handoff' ? error === 'Invalid handoff request'
        : typeof error === 'string' && /Unknown action/i.test(error);
      result(`probe:${handler}`, reply.status === 400 && expected ? 'PASS' : 'FAIL', reply.status === 400 && expected ? 'SAFE_INVALID_INPUT_REJECTED' : 'UNEXPECTED_STATUS_OR_CONTRACT', reply.status);
    }
    if (fixture && !mfaDenied && report.status !== 'FAIL') {
      report.stage = 'audit'; const before = await transport.send('audit-before'); requireTrue(before.status === 200);
      const ids = new Set(auditRows(before.body, identity.subject).map(row => row.id));
      report.stage = 'export'; const reply = await transport.send('probe:project-export'); requireTrue(reply.status === 200);
      report.exportCounts = validateExport(reply.body); result('probe:project-export', 'PASS', 'V2_SCOPED_CREDENTIALS_EXCLUDED', reply.status);
      if (report.exportCounts.mailboxRows === 0) report.limitations.push('NONEMPTY_MAILBOX_CREDENTIAL_REDACTION_UNTESTED');
      report.stage = 'audit'; const after = await transport.send('audit-after'); requireTrue(after.status === 200);
      const created = auditRows(after.body, identity.subject).filter(row => !ids.has(row.id)); requireTrue(created.length === 1);
      const metadata = created[0].metadata as JsonObject;
      requireTrue(metadata.export_version === 2 && metadata.total_rows === report.exportCounts.rows && metadata.table_count === report.exportCounts.tables && metadata.file_count === report.exportCounts.files);
      report.exportAuditRows = created.length; result('export-audit', 'PASS', 'EXACT_ACTOR_PROJECT_AND_COUNTS');
    } else result('probe:project-export', 'INCOMPLETE', mfaDenied ? 'AAL2_REQUIRED_FOR_AUTHORIZED_EXPORT' : 'PARENT_OR_PRIOR_CHECK_UNCONFIRMED');
    report.stage = 'final-identity'; const finalUser = await transport.send('auth-user-final'); requireTrue(finalUser.status === 200);
    const finalIdentity = verifyIdentity(session.body, finalUser.body, env.E2E_USER!);
    requireTrue(finalIdentity.verifiedFactors === identity.verifiedFactors && finalIdentity.aal === identity.aal);
    result('final-auth', 'PASS', 'AUTH_ENROLLMENT_RECHECKED'); report.stage = 'finished';
  } catch { report.status = 'FAIL'; result('runner', 'FAIL', 'BOUNDED_ACCEPTANCE_FAILED'); }
  return report;
}
