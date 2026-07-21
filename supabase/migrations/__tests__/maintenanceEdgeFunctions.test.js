import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readFunction = (name, file = "index.ts") =>
  readFileSync(
    fileURLToPath(new URL(`../../functions/${name}/${file}`, import.meta.url)),
    "utf8",
  );

const auth = readFunction("_shared", "maintenance-auth.ts");
const copy = readFunction("legacy-app-files-copy");
const bootstrap = readFunction("staging-e2e-bootstrap");

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

  it("copies only app-files/uploads and never deletes objects", () => {
    expect(copy).toContain('const BUCKET = "app-files"');
    expect(copy).toContain('const SOURCE_FOLDER = "uploads"');
    expect(copy).toContain("storage.copy(source, destination)");
    expect(copy).not.toMatch(/storage\.remove|deleteObject|\.move\(/);
    expect(copy).toContain("originals_deleted: 0");
  });

  it("returns copy aggregates rather than object paths", () => {
    expect(copy).toContain("scanned,");
    expect(copy).toContain("copied,");
    expect(copy).toContain("existing,");
    expect(copy).toContain("etag_verified: etagVerified,");
    expect(copy).toContain("hash_verified: hashVerified,");
    expect(copy).toContain("content_verified: contentVerified,");
    expect(copy).toContain("verification_failed: failed,");
    expect(copy).not.toMatch(/jsonResponse\([^)]*source|jsonResponse\([^)]*destination/s);
  });

  it("hashes both objects when equal-size copies do not have matching ETags", () => {
    expect(copy).toContain("sourceEtag === destinationEtag");
    expect(copy).toContain("async function downloadSha256(");
    expect(copy).toContain("const sourceHash = await downloadSha256(storage, source)");
    expect(copy).toContain("const destinationHash = await downloadSha256(storage, destination)");
    expect(copy).toContain('crypto.subtle.digest("SHA-256"');
    expect(copy).toContain("sourceHash === destinationHash");
    expect(copy).not.toContain("Promise.all");
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
