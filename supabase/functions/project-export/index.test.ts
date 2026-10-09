import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { buildExportAuditRecord, buildProjectExport } from './exportShape';
import { mfaDenialForVerifiedUser } from '../_shared/mfa';

// Execute unchanged entrypoint bodies; only the Deno import/network boundary is
// replaced. The SQL companion exercises the installed trigger and RLS policies.
type Handler = (request: Request) => Promise<Response>;
function compile(name: string, bindings: Record<string, unknown>): Handler {
  const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const statement = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!statement) throw new Error(`Missing entrypoint function ${name}`);
  const code = ts.transpileModule(statement.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(bindings), `${code}; return ${name};`)(...Object.values(bindings)) as Handler;
}

const actor = '20000000-0000-4000-8000-000000000002';
const otherActor = '20000000-0000-4000-8000-000000000003';
const project = '30000000-0000-4000-8000-000000000001';
const auditId = '40000000-0000-4000-8000-000000000001';
const authorization = `Bearer header.${Buffer.from(JSON.stringify({ sub: actor, aal: 'aal1' })).toString('base64url')}.signature`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const request = () => new Request('https://example.invalid/project-export', {
  method: 'POST', headers: { authorization, 'content-type': 'application/json' },
  body: JSON.stringify({ project_id: project, performed_by_user_id: otherActor }),
});

interface Scenario {
  auditRow?: Record<string, unknown> | null;
  auditError?: string;
  visible?: boolean;
  serviceKey?: boolean;
}
function setup(scenario: Scenario = {}) {
  const environment: Record<string, string | undefined> = {
    SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'public-anon',
    SUPABASE_SERVICE_ROLE_KEY: scenario.serviceKey === false ? undefined : 'service-role',
  };
  const result = { data: scenario.auditRow === undefined ? { id: auditId, performed_by_user_id: actor } : scenario.auditRow, error: scenario.auditError ? { message: scenario.auditError } : null };
  const selected = vi.fn(() => ({ single: async () => result }));
  const insert = vi.fn(() => ({ ...result, select: selected }));
  const adminInsert = vi.fn(async () => ({ data: null, error: null }));
  const readTablePaged = vi.fn(async () => ({ rows: [], error: null }));
  const client = {
    from: vi.fn((table: string) => table === 'activities' ? { insert } : {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: scenario.visible === false ? null : { id: project, org_id: 'workspace' }, error: null }) }) }),
    }),
  };
  const createClient = vi.fn((_url: string, key: string) => key === 'service-role' ? { from: () => ({ insert: adminInsert }) } : client);
  const authFetch = vi.fn(async () => json({ id: actor, email: 'synthetic@example.invalid', factors: [] }));
  const bindings: Record<string, unknown> = {
    Deno: { env: { get: (key: string) => environment[key] } }, console, Response,
    fetch: authFetch, mfaDenialForVerifiedUser, createClient,
    corsHeaders: () => ({}), errorResponse: (status: number, error: string) => json({ error }, status), jsonResponse: json,
    PROJECT_EXPORT_TABLES: ['drawings'], readTablePaged,
    readNoteFolderExport: async () => ({ results: [], error: null }), listProjectStorageFiles: async () => [],
    buildProjectExport, buildExportAuditRecord,
  };
  bindings.verifyJwt = compile('verifyJwt', bindings);
  return { handle: compile('handle', bindings), insert, adminInsert, selected, createClient, readTablePaged, authFetch };
}

afterEach(() => vi.restoreAllMocks());

describe('project export requires a persisted caller-attributed audit', () => {
  it('uses the caller JWT for the final write and returns v2 only after its verified actor is persisted', async () => {
    const test = setup();
    const response = await test.handle(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ export_version: 2 });
    expect(test.authFetch).toHaveBeenCalledOnce();
    expect(test.createClient).toHaveBeenCalledExactlyOnceWith('https://example.invalid', 'public-anon', { global: { headers: { Authorization: authorization } } });
    expect(test.adminInsert).not.toHaveBeenCalled();
    expect(test.insert).toHaveBeenCalledWith(expect.objectContaining({ project_id: project, performed_by_user_id: actor }));
    expect(test.selected).toHaveBeenCalledExactlyOnceWith('id,performed_by_user_id');
  });

  it.each([
    ['NULL actor', { id: auditId, performed_by_user_id: null }],
    ['different actor', { id: auditId, performed_by_user_id: otherActor }],
    ['missing actor', { id: auditId }],
    ['missing row', null],
    ['missing ID', { performed_by_user_id: actor }],
    ['blank ID', { id: '', performed_by_user_id: actor }],
    ['invalid ID', { id: 'not-an-audit-uuid', performed_by_user_id: actor }],
    ['non-string ID', { id: 7, performed_by_user_id: actor }],
  ])('refuses export contents when the persisted audit has %s', async (_label, auditRow) => {
    const test = setup({ auditRow });
    const response = await test.handle(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to record export audit entry' });
  });

  it('fails closed when membership is revoked between project reads and the audit write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const test = setup({ auditError: 'new row violates row-level security policy' });
    const response = await test.handle(request());
    expect(test.readTablePaged).toHaveBeenCalledOnce();
    expect(test.insert).toHaveBeenCalledOnce();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to record export audit entry' });
  });

  it('denies foreign or already-revoked projects before private reads or audit writes', async () => {
    const test = setup({ visible: false });
    expect((await test.handle(request())).status).toBe(403);
    expect(test.readTablePaged).not.toHaveBeenCalled();
    expect(test.insert).not.toHaveBeenCalled();
    expect(test.adminInsert).not.toHaveBeenCalled();
  });

  it('does not require a service-role secret for an operation entirely under caller RLS', async () => {
    const test = setup({ serviceKey: false });
    expect((await test.handle(request())).status).toBe(200);
  });
});
