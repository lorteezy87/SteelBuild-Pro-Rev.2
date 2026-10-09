import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { corsHeaders, errorResponse, jsonResponse } from "../../_shared/cors";
import { mfaDenialForVerifiedUser } from "../../_shared/mfa";
import { isDangerousAttachment, MAX_ATTACHMENT_BYTES, sanitizeAttachmentName } from "../../_shared/attachments";
import { normalizeRecipients } from "../recipients";
import { EdgeBoundaryError, boundedRequest, configuredLimit, fetchWithDeadline, operationKey, operationFingerprint, reserveOperation, finishOperation } from "../../_shared/edgeOperation";

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
  verifiedMailboxes?: unknown;
  mailboxFailure?: LookupFailure;
  fromEmail?: string;
  fromName?: string;
  graphConfigured?: boolean;
  connectionId?: string;
  sendLimit?: string;
  ledgerFailure?: boolean;
  providerFailure?: boolean;
  providerErrorBody?: string;
}

const VERIFIED_MAILBOX = { account_id: "44000000-5eed-4000-8000-000000000004", email_address: "project@example.invalid", display_name: "Project", send_provider: "resend", provider_connection_id: "resend-fixture" };

function emailHandler(fixture: Fixture = {}) {
  const env: Record<string, string> = {
    SUPABASE_URL: "https://supabase.example.invalid",
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    RESEND_API_KEY: "test-provider-key",
    EMAIL_RESEND_CONNECTION_ID: fixture.connectionId ?? "resend-fixture",
    EMAIL_SEND_HOURLY_LIMIT: fixture.sendLimit ?? "100",
    ...(fixture.graphConfigured ? { MS_GRAPH_CLIENT_ID: "test-client", MS_GRAPH_CLIENT_SECRET: "test-secret", MS_GRAPH_TENANT_ID: "test-tenant", EMAIL_MSGRAPH_CONNECTION_ID: "graph-fixture" } : {}),
  };
  let handler: Handler | undefined;
  const runtime = { env: { get: (key: string) => env[key] }, serve: (value: Handler) => { handler = value; } };
  vi.stubGlobal("Deno", runtime);
  const privateRequests: string[] = [];
  const deliveries: Record<string, unknown>[] = [];
  const correspondence: Record<string, unknown>[] = [];
  const providerCalls: string[] = [];
  const bindingRequests: unknown[] = [];
  const logs: unknown[][] = [];
  const operations = new Map<string, { operation_id: string; hash: string; state: string; result: unknown }>();
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
      if (name === "reserve_edge_operation") {
        if (fixture.ledgerFailure) return json({}, 503);
        const current = operations.get(args.p_request_key);
        if (current) return json({ decision: current.hash !== args.p_fingerprint ? "conflict" : current.state === "completed" ? "replay" : current.state, operation_id: current.operation_id, result: current.result, response_status: 200 });
        if (args.p_count_limit > 0 && operations.size >= args.p_count_limit) return json({ decision: "limited" });
        const operation_id = "55000000-5eed-4000-8000-000000000005";
        operations.set(args.p_request_key, { operation_id, hash: args.p_fingerprint, state: "pending", result: null });
        return json({ decision: "reserved", operation_id });
      }
      if (name === "finish_edge_operation") {
        for (const operation of operations.values()) if (operation.operation_id === args.p_operation_id) { operation.state = args.p_state; operation.result = args.p_result; }
        return json(true);
      }
      if (name === "get_verified_email_mailboxes") {
        privateRequests.push("mailbox");
        bindingRequests.push(args);
        if (request.method !== "POST" || request.headers.get("authorization") !== `Bearer ${SERVICE_KEY}` || request.headers.get("apikey") !== SERVICE_KEY) return json({}, 403);
        if (fixture.mailboxFailure === "http") return json({}, 503);
        if (fixture.mailboxFailure === "network") throw new Error("Offline mailbox fixture");
        if (fixture.mailboxFailure === "invalid-json") return new Response("not-json");
        if (fixture.mailboxFailure === "invalid-result") return json({ email_address: "project@example.invalid" });
        return json(fixture.verifiedMailboxes ?? [VERIFIED_MAILBOX]);
      }
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
      providerCalls.push("resend");
      deliveries.push(await request.json());
      if (fixture.providerErrorBody) return json({ error: fixture.providerErrorBody }, 500);
      if (fixture.providerFailure) throw new Error("Response lost after provider accepted request");
      return json({ id: "test-delivery" });
    }
    if (url.origin === "https://login.microsoftonline.com") {
      providerCalls.push("graph-token");
      return json({ access_token: "test-graph-token" });
    }
    if (url.origin === "https://graph.microsoft.com") {
      providerCalls.push(url.pathname);
      deliveries.push(await request.json());
      return new Response(null, { status: 202 });
    }
    throw new Error(`Unexpected HTTP boundary ${request.method} ${url.origin}${url.pathname}`);
  };
  const bindings = {
    Deno: runtime, fetch, corsHeaders, errorResponse, jsonResponse,
    mfaDenialForVerifiedUser, isDangerousAttachment, MAX_ATTACHMENT_BYTES,
    sanitizeAttachmentName, normalizeRecipients,
    EdgeBoundaryError, boundedRequest, configuredLimit, fetchWithDeadline, operationKey, operationFingerprint, reserveOperation, finishOperation,
    reportError: async () => undefined,
    console: { log: (...args: unknown[]) => logs.push(args), warn: (...args: unknown[]) => logs.push(args), error: (...args: unknown[]) => logs.push(args) },
  };
  vi.stubGlobal("fetch", fetch);
  new Function(...Object.keys(bindings), executable)(...Object.values(bindings));
  if (!handler) throw new Error("email-send did not register its handler");
  const run = (key = "66000000-5eed-4000-8000-000000000006") => handler!(new Request("https://functions.example.invalid/email-send", {
    method: "POST",
    headers: { authorization: AUTHORIZATION, "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ project_id: PROJECT_ID, to: ["recipient@example.invalid"], subject: "Fixture", body_text: "Fixture body", from_email: fixture.fromEmail, from_name: fixture.fromName }),
  }));
  return { run, raw: handler, logs, privateRequests, deliveries, correspondence, rpcRequests, providerCalls, bindingRequests };
}

