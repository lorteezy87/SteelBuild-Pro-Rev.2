/**
 * permissions.ts — Server-authoritative permission model.
 *
 * Sole client-side authorization resolver in the UI.
 * Authorization is combined from:
 * - `user_profiles.role` (global account role),
 * - `get_my_project_role(project_id)` (active-project role) with global-admin override.
 *
 * Frontend checks are intentional display behavior only:
 * - `can()` and `canPerform()` gate what the UI enables.
 * - RLS and RPC policies still block unauthorized reads/writes.
 * - Workflow transitions remain validated by `validateTransition()`.
 *
 * Usage:
 *   import { usePermissions } from "@/services/permissions";
 *   const { role, can, canTransition } = usePermissions();
 *   if (!can("edit", "change_order")) { /* show read-only UI * / }
 */

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useProjectId } from "@/hooks/useProjectId";
import { useProjectRole } from "@/hooks/useProjectRole";
import { validateTransition, type TransitionResult } from "./workflowEngine";
import type { AppRole, PermissionAction } from "@/types/rbac";

// ─── Role hierarchy ─────────────────────────────────────────────────────
// Privilege rank (lower = more privileged). This table must cover BOTH role
// vocabularies, because canPerform is fed whichever role usePermissions resolves:
//   • PROJECT user_projects.role  → 'owner' | 'admin' | 'pm' | 'field' | 'viewer'
//     (the primary gate — the user's role in the active project)
//   • GLOBAL  user_profiles.role  → 'admin' | 'user'
//     (admin overrides to admin everywhere; 'user' is the no-active-project fallback)
// 'owner' mirrors 'admin'. A global 'user' maps to PM-level (full create/edit/
// approve/export/view; delete/void/bulk_delete reserved for admins) — used only
// when no project is active. This gate is display-only — the authoritative
// guards are RLS and workflowEngine.validateTransition.
const ROLE_RANK: Record<AppRole, number> & Record<string, number> = {
  owner: 0,
  admin: 0,
  pm: 1,
  user: 1,
  field: 2,
  viewer: 3,
};

const ACTION_FLOORS: Record<string, AppRole> = {
  // entity-agnostic action → minimum role
  create:      "pm",
  edit:        "pm",
  delete:      "admin",
  bulk_update: "pm",
  bulk_delete: "admin",
  approve:     "pm",
  void:        "admin",
  export:      "field",
  view:        "viewer",
};

// Entity-specific overrides (entity:action → minRole)
const ENTITY_OVERRIDES: Record<string, AppRole> = {
  "delivery:create":      "field",
  "delivery:edit":        "field",
  "expense:create":       "field",
  "expense:edit":         "field",
  "rfi:create":           "field",
  "rfi:edit":             "field",
  "drawing:create":       "pm",
  "drawing:delete":       "pm",
  "change_order:approve": "pm",
  "change_order:void":    "admin",
  // budget_hour_items RLS: INSERT/UPDATE/DELETE = user_has_project_role_at_least(project_id,'pm').
  // create/edit already floor at pm; delete would default to admin, so the override
  // lets a project PM delete (soft-delete) a scope item, matching the DB boundary.
  "budget_hour_item:create": "pm",
  "budget_hour_item:edit":   "pm",
  "budget_hour_item:delete": "pm",
};

// ─── Pure permission check ──────────────────────────────────────────────
/**
 * Resolve whether `role` may perform `action` on an optional `entity`.
 * UI gating only — the authoritative guard is workflowEngine.validateTransition.
 *
 * Lower rank = more privileged; you may act when your rank is at least as
 * privileged as the floor. Entity-specific overrides win over the
 * entity-agnostic action floor. Unknown roles get rank 99 (deny); unknown
 * actions fall back to an admin-only floor.
 */
export function canPerform(
  role: string | null | undefined,
  action: string,
  entity: string | null = null,
): boolean {
  const roleRank = ROLE_RANK[role as string] ?? 99;
  if (entity) {
    const overrideFloor = ENTITY_OVERRIDES[`${entity}:${action}`];
    if (overrideFloor) return roleRank <= (ROLE_RANK[overrideFloor] ?? 0);
  }
  const floor = ACTION_FLOORS[action] || "admin";
  return roleRank <= (ROLE_RANK[floor] ?? 0);
}

// ─── Server role fetcher ────────────────────────────────────────────────

interface UserInfo {
  role: string;
  email: string | null;
  id: string | null;
}

async function fetchUserRole(): Promise<UserInfo> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { role: "viewer", email: null, id: null };

  // user_profiles is the server source of truth.
  // Pre-existing bug: this was `.eq("user_id", user.id)`, but the table's
  // primary key column is `id` (mirrors auth.users.id) — there is no
  // `user_profiles.user_id` column, so the previous lookup always returned
  // null and the hook silently fell through to "viewer". Fixed in RBAC Phase B.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    role: profile?.role || "viewer",
    email: user.email ?? null,
    id: user.id,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────

export function usePermissions() {
  const { data: userInfo } = useQuery({
    queryKey: ["user-permissions"],
    queryFn: fetchUserRole,
    staleTime: 5 * 60 * 1000, // re-fetch every 5 minutes
    initialData: { role: "viewer", email: null, id: null } as UserInfo,
  });

  // The authoritative UI gate is the user's role IN THE ACTIVE PROJECT
  // (owner/admin/pm/field/viewer), not their global account role — a project
  // viewer should see read-only controls even if their global role is "user".
  // A GLOBAL admin overrides to admin everywhere. With no active project
  // (portfolio / admin screens) fall back to the global role so those UIs
  // aren't over-restricted. Still display-only — RLS + validateTransition are
  // the authoritative guards.
  const projectId = useProjectId();
  const { role: projectRole } = useProjectRole(projectId);

  const globalRole = userInfo?.role || "viewer";
  const isGlobalAdmin = globalRole === "admin";
  const role = isGlobalAdmin
    ? "admin"
    : projectId
      ? (projectRole ?? "viewer")
      : globalRole;
  // Keep least-privilege display behavior while project role data is loading.
  const roleRank = ROLE_RANK[role] ?? 99;

  /**
   * Can the current user perform an action on an entity? Resolved against the
   * effective per-project role above. UI gating only — the real guard is RLS +
   * workflowEngine.validateTransition.
   */
  const can = useCallback(
    (action: PermissionAction, entity: string | null = null): boolean =>
      canPerform(role, action, entity),
    [role]
  );

  /**
   * Can the current user trigger a specific workflow transition?
   * Delegates to workflowEngine.validateTransition for the real check.
   */
  const canTransition = useCallback(
    (
      workflowName: string,
      fromStatus: string,
      toStatus: string,
      record: Record<string, any> = {},
    ): TransitionResult => {
      return validateTransition(workflowName, fromStatus, toStatus, {
        user: userInfo,
        record,
      });
    },
    [userInfo]
  );

  /**
   * Is the current user a GLOBAL system admin (user_profiles.role === 'admin')?
   * Distinct from a per-project admin — use this for app-level admin gates.
   */
  const isAdmin = useMemo(() => isGlobalAdmin, [isGlobalAdmin]);

  return {
    role,
    email: userInfo?.email,
    userId: userInfo?.id,
    user: userInfo,
    can,
    canTransition,
    isAdmin,
    roleRank,
  };
}
