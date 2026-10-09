import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedRequest, EdgeBoundaryError } from './edgeOperation';
import { corsHeaders, jsonResponse, errorResponse } from './cors';

type Handler = (request: Request) => Promise<Response>;
function entrypoint(slug: string) {
  const source = ts.createSourceFile('index.ts', readFileSync(new URL(`../${slug}/index.ts`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const body = source.statements.filter(statement => !ts.isImportDeclaration(statement)).map(statement => statement.getText(source)).join('\n');
  const executable = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  let handler: Handler | undefined;
  const effects = vi.fn(() => { throw new Error('Protected work reached'); });
  const runtime = { env: { get: () => 'synthetic-configuration' }, serve: (value: Handler) => { handler = value; } };
  vi.stubGlobal('Deno', runtime);
  class StripeStub { static createFetchHttpClient() { return {}; } }
  const bindings: Record<string, unknown> = { Deno: runtime, boundedRequest, EdgeBoundaryError, corsHeaders, jsonResponse, errorResponse,
    json: (value: unknown, status = 200) => Response.json(value, { status }), CORS: {}, Stripe: StripeStub,
    createClient: () => ({ from: effects, auth: { getUser: effects }, rpc: effects }),
    reportError: effects, fetch: effects, mfaDenialForVerifiedUser: effects, PROJECT_EXPORT_TABLES: [],
  };
  if (slug === 'stripe-billing') delete bindings.json; // The Stripe entrypoint defines its own response helper.
  new Function(...Object.keys(bindings), executable)(...Object.values(bindings));
  if (!handler) throw new Error('Entrypoint did not register');
  return { handler, effects };
}
afterEach(() => vi.unstubAllGlobals());
describe('bounded bodies at actual privileged entrypoints', () => {
  it.each(['project-export', 'account-delete', 'stripe-billing'])(
    '%s rejects absent/false/oversized lengths before privileged work', async slug => {
      for (const contentLength of [undefined, '1', '999999999']) {
        const { handler, effects } = entrypoint(slug);
        let pulls = 0;
        let cancelled = false;
        const stream = new ReadableStream({ pull(controller) {
          pulls++;
          if (pulls > 100) controller.close();
          else controller.enqueue(new Uint8Array(16_384).fill(120));
        }, cancel() { cancelled = true; } });
        const request = new Request(`https://test.invalid/${slug}`, { method: 'POST',
          headers: { authorization: 'Bearer synthetic', ...(contentLength ? { 'content-length': contentLength } : {}) },
          body: stream, duplex: 'half' } as RequestInit);
        const response = await handler(request);
        expect(response.status).toBe(413);
        expect(effects).not.toHaveBeenCalled();
        expect(pulls).toBeLessThan(10);
        if (contentLength !== '999999999') expect(cancelled).toBe(true);
      }
    });
});
