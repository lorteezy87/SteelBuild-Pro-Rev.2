import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { mfaDenialForVerifiedUser } from './mfa';

// Execute the real entrypoint functions with network/provider boundaries mocked.
// Deno's npm:/jsr: imports are not loadable by Vitest, so only remove the import
// boundary: TypeScript's AST selects the unchanged handler/auth function body.
type Handler = (...args: unknown[]) => Promise<Response>;
function compile(slug: string, name: string, bindings: Record<string, unknown>): Handler {
  const text = readFileSync(new URL(`../${slug}/index.ts`, import.meta.url), 'utf8');
  const source = ts.createSourceFile('index.ts', text, ts.ScriptTarget.Latest, true);
  let expression: string | undefined;
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) expression = statement.getText(source);
    if (name === 'serve' && ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
      && statement.expression.expression.getText(source) === 'Deno.serve') {
      expression = `const serve = ${statement.expression.arguments[0].getText(source)}`;
    }
  }
  if (!expression) throw new Error(`Missing ${slug}/${name}`);
  const output = ts.transpileModule(expression, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(bindings), `${output}; return ${name};`)(...Object.values(bindings));
}

const id = '11000000-5eed-4000-8000-000000000001';
const authorization = `Bearer header.${Buffer.from(JSON.stringify({ sub: id, aal: 'aal1' })).toString('base64url')}.signature`;
const user = { id, email: 'test@example.invalid', factors: [{ status: 'verified' }] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const errorResponse = (status: number, error: string) => json({ error }, status);
const request = (slug: string) => new Request(`https://example.invalid/${slug}`, {
  method: 'POST', headers: { authorization, 'content-type': 'application/json' },
  body: JSON.stringify({ mode: 'account', project_id: id, org_id: id, action: 'checkout' }),
});

beforeEach(() => vi.stubGlobal('Deno', { env: { get: () => 'configured-test-value' } }));
afterEach(() => vi.unstubAllGlobals());

describe('enrolled AAL1 cannot reach protected Edge operations', () => {
  it.each(['llm-proxy', 'email-send', 'project-export', 'account-delete', 'command-center-read', 'command-center-session-handoff', 'stripe-billing'])(
    '%s returns MFA_REQUIRED before reading private records or causing effects', async (slug) => {
      const effects = vi.fn(() => { throw new Error('Protected operation reached'); });
      const authFetch = vi.fn(async () => json(user));
      const getUser = vi.fn(async () => ({ data: { user }, error: null }));
      const client = { auth: { getUser }, from: effects, rpc: effects, storage: { from: effects } };
      const bindings: Record<string, unknown> = {
        Deno: globalThis.Deno, Response, Request, URL, console,
        fetch: authFetch, mfaDenialForVerifiedUser,
        json, jsonResponse: json, errorResponse, corsHeaders: () => ({}), CORS: {},
        createClient: () => client, admin: client,
        PROTOCOL_VERSION: 7, SUPABASE_URL: 'https://example.invalid', ANON_KEY: 'test-key',
        handleAccountDeletion: effects, handleOrgDeletion: effects, readOneEntity: effects, createHandoff: effects,
        readJson: (req: Request) => req.json(), parseReadRequest: (body: unknown) => body,
        requireEnvironment: () => ({ url: 'https://example.invalid', anonKey: 'test-key', serviceKey: 'test-service-key', baseUrl: '' }),
        requireExactKeys: () => undefined,
        loadConfig: async () => ({ livemode: true }), billingReadiness: () => ({ ok: true, key: 'test-key' }),
        stripeClient: () => ({ customers: { create: effects }, checkout: { sessions: { create: effects } } }),
      };
      let handler: Handler;
      if (slug === 'llm-proxy') {
        bindings.authenticateRequest = compile(slug, 'authenticateRequest', bindings);
        handler = compile(slug, 'handle', bindings);
      } else if (slug === 'email-send' || slug === 'project-export') {
        bindings.verifyJwt = compile(slug, 'verifyJwt', bindings);
        handler = compile(slug, 'handle', bindings);
      } else if (slug === 'command-center-session-handoff') {
        handler = compile(slug, 'handleCreate', bindings);
      } else if (slug === 'stripe-billing') {
        handler = compile(slug, 'handleRequest', bindings);
      } else {
        handler = compile(slug, 'serve', bindings);
      }
      const response = await handler(request(slug), {});
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'mfa_required' });
      expect(authFetch.mock.calls.length + getUser.mock.calls.length).toBe(1);
      expect(effects).not.toHaveBeenCalled();
    },
  );
});
