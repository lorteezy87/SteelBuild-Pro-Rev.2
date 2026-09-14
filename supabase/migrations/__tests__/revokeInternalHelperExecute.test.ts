import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260914020000_revoke_internal_helper_execute_from_authenticated.sql",
  ),
  "utf8",
);

/**
 * The ten helpers whose only callers are postgres-owned SECURITY DEFINER
 * functions, so revoking EXECUTE from authenticated cannot break them.
 */
const REVOKED = [
  "public.note_folder_effective_project_ids(uuid)",
  "public.note_folder_visible_payload(uuid)",
  "public.note_folder_receipt_get(text)",
  "public.note_folder_receipt_put(text, uuid, text, jsonb)",
  "public.note_folder_write_audit(uuid, uuid, text, boolean, text, jsonb, jsonb, jsonb)",
  "public.note_folder_reject(uuid, uuid, text, text, text, jsonb)",
  "public.note_folder_same_org_projects(uuid, uuid[])",
  "public.ensure_general_notes_folder(uuid)",
  "public.seed_project_handoff_items(uuid)",
  "public.feature_flag_enabled_for(text, text)",
] as const;

describe("revoke internal helper EXECUTE from authenticated", () => {
  it.each(REVOKED)("targets %s for revocation", (signature) => {
    // Listed as a to_regprocedure signature inside the guard's array, not as a
    // bare statement — see the replay-safety test below.
    expect(sql).toContain(`'${signature}'`);
  });

  it("names anon and authenticated, never public alone", () => {
    // This is the whole point. Supabase's ALTER DEFAULT PRIVILEGES grants
    // EXECUTE directly to anon/authenticated/service_role, and PUBLIC is a
    // separate grantee — so "revoke ... from public" leaves the function
    // callable by anyone with a session. 14 of this repo's 17 revokes and all
    // 108 of the sibling repo's use that ineffective form.
    expect(sql).toContain("revoke execute on function %s from public, anon, authenticated");
  });

  it("skips a function that is absent rather than aborting the migration", () => {
    // Replaying all 113 migrations against an empty cluster proved this file was
    // the only genuine failure: feature_flag_enabled_for is created by no
    // migration in this repo, so a bare REVOKE aborted the whole file with
    // "function ... does not exist" on every fresh database.
    expect(sql).toContain("to_regprocedure(v_sig) is not null");
    expect(sql).toContain("skipping revoke, function not present here");
    // No bare revoke may come back: that is what broke replay.
    expect(sql).not.toMatch(/^revoke execute on function/m);
  });

  it("keeps every target as an exact identity signature", () => {
    // to_regprocedure needs the identity form; a bare name or a mismatched
    // argument list resolves to NULL and would silently skip a real revoke.
    for (const signature of REVOKED) {
      expect(signature).toMatch(/^public\.\w+\(.*\)$/);
    }
  });

  it("does not revoke refresh_cost_code_actual, whose caller is SECURITY INVOKER", () => {
    // move_expense is SECURITY INVOKER, so it calls this as the end user and a
    // revoke would take the privilege from that call too.
    expect(sql).not.toContain("revoke execute on function public.refresh_cost_code_actual");
  });

  it("gates refresh_cost_code_actual at the same floor as the expense writers", () => {
    expect(sql).toContain(
      "create or replace function public.refresh_cost_code_actual(p_cost_code_id uuid)",
    );
    // create_expense and move_expense both require 'field', so anything higher
    // would break expense entry for the field users who do it.
    expect(sql).toContain("public.user_has_project_role_at_least(v_project, 'field')");
    expect(sql).toContain("Not authorized to update cost codes on this project");
  });

  it("resolves the project from the cost code rather than trusting an argument", () => {
    expect(sql).toContain(
      "select c.project_id into v_project from public.cost_codes c where c.id = p_cost_code_id",
    );
  });

  it("keeps an unknown cost code a silent no-op instead of an existence oracle", () => {
    expect(sql).toContain("if v_project is null then return; end if;");
  });

  it("enforces only for a real end-user JWT, so trigger and service paths still run", () => {
    // expenses_changed (a SECURITY DEFINER trigger) and migration/service-role
    // paths have no auth.uid() and bypass RLS anyway.
    expect(sql).toContain("if (select auth.uid()) is not null");
  });

  it("preserves the existing GUC save/restore around the cost-code write", () => {
    expect(sql).toContain(
      "v_prev text := coalesce(current_setting('steelbuild.expense_rpc', true), '')",
    );
    expect(sql).toContain("perform set_config('steelbuild.expense_rpc', v_prev, true)");
  });

  it("keeps the function SECURITY DEFINER with a pinned search_path", () => {
    expect(sql).toMatch(/security definer\s+set search_path to ''/);
  });
});
