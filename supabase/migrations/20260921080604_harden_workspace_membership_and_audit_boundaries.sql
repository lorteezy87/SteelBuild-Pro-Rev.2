-- Follow-up to the owner-approved #460 release. STAGING VALIDATION REQUIRED.
-- Based on downloaded production definitions on 2026-09-21; preserve shared callers.
-- Apply/stamp exact SQL manually after approval. Never use db push on the shared DB.
SET LOCAL lock_timeout = '5s';

-- Verified live gaps only. Existing PM-only sign-off/zone/link policies and
-- field-only revision-delta policies are stronger than the audit snapshot.
-- Retain permissive project visibility; restrict writes independently.
DO $policies$
DECLARE table_name text; predicate text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['drawing_analyses','drawing_findings','external_linked_folders','email_accounts','email_messages','email_attachments'] LOOP
    predicate := CASE WHEN table_name = 'drawing_findings' THEN
      'EXISTS (SELECT 1 FROM public.drawing_analyses a WHERE a.id = analysis_id AND public.user_has_project_access(a.project_id) AND public.user_has_project_role_at_least(a.project_id, ''field''))'
    ELSE
      'public.user_has_project_access(project_id) AND public.user_has_project_role_at_least(project_id, ''field'')'
    END;
    EXECUTE format('CREATE POLICY launch_field_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)', table_name, predicate);
    EXECUTE format('CREATE POLICY launch_field_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', table_name, predicate, predicate);
    EXECUTE format('CREATE POLICY launch_field_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)', table_name, predicate);
  END LOOP;
END $policies$;

CREATE OR REPLACE FUNCTION public.enforce_org_member_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_org uuid; v_plan text; v_limit int; v_count int;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'Workspace membership identity cannot be changed' USING ERRCODE = '23514';
  END IF;
  v_org := CASE WHEN TG_OP = 'DELETE' THEN OLD.org_id ELSE NEW.org_id END;
  -- Serialize membership changes for this org, including two concurrent owner removals.
  SELECT plan INTO v_plan FROM public.organizations WHERE id = v_org FOR UPDATE;
  -- A parent-org cascade is authorized by the org deletion boundary.
  IF NOT FOUND AND TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE org_id = NEW.org_id AND user_id = NEW.user_id) THEN
      v_limit := public.plan_member_limit(v_plan);
      IF v_limit IS NOT NULL THEN
        SELECT count(*) INTO v_count FROM public.organization_members WHERE org_id = NEW.org_id;
        IF v_count >= v_limit THEN
          RAISE EXCEPTION 'Workspace is at its plan member limit (%). Upgrade to add more members.', v_limit USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END IF;
  ELSIF OLD.role = 'owner' AND (TG_OP = 'DELETE' OR NEW.role <> 'owner') THEN
    IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE org_id = OLD.org_id AND role = 'owner' AND user_id <> OLD.user_id) THEN
      RAISE EXCEPTION 'Cannot remove the last owner of the workspace' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.enforce_org_member_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_enforce_org_member_guard ON public.organization_members;
CREATE TRIGGER trg_enforce_org_member_guard BEFORE INSERT OR UPDATE OR DELETE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_org_member_guard();

ALTER POLICY org_members_delete ON public.organization_members USING (
  (public.user_org_role_at_least(org_id, 'admin') OR user_id = (select auth.uid()))
  AND (role <> 'owner' OR public.user_org_role_at_least(org_id, 'owner'))
);
-- Invitees with a link still use get_invitation/accept_invitation. Listing bearer
-- invitation tokens is an administrative operation, not a general member read.
ALTER POLICY org_invites_select ON public.organization_invitations
USING (public.user_org_role_at_least(org_id, 'admin'));

