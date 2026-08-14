import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260813120000_note_folders_job_linking.sql",
);
const exportPath = resolve(process.cwd(), "supabase/functions/project-export/index.ts");
const sql = readFileSync(migrationPath, "utf8");
const exportSrc = readFileSync(exportPath, "utf8");

describe("note folders + job linking migration", () => {
  it("creates org-scoped folders, job links, audit, receipts, and migration counts", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.note_folders/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.note_folder_job_links/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.note_folder_audit_events/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.note_folder_mutation_receipts/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.note_folder_migrations/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS folder_id/i);
    expect(sql).toMatch(/General Notes/i);
  });

  it("enforces the every-job access rule and never grants blanket writes", () => {
    expect(sql).toMatch(/user_can_access_note_folder/i);
    expect(sql).toMatch(/FOREACH v_job IN ARRAY v_jobs/i);
    expect(sql).toMatch(/user_has_project_access\(v_job\)/i);
    expect(sql).not.toMatch(/(?:using|with\s+check)\s*\(\s*true\s*\)/i);
  });

  it("keeps folder mutations transactional, versioned, and retry-safe", () => {
    expect(sql).toMatch(/p_expected_version/i);
    expect(sql).toMatch(/VERSION_CONFLICT/i);
    expect(sql).toMatch(/p_idempotency_key/i);
    expect(sql).toMatch(/note_folder_receipt_get/i);
    expect(sql).toMatch(/CROSS_TENANT/i);
  });

  it("audits accepted and rejected attempts and restricts link writes to RPCs", () => {
    expect(sql).toMatch(/note_folder_write_audit/i);
    expect(sql).toMatch(/accepted boolean NOT NULL/i);
    expect(sql).toMatch(/CREATE POLICY note_folders_insert[\s\S]*WITH CHECK \(false\)/i);
    expect(sql).toMatch(/CREATE POLICY note_folder_job_links_write[\s\S]*USING \(false\)/i);
    expect(sql).toMatch(/AS RESTRICTIVE/i);
  });

  it("locks SECURITY DEFINER helpers and grants only the public commands", () => {
    expect(sql).toMatch(/SET search_path TO 'public'/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.note_folder_write_audit/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_visible_note_folders/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_note_folder_links/i);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.note_folder_write_audit/i);
  });

  it("requires every note to belong to a folder and lets PMs manage unlinked folders", () => {
    expect(sql).toMatch(/ALTER COLUMN folder_id SET NOT NULL/i);
    expect(sql).not.toMatch(/folder_id IS NULL OR public\.user_can_access_note_folder/i);
    expect(sql).toMatch(/Unlinked \/ general folder/i);
    expect(sql).toMatch(/user_has_project_role_at_least\(p\.id, 'pm'\)/i);
  });

  it("audits missing-folder rejects without a sentinel organization", () => {
    expect(sql).toMatch(/note_folder_audit_events \(\s*id uuid PRIMARY KEY[\s\S]*org_id uuid REFERENCES public\.organizations/i);
    expect(sql).not.toMatch(/note_folder_reject\('00000000-0000-0000-0000-000000000000'::uuid/i);
    expect(sql).toMatch(/RETURN public\.note_folder_reject\(NULL,/);
  });

  it("keeps org-scoped folder tables out of the generic project-export loop", () => {
    const genericList = exportSrc.slice(
      exportSrc.indexOf("const PROJECT_EXPORT_TABLES"),
      exportSrc.indexOf("] as const;"),
    );
    expect(genericList).not.toMatch(/note_folders/);
    expect(genericList).not.toMatch(/note_folder_job_links/);
    expect(exportSrc).toMatch(/async function readNoteFolderExport/);
    expect(exportSrc).toMatch(/\.eq\("project_id", projectId\)/);
  });
});