afterEach(() => vi.unstubAllGlobals());

it("keeps provider response content out of logs and the uncertain-delivery response", async () => {
  const marker = "PRIVATE_MARKER_secret_customer@example.invalid";
  const app = emailHandler({ providerErrorBody: marker });
  const response = await app.run();
  expect(response.status).toBe(409);
  expect(await response.text()).not.toContain(marker);
  expect(JSON.stringify(app.logs)).not.toContain(marker);
  expect(app.logs).toContainEqual(["[email-send] resend_failed", { status: 500 }]);
  expect(app.providerCalls).toEqual(["resend"]);
  expect(app.correspondence).toEqual([]);
});

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
    expect(app.deliveries).toEqual([{ from: '"Project" <project@example.invalid>', to: ["recipient@example.invalid"], subject: "Fixture", text: "Fixture body" }]);
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

describe("email-send durable reservations", () => {
  it("replays a completed operation without sending again", async () => {
    const app = emailHandler();
    expect((await app.run()).status).toBe(200);
    expect((await app.run()).status).toBe(200);
    expect(app.deliveries).toHaveLength(1);
  });
  it("blocks a second logical send at cap one even though editable correspondence count stays zero", async () => {
    const app = emailHandler({ sendLimit: "1" });
    expect((await app.run()).status).toBe(200);
    expect((await app.run("77000000-5eed-4000-8000-000000000007")).status).toBe(429);
    expect(app.deliveries).toHaveLength(1);
  });
  it.each(["invalid", "-1", "1.5", "Infinity", " "])("rejects invalid configured cap %s before provider", async sendLimit => {
    const app = emailHandler({ sendLimit });
    expect((await app.run()).status).toBe(503);
    expect(app.deliveries).toHaveLength(0);
  });
  it("fails closed if the reservation ledger is unavailable", async () => {
    const app = emailHandler({ ledgerFailure: true });
    expect((await app.run()).status).toBe(503);
    expect(app.deliveries).toHaveLength(0);
  });
  it("does not send again when the first provider outcome is unknown", async () => {
    const app = emailHandler({ providerFailure: true });
    expect((await app.run()).status).toBe(409);
    expect((await app.run()).status).toBe(409);
    expect(app.deliveries).toHaveLength(1);
  });
});

