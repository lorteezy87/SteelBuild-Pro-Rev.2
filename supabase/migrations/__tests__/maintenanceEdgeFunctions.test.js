import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const readFunction = (name, file = "index.ts") =>
  readFileSync(
    fileURLToPath(new URL(`../../functions/${name}/${file}`, import.meta.url)),
    "utf8",
  );

const auth = readFunction("_shared", "maintenance-auth.ts");
const copy = readFunction("legacy-app-files-copy");
const bootstrap = readFunction("staging-e2e-bootstrap");

function retiredCopyEntrypoint() {
  const privilegedWork = vi.fn(() => {
    throw new Error("A retired endpoint must not read secrets or perform privileged work");
  });
  const serve = vi.fn();
  // Execute the shipped body, removing only the Edge runtime type declaration.
  // Additional runtime imports fail instead of being silently mocked away.
  const source = copy.replace(
    /^import "jsr:@supabase\/functions-js@[^"]+\/edge-runtime\.d\.ts";\r?\n/m,
    "",
  );
  runInNewContext(source, {
    Deno: { serve, env: { get: privilegedWork } },
    Response,
    fetch: privilegedWork,
    createClient: privilegedWork,
    maintenanceClient: privilegedWork,
  }, { timeout: 1000 });
  expect(serve).toHaveBeenCalledTimes(1);
  expect(serve.mock.calls[0][0]).toBeTypeOf("function");
  expect(privilegedWork).not.toHaveBeenCalled();
  return { handler: serve.mock.calls[0][0], privilegedWork };
}

describe("one-time maintenance Edge Function contracts", () => {
  it("authenticates a preimage against only the private DB hash", () => {
    expect(auth).toContain('request.headers.get("x-sbp-maintenance-token")');
    expect(auth).toContain('crypto.subtle.digest("SHA-256"');
    expect(auth).toContain('rpc("get_maintenance_job_context"');
    expect(auth).not.toMatch(/LEGACY_COPY_TOKEN|STAGING_E2E_BOOTSTRAP_TOKEN/);
  });

  it("rejects every completed or wrong-project maintenance job", () => {
    expect(auth).toContain("if (context.completed_at)");
    expect(auth).toContain("new MaintenanceError(410");
    expect(auth).toContain("context.expected_project_ref !== actualProjectRef");
  });

  it.each(["GET", "POST", "OPTIONS", "DELETE"])(
    "the shipped copy endpoint permanently denies %s without privileged work",
    async (method) => {
      const { handler, privilegedWork } = retiredCopyEntrypoint();
      const response = await handler(new Request(
        "https://edge.example.invalid/legacy-app-files-copy?signedStreamVerify=true&limit=1",
        { method, headers: { "x-sbp-maintenance-token": "synthetic-retired-token" } },
      ));
      expect(response.status).toBe(410);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "Maintenance endpoint permanently closed." });
      expect(privilegedWork).not.toHaveBeenCalled();
    },
  );

  it("does not inspect credentials, query parameters or a body before denying a retired request", async () => {
    const { handler, privilegedWork } = retiredCopyEntrypoint();
    const inspectRequest = vi.fn(() => {
      throw new Error("Retirement must not depend on request data");
    });
    const request = new Proxy(new Request("https://edge.example.invalid/legacy-app-files-copy", {
      method: "POST",
      body: "not valid JSON",
    }), { get: inspectRequest });
    const response = await handler(request);
    expect(response.status).toBe(410);
    expect(inspectRequest).not.toHaveBeenCalled();
    expect(privilegedWork).not.toHaveBeenCalled();
  });

  it("hard-locks bootstrap to staging and deletes only unconfirmed synthetic users", () => {
    expect(bootstrap).toContain('const STAGING_PROJECT_REF = "abbeavtbifuddtrifvae"');
    expect(bootstrap).toContain('user.user_metadata?.purpose !== PURPOSE || user.email_confirmed_at');
    expect(bootstrap).toContain("client.auth.admin.deleteUser(user.id)");
    expect(bootstrap).toContain("email_confirm: true");
  });

  it("marks bootstrap complete only after user, org, project, and memberships exist", () => {
    expect(bootstrap).toContain('rpc("complete_staging_e2e_bootstrap"');
    expect(bootstrap).toContain('from("organization_members").upsert');
    expect(bootstrap).toContain('from("user_projects").upsert');
  });

  it.each(["legacy-app-files-copy", "staging-e2e-bootstrap"])(
    "ships a permanent 410 replacement for %s",
    (name) => {
      const disabled = readFunction(name, "disabled.ts");
      expect(disabled).toContain("status: 410");
      expect(disabled).not.toContain("createClient");
    },
  );
});
