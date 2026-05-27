-- 20260526200000_rls_consolidate_batch2.sql (Batch 2-safe)
--
-- Second batch of multiple_permissive_policies cleanup, for the tables whose
-- overlapping policies have DIFFERENT (not duplicate) conditions. Each rewrite
-- below is logic-preserving: permissive policies for a (role, action) are OR'd
-- by Postgres, so merging two into one with OR'd conditions -- or splitting a
-- FOR ALL into the write commands only -- yields byte-identical access. Verified
-- against pg_policies (5 -> 2 findings). user_projects is intentionally left for
-- a separate change (its INSERT policy needs a security review). Applied live via
-- Supabase MCP (user-confirmed) 2026-05-26.

-- projects: two SELECT policies (project member, system admin) -> one.
DROP POLICY IF EXISTS project_select ON public.projects;
DROP POLICY IF EXISTS project_select_system_admin ON public.projects;
CREATE POLICY project_select ON public.projects
  FOR SELECT TO authenticated
  USING (user_has_project_access(id) OR user_is_system_admin());

-- default_cost_codes: the public read policy (USING true) already covers SELECT,
-- so the admin FOR ALL policy's SELECT arm is the redundant overlap. Replace the
-- FOR ALL with write-only (INSERT/UPDATE/DELETE) admin policies; SELECT is then
-- served solely by default_cost_codes_read (was true OR admin = true; now true).
DROP POLICY IF EXISTS default_cost_codes_admin_write ON public.default_cost_codes;
CREATE POLICY default_cost_codes_admin_insert ON public.default_cost_codes
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles
                      WHERE user_profiles.id = (SELECT auth.uid())
                        AND user_profiles.role = 'admin'));
CREATE POLICY default_cost_codes_admin_update ON public.default_cost_codes
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles
                 WHERE user_profiles.id = (SELECT auth.uid())
                   AND user_profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles
                      WHERE user_profiles.id = (SELECT auth.uid())
                        AND user_profiles.role = 'admin'));
CREATE POLICY default_cost_codes_admin_delete ON public.default_cost_codes
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles
                 WHERE user_profiles.id = (SELECT auth.uid())
                   AND user_profiles.role = 'admin'));

-- feature_flags: same pattern; public read (true) + admin FOR ALL overlap on
-- SELECT. Split the admin policy into write-only commands.
DROP POLICY IF EXISTS feature_flags_admin_write ON public.feature_flags;
CREATE POLICY feature_flags_admin_insert ON public.feature_flags
  FOR INSERT TO authenticated
  WITH CHECK (user_is_system_admin());
CREATE POLICY feature_flags_admin_update ON public.feature_flags
  FOR UPDATE TO authenticated
  USING (user_is_system_admin())
  WITH CHECK (user_is_system_admin());
CREATE POLICY feature_flags_admin_delete ON public.feature_flags
  FOR DELETE TO authenticated
  USING (user_is_system_admin());

NOTIFY pgrst, 'reload schema';
