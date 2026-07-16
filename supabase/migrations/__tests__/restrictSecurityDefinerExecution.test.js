import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "..", "20260715235514_restrict_security_definer_execution.sql"),
  "utf8",
);

const internalFunctions = [
  "escalate_rfi_sla()",
  "reconcile_stuck_extractions()",
  "raise_if_drawing_set_locked(uuid)",
  "recompute_schedule_summary(uuid)",
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

const authenticatedFunctions = [
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

const revokeLine = (identity) =>
  "revoke all on function public." +
  identity +
  " from public, anon, authenticated, service_role;";
const grantLine = (identity, role) =>
  "grant execute on function public." + identity + " to " + role + ";";

describe("SECURITY DEFINER execution migration contract", () => {
  it("does not grant direct execution to PUBLIC or anon", () => {
    expect(migration).not.toMatch(
      /grant\\s+execute\\s+on\\s+function[^;]+\\s+to\\s+(?:public|anon)\\s*;/i,
    );
  });

  it("denies direct execution for every internal trigger and maintenance function", () => {
    for (const identity of internalFunctions) {
      expect(migration).toContain(revokeLine(identity));
    }
  });

  it("keeps browser and RLS helper execution authenticated-only", () => {
    for (const identity of authenticatedFunctions) {
      expect(migration).toContain(revokeLine(identity));
      expect(migration).toContain(grantLine(identity, "authenticated"));
    }
  });

  it("keeps the LLM quota aggregate service-role-only", () => {
    const identity = "get_llm_usage_window(uuid, timestamptz)";
    expect(migration).toContain(revokeLine(identity));
    expect(migration).toContain(grantLine(identity, "service_role"));
    expect(migration).not.toContain(grantLine(identity, "anon"));
    expect(migration).not.toContain(grantLine(identity, "authenticated"));
  });

  it("does not include the frozen hard-delete RPCs", () => {
    expect(migration).not.toMatch(/hard_delete_(organization|project)/);
  });

  it("contains only the explicit authenticated catalog plus service-role quota grant", () => {
    expect(migration.match(/grant\\s+execute\\s+on\\s+function/gi)).toHaveLength(
      authenticatedFunctions.length + 1,
    );
  });
});
