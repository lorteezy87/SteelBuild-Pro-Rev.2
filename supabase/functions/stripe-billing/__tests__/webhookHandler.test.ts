import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import * as webhookLogic from "../webhookLogic";
import { billingReadiness } from "../configGuard";

// Run the actual registered entrypoint. Only Deno/import/provider/database
// boundaries are replaced; the billing decisions and error paths are real.
const source = ts.createSourceFile("index.ts", readFileSync(new URL("../index.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const executable = ts.transpileModule(source.statements.filter((statement) => !ts.isImportDeclaration(statement)).map((statement) => statement.getText(source)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const ORG = "10000000-0000-4000-8000-000000000001";
const subscription = (overrides: Record<string, unknown> = {}) => ({ id: "sub_current", customer: "cus_test", status: "active", created: 200,
  metadata: { org_id: ORG }, items: { data: [{ price: { id: "price_pro" } }] }, ...overrides });
const checkout = () => ({ id: "evt_checkout", type: "checkout.session.completed", livemode: true, data: { object: {
  subscription: "sub_current", customer: "cus_test", metadata: { org_id: ORG, plan: "business" },
} } });
const changed = (overrides: Record<string, unknown> = {}) => ({ id: "evt_subscription", type: "customer.subscription.updated", livemode: true, data: { object: subscription(overrides) } });
type Failure = "config" | "seen" | "lookup" | "snapshot" | "update" | "marker" | "empty-snapshot" | "invalid-commit" | "unique-unrelated" | "unique-committed";
type Event = ReturnType<typeof changed> | ReturnType<typeof checkout>;
type Handler = (request: Request) => Promise<Response>;

function fixture(options: { failure?: Failure; current?: string | null; subscription?: Record<string, unknown>; prior?: Record<string, unknown>; retrieveFails?: boolean } = {}) {
  let handler: Handler | undefined;
  let failure = options.failure;
  const markers = new Set<string>();
  const organization: Record<string, unknown> = { id: ORG, plan: "business", stripe_customer_id: "cus_test", stripe_subscription_id: options.current === undefined ? "sub_current" : options.current };
  const writes: Record<string, unknown>[] = [];
  const calls: string[] = [];
  const commits: Record<string, unknown>[] = [];
  let revision = "0";
  const failureResult = () => ({ data: null, error: { code: "40001", message: "Synthetic returned database error" } });
  const client = {
    from(table: string) {
      let operation = "read";
      let payload: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};
      const result = () => {
        calls.push(`${table}:${operation}`);
        if (table === "billing_config") return failure === "config" ? failureResult() : { data: { stripe_price_pro: "price_pro", stripe_price_business: "price_business", stripe_webhook_secret: "whsec_fixture", livemode: true }, error: null };
        if (table === "billing_events") {
          if (operation === "read") return failure === "seen" ? failureResult() : { data: markers.has(String(filters.stripe_event_id)) ? { stripe_event_id: filters.stripe_event_id } : null, error: null };
          if (failure === "marker") return failureResult();
          markers.add(String(payload.stripe_event_id));
          return { data: null, error: null };
        }
        if (table === "organizations") {
          if (operation === "read") return failure === "lookup" ? failureResult() : { data: { ...organization }, error: null };
          if (failure === "update") return failureResult();
          Object.assign(organization, payload);
          writes.push(payload);
          return { data: [{ id: ORG }], error: null };
        }
        throw new Error(`Unexpected table ${table}`);
      };
      const query = {
        select() { return query; }, eq(key: string, value: unknown) { filters[key] = value; return query; },
        update(value: Record<string, unknown>) { operation = "update"; payload = value; return query; },
        insert(value: Record<string, unknown>) { operation = "insert"; payload = value; return query; },
        maybeSingle: async () => result(), single: async () => result(),
        then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
      };
      return query;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push(name);
      if (name === "get_stripe_billing_snapshot") {
        if (failure === "snapshot") return failureResult();
        return { data: failure === "empty-snapshot" ? null : { org_id: ORG, revision, stripe_customer_id: organization.stripe_customer_id, stripe_subscription_id: organization.stripe_subscription_id }, error: null };
      }
      if (name !== "apply_stripe_billing_event") throw new Error(`Unexpected RPC ${name}`);
      commits.push(args);
      if (failure === "update" || failure === "marker") return failureResult();
      if (failure === "invalid-commit") return { data: null, error: null };
      if (failure === "unique-unrelated" || failure === "unique-committed") {
        if (failure === "unique-committed") markers.add(String(args.p_event_id));
        return { data: null, error: { code: "23505", message: "Constraint violation" } };
      }
      if (markers.has(String(args.p_event_id))) return { data: "duplicate", error: null };
      if (args.p_update) {
        Object.assign(organization, args.p_update);
        writes.push(args.p_update as Record<string, unknown>);
      }
      revision = String(Number(revision) + 1);
      markers.add(String(args.p_event_id));
      return { data: args.p_update ? "applied" : "ignored", error: null };
    },
  };
  const retrieve = vi.fn(async (id: string) => {
    calls.push(`retrieve:${id}`);
    if (options.retrieveFails) throw new Error("Synthetic provider unavailable");
    return id === "sub_current" ? subscription(options.subscription) : subscription({ id, created: 100, ...options.prior });
  });
  class StripeFixture {
    static createFetchHttpClient() { return {}; }
    subscriptions = { retrieve };
    webhooks = { constructEventAsync: async (body: string, signature: string) => {
      if (signature !== "valid-fixture-signature") throw new Error("Invalid fixture signature");
      return JSON.parse(body);
    } };
  }
  const env: Record<string, string> = { SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-service", STRIPE_SECRET_KEY: "sk_fixture" };
  const runtime = { env: { get: (name: string) => env[name] }, serve: (value: Handler) => { handler = value; } };
  vi.stubGlobal("Deno", runtime);
  const reports: unknown[] = [];
  const bindings = { Deno: runtime, Stripe: StripeFixture, createClient: () => client, ...webhookLogic, billingReadiness,
    corsHeaders: () => ({}), isAllowedOrigin: () => false, mfaDenialForVerifiedUser: () => null,
    reportError: async (error: unknown) => { reports.push(error); }, console: { log() {}, warn() {}, error() {} } };
  new Function(...Object.keys(bindings), executable)(...Object.values(bindings));
  if (!handler) throw new Error("Entrypoint failed to register");
  return { organization, writes, calls, commits, markers, retrieve, reports, setFailure(value?: Failure) { failure = value; },
    run: (event: Event = checkout(), signature = "valid-fixture-signature") => handler!(new Request("https://fixture.invalid/stripe-billing/webhook", {
      method: "POST", headers: { "stripe-signature": signature }, body: JSON.stringify(event),
    })) };
}

afterEach(() => vi.unstubAllGlobals());

describe("Stripe actual webhook entrypoint", () => {
  it.each(["config", "seen", "snapshot", "empty-snapshot", "update", "marker", "invalid-commit", "unique-unrelated"] as Failure[])("does not acknowledge or mark a %s failure", async (failure) => {
    const app = fixture({ failure });
    expect((await app.run()).status).toBeGreaterThanOrEqual(500);
    expect(app.markers.size).toBe(0);
    expect(app.writes).toHaveLength(0);
  });
  it("does not confuse failed customer lookup with an irrelevant event", async () => {
    const app = fixture({ failure: "lookup" });
    expect((await app.run(changed({ metadata: {} }))).status).toBeGreaterThanOrEqual(500);
    expect(app.markers.size).toBe(0);
  });
  it("retries a returned write failure, then applies once and deduplicates", async () => {
    const app = fixture({ failure: "update" });
    expect((await app.run()).status).toBe(500);
    app.setFailure();
    expect((await app.run()).status).toBe(200);
    expect((await app.run()).status).toBe(200);
    expect(app.writes).toHaveLength(1);
    expect(app.organization.plan).toBe("pro");
    expect(app.calls.indexOf("get_stripe_billing_snapshot")).toBeLessThan(app.calls.indexOf("retrieve:sub_current"));
    expect(app.calls).not.toContain("organizations:update");
    expect(app.calls).not.toContain("billing_events:insert");
  });
  it("does not acknowledge a failed cancellation or retain its marker on retry", async () => {
    const app = fixture({ failure: "update", subscription: { status: "canceled" } });
    const event = { ...changed(), type: "customer.subscription.deleted" };
    expect((await app.run(event)).status).toBe(500);
    expect(app.markers.size).toBe(0);
    app.setFailure();
    expect((await app.run(event)).status).toBe(200);
    expect(app.organization).toMatchObject({ plan: "free", subscription_status: "canceled" });
    expect(app.writes).toHaveLength(1);
  });
  it("acknowledges a 23505 only after confirming this exact event was durably committed", async () => {
    const app = fixture({ failure: "unique-committed" });
    expect((await app.run()).status).toBe(200);
    expect(app.markers.has("evt_checkout")).toBe(true);
  });
  it("does not grant a canceled delayed checkout its metadata plan", async () => {
    const app = fixture({ subscription: { status: "canceled" } });
    expect((await app.run()).status).toBe(200);
    expect(app.organization).toMatchObject({ plan: "free", subscription_status: "canceled" });
  });
  it("does not grant an unknown price a paid metadata plan", async () => {
    const app = fixture({ subscription: { items: { data: [{ price: { id: "price_unknown" } }] }, metadata: { org_id: ORG, plan: "business" } } });
    expect((await app.run()).status).toBe(200);
    expect(app.organization.plan).toBe("free");
    expect(app.reports.length).toBeGreaterThan(0);
  });
  it("removes paid entitlement for an unknown provider status", async () => {
    const app = fixture({ subscription: { status: "new_provider_state" } });
    expect((await app.run()).status).toBe(200);
    expect(app.organization.plan).toBe("free");
  });
  it("ignores an obsolete subscription event without overwriting the current binding", async () => {
    const app = fixture({ current: "sub_newer", prior: { created: 300 } });
    expect((await app.run(changed())).status).toBe(200);
    expect(app.organization.stripe_subscription_id).toBe("sub_newer");
    expect(app.writes).toHaveLength(0);
    expect(app.commits[0].p_update).toBeNull();
  });
  it("ignores an older checkout but permits a strictly newer checkout", async () => {
    const old = fixture({ current: "sub_other", prior: { created: 300 } });
    expect((await old.run()).status).toBe(200);
    expect(old.writes).toHaveLength(0);
    const newer = fixture({ current: "sub_other", prior: { created: 100 } });
    expect((await newer.run()).status).toBe(200);
    expect(newer.organization.stripe_subscription_id).toBe("sub_current");
  });
  it("does not guess ordering of distinct subscriptions created in the same second", async () => {
    const app = fixture({ current: "sub_other", prior: { created: 200 } });
    expect((await app.run()).status).toBe(500);
    expect(app.writes).toHaveLength(0);
    expect(app.markers.size).toBe(0);
    expect(app.reports.length).toBeGreaterThan(0);
  });
  it("does not bind a subscription belonging to a different customer", async () => {
    const app = fixture({ subscription: { customer: "cus_foreign" } });
    expect((await app.run()).status).toBe(500);
    expect(app.markers.size).toBe(0);
  });
  it("does not fall back to the event payload when current Stripe state is unavailable", async () => {
    const app = fixture({ retrieveFails: true });
    expect((await app.run()).status).toBe(500);
    expect(app.markers.size).toBe(0);
  });
  it("rejects invalid signatures before billing reads or writes", async () => {
    const app = fixture();
    expect((await app.run(checkout(), "invalid")).status).toBe(400);
    expect(app.calls).toEqual(["billing_config:read"]);
    expect(app.writes).toHaveLength(0);
  });
});
