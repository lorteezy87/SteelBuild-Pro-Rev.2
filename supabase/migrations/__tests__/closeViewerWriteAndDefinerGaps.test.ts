import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260914010000_close_viewer_write_and_definer_gaps.sql",
  ),
  "utf8",
);

describe("close viewer-write and SECURITY DEFINER gaps migration", () => {
  it("puts a pm floor on project updates and an admin floor on archiving", () => {
    // The hole was project_update gating on user_has_project_access, which is
    // true for any org member once member_default_project_role is set.
    expect(sql).toContain("drop policy if exists project_update on public.projects");
    expect(sql).toContain("public.user_has_project_role_at_least(id, 'pm')");
    expect(sql).not.toContain("using (public.user_has_project_access(id))");

    expect(sql).toContain("new.is_deleted is distinct from old.is_deleted");
    expect(sql).toContain("new.deleted_at is distinct from old.deleted_at");
    expect(sql).toContain(
      "Archiving or restoring a project requires an admin",
    );
  });

  it("keeps the project guard's existing org_id and contract-field rules", () => {
    expect(sql).toContain("project org_id is immutable");
    expect(sql).toContain(
      "Editing project contract fields requires PM or admin",
    );
  });

  it("requires pm to update a fab-release sign-off, keeping the void rule", () => {
    expect(sql).toContain(
      "drop policy if exists drawing_signoffs_update on public.drawing_signoffs",
    );
    expect(sql).toContain(
      "using (public.user_has_project_role_at_least(project_id, 'pm'))",
    );
    // Voiding still needs admin or your own stamp.
    expect(sql).toContain("is_voided = false");
    expect(sql).toContain("stamped_by_id = (select auth.uid())");
  });

  it("stops an org admin from raising an invite to owner", () => {
    expect(sql).toContain(
      "drop policy if exists org_invites_update on public.organization_invitations",
    );
    expect(sql).toContain(
      "(role <> 'owner' or public.user_org_role_at_least(org_id, 'owner'))",
    );
    // A policy sees only NEW, so invited_by immutability is not expressible
    // here and must not be faked with an equality test.
    expect(sql).not.toContain("and invited_by = (select auth.uid())");
  });

  it("validates the forgeable row argument to build_pay_application_lines", () => {
    expect(sql).toContain(
      "create or replace function public.build_pay_application_lines(p_app pay_applications)",
    );
    // Trust the id, re-read the row, and reject a mismatched composite.
    expect(sql).toContain(
      "select * into v_real from public.pay_applications where id = p_app.id",
    );
    expect(sql).toContain("Pay application does not match the row supplied");
    expect(sql).toContain(
      "public.user_has_project_role_at_least(v_real.project_id, 'pm')",
    );
    expect(sql).toContain(
      "Only a draft pay application can have its G703 lines drafted",
    );
    // No upsert on this path, so a second draft would double the billing.
    expect(sql).toContain("Pay application already has G703 lines");
  });

  it("puts a pm floor on refresh_pay_application_totals", () => {
    expect(sql).toContain(
      "create or replace function public.refresh_pay_application_totals(p_id uuid)",
    );
    expect(sql).toContain(
      "public.user_has_project_role_at_least(v_app.project_id, 'pm')",
    );
  });

  it("only enforces auth on the two functions a service-role path can reach", () => {
    // Both also run without a JWT (trigger / migration / service role), where
    // auth.uid() is null and RLS is bypassed anyway.
    const guarded = sql.match(/\(select auth\.uid\(\)\) is not null/g) ?? [];
    expect(guarded).toHaveLength(2);
  });

  it("restores the payapp guard GUC instead of leaving it armed", () => {
    // Left 'on', these handed the rest of the transaction a disarmed
    // enforce_pay_application_guards.
    expect(sql).toContain(
      "v_prior_rpc text := coalesce(current_setting('steelbuild.payapp_rpc', true), 'off')",
    );
    expect(sql).toContain(
      "perform set_config('steelbuild.payapp_rpc', v_prior_rpc, true)",
    );
  });

  it("revokes the piece-link helper, which only a definer trigger calls", () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(sql).toContain(
        `revoke execute on function public.link_unlinked_model_elements_for_piece(uuid) from ${role}`,
      );
    }
  });

  it("gates the cross-tenant row-count census on project access", () => {
    expect(sql).toContain(
      "create or replace function public.project_row_counts(p_project_id uuid)",
    );
    expect(sql).toContain("public.user_has_project_access(p_project_id)");
    expect(sql).toContain("Not authorized to read this project");
  });

  it("keeps every replaced function SECURITY DEFINER with a pinned search_path", () => {
    const definers = sql.match(/security definer\s+set search_path to/g) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(4);
  });
});