CREATE OR REPLACE FUNCTION public.log_backcharge_event(p_backcharge_id uuid, p_event_type text, p_from text, p_to text, p_detail text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_project uuid; v_previous text;
BEGIN
  SELECT project_id INTO v_project FROM public.backcharges WHERE id = p_backcharge_id;
  IF v_project IS NULL OR (coalesce(auth.role(), '') <> 'service_role' AND NOT (
    public.user_has_project_access(v_project) AND public.user_has_project_role_at_least(v_project, 'pm')
  )) THEN
    RAISE EXCEPTION 'Not authorized to record this backcharge event' USING ERRCODE = '42501';
  END IF;
  v_previous := current_setting('steelbuild.bc_rpc', true);
  PERFORM set_config('steelbuild.bc_rpc', 'on', true);
  INSERT INTO public.backcharge_events (backcharge_id, project_id, event_type, from_status, to_status, detail, actor)
  VALUES (p_backcharge_id, v_project, p_event_type, p_from, p_to, nullif(p_detail, ''), auth.uid());
  PERFORM set_config('steelbuild.bc_rpc', coalesce(v_previous, ''), true);
END
$function$;

CREATE OR REPLACE FUNCTION public.log_transmittal_event(p_project_id uuid, p_transmittal_id uuid, p_event text, p_from text, p_to text, p_reason text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_project uuid;
BEGIN
  SELECT project_id INTO v_project FROM public.drawing_transmittals WHERE id = p_transmittal_id;
  IF v_project IS NULL OR v_project IS DISTINCT FROM p_project_id OR
     (coalesce(auth.role(), '') <> 'service_role' AND NOT (
       public.user_has_project_access(v_project) AND public.user_has_project_role_at_least(v_project, 'pm')
     )) THEN
    RAISE EXCEPTION 'Not authorized to record this transmittal event' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.drawing_transmittal_activity (project_id, transmittal_id, event_type, actor_id, actor_name, from_status, to_status, reason, metadata)
  VALUES (v_project, p_transmittal_id, p_event, (select auth.uid()),
    (select coalesce(nullif(btrim(up.full_name), ''), up.email) from public.user_profiles up where up.id = (select auth.uid())),
    p_from, p_to, nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_metadata, '{}'::jsonb));
END
$function$;

CREATE OR REPLACE FUNCTION public.evaluate_fab_release_package(p_drawing_ids uuid[])
 RETURNS TABLE(kind text, title text, sheet_numbers text[], rfi_numbers text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rfis text[];
  v_rejected text[];
  v_superseded text[];
  v_unresolved text[];
  v_not_ifc text[];
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND (
    auth.uid() IS NULL OR EXISTS (
      SELECT 1 FROM unnest(coalesce(p_drawing_ids, '{}'::uuid[])) requested(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.drawings d
        WHERE d.id = requested.id AND public.user_has_project_access(d.project_id)
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to evaluate this package' USING ERRCODE = '42501';
  END IF;
  -- Open RFIs
  SELECT coalesce(array_agg(DISTINCT b.rfi_number) FILTER (WHERE b.rfi_number IS NOT NULL), '{}')
    INTO v_rfis
  FROM public.fab_release_blocking_rfis(coalesce(p_drawing_ids, '{}')) b;

  IF array_length(v_rfis, 1) IS NOT NULL THEN
    kind := 'open_rfis';
    title := format('%s open RFI(s) reference this package', array_length(v_rfis, 1));
    sheet_numbers := '{}';
    rfi_numbers := v_rfis;
    RETURN NEXT;
  END IF;

  -- Rejected / R&R sheets (sheet fields + legacy status vocabulary)
  SELECT coalesce(array_agg(d.sheet_number ORDER BY d.sheet_number)
                    FILTER (WHERE d.sheet_number IS NOT NULL), '{}')
    INTO v_rejected
  FROM public.drawings d
  WHERE d.id = ANY (coalesce(p_drawing_ids, '{}'))
    AND d.is_deleted IS DISTINCT FROM true
    AND lower(coalesce(d.stage,'') || ' ' || coalesce(d.set_approval_status,'') || ' ' || coalesce(d.ifc_status,''))
          ~ '(reject|revise|resubmit|returned|r&r)';

  IF array_length(v_rejected, 1) IS NOT NULL THEN
    kind := 'rejected_sheets';
    title := format('%s rejected / revise-and-resubmit sheet(s)', array_length(v_rejected, 1));
    sheet_numbers := v_rejected;
    rfi_numbers := '{}';
    RETURN NEXT;
  END IF;

  -- Superseded sheets
  SELECT coalesce(array_agg(d.sheet_number ORDER BY d.sheet_number)
                    FILTER (WHERE d.sheet_number IS NOT NULL), '{}')
    INTO v_superseded
  FROM public.drawings d
  WHERE d.id = ANY (coalesce(p_drawing_ids, '{}'))
    AND d.is_deleted IS DISTINCT FROM true
    AND d.is_superseded IS TRUE;

  IF array_length(v_superseded, 1) IS NOT NULL THEN
    kind := 'revision_conflict';
    title := format('%s sheet(s) with a superseded revision', array_length(v_superseded, 1));
    sheet_numbers := v_superseded;
    rfi_numbers := '{}';
    RETURN NEXT;
  END IF;

  -- Unresolved current revision
  SELECT coalesce(array_agg(d.sheet_number ORDER BY d.sheet_number)
                    FILTER (WHERE d.sheet_number IS NOT NULL), '{}')
    INTO v_unresolved
  FROM public.drawings d
  WHERE d.id = ANY (coalesce(p_drawing_ids, '{}'))
    AND d.is_deleted IS DISTINCT FROM true
    AND d.is_superseded IS DISTINCT FROM true
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.drawing_revisions r
        WHERE r.drawing_id = d.id
          AND r.is_current = true
          AND r.archived_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.drawing_revisions r
        WHERE r.drawing_id = d.id
          AND r.is_current = true
          AND r.archived_at IS NULL
          AND r.release_status IN ('on_hold', 'void', 'pending_review')
      )
    );

  IF array_length(v_unresolved, 1) IS NOT NULL THEN
    kind := 'unresolved_revision';
    title := format('%s sheet(s) with an unresolved current revision', array_length(v_unresolved, 1));
    sheet_numbers := v_unresolved;
    rfi_numbers := '{}';
    RETURN NEXT;
  END IF;

  -- Slice 8: not IFC / Released (reuse piece_control_drawing_is_approved)
  SELECT coalesce(array_agg(d.sheet_number ORDER BY d.sheet_number)
                    FILTER (WHERE d.sheet_number IS NOT NULL), '{}')
    INTO v_not_ifc
  FROM public.drawings d
  WHERE d.id = ANY (coalesce(p_drawing_ids, '{}'))
    AND d.is_deleted IS DISTINCT FROM true
    AND d.is_superseded IS DISTINCT FROM true
    AND NOT public.piece_control_drawing_is_approved(d.id)
    AND lower(coalesce(d.stage,'') || ' ' || coalesce(d.set_approval_status,'') || ' ' || coalesce(d.ifc_status,''))
          !~ '(reject|revise|resubmit|returned|r&r)';

  IF array_length(v_not_ifc, 1) IS NOT NULL THEN
    kind := 'not_ifc_ready';
    title := format('%s sheet(s) not IFC / Released for fabrication', array_length(v_not_ifc, 1));
    sheet_numbers := v_not_ifc;
    rfi_numbers := '{}';
    RETURN NEXT;
  END IF;

  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.work_package_drawing_set_reports(p_work_package_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_project_id uuid; v_set_id uuid; v_eval jsonb; v_reports jsonb := '[]'::jsonb;
begin
  select project_id into v_project_id from public.work_packages where id = p_work_package_id;
  if v_project_id is null or
     (coalesce(auth.role(), '') <> 'service_role' and not public.user_has_project_access(v_project_id)) then
    raise exception 'Not authorized to evaluate this work package' using errcode = '42501';
  end if;
  for v_set_id in
    with scope as (
      select piece.id from public.pieces piece
       where piece.project_id = v_project_id and piece.work_package_id = p_work_package_id
         and piece.deleted_at is null and piece.is_deleted = false
         and piece.lifecycle_status not in ('shipped', 'delivered', 'erected')
         and not exists (select 1 from public.pieces child where child.parent_piece_id = piece.id and child.deleted_at is null and child.is_deleted = false)
    )
    select distinct s.set_id from (
      select d.drawing_set_id as set_id
        from public.piece_drawings pd join scope on scope.id = pd.piece_id
        join public.drawings d on d.id = pd.drawing_id and d.is_deleted = false and d.deleted_at is null
       where pd.project_id = v_project_id
      union
      select pds.drawing_set_id from public.piece_drawing_sets pds join scope on scope.id = pds.piece_id where pds.project_id = v_project_id
    ) s
    join public.drawing_sets ds on ds.id = s.set_id and ds.is_deleted = false
    order by 1
  loop
    v_eval := public.evaluate_fab_release_set(v_project_id, v_set_id);
    v_reports := v_reports || jsonb_build_object(
      'drawing_set_id', v_set_id, 'set_name', v_eval ->> 'set_name', 'ok', coalesce((v_eval ->> 'ok')::boolean, false),
      'governing_stage', v_eval ->> 'governing_stage', 'submittal_id', v_eval -> 'submittal_id', 'submittal_number', v_eval -> 'submittal_number',
      'blockers', coalesce(v_eval -> 'blockers', '[]'::jsonb), 'sheet_count', v_eval -> 'sheet_count');
  end loop;
  return v_reports;
end
$function$;

CREATE OR REPLACE FUNCTION public.piece_control_drawing_is_approved(p_drawing_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select case when coalesce(auth.role(), '') = 'service_role' or public.user_has_project_access(d.project_id)
      then (public.evaluate_fab_release_set(d.project_id, d.drawing_set_id) ->> 'governing_stage') in ('IFC', 'Released')
      else false end
      from public.drawings d
     where d.id = p_drawing_id and d.is_deleted = false and d.deleted_at is null and d.is_superseded = false and d.drawing_set_id is not null
  ), false);
$function$;


REVOKE ALL ON FUNCTION public.log_backcharge_event(uuid,text,text,text,text),
  public.log_transmittal_event(uuid,uuid,text,text,text,text,jsonb),
  public.evaluate_fab_release_package(uuid[]),
  public.work_package_drawing_set_reports(uuid),
  public.piece_control_drawing_is_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_backcharge_event(uuid,text,text,text,text),
  public.log_transmittal_event(uuid,uuid,text,text,text,text,jsonb),
  public.evaluate_fab_release_package(uuid[]),
  public.work_package_drawing_set_reports(uuid),
  public.piece_control_drawing_is_approved(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
