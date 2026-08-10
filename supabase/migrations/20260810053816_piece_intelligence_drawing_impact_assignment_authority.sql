-- Task 7 follow-up: expose an assignment-only member roster to PM+ callers
-- without broadening user_projects SELECT, and enforce the same-project
-- assignee invariant for every direct drawing_impacts write.

CREATE OR REPLACE FUNCTION public.list_drawing_impact_assignees(
  p_project_id uuid
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  project_role text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'pm') THEN
    RAISE EXCEPTION
      'DRAWING_IMPACT_ASSIGNEES_FORBIDDEN: PM access is required for this project.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    up.user_id,
    COALESCE(
      NULLIF(BTRIM(profile.full_name), ''),
      NULLIF(BTRIM(profile.email), ''),
      up.user_id::text
    )::text AS display_name,
    up.role::text AS project_role
  FROM public.user_projects AS up
  LEFT JOIN public.user_profiles AS profile
    ON profile.id = up.user_id
  WHERE up.project_id = p_project_id
  ORDER BY
    LOWER(COALESCE(
      NULLIF(BTRIM(profile.full_name), ''),
      NULLIF(BTRIM(profile.email), ''),
      up.user_id::text
    )),
    up.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_drawing_impact_assignees(uuid)
  FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_drawing_impact_assignees(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_drawing_impact_assignee_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.user_projects AS up
       WHERE up.project_id = NEW.project_id
         AND up.user_id = NEW.assigned_to
     ) THEN
    RAISE EXCEPTION
      'DRAWING_IMPACT_ASSIGNEE_NOT_PROJECT_MEMBER: The assignee must belong to the drawing impact project.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drawing_impacts_assignee_membership
  ON public.drawing_impacts;
CREATE TRIGGER trg_drawing_impacts_assignee_membership
  BEFORE INSERT OR UPDATE ON public.drawing_impacts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_drawing_impact_assignee_membership();

REVOKE ALL ON FUNCTION public.enforce_drawing_impact_assignee_membership()
  FROM public, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
