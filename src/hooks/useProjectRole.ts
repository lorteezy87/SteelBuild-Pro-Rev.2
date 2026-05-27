/**
 * useProjectRole — fetch the current user's role on a given project.
 *
 * RBAC Phase B: server-authoritative per-project role. Backed by the
 * SECURITY DEFINER `get_my_project_role(uuid)` RPC. The hook is the
 * authoritative source for project-scoped role; localStorage is only a
 * legacy fallback used elsewhere when there is no active project.
 *
 * `roleAtLeast` mirrors the SQL helper `user_has_project_role_at_least` —
 * 'owner' is treated as a synonym for 'admin' (level 3).
 */
import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { AuthContext } from "@/lib/AuthContext";

export type ProjectRole = "owner" | "admin" | "pm" | "field" | "viewer" | null;

const STALE = 5 * 60_000;

export function useProjectRole(projectId: string | null | undefined): {
  role: ProjectRole;
  isLoading: boolean;
} {
  // Read the auth context OPTIONALLY — not via useAuth(), which throws when no
  // AuthProvider is mounted. In production the app is always wrapped in
  // AuthProvider, so this is identical to useAuth(); reading the context
  // directly just lets usePermissions consumers render in tests / isolated
  // trees without an AuthProvider, degrading to "no user" (role → viewer).
  const auth = useContext(AuthContext);
  const userId = auth?.user?.id || null;
  const { data, isLoading } = useQuery({
    queryKey: ["project-role", userId, projectId],
    enabled: !!userId && !!projectId,
    staleTime: STALE,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_project_role", {
        p_project_id: projectId as string,
      });
      if (error) {
        console.error("[useProjectRole] RPC failed:", error.message);
        throw error;
      }
      return ((data as ProjectRole) ?? null) as ProjectRole;
    },
  });
  return { role: (data ?? "viewer") as ProjectRole, isLoading };
}

/**
 * Per-project role rank. Mirrors the SQL `user_has_project_role_at_least`
 * helper — 'owner' is treated as a synonym for 'admin' (level 3).
 *
 * Unknown roles, null, and undefined all rank below 'viewer' so they
 * fail any non-trivial check.
 */
const ROLE_LEVELS: Record<string, number> = {
  viewer: 0,
  field: 1,
  pm: 2,
  admin: 3,
  owner: 3,
};

export function roleAtLeast(
  role: string | null | undefined,
  min: string,
): boolean {
  const r = role ? ROLE_LEVELS[role] ?? -1 : -1;
  const m = ROLE_LEVELS[min] ?? Infinity;
  return r >= m;
}
