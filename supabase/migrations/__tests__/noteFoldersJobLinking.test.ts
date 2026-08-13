import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260813120000_note_folders_job_linking.sql",
);
const sql = readFileSync(migrationPath, "utf8");

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
});
