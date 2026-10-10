import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors";
import { mfaDenialForVerifiedUser } from "../_shared/mfa";
import { buildExportAuditRecord, buildProjectExport } from "./exportShape";

// Execute the complete production entrypoint. Only the runtime, Supabase
// boundary, and bulk readers are replaced so the authorization order and
// response behavior remain under test.
const source = ts.createSourceFile(
  "index.ts",
  readFileSync(new URL("./index.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const executable = ts.transpileModule(
  source.statements
    .filter((statement) => !ts.isImportDeclaration(statement))
    .map((statement) => statement.getText(source))
    .join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

const USER_ID = "11000000-5eed-4000-8000-000000000001";
const PROJECT_ID = "22000000-5eed-4000-8000-000000000002";
const ORG_ID = "33000000-5eed-4000-8000-000000000003";
const AUTHORIZATION = `Bearer header.${Buffer.from(JSON.stringify({ sub: USER_ID, aal: "aal2" })).toString("base64url")}.signature`;
const ANON_KEY = "test-anon-key";
const SERVICE_KEY = "test-service-key";
type Handler = (request: Request) => Promise<Response>;

interface Fixture {
  canExport?: unknown;
  roleError?: { message: string } | null;
}

function exportHandler(fixture: Fixture = {}) {
  const env: Record<string, string> = {
    SUPABASE_URL: "https://supabase.example.invalid",
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  };
  let handler: Handler | undefined;
  const runtime = {
    env: { get: (key: string) => env[key] },
    serve: (value: Handler) => { handler = value; },
  };
  vi.stubGlobal("Deno", runtime);

  const events: string[] = [];
  const rpcRequests: Array<{ name: string; arguments: unknown }> = [];

  const emptyRangeQuery = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    in() { return this; },
    range: async () => ({ data: [], error: null }),
  };
  const rls = {
    rpc: async (name: string, args: unknown) => {
      events.push(`rpc:${name}`);
      rpcRequests.push({ name, arguments: args });
      return { data: fixture.canExport ?? true, error: fixture.roleError ?? null };
    },
    from: (table: string) => {
      events.push(`read:${table}`);
      if (table === "projects") {
        const query = {
          select() { return query; },
          eq() { return query; },
          maybeSingle: async () => ({ data: { id: PROJECT_ID, org_id: ORG_ID, name: "Fixture" }, error: null }),
        };
        return query;
      }
      return emptyRangeQuery;
    },
    storage: {
      from: (bucket: string) => ({
        list: async () => {
          events.push(`storage:${bucket}`);
          return { data: [], error: null };
        },
      }),
    },
  };
  const admin = {
    from: (table: string) => ({
      insert: async () => {
        events.push(`write:${table}`);
        return { error: null };
      },
    }),
  };
  const createClient = (_url: string, key: string) => key === SERVICE_KEY ? admin : rls;
  const fetch = async (input: string | URL | Request): Promise<Response> => {
    const request = new Request(input);
    if (new URL(request.url).pathname !== "/auth/v1/user") throw new Error(`Unexpected HTTP boundary ${request.url}`);
    return new Response(JSON.stringify({
      id: USER_ID,
      email: "member@example.invalid",
      user_metadata: { full_name: "Fixture User" },
      factors: [{ status: "verified" }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const bindings = {
    Deno: runtime,
    fetch,
    createClient,
    corsHeaders,
    errorResponse,
    jsonResponse,
    mfaDenialForVerifiedUser,
    reportError: async () => undefined,
    readTablePaged: async () => ({ rows: [], error: null }),
    readQueryPages: async () => ({ rows: [], error: null }),
    buildProjectExport,
    buildExportAuditRecord,
    PROJECT_EXPORT_TABLES: [],
    console: { log() {}, warn() {}, error() {} },
  };
  new Function(...Object.keys(bindings), executable)(...Object.values(bindings));
  if (!handler) throw new Error("project-export did not register its handler");
  const run = () => handler!(new Request("https://functions.example.invalid/project-export", {
    method: "POST",
    headers: { authorization: AUTHORIZATION, "content-type": "application/json" },
    body: JSON.stringify({ project_id: PROJECT_ID }),
  }));
  return { events, rpcRequests, run };
}

afterEach(() => vi.unstubAllGlobals());

describe("project-export authorization", () => {
  it("denies a project-visible non-admin before reading or exporting project data", async () => {
    const app = exportHandler({ canExport: false });

    const response = await app.run();

    expect(response.status).toBe(403);
    expect(app.rpcRequests).toEqual([{
      name: "user_has_project_role_at_least",
      arguments: { p_project_id: PROJECT_ID, p_min_role: "admin" },
    }]);
    expect(app.events).toEqual(["rpc:user_has_project_role_at_least"]);
  });

  it("allows an administrator and records the audited export", async () => {
    const app = exportHandler({ canExport: true });

    const response = await app.run();

    expect(response.status).toBe(200);
    expect(app.events).toEqual([
      "rpc:user_has_project_role_at_least",
      "read:projects",
      "read:note_folder_job_links",
      "storage:app-files",
      "storage:app-files",
      "storage:email-attachments",
      "storage:email-attachments",
      "write:activities",
    ]);
  });

  it.each([
    ["database failure", { canExport: true, roleError: { message: "role lookup unavailable" } }],
    ["invalid result", { canExport: "true" }],
  ])("fails closed on a %s before reading project data", async (_name, fixture) => {
    const app = exportHandler(fixture);

    const response = await app.run();

    expect(response.status).toBe(503);
    expect(app.events).toEqual(["rpc:user_has_project_role_at_least"]);
  });
});
