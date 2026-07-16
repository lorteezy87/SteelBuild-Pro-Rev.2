import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260715235514_restrict_security_definer_execution.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

const triggerOnlyFunctions = [
  "activities_stamp_actor()",
  "audit_log_trigger()",
  "demo_requests_throttle()",
  "drawing_watch_notify_impact()",
  "drawing_watch_notify_revision()",
  "enforce_drawing_set_unlock_role()",
  "enforce_org_invite_limit()",
  "enforce_org_member_guard()",
  "enforce_project_update_guard()",
  "enforce_user_projects_membership_identity()",
  "guard_drawing_set_lock_for_drawing_links()",
  "guard_drawing_set_lock_for_drawing_zone_dependencies()",
  "guard_drawing_set_lock_for_drawing_zones()",
  "guard_drawing_set_lock_for_drawings()",
  "handle_new_project()",
  "handle_new_user()",
  "log_drawing_activity()",
  "log_drawing_link_activity()",
  "log_drawing_zone_activity()",
  "log_user_project_member_activity()",
  "notify_demo_request()",
  "notify_rfi_bic_handoff()",
  "org_protect_billing_columns()",
  "prevent_schedule_task_cycle()",
  "prevent_user_profile_role_change()",
  "schedule_task_rollup()",
  "seed_default_setup_items()",
  "seed_project_cost_codes()",
  "set_updated_at_model_elements()",
  "trg_projects_seed_handoff_items()",
  "vendors_set_org()",
  "rls_auto_enable()",
];

const retainedAuthenticatedFunctions = [
  "accept_invitation(uuid)",
  "create_organization(text, text)",
  "create_project(jsonb)",
  "delete_drawing_set(uuid)",
  "fab_release_blocking_rfis(uuid[])",
  "founding_org_id()",
  "get_invitation(uuid)",
  "get_my_project_role(uuid)",
  "get_next_sequence_number(uuid, text)",
  "publish_drawing_revision(uuid, text)",
  "set_for_drawing_is_locked(uuid)",
  "set_for_zone_is_locked(uuid)",
  "soft_delete_project(uuid)",
  "submittal_blocking_rfis(uuid)",
  "user_has_project_access(uuid)",
  "user_has_project_role(uuid, text)",
  "user_has_project_role_at_least(uuid, text)",
  "user_is_org_member(uuid)",
  "user_is_project_admin(uuid)",
  "user_is_system_admin()",
  "user_org_role_at_least(uuid, text)",
  "users_share_org(uuid, uuid)",
];

const revokeLine = (signature) =>
  `revoke all on function public.${signature} from public, anon, authenticated, service_role;`;

describe("Security Definer execution restrictions migration", () => {
  it("does not grant SECURITY DEFINER execution to PUBLIC or anon", () => {
    expect(migration).not.toMatch(
      /grant\s+execute\s+on\s+function[^;]+\s+to\s+(?:public|anon)\s*;/i,
    );

    expect(migration.match(/grant\s+execute\s+on\s+function/gi)).toHaveLength(
      retainedAuthenticatedFunctions.length + 1,
    );
  });

  it("locks every trigger-only SECURITY DEFINER function from API roles", () => {
    for (const signature of triggerOnlyFunctions) {
      expect(migration).toContain(revokeLine(signature));
      expect(migration).not.toMatch(
        new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+public\\.${signature.replace(/[()[\], ]/g, "\\$&")}\\s+to\\s+(?:anon|authenticated|service_role)`,
          "i",
        ),
      );
    }
  });

  it("denies maintenance RPCs and keeps the quota RPC service-role-only", () => {
    for (const signature of [
      "escalate_rfi_sla()",
      "reconcile_stuck_extractions()",
    ]) {
      expect(migration).toContain(revokeLine(signature));
      expect(migration).not.toMatch(
        new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+public\\.${signature.replace(/[()[\], ]/g, "\\$&")}\\s+to\\s+(?:anon|authenticated)`,
          "i",
        ),
      );
    }

    const quota = "get_llm_usage_window(uuid, timestamptz)";
    expect(migration).toContain(revokeLine(quota));
    expect(migration).toContain(
      `grant execute on function public.${quota} to service_role;`,
    );
    expect(migration).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.get_llm_usage_window\([^;]+\)\s+to\s+(?:anon|authenticated)\s*;/i,
    );
  });

  it("matches the explicitly retained authenticated RPC catalog", () => {
    const actual = [
      ...migration.matchAll(
        /grant\s+execute\s+on\s+function\s+public\.([^;]+?)\s+to\s+authenticated\s*;/gi,
      ),
    ].map((match) => match[1]);

    expect(actual).toEqual(retainedAuthenticatedFunctions);
  });
});
