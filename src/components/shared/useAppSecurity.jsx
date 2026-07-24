/**
 * useAppSecurity.jsx
 * Minimal identity + write-shaping helper for SteelBuild Pro.
 *
 * Authorization decisions do not live here:
 * - usePermissions() is the only UI authorization resolver.
 * - Supabase RLS/RPC is the authoritative gate for reads/writes.
 *
 * This hook intentionally provides only:
 * - current user identity (fallback-safe),
 * - `stamp()` for created_* defaults,
 * - `assertProjectId()` for write payload shaping.
 */

import { useCallback, useContext } from "react";
import { AuthContext } from "@/lib/AuthContext";

export function useAppSecurity() {
  // Use useContext directly to avoid throwing if AuthProvider is not mounted.
  const authCtx = useContext(AuthContext);

  // Identity comes ONLY from AuthContext / Supabase session — never from
  // localStorage identity leftovers (current_user_email / current_user_id),
  // which are stale Base44-era keys and are not an authorization source.
  const user = authCtx?.user ?? null;
  const isAuthenticated = Boolean(authCtx?.isAuthenticated && user);

  const stamp = useCallback((data) => {
    return {
      ...data,
      created_by: data.created_by || user?.email || "unknown",
      created_uid: data.created_uid || user?.id || null,
    };
  }, [user]);

  const assertProjectId = useCallback((data, activeProjectIdArg) => {
    if (!activeProjectIdArg) return data;
    if (data.project_id && data.project_id !== activeProjectIdArg) {
      console.warn(
        "[Security] project_id mismatch on write — forcing to active project",
        { provided: data.project_id, active: activeProjectIdArg }
      );
    }
    return { ...data, project_id: activeProjectIdArg };
  }, []);

  return {
    user: isAuthenticated ? user : null,
    stamp,
    assertProjectId,
  };
}
