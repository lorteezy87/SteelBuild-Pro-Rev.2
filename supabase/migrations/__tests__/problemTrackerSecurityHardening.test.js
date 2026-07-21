import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const hardeningSql = readFileSync(
  fileURLToPath(
    new URL("../20260721030200_harden_trigger_and_split_write_policies.sql", import.meta.url),
  ),
  "utf8",
).toLowerCase();

const cutoverSql = readFileSync(
  fileURLToPath(
    new URL("../20260721031606_close_app_files_legacy_path_final.sql", import.meta.url),
  ),
  "utf8",
).toLowerCase();

const rewriteSql = readFileSync(
  fileURLToPath(
    new URL("../20260721031557_rewrite_app_files_legacy_references.sql", import.meta.url),
  ),
  "utf8",
).toLowerCase();

const policyTables = [
  "delivery_items",
  "drawing_sheets",
  "submittal_activity",
  "task_dependencies",
];

describe("problem-tracker database security hardening", () => {
  it("makes the piece-station trigger function trigger-only", () => {
    expect(hardeningSql).toContain(
      "revoke all on function public.seed_default_piece_stations_for_project()\n  from public, anon, authenticated, service_role;",
    );
    expect(hardeningSql).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.seed_default_piece_stations_for_project/,
    );
  });

  it("keeps one-time maintenance authorization in a private, RLS-enabled table", () => {
    expect(hardeningSql).toContain("create schema if not exists private;");
    expect(hardeningSql).toContain("create table if not exists private.maintenance_jobs");
    expect(hardeningSql).toContain(
      "alter table private.maintenance_jobs enable row level security;",
    );
    expect(hardeningSql).toContain(
      "revoke all on table private.maintenance_jobs from public, anon, authenticated, service_role;",
    );
    expect(hardeningSql).toContain("token_sha256 ~ '^[0-9a-f]{64}$'");
  });

  it("exposes maintenance context and bootstrap completion only to service_role", () => {
    for (const identity of [
      "public.get_maintenance_job_context(text)",
      "public.complete_staging_e2e_bootstrap(uuid, uuid, uuid)",
    ]) {
      expect(hardeningSql).toContain(
        `revoke all on function ${identity}\n  from public, anon, authenticated, service_role;`,
      );
      expect(hardeningSql).toMatch(
        new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${identity.replace(/[().]/g, "\\$&")}[\\s\\S]*?to\\s+service_role;`),
      );
    }
  });

  it.each(policyTables)(
    "replaces %s FOR ALL with authenticated-only insert/update/delete policies",
    (table) => {
      expect(hardeningSql).toContain(`drop policy if exists ${table}_write on public.${table};`);
      expect(hardeningSql).not.toMatch(
        new RegExp(`create\\s+policy\\s+${table}_write[\\s\\S]*?for\\s+all`),
      );

      for (const command of ["insert", "update", "delete"]) {
        expect(hardeningSql).toMatch(
          new RegExp(
            `create\\s+policy\\s+${table}_${command}\\s+on\\s+public\\.${table}[\\s\\S]*?for\\s+${command}\\s+to\\s+authenticated`,
          ),
        );
      }
    },
  );

  it.each(["delivery_items", "drawing_sheets"])(
    "preserves both USING and WITH CHECK for %s updates",
    (table) => {
      const updatePolicy = hardeningSql.match(
        new RegExp(
          `create\\s+policy\\s+${table}_update[\\s\\S]*?;(?=\\s*(?:create|drop|notify|commit))`,
        ),
      )?.[0];
      expect(updatePolicy).toContain("using (");
      expect(updatePolicy).toContain("with check (");
      expect(updatePolicy).toContain("user_has_project_role_at_least");
    },
  );

  it("fails the Storage closure when copies or rewritten references are incomplete", () => {
    expect(cutoverSql).toContain("legacy object(s) do not have org-scoped copies");
    expect(cutoverSql).toContain("database reference(s) still use uploads/ paths");
    expect(cutoverSql).toContain("org-scoped database reference(s) have no object");
    expect(cutoverSql).toContain("destination copy size record(s) do not match their source");
  });

  it("rewrites all reviewed scalar references only after size and aggregate verification", () => {
    expect(rewriteSql).toContain("destination object(s) are missing or size-mismatched");
    expect(rewriteSql).toContain("change-order attachment row(s) need manual parsing");
    expect(rewriteSql.match(/\('(?:[a-z_]+)', '(?:[a-z_]+)'\)/g)).toHaveLength(23);
    expect(rewriteSql).not.toMatch(/delete\s+from\s+storage\.objects/);
  });

  it.each([
    ["reference rewrite", rewriteSql],
    ["policy closure", cutoverSql],
  ])("requires complete aggregate content verification before %s", (_name, sql) => {
    for (const field of [
      "source_objects",
      "destination_objects",
      "content_verified",
      "verification_failed",
      "verified_at",
    ]) {
      expect(sql).toContain(`v_verification ->> '${field}'`);
    }
    expect(sql).toContain("<> v_source_objects");
    expect(sql).toContain("<> 0");
    expect(sql).not.toMatch(/metadata\s*->>\s*'etag'/i);
    expect(sql).not.toMatch(/metadata\s*->>\s*'eTag'/);
  });

  it("retains source objects while preserving copied-object ownership", () => {
    expect(cutoverSql).toContain("set owner_id = source_object.owner_id");
    expect(cutoverSql).toContain("owner = source_object.owner");
    expect(cutoverSql).not.toMatch(/delete\s+from\s+storage\.objects/);
  });

  it("removes both legacy read and upload grandfather branches", () => {
    expect(cutoverSql).toMatch(/alter\s+policy\s+auth_read\s+on\s+storage\.objects/);
    expect(cutoverSql).toMatch(/alter\s+policy\s+auth_upload\s+on\s+storage\.objects/);

    const alteredPolicies = cutoverSql.slice(cutoverSql.indexOf("alter policy auth_read"));
    expect(alteredPolicies).not.toContain("founding_org_id");
    expect(alteredPolicies).not.toContain("= 'uploads'");
  });

  it("atomically completes and disables the legacy-copy maintenance job", () => {
    expect(cutoverSql).toContain("update private.maintenance_jobs");
    expect(cutoverSql).toContain("token_sha256 = null");
    expect(cutoverSql).toContain("completion_details = completion_details || jsonb_build_object");
    expect(cutoverSql).toContain("where job_key = 'legacy_app_files_copy'");
  });
});
