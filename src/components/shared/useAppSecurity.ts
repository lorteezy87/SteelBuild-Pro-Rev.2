/**
 * useAppSecurity.ts
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
import { AuthContext, type AppUser } from "@/lib/AuthContext";

type Stampable = Record<string, unknown> & {
  created_by?: unknown;
  created_uid?: unknown;
};

type ProjectScoped = Record<string, unknown> & {
  project_id?: unknown;
};

export function useAppSecurity() {
  // Use useContext directly to avoid throwing if AuthProvider is not mounted.
  const authCtx = useContext(AuthContext);

  // Identity comes ONLY from AuthContext / Supabase session — never from
  // localStorage identity leftovers (current_user_email / current_user_id),
  // which are stale Base44-era keys and are not an authorization source.
  const user = authCtx?.user ?? null;
  const isAuthenticated = Boolean(authCtx?.isAuthenticated && user);

  const stamp = useCallback(<T extends Stampable>(data: T) => {
    return {
      ...data,
      created_by: data.created_by || user?.email || "unknown",
      created_uid: data.created_uid || user?.id || null,
    };
  }, [user]);

  const assertProjectId = useCallback(<T extends ProjectScoped>(data: T, activeProjectIdArg?: string | null) => {
    if (!activeProjectIdArg) return data;
    if (data.project_id && data.project_id !== activeProjectIdArg) {
      console.warn(
        "[Security] project_id mismatch on write — forcing to active project",
        { provided: data.project_id, active: activeProjectIdArg },
      );
    }
    return { ...data, project_id: activeProjectIdArg };
  }, []);

  return {
    user: (isAuthenticated ? user : null) as AppUser | null,
    stamp,
    assertProjectId,
  };
}
