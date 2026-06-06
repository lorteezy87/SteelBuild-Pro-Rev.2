-- Restore role-differentiated write gates on tables the 20260526190000 RLS
-- consolidation collapsed to a single membership-only project_member_access
-- (FOR ALL). Under that collapsed state a `viewer` (read-only role) could
-- INSERT/UPDATE/DELETE budgeted labor hours, the risk register, and the
-- submittal approval workflow — defeating the role model and the cost rules.
--
-- Reads stay open to every project member; writes are role-gated:
--   budget_hour_items (financial)         -> PM and above
--   risks                                 -> field and above (exclude viewer)
--   submittal_rounds / _sheet_responses   -> field and above (exclude viewer;
--                                            also un-breaks PM, who the older
--                                            admin-only gate had locked out)
--
-- Role levels in user_has_project_role_at_least: viewer 0, field 1, pm 2,
-- admin 3, owner 3.

-- ── budget_hour_items — PM+ writes ──────────────────────────────────────────
DROP POLICY IF EXISTS project_member_access ON public.budget_hour_items;
CREATE POLICY budget_hour_items_select ON public.budget_hour_items
  FOR SELECT TO authenticated USING (user_has_project_access(project_id));
CREATE POLICY budget_hour_items_insert ON public.budget_hour_items
  FOR INSERT TO authenticated WITH CHECK (user_has_project_role_at_least(project_id, 'pm'));
CREATE POLICY budget_hour_items_update ON public.budget_hour_items
  FOR UPDATE TO authenticated
  USING (user_has_project_role_at_least(project_id, 'pm'))
  WITH CHECK (user_has_project_role_at_least(project_id, 'pm'));
CREATE POLICY budget_hour_items_delete ON public.budget_hour_items
  FOR DELETE TO authenticated USING (user_has_project_role_at_least(project_id, 'pm'));

-- ── risks — field+ writes (exclude viewer) ──────────────────────────────────
DROP POLICY IF EXISTS project_member_access ON public.risks;
CREATE POLICY risks_select ON public.risks
  FOR SELECT TO authenticated USING (user_has_project_access(project_id));
CREATE POLICY risks_insert ON public.risks
  FOR INSERT TO authenticated WITH CHECK (user_has_project_role_at_least(project_id, 'field'));
CREATE POLICY risks_update ON public.risks
  FOR UPDATE TO authenticated
  USING (user_has_project_role_at_least(project_id, 'field'))
  WITH CHECK (user_has_project_role_at_least(project_id, 'field'));
CREATE POLICY risks_delete ON public.risks
  FOR DELETE TO authenticated USING (user_has_project_role_at_least(project_id, 'field'));

-- ── submittal_rounds — field+ writes ────────────────────────────────────────
DROP POLICY IF EXISTS project_member_access ON public.submittal_rounds;
CREATE POLICY submittal_rounds_select ON public.submittal_rounds
  FOR SELECT TO authenticated USING (user_has_project_access(project_id));
CREATE POLICY submittal_rounds_insert ON public.submittal_rounds
  FOR INSERT TO authenticated WITH CHECK (user_has_project_role_at_least(project_id, 'field'));
CREATE POLICY submittal_rounds_update ON public.submittal_rounds
  FOR UPDATE TO authenticated
  USING (user_has_project_role_at_least(project_id, 'field'))
  WITH CHECK (user_has_project_role_at_least(project_id, 'field'));
CREATE POLICY submittal_rounds_delete ON public.submittal_rounds
  FOR DELETE TO authenticated USING (user_has_project_role_at_least(project_id, 'field'));

-- ── submittal_sheet_responses — field+ writes ───────────────────────────────
DROP POLICY IF EXISTS project_member_access ON public.submittal_sheet_responses;
CREATE POLICY submittal_sheet_responses_select ON public.submittal_sheet_responses
  FOR SELECT TO authenticated USING (user_has_project_access(project_id));
CREATE POLICY submittal_sheet_responses_insert ON public.submittal_sheet_responses
  FOR INSERT TO authenticated WITH CHECK (user_has_project_role_at_least(project_id, 'field'));
CREATE POLICY submittal_sheet_responses_update ON public.submittal_sheet_responses
  FOR UPDATE TO authenticated
  USING (user_has_project_role_at_least(project_id, 'field'))
  WITH CHECK (user_has_project_role_at_least(project_id, 'field'));
CREATE POLICY submittal_sheet_responses_delete ON public.submittal_sheet_responses
  FOR DELETE TO authenticated USING (user_has_project_role_at_least(project_id, 'field'));

NOTIFY pgrst, 'reload schema';
