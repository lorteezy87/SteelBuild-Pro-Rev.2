import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { corsHeaders, errorResponse, jsonResponse } from "../../_shared/cors";
import { mfaDenialForVerifiedUser } from "../../_shared/mfa";
import { isDangerousAttachment, MAX_ATTACHMENT_BYTES, sanitizeAttachmentName } from "../../_shared/attachments";
import { normalizeRecipients } from "../recipients";

// Execute the complete production entrypoint, including its auth helpers and
// provider adapter. Only Deno's runtime/import boundary and HTTP are replaced;
// no authorization function is mocked. This follows mfaEntrypoints.test.ts.
const source = ts.createSourceFile("index.ts", readFileSync(new URL("../index.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const executable = ts.transpileModule(
  source.statements.filter((statement) => !ts.isImportDeclaration(statement)).map((statement) => statement.getText(source)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

const USER_ID = "11000000-5eed-4000-8000-000000000001";
const PROJECT_ID = "22000000-5eed-4000-8000-000000000002";
const ORG_ID = "33000000-5eed-4000-8000-000000000003";
const AUTHORIZATION = `Bearer header.${Buffer.from(JSON.stringify({ sub: USER_ID, aal: "aal2" })).toString("base64url")}.signature`;
const ANON_KEY = "test-anon-key";
const SERVICE_KEY = "test-service-key";
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
type Handler = (request: Request) => Promise<Response>;
type LookupFailure = "http" | "network" | "invalid-json" | "invalid-result";
interface Fixture {
  access?: boolean;
  canSend?: boolean;
  explicitRole?: string | null;
  orgRole?: string | null;
  archived?: boolean;
  failure?: { lookup: "access" | "role"; kind: LookupFailure };
}

function emailHandler(fixture: Fixture = {}) {
  const env: Record<string, string> = {
    SUPABASE_URL: "https://supabase.example.invalid",
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    RESEND_API_KEY: "test-provider-key",
  };
  let handler: Handler | undefined;
  const runtime = { env: { get: (key: string) => env[key] }, serve: (value: Handler) => { handler = value; } };
  vi.stubGlobal("Deno", runtime);
  const privateRequests: string[] = [];
  const deliveries: Record<string, unknown>[] = [];
  const correspondence: Record<string, unknown>[] = [];
  const rpcRequests: Array<{ name: string; arguments: unknown; authorization: string | null; apikey: string | null }> = [];

  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname === "/auth/v1/user") {
      return json({ id: USER_ID, email: "member@example.invalid", factors: [{ status: "verified" }] });
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const name = url.pathname.split("/").at(-1)!;
      const args = await request.json();
      rpcRequests.push({ name, arguments: args, authorization: request.headers.get("authorization"), apikey: request.headers.get("apikey") });
      // A service-role lookup would test its own identity, not this caller.
      if (request.method !== "POST" || request.headers.get("authorization") !== AUTHORIZATION || request.headers.get("apikey") !== ANON_KEY) return json({ error: "wrong caller" }, 403);
      const lookup = name === "user_has_project_access" ? "access" : name === "user_has_project_role_at_least" ? "role" : null;
      if (!lookup) throw new Error(`Unexpected RPC ${name}`);
      if (fixture.failure?.lookup === lookup) {
        if (fixture.failure.kind === "http") return json({ error: "lookup unavailable" }, 503);
        if (fixture.failure.kind === "network") throw new Error("Offline fixture");
        if (fixture.failure.kind === "invalid-json") return new Response("not-json");
        return json("true");
      }
      return json(lookup === "access" ? fixture.access ?? true : fixture.canSend ?? true);
    }
    // Retain the old service-role lookup responses so the regression fails
    // because it admits the stale membership, not because a mock is missing.
    if (url.pathname === "/rest/v1/user_projects") return json(fixture.explicitRole === null ? [] : [{ role: fixture.explicitRole ?? "pm" }]);
    if (url.pathname === "/rest/v1/projects") return json([{ id: PROJECT_ID, org_id: ORG_ID, is_deleted: fixture.archived ?? false }]);
    if (url.pathname === "/rest/v1/organization_members") return json(fixture.orgRole === null ? [] : [{ role: fixture.orgRole ?? "member" }]);
    if (url.pathname === "/rest/v1/email_accounts") {
      privateRequests.push("mailbox");
      return json([{ email_address: "project@example.invalid", display_name: "Project" }]);
    }
    if (url.pathname === "/rest/v1/email_messages") {
      privateRequests.push("correspondence");
      if (request.method === "POST") {
        correspondence.push(await request.json());
        return json([{ id: "44000000-5eed-4000-8000-000000000004" }]);
      }
      return json([], 200, { "content-range": "*/0" });
    }
    if (url.origin === "https://api.resend.com" && url.pathname === "/emails") {
      deliveries.push(await request.json());
      return json({ id: "test-delivery" });
    }
    throw new Error(`Unexpected HTTP boundary ${request.method} ${url.origin}${url.pathname}`);
  };
  const bindings = {
    Deno: runtime, fetch, corsHeaders, errorResponse, jsonResponse,
    mfaDenialForVerifiedUser, isDangerousAttachment, MAX_ATTACHMENT_BYTES,
    sanitizeAttachmentName, normalizeRecipients,
    reportError: async () => undefined,
    console: { log() {}, warn() {}, error() {} },
  };
  new Function(...Object.keys(bindings), executable)(...Object.values(bindings));
  if (!handler) throw new Error("email-send did not register its handler");
  const run = () => handler!(new Request("https://functions.example.invalid/email-send", {
    method: "POST",
    headers: { authorization: AUTHORIZATION, "content-type": "application/json" },
    body: JSON.stringify({ project_id: PROJECT_ID, to: ["recipient@example.invalid"], subject: "Fixture", body_text: "Fixture body" }),
  }));
  return { run, privateRequests, deliveries, correspondence, rpcRequests };
}

afterEach(() => vi.unstubAllGlobals());

describe("email-send project authorization", () => {
  it.each([
    ["removed workspace member with retained PM membership", { access: false, canSend: true, explicitRole: "pm", orgRole: null }],
    ["a different workspace", { access: false, canSend: false, explicitRole: null, orgRole: null }],
    ["archived project even for an owner", { access: false, canSend: true, explicitRole: "pm", orgRole: "owner", archived: true }],
    ["viewer", { access: true, canSend: false, explicitRole: "viewer" }],
    ["field member", { access: true, canSend: false, explicitRole: "field" }],
  ] satisfies Array<[string, Fixture]>)("denies %s before privileged email access", async (_name, fixture) => {
    const app = emailHandler(fixture);
    const response = await app.run();
    expect(response.status).toBe(403);
    expect(app.privateRequests).toEqual([]);
    expect(app.deliveries).toEqual([]);
    expect(app.correspondence).toEqual([]);
  });

  it.each([
    ["current project PM", { explicitRole: "pm" }],
    ["current project admin", { explicitRole: "admin" }],
    ["workspace owner without a project row", { explicitRole: null, orgRole: "owner" }],
    ["workspace admin without a project row", { explicitRole: null, orgRole: "admin" }],
    ["workspace-default PM without a project row", { explicitRole: null, orgRole: "member" }],
  ] satisfies Array<[string, Fixture]>)("sends for %s using caller-scoped canonical authority", async (_name, fixture) => {
    const app = emailHandler(fixture);
    const response = await app.run();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, provider: "resend", provider_message_id: "test-delivery" });
    expect(app.rpcRequests).toEqual([
      { name: "user_has_project_access", arguments: { p_project_id: PROJECT_ID }, authorization: AUTHORIZATION, apikey: ANON_KEY },
      { name: "user_has_project_role_at_least", arguments: { p_project_id: PROJECT_ID, p_min_role: "pm" }, authorization: AUTHORIZATION, apikey: ANON_KEY },
    ]);
    expect(app.deliveries).toEqual([{ from: "Project <project@example.invalid>", to: ["recipient@example.invalid"], subject: "Fixture", text: "Fixture body" }]);
    expect(app.correspondence).toHaveLength(1);
    expect(app.correspondence[0]).toMatchObject({ project_id: PROJECT_ID, sent_by: USER_ID, direction: "outbound" });
  });

  it.each([
    ["access", "http"], ["access", "network"], ["access", "invalid-json"], ["access", "invalid-result"],
    ["role", "http"], ["role", "network"], ["role", "invalid-json"], ["role", "invalid-result"],
  ] satisfies Array<["access" | "role", LookupFailure]>)("fails closed on %s lookup %s failure", async (lookup, kind) => {
    const app = emailHandler({ failure: { lookup, kind } });
    const response = await app.run();
    expect(response.status).toBe(503);
    expect(app.privateRequests).toEqual([]);
    expect(app.deliveries).toEqual([]);
    expect(app.correspondence).toEqual([]);
  });
});
