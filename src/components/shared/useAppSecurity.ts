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

export type Stampable = Record<string, unknown> & {
  created_by?: unknown;
  created_uid?: unknown;
};

export type ProjectScoped = Record<string, unknown> & {
  project_id?: unknown;
};

export type Stamped<T extends Stampable> = Omit<T, "created_by" | "created_uid"> & {
  created_by: T["created_by"] | string;
  created_uid: T["created_uid"] | string | null;
};

export type WithProjectId<T extends ProjectScoped> = Omit<T, "project_id"> & {
  project_id: string;
};

export type AppSecurity = {
  user: AppUser | null;
  stamp: <T extends Stampable>(data: T) => Stamped<T>;
  assertProjectId: {
    <T extends ProjectScoped>(data: T, activeProjectIdArg: string): WithProjectId<T>;
    <T extends ProjectScoped>(data: T, activeProjectIdArg?: null): T;
  };
};

export function useAppSecurity(): AppSecurity {
  // Use useContext directly to avoid throwing if AuthProvider is not mounted.
  const authCtx = useContext(AuthContext);

  // Identity comes ONLY from AuthContext / Supabase session — never from
  // localStorage identity leftovers (current_user_email / current_user_id),
  // which are stale Base44-era keys and are not an authorization source.
  const user = authCtx?.user ?? null;
  const isAuthenticated = Boolean(authCtx?.isAuthenticated && user);

  const stamp = useCallback(<T extends Stampable>(data: T): Stamped<T> => {
    return {
      ...data,
      created_by: data.created_by || user?.email || "unknown",
      created_uid: data.created_uid || user?.id || null,
    } as Stamped<T>;
  }, [user]);

  const assertProjectId = useCallback(<T extends ProjectScoped>(
    data: T,
    activeProjectIdArg?: string | null,
  ): T | WithProjectId<T> => {
    if (!activeProjectIdArg) return data;
    if (data.project_id && data.project_id !== activeProjectIdArg) {
      console.warn(
        "[Security] project_id mismatch on write — forcing to active project",
        { provided: data.project_id, active: activeProjectIdArg },
      );
    }
    return { ...data, project_id: activeProjectIdArg };
  }, []) as AppSecurity["assertProjectId"];

  return {
    user: (isAuthenticated ? user : null) as AppUser | null,
    stamp,
    assertProjectId,
  };
}
