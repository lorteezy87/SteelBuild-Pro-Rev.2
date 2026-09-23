/**
 * useProjectRoleAtLeast — ask the database the exact question an RLS write
 * policy asks: `user_has_project_role_at_least(project_id, min_role)`.
 *
 * `useProjectRole` + `roleAtLeast` is close but not identical: the
 * `get_my_project_role` RPC returns an explicit `user_projects` role FIRST, so
 * an org owner/admin who was also added to the project as `pm` reads as `pm`,
 * while the SQL helper grants them admin. Use this hook where the UI must match
 * a policy exactly (e.g. email_accounts writes, SEC-N1).
 *
 * Display gating only — RLS is the authorization boundary. Fails closed:
 * no user, no project, loading or an RPC error all yield `allowed: false`.
 */
import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { AuthContext } from "@/lib/AuthContext";

export type ProjectRoleFloor = "viewer" | "field" | "pm" | "admin";

const STALE = 5 * 60_000;

export function useProjectRoleAtLeast(
  projectId: string | null | undefined,
  minRole: ProjectRoleFloor,
): { allowed: boolean; isLoading: boolean } {
  // Optional context read, as in useProjectRole: renders without a provider
  // degrade to "no user" rather than throwing.
  const auth = useContext(AuthContext);
  const userId = auth?.user?.id || null;
  const enabled = !!userId && !!projectId;
  const { data, isLoading } = useQuery({
    queryKey: ["project-role-at-least", userId, projectId, minRole],
    enabled,
    staleTime: STALE,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("user_has_project_role_at_least", {
        p_project_id: projectId as string,
        p_min_role: minRole,
      });
      if (error) {
        console.error("[useProjectRoleAtLeast] RPC failed:", error.message);
        throw error;
      }
      return data === true;
    },
  });
  return { allowed: data === true, isLoading: enabled && isLoading };
}
