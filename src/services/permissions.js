/**
 * permissions.js — Server-authoritative permission model.
 *
 * Problem: useAppSecurity stores roles in localStorage (bypassable).
 *          can() returns true for ALL authenticated users.
 *
 * Solution: Fetch role from user_profiles table (server truth).
 *           Frontend role logic is DISPLAY ONLY — never gates mutations.
 *           All mutation guards use validateTransition() which checks role.
 *
 * Usage:
 *   import { usePermissions } from "@/services/permissions";
 *   const { role, can, canTransition } = usePermissions();
 *   if (!can("edit", "change_order")) { /* show read-only UI * / }
 */

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { validateTransition } from "./workflowEngine";

// ─── Role hierarchy ─────────────────────────────────────────────────────
const ROLE_RANK = { admin: 0, pm: 1, field: 2, viewer: 3 };

const ACTION_FLOORS = {
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
const ENTITY_OVERRIDES = {
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
};

// ─── Server role fetcher ────────────────────────────────────────────────

async function fetchUserRole() {
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
    email: user.email,
    id: user.id,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────

export function usePermissions() {
  const { data: userInfo } = useQuery({
    queryKey: ["user-permissions"],
    queryFn: fetchUserRole,
    staleTime: 5 * 60 * 1000, // re-fetch every 5 minutes
    initialData: { role: "viewer", email: null, id: null },
  });

  const role = userInfo?.role || "viewer";
  const roleRank = ROLE_RANK[role] ?? 99;

  /**
   * Can the current user perform an action on an entity?
   * This is for UI gating only — the real guard is in workflowEngine.
   */
  const can = useCallback(
    (action, entity = null) => {
      // Check entity-specific override first
      if (entity) {
        const overrideKey = `${entity}:${action}`;
        const overrideFloor = ENTITY_OVERRIDES[overrideKey];
        if (overrideFloor) {
          return roleRank <= (ROLE_RANK[overrideFloor] ?? 0);
        }
      }
      // Fall back to action-level floor
      const floor = ACTION_FLOORS[action] || "admin";
      return roleRank <= (ROLE_RANK[floor] ?? 0);
    },
    [roleRank]
  );

  /**
   * Can the current user trigger a specific workflow transition?
   * Delegates to workflowEngine.validateTransition for the real check.
   */
  const canTransition = useCallback(
    (workflowName, fromStatus, toStatus, record = {}) => {
      return validateTransition(workflowName, fromStatus, toStatus, {
        user: userInfo,
        record,
      });
    },
    [userInfo]
  );

  /**
   * Is the current user an admin?
   */
  const isAdmin = useMemo(() => role === "admin", [role]);

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