describe("email-send verified mailbox boundary", () => {
  it.each(["unverified", "revoked", "address changed", "moved to a different workspace"])("denies %s mailbox even when editable metadata still lists it", async () => {
    const app = emailHandler({ verifiedMailboxes: [] });
    expect((await app.run()).status).toBe(403);
    expect(app.providerCalls).toEqual([]);
    expect(app.correspondence).toEqual([]);
  });
  it.each(["http", "network", "invalid-json", "invalid-result"] as const)("fails closed on binding lookup %s", async (mailboxFailure) => {
    const app = emailHandler({ mailboxFailure });
    expect((await app.run()).status).toBe(503);
    expect(app.providerCalls).toEqual([]);
  });
  it("denies an unbound caller-selected address before provider access", async () => {
    const app = emailHandler({ fromEmail: "another@example.invalid" });
    expect((await app.run()).status).toBe(403);
    expect(app.providerCalls).toEqual([]);
  });
  it("rejects malformed verified data without falling back to editable metadata", async () => {
    const app = emailHandler({ verifiedMailboxes: [{ ...VERIFIED_MAILBOX, email_address: "Forged <other@example.invalid>" }] });
    expect((await app.run()).status).toBe(503);
    expect(app.providerCalls).toEqual([]);
  });
  it("denies a provider connection mismatch", async () => {
    const app = emailHandler({ connectionId: "rotated-connection" });
    expect((await app.run()).status).toBe(503);
    expect(app.providerCalls).toEqual([]);
  });
  it("does not fall back to Resend for a Graph-bound mailbox", async () => {
    const app = emailHandler({ verifiedMailboxes: [{ ...VERIFIED_MAILBOX, send_provider: "msgraph", provider_connection_id: "graph-fixture" }] });
    expect((await app.run()).status).toBe(503);
    expect(app.providerCalls).toEqual([]);
  });
  it("keeps a Resend binding on Resend when global Graph credentials also exist", async () => {
    const app = emailHandler({ graphConfigured: true });
    expect((await app.run()).status).toBe(200);
    expect(app.providerCalls).toEqual(["resend"]);
    expect(app.bindingRequests).toEqual([{ p_project_id: PROJECT_ID }]);
  });
  it("sends a verified Graph mailbox through its matching connection", async () => {
    const app = emailHandler({ graphConfigured: true, verifiedMailboxes: [{ ...VERIFIED_MAILBOX, send_provider: "msgraph", provider_connection_id: "graph-fixture" }] });
    expect((await app.run()).status).toBe(200);
    expect(app.providerCalls).toEqual(["graph-token", "/v1.0/users/project%40example.invalid/sendMail"]);
  });
  it("cannot send from an inbound-only verified mailbox", async () => {
    const app = emailHandler({ verifiedMailboxes: [{ ...VERIFIED_MAILBOX, send_provider: "inbound_only" }] });
    expect((await app.run()).status).toBe(403);
    expect(app.providerCalls).toEqual([]);
  });
  it("stores the resolved canonical address and safe display name used for delivery", async () => {
    const app = emailHandler({ fromEmail: "PROJECT@example.invalid", fromName: "Forged <attacker@example.invalid>" });
    expect((await app.run()).status).toBe(200);
    expect(app.deliveries[0].from).toBe('"Project" <project@example.invalid>');
    expect(app.correspondence[0]).toMatchObject({ sender_email: "project@example.invalid", sender_name: "Project" });
  });
  it("does not let editable display-name address syntax change the From mailbox", async () => {
    const app = emailHandler({ verifiedMailboxes: [{ ...VERIFIED_MAILBOX, display_name: "Ops, attacker@example.invalid; Group:\\name" }] });
    expect((await app.run()).status).toBe(200);
    expect(app.deliveries[0].from).toBe('"Ops, attacker@example.invalid; Group:\\\\name" <project@example.invalid>');
  });
});

it.each([undefined, '1', String(31 * 1024 * 1024)])('bounds actual email-send bytes with Content-Length %s', async length => {
  const app = emailHandler(); const chunk = new Uint8Array(4 * 1024 * 1024); let sent = 0;
  const body = new ReadableStream({pull(c) { if (sent++ < 8) c.enqueue(chunk); else c.close(); }});
  const response = await app.raw!(new Request('https://functions.example.invalid/email-send', {method:'POST', headers:{authorization:AUTHORIZATION, ...(length ? {'content-length':length}:{})},body,duplex:'half'} as RequestInit));
  expect(response.status).toBe(413); expect(app.providerCalls).toEqual([]);expect(app.correspondence).toEqual([]);
});
