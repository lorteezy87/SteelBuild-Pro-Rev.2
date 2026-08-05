-- Restrict high-impact fabrication release status transitions to elevated roles.
-- Keeps existing member access for other updates while blocking low-privilege users
-- from setting status='Released for Fabrication'.

CREATE POLICY submittals_released_for_fab_requires_elevated_role
ON public.submittals
AS RESTRICTIVE
FOR UPDATE
TO authenticated
WITH CHECK (
  status <> 'Released for Fabrication'
  OR public.get_my_project_role(project_id) = ANY (ARRAY['owner','admin','project_manager','reviewer'])
);

CREATE POLICY submittal_rounds_released_for_fab_requires_elevated_role
ON public.submittal_rounds
AS RESTRICTIVE
FOR UPDATE
TO authenticated
WITH CHECK (
  status <> 'Released for Fabrication'
  OR public.get_my_project_role(project_id) = ANY (ARRAY['owner','admin','project_manager','reviewer'])
);
