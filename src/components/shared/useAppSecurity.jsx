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

  const user = authCtx?.user || {
    email: typeof window !== "undefined" ? localStorage.getItem("current_user_email") : null,
    id: typeof window !== "undefined" ? localStorage.getItem("current_user_id") : null,
  };
  const isAuthenticated = authCtx ? authCtx.isAuthenticated : !!user.email;

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
