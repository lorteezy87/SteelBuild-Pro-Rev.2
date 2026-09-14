-- Adopt production's access model for change requests, drawing revisions and
-- project closeout. Production replaced Rev.2's restrictive PM floors and
-- generic project_* policies on these tables with per-table policies (sibling
-- app m3, m16 and m25), and the owner decided on 2026-09-14 that FIELD users
-- keep creating change requests. This reproduces production's policies and
-- table grants exactly, so fresh Rev.2 environments match it. In production
-- it changes nothing.
SET LOCAL lock_timeout = '5s';

DO $drop_superseded$
DECLARE
  t text;
  p text;
BEGIN
  FOREACH t IN ARRAY ARRAY['change_requests', 'drawing_revisions', 'project_closeout'] LOOP
    FOREACH p IN ARRAY ARRAY[t || '_ins_role_floor', t || '_upd_role_floor', t || '_del_role_floor',
        'project_select', 'project_insert', 'project_update', 'project_delete'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
    END LOOP;
  END LOOP;
END;
$drop_superseded$;
DROP POLICY IF EXISTS drawing_revisions_project_access ON public.drawing_revisions;

DROP POLICY IF EXISTS change_requests_select ON public.change_requests;
CREATE POLICY change_requests_select ON public.change_requests FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
DROP POLICY IF EXISTS change_requests_insert ON public.change_requests;
CREATE POLICY change_requests_insert ON public.change_requests FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'field'));
DROP POLICY IF EXISTS change_requests_update ON public.change_requests;
CREATE POLICY change_requests_update ON public.change_requests FOR UPDATE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'pm'))
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'));

DROP POLICY IF EXISTS drawing_revisions_select ON public.drawing_revisions;
CREATE POLICY drawing_revisions_select ON public.drawing_revisions FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
DROP POLICY IF EXISTS drawing_revisions_insert ON public.drawing_revisions;
CREATE POLICY drawing_revisions_insert ON public.drawing_revisions FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'));
DROP POLICY IF EXISTS drawing_revisions_update ON public.drawing_revisions;
CREATE POLICY drawing_revisions_update ON public.drawing_revisions FOR UPDATE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'pm'))
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'));

DROP POLICY IF EXISTS project_closeout_select ON public.project_closeout;
CREATE POLICY project_closeout_select ON public.project_closeout FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
DROP POLICY IF EXISTS project_closeout_insert ON public.project_closeout;
CREATE POLICY project_closeout_insert ON public.project_closeout FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'));
DROP POLICY IF EXISTS project_closeout_update ON public.project_closeout;
CREATE POLICY project_closeout_update ON public.project_closeout FOR UPDATE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'pm'))
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'));

REVOKE ALL ON TABLE public.change_requests, public.drawing_revisions, public.project_closeout FROM anon;
REVOKE DELETE ON TABLE public.change_requests FROM authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.project_closeout FROM authenticated;

NOTIFY pgrst, 'reload schema';
