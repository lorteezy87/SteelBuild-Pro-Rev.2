


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE SCHEMA IF NOT EXISTS "storage";


ALTER SCHEMA "storage" OWNER TO "supabase_admin";


CREATE TYPE "storage"."buckettype" AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


ALTER TYPE "storage"."buckettype" OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "public"."accept_invitation"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid; v_email text; v_inv record; v_result jsonb; v_plan text; v_limit int; v_count int;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;
  select email into v_email from auth.users where id = v_uid;

  select * into v_inv from public.organization_invitations where token = p_token;
  if v_inv.id is null then raise exception 'Invitation not found' using errcode = 'P0001'; end if;
  if v_inv.status <> 'pending' then raise exception 'This invitation is no longer valid' using errcode = 'P0001'; end if;
  if v_inv.expires_at < now() then raise exception 'This invitation has expired' using errcode = 'P0001'; end if;
  if lower(v_inv.email) <> lower(coalesce(v_email, '')) then
    raise exception 'This invitation was sent to a different email address' using errcode = 'P0001';
  end if;

  -- Plan member-limit enforcement (skip when the caller is already a member = re-accept).
  if not exists (select 1 from public.organization_members where org_id = v_inv.org_id and user_id = v_uid) then
    select plan into v_plan from public.organizations where id = v_inv.org_id;
    v_limit := public.plan_member_limit(v_plan);
    if v_limit is not null then
      select count(*) into v_count from public.organization_members where org_id = v_inv.org_id;
      if v_count >= v_limit then
        raise exception 'This workspace is on the % plan, limited to % member(s). The owner must upgrade to add more.', initcap(v_plan), v_limit
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  insert into public.organization_members (org_id, user_id, role)
  values (v_inv.org_id, v_uid, v_inv.role)
  on conflict (org_id, user_id) do nothing;

  -- I3: give an invited org owner/admin project-write access matching their org
  -- standing, for all projects that exist today (create_project covers later ones).
  if v_inv.role in ('owner','admin') then
    insert into public.user_projects (user_id, project_id, role)
    select v_uid, p.id, case v_inv.role when 'owner' then 'owner' else 'admin' end
    from public.projects p
    where p.org_id = v_inv.org_id
    on conflict (user_id, project_id) do nothing;
  end if;

  update public.organization_invitations set status = 'accepted' where id = v_inv.id;

  select jsonb_build_object('org_id', o.id, 'org_name', o.name) into v_result
  from public.organizations o where o.id = v_inv.org_id;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."accept_invitation"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_updated_at_trigger"("tbl" "regclass") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I
     FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
    tbl, tbl
  );
END;
$$;


ALTER FUNCTION "public"."add_updated_at_trigger"("tbl" "regclass") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_updated_at_trigger"("tbl" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I
     FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
    tbl, tbl
  );
END;
$$;


ALTER FUNCTION "public"."add_updated_at_trigger"("tbl" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_log_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id UUID;
  v_project UUID;
  v_old JSONB;
  v_new JSONB;
  v_action TEXT;
BEGIN
  -- Try to get the current user; might be NULL for service-role operations.
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_old    := to_jsonb(OLD);
    v_new    := NULL;
    v_project := OLD.project_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old    := to_jsonb(OLD);
    v_new    := to_jsonb(NEW);
    v_project := NEW.project_id;
  ELSE
    v_action := 'INSERT';
    v_old    := NULL;
    v_new    := to_jsonb(NEW);
    v_project := NEW.project_id;
  END IF;

  -- Existing audit rows are intentionally project-scoped and project_id is
  -- NOT NULL. If the parent project no longer exists, there is no valid audit
  -- parent to attach to; returning here keeps the user operation from failing.
  IF v_project IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = v_project
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.pma_audit_logs (
    project_id, entity_type, entity_id, action,
    old_values, new_values, changed_by
  ) VALUES (
    v_project,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    v_action,
    v_old,
    v_new,
    v_user_id::TEXT
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_log_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backcharge_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin new.updated_at = now(); return new; end;
$$;


ALTER FUNCTION "public"."backcharge_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid; v_org uuid; v_result jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;
  insert into public.organizations (name, slug, created_by)
    values (p_name, nullif(p_slug, ''), v_uid) returning id into v_org;
  insert into public.organization_members (org_id, user_id, role) values (v_org, v_uid, 'owner');
  select to_jsonb(o) into v_result from public.organizations o where o.id = v_org;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_project"("project_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid; v_project_id uuid; v_org_id uuid; v_result jsonb;
  v_plan text; v_limit int; v_count int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;

  v_org_id := coalesce(
    (project_data->>'org_id')::uuid,
    (select org_id from public.organization_members where user_id = v_user_id order by created_at limit 1)
  );
  if v_org_id is null or not public.user_is_org_member(v_org_id) then
    raise exception 'Not a member of the target organization' using errcode = 'P0001';
  end if;

  -- Plan project-limit enforcement.
  select plan into v_plan from public.organizations where id = v_org_id;
  v_limit := public.plan_project_limit(v_plan);
  if v_limit is not null then
    select count(*) into v_count from public.projects
      where org_id = v_org_id and coalesce(is_deleted, false) = false;
    if v_count >= v_limit then
      raise exception 'Your % plan is limited to % project(s). Upgrade to add more.', initcap(v_plan), v_limit
        using errcode = 'P0001';
    end if;
  end if;

  insert into projects (
    name, project_number, client, general_contractor, engineer_of_record,
    project_manager, superintendent, contract_type, original_contract_value,
    start_date, target_completion_date, forecast_completion_date,
    phase, health_status, retainage_percent, contingency_amount,
    address, notes, metadata, org_id
  )
  select
    (project_data->>'name'), (project_data->>'project_number'), (project_data->>'client'),
    (project_data->>'general_contractor'), (project_data->>'engineer_of_record'),
    (project_data->>'project_manager'), (project_data->>'superintendent'),
    (project_data->>'contract_type'), (project_data->>'original_contract_value')::numeric,
    (project_data->>'start_date')::date, (project_data->>'target_completion_date')::date,
    (project_data->>'forecast_completion_date')::date,
    coalesce(project_data->>'phase', 'Pre-Construction'),
    coalesce(project_data->>'health_status', 'On Track'),
    coalesce((project_data->>'retainage_percent')::numeric, 10),
    (project_data->>'contingency_amount')::numeric,
    (project_data->>'address'), (project_data->>'notes'),
    coalesce((project_data->'metadata')::jsonb, '{}'::jsonb), v_org_id
  returning id into v_project_id;

  insert into user_projects (user_id, project_id, role) values (v_user_id, v_project_id, 'owner');

  -- I3 (forward cover): every other org owner/admin gets write access to each new
  -- org project, so the invite-accept backfill stays complete for later projects.
  insert into user_projects (user_id, project_id, role)
  select m.user_id, v_project_id, case m.role when 'owner' then 'owner' else 'admin' end
  from organization_members m
  where m.org_id = v_org_id and m.role in ('owner','admin') and m.user_id <> v_user_id
  on conflict (user_id, project_id) do nothing;

  select to_jsonb(p) into v_result from projects p where p.id = v_project_id;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."create_project"("project_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_drawing_set"("p_set_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_child_count INTEGER := 0;
  v_now TIMESTAMPTZ := NOW();
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM drawing_sets WHERE id = p_set_id;
  IF v_project_id IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT public.user_has_project_role_at_least(v_project_id, 'admin') THEN
    RAISE EXCEPTION 'Not authorized to delete this drawing set'
      USING ERRCODE = '42501';
  END IF;

  WITH updated AS (
    UPDATE drawings
       SET is_deleted = TRUE,
           deleted_at = v_now,
           updated_at = v_now
     WHERE drawing_set_id = p_set_id
       AND (is_deleted IS NULL OR is_deleted = FALSE)
     RETURNING id
  )
  SELECT COUNT(*) INTO v_child_count FROM updated;

  UPDATE drawing_sets
     SET is_deleted = TRUE,
         deleted_at = v_now,
         updated_at = v_now
   WHERE id = p_set_id
     AND (is_deleted IS NULL OR is_deleted = FALSE);

  RETURN v_child_count;
END;
$$;


ALTER FUNCTION "public"."delete_drawing_set"("p_set_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_drawing_set"("p_set_id" "uuid") IS 'Soft-deletes a drawing set and all of its child drawings in a single transaction. Returns the number of child sheets that were newly soft-deleted.';



CREATE OR REPLACE FUNCTION "public"."drawing_watch_notify_impact"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_watchers int; v_drawing uuid; v_sheet text; v_sev text;
BEGIN
  SELECT r.drawing_id, r.sheet_number INTO v_drawing, v_sheet
    FROM public.drawing_revisions r WHERE r.id = NEW.drawing_revision_id;
  IF v_drawing IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_watchers FROM public.drawing_watchers w WHERE w.drawing_id = v_drawing;
  IF v_watchers = 0 THEN RETURN NEW; END IF;
  v_sev := CASE NEW.priority WHEN 'critical' THEN 'Critical' WHEN 'high' THEN 'High' ELSE 'Medium' END;

  INSERT INTO public.alerts (project_id, alert_type, severity, status, title, message, description,
    entity_type, entity_id, record_type, record_id, is_read, is_dismissed, metadata)
  VALUES (NEW.project_id, 'Drawing_Impact', v_sev, 'Active',
    'Watched sheet: new impact',
    replace(NEW.impact_type, '_', ' ') || ' on ' || COALESCE(v_sheet, '(sheet)'),
    NEW.title,
    'drawing', v_drawing, 'drawing', v_drawing, false, false,
    jsonb_build_object('drawing_id', v_drawing, 'impact_id', NEW.id,
                       'impact_type', NEW.impact_type, 'priority', NEW.priority, 'watchers', v_watchers));
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."drawing_watch_notify_impact"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."drawing_watch_notify_revision"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_watchers int;
  v_sheet text;
BEGIN
  SELECT count(*) INTO v_watchers FROM public.drawing_watchers w WHERE w.drawing_id = NEW.drawing_id;
  IF v_watchers = 0 THEN RETURN NEW; END IF;
  v_sheet := COALESCE(NEW.sheet_number, '(sheet)');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.alerts (project_id, alert_type, severity, status, title, message, description,
      entity_type, entity_id, record_type, record_id, is_read, is_dismissed, metadata)
    VALUES (NEW.project_id, 'Drawing_Revision', 'Medium', 'Active',
      'Watched sheet: new revision',
      v_sheet || ' Rev ' || COALESCE(NEW.revision_code, '') || ' received',
      'A new revision was logged on a sheet you are watching.',
      'drawing', NEW.drawing_id, 'drawing', NEW.drawing_id, false, false,
      jsonb_build_object('drawing_id', NEW.drawing_id, 'revision_id', NEW.id,
                         'revision_code', NEW.revision_code, 'watchers', v_watchers));
  ELSIF TG_OP = 'UPDATE'
        AND NEW.release_status IS DISTINCT FROM OLD.release_status
        AND NEW.release_status LIKE 'released_%' THEN
    INSERT INTO public.alerts (project_id, alert_type, severity, status, title, message, description,
      entity_type, entity_id, record_type, record_id, is_read, is_dismissed, metadata)
    VALUES (NEW.project_id, 'Drawing_Released', 'Medium', 'Active',
      'Watched sheet released',
      v_sheet || ' -> ' || replace(NEW.release_status, '_', ' '),
      'A sheet you are watching was released.',
      'drawing', NEW.drawing_id, 'drawing', NEW.drawing_id, false, false,
      jsonb_build_object('drawing_id', NEW.drawing_id, 'revision_id', NEW.id,
                         'release_status', NEW.release_status, 'watchers', v_watchers));
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."drawing_watch_notify_revision"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_drawing_set_unlock_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF (OLD.is_locked = true AND NEW.is_locked = false) THEN
    IF NOT public.user_has_project_role_at_least(NEW.project_id, 'admin') THEN
      RAISE EXCEPTION 'Only admins can unlock drawing sets'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_drawing_set_unlock_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_fab_release_gate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_blocking   text[];
  v_rejected   text[];
  v_superseded text[];
begin
  -- 1. Open RFIs referencing the package's sheets — authoritative server snapshot.
  select coalesce(array_agg(distinct b.rfi_number) filter (where b.rfi_number is not null), '{}')
    into v_blocking
  from public.fab_release_blocking_rfis(coalesce(new.drawing_ids, '{}')) b;
  new.blocking_rfi_numbers := v_blocking;

  -- An explicit override reason is the audited escape hatch: it releases past
  -- EVERY gate dimension (a deliberate partial release), exactly like the UI's PM
  -- override. The snapshot above still records what RFIs were open at release.
  if coalesce(btrim(new.override_reason), '') <> '' then
    return new;
  end if;

  -- 2. Open RFIs (existing behavior + the exact message the client parser reads).
  if array_length(v_blocking, 1) is not null then
    raise exception
      'FAB_RELEASE_BLOCKED: % open RFI(s) reference sheets in this package (%). Resolve them or release with an override reason.',
      array_length(v_blocking, 1), array_to_string(v_blocking, ', ');
  end if;

  -- 3. Rejected / revise-and-resubmit sheets — match anywhere across
  --    stage / set_approval_status / ifc_status (mirrors isRejectedSheet).
  select coalesce(array_agg(d.sheet_number order by d.sheet_number)
                    filter (where d.sheet_number is not null), '{}')
    into v_rejected
  from public.drawings d
  where d.id = any (coalesce(new.drawing_ids, '{}'))
    and d.is_deleted is distinct from true
    and lower(coalesce(d.stage,'') || ' ' || coalesce(d.set_approval_status,'') || ' ' || coalesce(d.ifc_status,''))
          ~ '(reject|revise|resubmit|returned|r&r)';
  if array_length(v_rejected, 1) is not null then
    raise exception
      'FAB_RELEASE_BLOCKED: % sheet marks in this package came back rejected or revise-and-resubmit. Resolve them or release with an override reason. Sheets: %',
      array_length(v_rejected, 1), array_to_string(v_rejected, ', ');
  end if;

  -- 4. Sheets superseded by a newer revision — a live revision conflict
  --    (mirrors isSupersededSheet).
  select coalesce(array_agg(d.sheet_number order by d.sheet_number)
                    filter (where d.sheet_number is not null), '{}')
    into v_superseded
  from public.drawings d
  where d.id = any (coalesce(new.drawing_ids, '{}'))
    and d.is_deleted is distinct from true
    and d.is_superseded is true;
  if array_length(v_superseded, 1) is not null then
    raise exception
      'FAB_RELEASE_BLOCKED: % sheet marks in this package are superseded by a newer revision. Release the current revision or release with an override reason. Sheets: %',
      array_length(v_superseded, 1), array_to_string(v_superseded, ', ');
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_fab_release_gate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_org_invite_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_plan  text;
  v_limit int;
  v_used  int;
begin
  select plan into v_plan from public.organizations where id = NEW.org_id;
  v_limit := public.plan_member_limit(v_plan);
  if v_limit is null then
    return NEW;  -- unlimited plan
  end if;
  select
    (select count(*) from public.organization_members m where m.org_id = NEW.org_id)
    + (select count(*) from public.organization_invitations i
         where i.org_id = NEW.org_id and i.status = 'pending')
    into v_used;
  if v_used >= v_limit then
    raise exception 'Workspace is at its plan member limit (%). Upgrade your plan to invite more teammates.', v_limit
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."enforce_org_invite_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_org_member_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_plan         text;
  v_limit        int;
  v_count        int;
  v_other_owners int;
begin
  if tg_op = 'INSERT' then
    -- Plan member-limit, only for a genuinely NEW member (skip re-accept /
    -- ON CONFLICT no-ops). Mirrors accept_invitation's own check exactly, so it
    -- can't false-block that path; it closes the direct-insert bypass. The
    -- first owner from create_organization passes (count 0 < limit).
    if not exists (
      select 1 from public.organization_members m
      where m.org_id = NEW.org_id and m.user_id = NEW.user_id
    ) then
      select plan into v_plan from public.organizations where id = NEW.org_id;
      v_limit := public.plan_member_limit(v_plan);
      if v_limit is not null then
        select count(*) into v_count
          from public.organization_members m where m.org_id = NEW.org_id;
        if v_count >= v_limit then
          raise exception 'Workspace is at its plan member limit (%). Upgrade to add more members.', v_limit
            using errcode = 'P0001';
        end if;
      end if;
    end if;
    return NEW;

  elsif tg_op = 'UPDATE' then
    -- Never let the workspace lose its last owner via demotion. (RLS already
    -- ensures only an owner can update an owner's row, so this just guards the
    -- self-demotion / sole-owner case.)
    if OLD.role = 'owner' and NEW.role <> 'owner' then
      select count(*) into v_other_owners
        from public.organization_members m
        where m.org_id = OLD.org_id and m.role = 'owner' and m.user_id <> OLD.user_id;
      if v_other_owners = 0 then
        raise exception 'Cannot remove the last owner of the workspace' using errcode = 'P0001';
      end if;
    end if;
    return NEW;
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."enforce_org_member_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_payapp_line_draft_only"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_app_id uuid := COALESCE(NEW.pay_application_id, OLD.pay_application_id);
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.pay_applications WHERE id = v_app_id;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION
      'Pay application is % - its G703 lines are locked (only a draft pay app can be edited; advance or void it via status instead).',
      COALESCE(v_status, 'missing')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_payapp_line_draft_only"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_submittal_fab_release_gate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare v_blocking text[];
begin
  if new.status is distinct from 'Released for Fabrication'
     or old.status is not distinct from 'Released for Fabrication' then
    return new;
  end if;
  select coalesce(array_agg(distinct b.rfi_number) filter (where b.rfi_number is not null), '{}')
    into v_blocking
  from public.submittal_blocking_rfis(new.id) b;
  if array_length(v_blocking, 1) is not null
     and coalesce(btrim(new.fab_release_override_reason), '') = '' then
    raise exception
      'FAB_RELEASE_BLOCKED: % open RFI(s) reference sheets in this submittal''s package (%). Resolve them or release with an override reason.',
      array_length(v_blocking, 1), array_to_string(v_blocking, ', ');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_submittal_fab_release_gate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_user_projects_membership_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id
     OR OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'Membership user_id and project_id cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_user_projects_membership_identity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."escalate_rfi_sla"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r          record;
  v_age      int;
  v_tier     int;
  v_prev     int;
  v_sev      text;
  v_label    text;
  v_ref      text;
  v_created  int := 0;
BEGIN
  FOR r IN
    SELECT id, project_id, project_name, rfi_number, title, question,
           ball_in_court, priority, status,
           (CURRENT_DATE - COALESCE(submitted_date, created_at::date)) AS age_days
      FROM public.rfis
     WHERE is_deleted IS NOT TRUE
       AND lower(COALESCE(status, '')) NOT IN ('closed', 'answered', 'void')
  LOOP
    v_age := r.age_days;
    IF v_age IS NULL OR v_age < 7 THEN
      CONTINUE;
    END IF;

    v_tier := CASE WHEN v_age >= 21 THEN 3 WHEN v_age >= 14 THEN 2 ELSE 1 END;

    SELECT COALESCE(MAX((metadata -> 'sla' ->> 'tier')::int), 0)
      INTO v_prev
      FROM public.alerts
     WHERE entity_id = r.id
       AND alert_type = 'RFI_SLA_Escalation'
       AND is_dismissed = false;

    IF v_tier <= v_prev THEN
      CONTINUE;
    END IF;

    v_sev   := CASE v_tier WHEN 3 THEN 'Critical' WHEN 2 THEN 'High' ELSE 'Medium' END;
    v_label := CASE v_tier WHEN 3 THEN 'Executive attention (21d+)'
                           WHEN 2 THEN 'Overdue (14d+)'
                           ELSE 'Response due (7d+)' END;
    v_ref   := 'RFI ' || COALESCE(NULLIF(btrim(r.rfi_number), ''), left(r.id::text, 8));

    UPDATE public.alerts
       SET is_dismissed = true, dismissed_at = now(), status = 'Superseded'
     WHERE entity_id = r.id
       AND alert_type = 'RFI_SLA_Escalation'
       AND is_dismissed = false;

    INSERT INTO public.alerts (
      project_id, project_name, alert_type, severity, status,
      title, message, description,
      entity_type, entity_id, record_type, record_id,
      is_read, is_dismissed, metadata
    ) VALUES (
      r.project_id, r.project_name, 'RFI_SLA_Escalation', v_sev, 'Active',
      v_ref || ' — SLA: ' || v_label,
      v_ref || ' "' || COALESCE(NULLIF(btrim(r.title), ''), r.question, 'Untitled')
        || '" has been open ' || v_age || ' days'
        || COALESCE(' (ball in court: ' || NULLIF(btrim(r.ball_in_court), '') || ')', '') || '.',
      'RFI open ' || v_age || ' days without resolution',
      'rfi', r.id, 'rfi', r.id,
      false, false,
      jsonb_build_object('sla', jsonb_build_object('tier', v_tier, 'age_days', v_age))
    );

    v_created := v_created + 1;
  END LOOP;

  RETURN v_created;
END;
$$;


ALTER FUNCTION "public"."escalate_rfi_sla"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fab_release_blocking_rfis"("p_drawing_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "rfi_number" "text", "title" "text", "status" "text", "project_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with sheet_links as (
    select d.project_id,
           regexp_replace(upper(trim(x.num)), '[^A-Z0-9]', '', 'g') as norm_num
    from public.drawings d
    cross join lateral unnest(string_to_array(coalesce(d.linked_rfi_ids, ''), ',')) as x(num)
    where d.id = any(p_drawing_ids)
      and public.user_has_project_access(d.project_id)
  )
  select distinct r.id, r.rfi_number, r.title, r.status, r.project_id
  from public.rfis r
  join sheet_links s
    on s.project_id = r.project_id
   and regexp_replace(upper(coalesce(r.rfi_number, '')), '[^A-Z0-9]', '', 'g') = s.norm_num
  where coalesce(r.is_deleted, false) = false
    and coalesce(r.status, 'Open') not in ('Answered', 'Closed', 'Void')
    and s.norm_num <> '';
$$;


ALTER FUNCTION "public"."fab_release_blocking_rfis"("p_drawing_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."founding_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select id from public.organizations order by created_at limit 1
$$;


ALTER FUNCTION "public"."founding_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invitation"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'org_id', i.org_id, 'org_name', o.name, 'role', i.role, 'email', i.email,
    'status', i.status, 'expired', (i.expires_at < now())
  )
  from public.organization_invitations i
  join public.organizations o on o.id = i.org_id
  where i.token = p_token;
$$;


ALTER FUNCTION "public"."get_invitation"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_llm_usage_window"("p_user_id" "uuid", "p_since" timestamp with time zone) RETURNS TABLE("request_count" bigint, "cost_sum" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    count(*)::bigint                       as request_count,
    coalesce(sum(t.cost_usd), 0)::numeric  as cost_sum
  from public.llm_telemetry t
  where t.user_id = p_user_id
    and t.occurred_at >= p_since;
$$;


ALTER FUNCTION "public"."get_llm_usage_window"("p_user_id" "uuid", "p_since" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_project_role"("p_project_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_projects
       WHERE user_id = auth.uid() AND project_id = p_project_id
       LIMIT 1),
    (SELECT om.role FROM public.projects p
       JOIN public.organization_members om
         ON om.org_id = p.org_id AND om.user_id = auth.uid()
      WHERE p.id = p_project_id AND om.role IN ('owner', 'admin')
      LIMIT 1)
  );
$$;


ALTER FUNCTION "public"."get_my_project_role"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_sequence_number"("p_project_id" "uuid", "p_record_type" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_next integer;
BEGIN
  IF NOT public.user_has_project_access(p_project_id) THEN
    RAISE EXCEPTION 'Not authorized for this project' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.number_sequences (project_id, record_type, next_value)
  VALUES (p_project_id, p_record_type, 2)
  ON CONFLICT (project_id, record_type)
  DO UPDATE SET next_value = number_sequences.next_value + 1,
                updated_at = now()
  RETURNING next_value - 1 INTO v_next;

  RETURN v_next;
END;
$$;


ALTER FUNCTION "public"."get_next_sequence_number"("p_project_id" "uuid", "p_record_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_project"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.user_projects (user_id, project_id, role)
  VALUES (auth.uid(), NEW.id, 'owner');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_project"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_drawing_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actor UUID;
BEGIN
  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO drawing_activity (project_id, drawing_id, event_type, to_value, actor_id, metadata)
    VALUES (NEW.project_id, NEW.id, 'created', NEW.stage, v_actor,
            jsonb_build_object('sheet_number', NEW.sheet_number, 'title', NEW.title));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id,
              CASE WHEN NEW.is_deleted THEN 'deleted' ELSE 'restored' END,
              OLD.is_deleted::text, NEW.is_deleted::text, v_actor);
    END IF;

    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'stage_changed', OLD.stage, NEW.stage, v_actor);
    END IF;

    IF NEW.revision_number IS DISTINCT FROM OLD.revision_number THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'revision_changed', OLD.revision_number::text, NEW.revision_number::text, v_actor);
    END IF;

    IF NEW.set_approval_status IS DISTINCT FROM OLD.set_approval_status THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'approval_changed',
              COALESCE(OLD.set_approval_status, ''), COALESCE(NEW.set_approval_status, ''), v_actor);
    END IF;

    IF NEW.ai_extraction_status IS DISTINCT FROM OLD.ai_extraction_status THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'ai_status_changed',
              COALESCE(OLD.ai_extraction_status, ''), COALESCE(NEW.ai_extraction_status, ''), v_actor);
    END IF;

    IF NEW.is_superseded IS DISTINCT FROM OLD.is_superseded AND NEW.is_superseded = TRUE THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'superseded', 'false', 'true', v_actor);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."log_drawing_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_drawing_link_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid;
begin
  begin v_actor := auth.uid(); exception when others then v_actor := null; end;

  if (tg_op = 'INSERT') then
    insert into public.drawing_zone_activity
      (project_id, drawing_zone_id, event_type, metadata, actor_id)
    values
      (new.project_id, new.drawing_zone_id, 'link_added',
       jsonb_build_object(
         'linked_record_type', new.linked_record_type,
         'linked_record_id',   new.linked_record_id,
         'link_role',          new.link_role,
         'link_source',        new.link_source,
         'created_from_zone',  coalesce(new.metadata->>'created_from_zone', 'false')
       ),
       v_actor);
    return new;
  end if;

  if (tg_op = 'UPDATE') then
    -- Soft-delete: removed_at transitioned from null → not-null.
    if old.removed_at is null and new.removed_at is not null then
      insert into public.drawing_zone_activity
        (project_id, drawing_zone_id, event_type, metadata, actor_id)
      values
        (new.project_id, new.drawing_zone_id, 'link_removed',
         jsonb_build_object(
           'linked_record_type', new.linked_record_type,
           'linked_record_id',   new.linked_record_id,
           'link_role',          new.link_role
         ),
         v_actor);
    end if;
    return new;
  end if;

  return null;
end $$;


ALTER FUNCTION "public"."log_drawing_link_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_drawing_link_event"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into public.drawing_zone_activity
      (project_id, drawing_zone_id, drawing_id, event_type, to_value, actor_id, metadata)
    values
      (new.project_id, new.drawing_zone_id, new.drawing_id, 'link_added',
       new.linked_record_type || ':' || new.linked_record_id::text,
       auth.uid(),
       jsonb_build_object(
         'link_id', new.id,
         'linked_record_type', new.linked_record_type,
         'linked_record_id',   new.linked_record_id,
         'link_role',   new.link_role,
         'link_source', new.link_source,
         'confidence',  new.confidence_score,
         'created_from_zone', coalesce(new.metadata->>'created_from_zone', 'false')
       ));
    return new;
  elsif tg_op = 'UPDATE' then
    -- Only log the removal transition; other link edits (confidence
    -- toggles, confirmation flips) are out of scope for V1.5.
    if old.removed_at is null and new.removed_at is not null then
      insert into public.drawing_zone_activity
        (project_id, drawing_zone_id, drawing_id, event_type, from_value, actor_id, metadata)
      values
        (new.project_id, new.drawing_zone_id, new.drawing_id, 'link_removed',
         new.linked_record_type || ':' || new.linked_record_id::text,
         coalesce(auth.uid(), new.removed_by),
         jsonb_build_object(
           'link_id', new.id,
           'linked_record_type', new.linked_record_type,
           'linked_record_id',   new.linked_record_id
         ));
    end if;
    return new;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."log_drawing_link_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_drawing_zone_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid;
begin
  -- auth.uid() isn't available under all execution contexts (background
  -- jobs, server-side RPCs), so guard and fall back to NULL.
  begin v_actor := auth.uid(); exception when others then v_actor := null; end;

  if (tg_op = 'INSERT') then
    insert into public.drawing_zone_activity
      (project_id, drawing_zone_id, event_type, to_value, metadata, actor_id)
    values
      (new.project_id, new.id, 'zone_created',
       coalesce(new.label, new.zone_key),
       jsonb_build_object(
         'zone_key',  new.zone_key,
         'zone_type', new.zone_type,
         'shape',     new.shape_type
       ),
       v_actor);
    return new;
  end if;

  if (tg_op = 'UPDATE') then
    -- Soft-delete: deleted_at transitioned from null → not-null.
    if old.deleted_at is null and new.deleted_at is not null then
      insert into public.drawing_zone_activity
        (project_id, drawing_zone_id, event_type, metadata, actor_id)
      values
        (new.project_id, new.id, 'zone_deleted',
         jsonb_build_object('zone_key', new.zone_key),
         v_actor);
    end if;

    -- Rename
    if coalesce(old.label, '') is distinct from coalesce(new.label, '') then
      insert into public.drawing_zone_activity
        (project_id, drawing_zone_id, event_type, from_value, to_value, metadata, actor_id)
      values
        (new.project_id, new.id, 'zone_renamed',
         old.label, new.label,
         jsonb_build_object('zone_key', new.zone_key),
         v_actor);
    end if;

    -- Status change — honours is_manual_status_override so the UI can
    -- label the event "by user" vs "by rule engine".
    if coalesce(old.status, '') is distinct from coalesce(new.status, '') then
      insert into public.drawing_zone_activity
        (project_id, drawing_zone_id, event_type, from_value, to_value, metadata, actor_id)
      values
        (new.project_id, new.id, 'status_changed',
         old.status, new.status,
         jsonb_build_object(
           'reason',      new.status_reason,
           'computed_by', coalesce(new.status_computed_by,
                                    case when new.is_manual_status_override then 'user' else 'rule_engine' end)
         ),
         v_actor);
    end if;
    return new;
  end if;

  return null;
end $$;


ALTER FUNCTION "public"."log_drawing_zone_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_drawing_zone_event"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_event text;
  v_from  text;
  v_to    text;
  v_meta  jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    v_event := 'zone_created';
    v_to    := coalesce(new.label, new.zone_key);
    v_meta  := jsonb_build_object(
      'zone_key',  new.zone_key,
      'label',     new.label,
      'zone_type', new.zone_type,
      'status',    new.status
    );
  elsif tg_op = 'UPDATE' then
    -- Order matters: we emit a separate row per semantic change so
    -- the Activity tab can render a timeline of distinct events
    -- rather than one diff-blob.

    -- Soft-delete wins — if the zone was just deleted the other
    -- changes are incidental.
    if old.deleted_at is null and new.deleted_at is not null then
      insert into public.drawing_zone_activity
        (project_id, drawing_zone_id, drawing_id, event_type, actor_id, metadata)
      values
        (new.project_id, new.id, new.drawing_id, 'zone_deleted', auth.uid(),
         jsonb_build_object('zone_key', new.zone_key));
      return new;
    end if;

    if coalesce(old.label, '') is distinct from coalesce(new.label, '') then
      insert into public.drawing_zone_activity
        (project_id, drawing_zone_id, drawing_id, event_type, from_value, to_value, actor_id, metadata)
      values
        (new.project_id, new.id, new.drawing_id, 'zone_renamed',
         old.label, new.label, auth.uid(),
         jsonb_build_object('zone_key', new.zone_key));
    end if;

    if coalesce(old.status, '') is distinct from coalesce(new.status, '') then
      insert into public.drawing_zone_activity
        (project_id, drawing_zone_id, drawing_id, event_type, from_value, to_value, actor_id, metadata)
      values
        (new.project_id, new.id, new.drawing_id, 'status_changed',
         old.status, new.status,
         coalesce(auth.uid(), new.manual_status_override_by),
         jsonb_build_object(
           'zone_key', new.zone_key,
           -- When the rule engine moved the status, status_computed_by
           -- will be 'rule_engine'. We stamp that into metadata so the
           -- UI can tell human from machine at a glance.
           'computed_by', coalesce(new.status_computed_by,
                                   case when new.is_manual_status_override then 'manual' else 'rule_engine' end),
           'reason', new.status_reason
         ));
    end if;
    return new;
  end if;
  -- INSERT fallthrough
  if v_event is not null then
    insert into public.drawing_zone_activity
      (project_id, drawing_zone_id, drawing_id, event_type, from_value, to_value, actor_id, metadata)
    values
      (new.project_id, new.id, new.drawing_id, v_event, v_from, v_to, auth.uid(), v_meta);
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."log_drawing_zone_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_user_project_member_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_actor_email text;
  v_target_user_id uuid;
  v_target_email text;
  v_project_id uuid;
  v_event_type text;
  v_old_role text;
  v_new_role text;
  v_membership_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_project_id := NEW.project_id;
    v_target_user_id := NEW.user_id;
    v_event_type := 'member_added';
    v_new_role := NEW.role;
    v_membership_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role IS NOT DISTINCT FROM NEW.role THEN
      RETURN NEW;
    END IF;
    v_project_id := NEW.project_id;
    v_target_user_id := NEW.user_id;
    v_event_type := 'role_changed';
    v_old_role := OLD.role;
    v_new_role := NEW.role;
    v_membership_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_project_id := OLD.project_id;
    v_target_user_id := OLD.user_id;
    v_event_type := 'member_removed';
    v_old_role := OLD.role;
    v_membership_id := OLD.id;
  END IF;

  SELECT email INTO v_actor_email
  FROM public.user_profiles
  WHERE id = v_actor_user_id;

  SELECT email INTO v_target_email
  FROM public.user_profiles
  WHERE id = v_target_user_id;

  INSERT INTO public.member_activity (
    project_id,
    actor_user_id,
    actor_email,
    target_user_id,
    target_email,
    event_type,
    old_role,
    new_role,
    metadata
  )
  VALUES (
    v_project_id,
    v_actor_user_id,
    v_actor_email,
    v_target_user_id,
    v_target_email,
    v_event_type,
    v_old_role,
    v_new_role,
    jsonb_build_object(
      'source', 'user_projects_trigger',
      'user_project_id', v_membership_id
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_user_project_member_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_rfi_bic_handoff"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_due      date    := COALESCE(NEW.due_date, NEW.date_required);
  v_overdue  boolean := (v_due IS NOT NULL AND v_due < CURRENT_DATE);
  v_to       text    := NULLIF(btrim(NEW.ball_in_court), '');
  v_from     text    := NULLIF(btrim(OLD.ball_in_court), '');
  v_ref      text    := 'RFI ' || COALESCE(NULLIF(btrim(NEW.rfi_number), ''), left(NEW.id::text, 8));
  v_severity text;
BEGIN
  IF v_to IS NULL THEN
    RETURN NEW;
  END IF;
  IF lower(COALESCE(NEW.status, '')) IN ('closed', 'void') THEN
    RETURN NEW;
  END IF;

  v_severity := CASE
    WHEN v_overdue OR lower(COALESCE(NEW.priority, '')) IN ('critical', 'high') THEN 'High'
    ELSE 'Medium'
  END;

  UPDATE public.alerts
     SET is_dismissed = true, dismissed_at = now(), status = 'Superseded'
   WHERE entity_id = NEW.id
     AND alert_type = 'RFI_BIC_Handoff'
     AND is_dismissed = false;

  INSERT INTO public.alerts (
    project_id, project_name, alert_type, severity, status,
    title, message, description,
    entity_type, entity_id, record_type, record_id,
    is_read, is_dismissed, metadata
  ) VALUES (
    NEW.project_id, NEW.project_name, 'RFI_BIC_Handoff', v_severity, 'Active',
    v_ref || ' — ball in court: ' || v_to,
    v_ref || ' "' || COALESCE(NULLIF(btrim(NEW.title), ''), NEW.question, 'Untitled')
      || '" is now with ' || v_to
      || COALESCE(' (from ' || v_from || ')', '')
      || CASE WHEN v_due IS NOT NULL
              THEN '. Response due ' || to_char(v_due, 'YYYY-MM-DD')
                   || CASE WHEN v_overdue THEN ' (OVERDUE)' ELSE '' END || '.'
              ELSE '.' END,
    'Ball-in-court moved to ' || v_to,
    'rfi', NEW.id, 'rfi', NEW.id,
    false, false,
    jsonb_build_object('bic_handoff', jsonb_build_object(
      'from', v_from, 'to', v_to,
      'rfi_number', NEW.rfi_number, 'due_date', v_due, 'overdue', v_overdue
    ))
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_rfi_bic_handoff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."org_protect_billing_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.role() = 'authenticated' and (
       new.plan                   is distinct from old.plan
    or new.stripe_customer_id     is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.subscription_status    is distinct from old.subscription_status
    or new.current_period_end     is distinct from old.current_period_end
  ) then
    raise exception 'Billing fields can only be changed by the billing system' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."org_protect_billing_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."organizations_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin new.updated_at = now(); return new; end;
$$;


ALTER FUNCTION "public"."organizations_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payapp_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin new.updated_at = now(); return new; end;
$$;


ALTER FUNCTION "public"."payapp_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."piece_production_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."piece_production_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."plan_member_limit"("p_plan" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case p_plan when 'free' then 2 when 'pro' then 15 else null end;
$$;


ALTER FUNCTION "public"."plan_member_limit"("p_plan" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."plan_project_limit"("p_plan" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case p_plan when 'free' then 1 when 'pro' then 10 else null end;
$$;


ALTER FUNCTION "public"."plan_project_limit"("p_plan" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_user_profile_role_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role
     AND auth.uid() IS NOT NULL
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'user_profiles.role is server-controlled';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_user_profile_role_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."project_handoff_items_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."project_handoff_items_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."project_on_hold_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.on_hold IS DISTINCT FROM OLD.on_hold THEN
    IF NEW.on_hold THEN
      NEW.on_hold_at := COALESCE(NEW.on_hold_at, now());
      NEW.on_hold_by := COALESCE(NEW.on_hold_by, auth.uid());
    ELSE
      NEW.on_hold_at     := NULL;
      NEW.on_hold_by     := NULL;
      NEW.on_hold_reason := NULL;
    END IF;
  END IF;
  RETURN NEW;
END
$$;


ALTER FUNCTION "public"."project_on_hold_stamp"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."drawing_revisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "drawing_id" "uuid" NOT NULL,
    "revision_code" "text" NOT NULL,
    "revision_name" "text",
    "sheet_number" "text" NOT NULL,
    "sheet_title" "text" NOT NULL,
    "file_id" "uuid",
    "version_number" integer DEFAULT 1 NOT NULL,
    "is_current" boolean DEFAULT false NOT NULL,
    "issued_at" timestamp with time zone,
    "received_at" timestamp with time zone,
    "supersedes_revision_id" "uuid",
    "viewer_width" numeric(12,4),
    "viewer_height" numeric(12,4),
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "release_status" "text" DEFAULT 'received'::"text" NOT NULL,
    "file_url" "text",
    "pdf_page" integer,
    "revision_notes" "text",
    CONSTRAINT "drawing_revisions_release_status_check" CHECK (("release_status" = ANY (ARRAY['received'::"text", 'pending_review'::"text", 'reviewed'::"text", 'released_for_estimate'::"text", 'released_for_shop'::"text", 'released_for_field'::"text", 'on_hold'::"text", 'superseded'::"text", 'void'::"text"]))),
    CONSTRAINT "drawing_revisions_version_positive" CHECK (("version_number" > 0))
);


ALTER TABLE "public"."drawing_revisions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."drawing_revisions"."file_url" IS 'Storage URL (or bucket-prefixed path) of the master PDF this revision shipped in. Snapshotted at supersede time.';



COMMENT ON COLUMN "public"."drawing_revisions"."pdf_page" IS '1-based page within file_url where this sheet revision lives.';



COMMENT ON COLUMN "public"."drawing_revisions"."revision_notes" IS 'What changed in this revision (from the revision upload form).';



CREATE OR REPLACE FUNCTION "public"."publish_drawing_revision"("p_revision_id" "uuid", "p_release_status" "text" DEFAULT 'released_for_field'::"text") RETURNS "public"."drawing_revisions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rev public.drawing_revisions;
  v_project uuid;
  v_drawing uuid;
begin
  select project_id, drawing_id into v_project, v_drawing
  from public.drawing_revisions where id = p_revision_id;
  if v_project is null then raise exception 'Revision not found'; end if;
  if not public.user_has_project_role_at_least(v_project, 'pm') then
    raise exception 'Not authorized to publish drawing revisions for this project (requires project manager or above)' using errcode = '42501';
  end if;
  if p_release_status not in ('released_for_estimate','released_for_shop','released_for_field','reviewed') then
    raise exception 'Invalid publish status: %', p_release_status;
  end if;

  update public.drawing_revisions
     set is_current = false, release_status = 'superseded', updated_at = now()
   where drawing_id = v_drawing and id <> p_revision_id and is_current = true;

  update public.drawing_revisions
     set is_current = true, release_status = p_release_status, updated_at = now()
   where id = p_revision_id
  returning * into v_rev;

  return v_rev;
end $$;


ALTER FUNCTION "public"."publish_drawing_revision"("p_revision_id" "uuid", "p_release_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_stuck_extractions"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  fixed_count integer;
BEGIN
  UPDATE public.drawings
  SET ai_extraction_status = 'Failed',
      ai_extraction_error  = 'Reset by server-side reconciler: stuck in Extracting > 5 minutes'
  WHERE ai_extraction_status = 'Extracting'
    AND COALESCE(last_extracted_at, updated_at, created_at) < now() - interval '5 minutes';
  GET DIAGNOSTICS fixed_count = ROW_COUNT;
  RETURN fixed_count;
END;
$$;


ALTER FUNCTION "public"."reconcile_stuck_extractions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_default_setup_items"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _titles TEXT[] := ARRAY[
    'Project Info',
    'Drawings/Submittals/Revisions',
    'Work Packages',
    'RFIs',
    'Budgeted Labor Hours',
    'Project Scope',
    'Change Orders',
    'Resources',
    'Schedules',
    'SOVs/Budget/Expenses'
  ];
  _descriptions TEXT[] := ARRAY[
    'Verify all project info fields are complete: project number, client, GC, EOR, PM, super, contract value, dates, and address.',
    'Set up initial drawing sets, submittal packages, and revision tracking. Confirm approval routing is configured.',
    'Define work packages with scope, tonnage, crew assignments, and shop/field hour budgets.',
    'Initialize the RFI log. Confirm routing rules and response deadlines are set.',
    'Enter budgeted labor hours by work package and phase. Set baseline for tracking.',
    'Document the contracted scope of work. Attach the executed contract and scope exhibits.',
    'Review contract for change order procedures. Set up CO log with baseline scope reference.',
    'Assign project team members, equipment, and subcontractor contacts.',
    'Build the project schedule with milestones, predecessor logic, and phase dates.',
    'Set up the Schedule of Values, project budget, and expense tracking categories.'
  ];
  _title TEXT;
  _idx INT;
BEGIN
  -- Only seed if this project has no SETUP items yet
  IF EXISTS (
    SELECT 1 FROM public.action_items
    WHERE project_id = NEW.id AND category = 'SETUP'
    LIMIT 1
  ) THEN
    RETURN NEW;
  END IF;

  FOR _idx IN 1 .. array_length(_titles, 1) LOOP
    INSERT INTO public.action_items (
      project_id, project_name, title, description,
      priority, status, category, metadata
    ) VALUES (
      NEW.id,
      COALESCE(NEW.name, ''),
      _titles[_idx],
      _descriptions[_idx],
      'Medium',
      'Open',
      'SETUP',
      jsonb_build_object('setup_item', true, 'sort_order', _idx)
    );
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."seed_default_setup_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_project_cost_codes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.cost_codes
    WHERE project_id = NEW.id
    LIMIT 1
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.cost_codes (
    project_id, project_name, cost_code_number, description,
    category, phase, budget_amount, actual_cost, committed_cost,
    forecast_to_complete, metadata
  )
  SELECT
    NEW.id,
    COALESCE(NEW.name, ''),
    d.cost_code_number,
    d.description,
    d.category,
    d.category,
    d.default_budget_amount,
    0,
    0,
    0,
    jsonb_build_object('auto_seeded', true, 'source', 'default_cost_codes')
  FROM public.default_cost_codes d
  WHERE d.is_active = true
  ORDER BY d.sort_order;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."seed_project_cost_codes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_project_handoff_items"("p_project_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO project_handoff_items (project_id, seq, description) VALUES
    (p_project_id,  1, 'Project Hand Off Internal Review With Estimators'),
    (p_project_id,  2, 'Reviewed Contract'),
    (p_project_id,  3, 'Schedule Of Values Review'),
    (p_project_id,  4, 'Field Hours Breakout Review'),
    (p_project_id,  5, 'Detailing Released'),
    (p_project_id,  6, 'Joist Supplier Released'),
    (p_project_id,  7, 'Deck Supplier Released'),
    (p_project_id,  8, 'Job Sequenced'),
    (p_project_id,  9, 'Jobsite Visited'),
    (p_project_id, 10, 'Pre-Con Meeting'),
    (p_project_id, 11, 'SDS Book Emailed and Delivered'),
    (p_project_id, 12, 'Project Safety Plan, Quality Plan, and AHA Emailed'),
    (p_project_id, 13, 'Weld Certs and Training Certs Emailed'),
    (p_project_id, 14, 'Hilti Pins Submitted (No AV Schwan)'),
    (p_project_id, 15, 'Anchor Bolts Released for Order & Fabrication'),
    (p_project_id, 16, 'Embeds Released for Order & Fabrication'),
    (p_project_id, 17, 'Main Steel Released for Fabrication'),
    (p_project_id, 18, 'RTU Frames Released for Fabrication'),
    (p_project_id, 19, 'Misc Steel Released for Fabrication'),
    (p_project_id, 20, 'Joist Delivery Confirmed'),
    (p_project_id, 21, 'Deck Delivery Confirmed'),
    (p_project_id, 22, 'Job Start Date Confirmed'),
    (p_project_id, 23, 'Crane Ordered'),
    (p_project_id, 24, 'Crane Plan and Certs Submitted'),
    (p_project_id, 25, 'Equipment Ordered'),
    (p_project_id, 26, 'Field Bolts Ordered'),
    (p_project_id, 27, 'Shear Studs Ordered for Field'),
    (p_project_id, 28, 'Specific Rigging and Safety Ordered'),
    (p_project_id, 29, 'Perimeter Safety Cable Needed and Ordered'),
    (p_project_id, 30, 'Job Reviewed with S&H Super'),
    (p_project_id, 31, 'Job Reviewed with Foreman'),
    (p_project_id, 32, 'Anchor Bolt Survey Performed'),
    (p_project_id, 33, 'Ladders Field Measured'),
    (p_project_id, 34, 'Handrail Field Measured'),
    (p_project_id, 35, 'Gates Field Measured'),
    (p_project_id, 36, 'Special Orders')
  ON CONFLICT (project_id, seq) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."seed_project_handoff_items"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_for_drawing_is_locked"("p_drawing_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(ds.is_locked, false)
    FROM public.drawings d
    JOIN public.drawing_sets ds ON ds.id = d.drawing_set_id
   WHERE d.id = p_drawing_id;
$$;


ALTER FUNCTION "public"."set_for_drawing_is_locked"("p_drawing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_for_zone_is_locked"("p_zone_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(ds.is_locked, false)
    FROM public.drawing_zones z
    JOIN public.drawings d ON d.id = z.drawing_id
    JOIN public.drawing_sets ds ON ds.id = d.drawing_set_id
   WHERE z.id = p_zone_id;
$$;


ALTER FUNCTION "public"."set_for_zone_is_locked"("p_zone_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_model_elements"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at_model_elements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."soft_delete_project"("p_project_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_deleted_at timestamptz := now();
  v_table text;
  v_child_tables text[] := array[
    'rfis','change_orders','deliveries','work_packages','documents','drawings',
    'drawing_sets','expenses','inspections','punchlist_items','safety_incidents',
    'scope_items','sov_items','contacts','meetings','model_elements','submittals',
    'submittal_rounds','submittal_sheet_responses','comments','document_folders',
    'daily_logs','photos','quality_control_records','budget_hour_items','risks',
    'email_messages','linked_folders','document_import_queue'
  ];
BEGIN
  IF NOT public.user_has_project_role_at_least(p_project_id, 'admin') THEN
    RAISE EXCEPTION 'Not authorized to delete project %', p_project_id USING ERRCODE = '42501';
  END IF;

  FOREACH v_table IN ARRAY v_child_tables LOOP
    EXECUTE format(
      'update public.%I set is_deleted = true, deleted_at = $1 where project_id = $2 and is_deleted = false',
      v_table
    ) USING v_deleted_at, p_project_id;
  END LOOP;

  UPDATE public.projects SET is_deleted = true, deleted_at = v_deleted_at WHERE id = p_project_id;
END;
$_$;


ALTER FUNCTION "public"."soft_delete_project"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submittal_blocking_rfis"("p_submittal_id" "uuid") RETURNS TABLE("id" "uuid", "rfi_number" "text", "title" "text", "status" "text", "project_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with sub as (
    select s.project_id, s.drawing_set_ids
    from public.submittals s
    where s.id = p_submittal_id and public.user_has_project_access(s.project_id)
  ),
  sheet_links as (
    select d.project_id,
           regexp_replace(upper(trim(x.num)), '[^A-Z0-9]', '', 'g') as norm_num
    from sub
    join public.drawings d
      on d.drawing_set_id = any(sub.drawing_set_ids) and coalesce(d.is_deleted, false) = false
    cross join lateral unnest(string_to_array(coalesce(d.linked_rfi_ids, ''), ',')) as x(num)
  )
  select distinct r.id, r.rfi_number, r.title, r.status, r.project_id
  from public.rfis r
  join sheet_links sl
    on sl.project_id = r.project_id
   and regexp_replace(upper(coalesce(r.rfi_number, '')), '[^A-Z0-9]', '', 'g') = sl.norm_num
  where coalesce(r.is_deleted, false) = false
    and coalesce(r.status, 'Open') not in ('Answered', 'Closed', 'Void')
    and sl.norm_num <> '';
$$;


ALTER FUNCTION "public"."submittal_blocking_rfis"("p_submittal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_drawing_set_counts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_set UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_set := OLD.drawing_set_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.drawing_set_id IS DISTINCT FROM OLD.drawing_set_id THEN
    IF OLD.drawing_set_id IS NOT NULL THEN
      UPDATE drawing_sets ds SET
        sheet_count         = COALESCE((SELECT COUNT(*) FROM drawings WHERE drawing_set_id = OLD.drawing_set_id AND (is_deleted IS NULL OR is_deleted = false)), 0),
        processed_count     = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'Processed') FROM drawings WHERE drawing_set_id = OLD.drawing_set_id AND (is_deleted IS NULL OR is_deleted = false)), 0),
        needs_review_count  = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'NeedsReview') FROM drawings WHERE drawing_set_id = OLD.drawing_set_id AND (is_deleted IS NULL OR is_deleted = false)), 0),
        failed_count        = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'Failed' OR upload_status = 'Failed') FROM drawings WHERE drawing_set_id = OLD.drawing_set_id AND (is_deleted IS NULL OR is_deleted = false)), 0),
        updated_at          = NOW()
      WHERE ds.id = OLD.drawing_set_id;
    END IF;
    v_set := NEW.drawing_set_id;
  ELSE
    v_set := NEW.drawing_set_id;
  END IF;

  IF v_set IS NOT NULL THEN
    UPDATE drawing_sets ds SET
      sheet_count         = COALESCE((SELECT COUNT(*) FROM drawings WHERE drawing_set_id = v_set AND (is_deleted IS NULL OR is_deleted = false)), 0),
      processed_count     = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'Processed') FROM drawings WHERE drawing_set_id = v_set AND (is_deleted IS NULL OR is_deleted = false)), 0),
      needs_review_count  = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'NeedsReview') FROM drawings WHERE drawing_set_id = v_set AND (is_deleted IS NULL OR is_deleted = false)), 0),
      failed_count        = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'Failed' OR upload_status = 'Failed') FROM drawings WHERE drawing_set_id = v_set AND (is_deleted IS NULL OR is_deleted = false)), 0),
      updated_at          = NOW()
    WHERE ds.id = v_set;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."sync_drawing_set_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_drawing_zone_proposals_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  NEW.cluster_size = COALESCE(array_length(NEW.finding_ids, 1), 0);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."tg_drawing_zone_proposals_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_submittal_rounds_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."tg_submittal_rounds_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_validate_drawing_zone_dependency_project"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  src_project uuid;
  tgt_project uuid;
BEGIN
  SELECT project_id INTO src_project FROM drawing_zones WHERE id = NEW.source_zone_id;
  SELECT project_id INTO tgt_project FROM drawing_zones WHERE id = NEW.target_zone_id;

  IF src_project IS NULL THEN
    RAISE EXCEPTION 'source_zone_id % does not exist in drawing_zones', NEW.source_zone_id;
  END IF;
  IF tgt_project IS NULL THEN
    RAISE EXCEPTION 'target_zone_id % does not exist in drawing_zones', NEW.target_zone_id;
  END IF;
  IF src_project <> NEW.project_id OR tgt_project <> NEW.project_id THEN
    RAISE EXCEPTION 'drawing_zone_dependencies: source/target zones must share project_id (got src=%, tgt=%, row=%)',
      src_project, tgt_project, NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."tg_validate_drawing_zone_dependency_project"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_projects_seed_handoff_items"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM seed_project_handoff_items(NEW.id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_projects_seed_handoff_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_project_access"("p_project_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.projects p
    join public.organization_members om
      on om.org_id = p.org_id
     and om.user_id = auth.uid()
    where p.id = p_project_id
      and (
        om.role in ('owner', 'admin')
        or exists (
          select 1 from public.user_projects up
          where up.project_id = p.id and up.user_id = auth.uid()
        )
      )
  );
$$;


ALTER FUNCTION "public"."user_has_project_access"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_project_role"("p_project_id" "uuid", "p_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_projects up
     WHERE up.user_id    = auth.uid()
       AND up.project_id = p_project_id
       AND up.role       = p_role
  );
$$;


ALTER FUNCTION "public"."user_has_project_role"("p_project_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_project_role_at_least"("p_project_id" "uuid", "p_min_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH role_levels(name, level) AS (
    VALUES ('viewer', 0), ('field', 1), ('pm', 2), ('admin', 3), ('owner', 3)
  ), my_role AS (
    SELECT rl.level
      FROM public.user_projects up
      JOIN role_levels rl ON rl.name = up.role
     WHERE up.user_id    = auth.uid()
       AND up.project_id = p_project_id
  ), required AS (
    SELECT level FROM role_levels WHERE name = p_min_role
  )
  SELECT EXISTS (
           SELECT 1
             FROM public.projects p
             JOIN public.organization_members om
               ON om.org_id = p.org_id AND om.user_id = auth.uid()
            WHERE p.id = p_project_id
              AND om.role IN ('owner', 'admin')
         )
      OR EXISTS (
           SELECT 1 FROM my_role m, required r WHERE m.level >= r.level
         );
$$;


ALTER FUNCTION "public"."user_has_project_role_at_least"("p_project_id" "uuid", "p_min_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_org_member"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."user_is_org_member"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_project_admin"("p_project_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.user_has_project_role_at_least(p_project_id, 'admin');
$$;


ALTER FUNCTION "public"."user_is_project_admin"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_system_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND up.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."user_is_system_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_org_role_at_least"("p_org_id" "uuid", "p_min_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = auth.uid()
      and (case m.role when 'owner' then 3 when 'admin' then 2 when 'member' then 1 else 0 end)
        >= (case p_min_role when 'owner' then 3 when 'admin' then 2 when 'member' then 1 else 0 end)
  );
$$;


ALTER FUNCTION "public"."user_org_role_at_least"("p_org_id" "uuid", "p_min_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."users_share_org"("p_a" "uuid", "p_b" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.organization_members m1
    join public.organization_members m2 on m2.org_id = m1.org_id
    where m1.user_id = p_a and m2.user_id = p_b
  );
$$;


ALTER FUNCTION "public"."users_share_org"("p_a" "uuid", "p_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_drawing_link_target"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  found_count int;
BEGIN
  CASE NEW.linked_record_type
    WHEN 'rfi' THEN
      SELECT COUNT(*) INTO found_count FROM rfis
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'work_package' THEN
      SELECT COUNT(*) INTO found_count FROM work_packages
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'delivery' THEN
      SELECT COUNT(*) INTO found_count FROM deliveries
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'photo' THEN
      SELECT COUNT(*) INTO found_count FROM documents
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'inspection' THEN
      SELECT COUNT(*) INTO found_count FROM inspections
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'daily_log' THEN
      SELECT COUNT(*) INTO found_count FROM daily_logs
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'document' THEN
      SELECT COUNT(*) INTO found_count FROM documents
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'change_order' THEN
      SELECT COUNT(*) INTO found_count FROM change_orders
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'submittal' THEN
      SELECT COUNT(*) INTO found_count FROM documents
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'drawing' THEN
      SELECT COUNT(*) INTO found_count FROM drawings
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'finding' THEN
      SELECT COUNT(*) INTO found_count
        FROM drawing_findings df
        JOIN drawing_analyses da ON da.id = df.analysis_id
        WHERE df.id = NEW.linked_record_id
          AND da.project_id = NEW.project_id;
    ELSE
      RAISE EXCEPTION 'validate_drawing_link_target: unknown linked_record_type %',
        NEW.linked_record_type;
  END CASE;

  IF found_count = 0 THEN
    RAISE EXCEPTION '% % not found in project %',
      NEW.linked_record_type, NEW.linked_record_id, NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_drawing_link_target"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_drawing_zone_polygon"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  pt jsonb;
  x numeric;
  y numeric;
begin
  if new.shape_type <> 'polygon' then return new; end if;
  if new.polygon_points is null then
    raise exception 'polygon_points required when shape_type=polygon';
  end if;
  for pt in select value from jsonb_array_elements(new.polygon_points) loop
    if jsonb_typeof(pt) <> 'array' or jsonb_array_length(pt) <> 2 then
      raise exception 'polygon_points: each element must be a [x,y] array, got %', pt;
    end if;
    x := (pt->>0)::numeric;
    y := (pt->>1)::numeric;
    if x < 0 or x > 1 or y < 0 or y > 1 then
      raise exception 'polygon_points: coordinates must be in [0,1], got (%,%)', x, y;
    end if;
  end loop;
  return new;
end $$;


ALTER FUNCTION "public"."validate_drawing_zone_polygon"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vendors_set_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.org_id is null then
    new.org_id := (select org_id from public.organization_members
                   where user_id = auth.uid() order by created_at limit 1);
  elsif not public.user_is_org_member(new.org_id) then
    raise exception 'Not a member of the target organization' using errcode = 'P0001';
  end if;
  if new.org_id is null then
    raise exception 'No organization for vendor' using errcode = 'P0001';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."vendors_set_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "storage"."allow_any_operation"("expected_operations" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$$;


ALTER FUNCTION "storage"."allow_any_operation"("expected_operations" "text"[]) OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."allow_only_operation"("expected_operation" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$$;


ALTER FUNCTION "storage"."allow_only_operation"("expected_operation" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."can_insert_object"("bucketid" "text", "name" "text", "owner" "uuid", "metadata" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


ALTER FUNCTION "storage"."can_insert_object"("bucketid" "text", "name" "text", "owner" "uuid", "metadata" "jsonb") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."enforce_bucket_name_length"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


ALTER FUNCTION "storage"."enforce_bucket_name_length"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."extension"("name" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Get the last path segment (the actual filename)
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    -- Extract extension: reverse, split on '.', then reverse again
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


ALTER FUNCTION "storage"."extension"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."filename"("name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


ALTER FUNCTION "storage"."filename"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."foldername"("name" "text") RETURNS "text"[]
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


ALTER FUNCTION "storage"."foldername"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."get_common_prefix"("p_key" "text", "p_prefix" "text", "p_delimiter" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$$;


ALTER FUNCTION "storage"."get_common_prefix"("p_key" "text", "p_prefix" "text", "p_delimiter" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."get_size_by_bucket"() RETURNS TABLE("size" bigint, "bucket_id" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint)::bigint as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


ALTER FUNCTION "storage"."get_size_by_bucket"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."list_multipart_uploads_with_delimiter"("bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer DEFAULT 100, "next_key_token" "text" DEFAULT ''::"text", "next_upload_token" "text" DEFAULT ''::"text") RETURNS TABLE("key" "text", "id" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


ALTER FUNCTION "storage"."list_multipart_uploads_with_delimiter"("bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer, "next_key_token" "text", "next_upload_token" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."list_objects_with_delimiter"("_bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer DEFAULT 100, "start_after" "text" DEFAULT ''::"text", "next_token" "text" DEFAULT ''::"text", "sort_order" "text" DEFAULT 'asc'::"text") RETURNS TABLE("name" "text", "id" "uuid", "metadata" "jsonb", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


ALTER FUNCTION "storage"."list_objects_with_delimiter"("_bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer, "start_after" "text", "next_token" "text", "sort_order" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."operation"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


ALTER FUNCTION "storage"."operation"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."protect_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "storage"."protect_delete"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."search"("prefix" "text", "bucketname" "text", "limits" integer DEFAULT 100, "levels" integer DEFAULT 1, "offsets" integer DEFAULT 0, "search" "text" DEFAULT ''::"text", "sortcolumn" "text" DEFAULT 'name'::"text", "sortorder" "text" DEFAULT 'asc'::"text") RETURNS TABLE("name" "text", "id" "uuid", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone, "metadata" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


ALTER FUNCTION "storage"."search"("prefix" "text", "bucketname" "text", "limits" integer, "levels" integer, "offsets" integer, "search" "text", "sortcolumn" "text", "sortorder" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."search_by_timestamp"("p_prefix" "text", "p_bucket_id" "text", "p_limit" integer, "p_level" integer, "p_start_after" "text", "p_sort_order" "text", "p_sort_column" "text", "p_sort_column_after" "text") RETURNS TABLE("key" "text", "name" "text", "id" "uuid", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone, "metadata" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


ALTER FUNCTION "storage"."search_by_timestamp"("p_prefix" "text", "p_bucket_id" "text", "p_limit" integer, "p_level" integer, "p_start_after" "text", "p_sort_order" "text", "p_sort_column" "text", "p_sort_column_after" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."search_v2"("prefix" "text", "bucket_name" "text", "limits" integer DEFAULT 100, "levels" integer DEFAULT 1, "start_after" "text" DEFAULT ''::"text", "sort_order" "text" DEFAULT 'asc'::"text", "sort_column" "text" DEFAULT 'name'::"text", "sort_column_after" "text" DEFAULT ''::"text") RETURNS TABLE("key" "text", "name" "text", "id" "uuid", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone, "metadata" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


ALTER FUNCTION "storage"."search_v2"("prefix" "text", "bucket_name" "text", "limits" integer, "levels" integer, "start_after" "text", "sort_order" "text", "sort_column" "text", "sort_column_after" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


ALTER FUNCTION "storage"."update_updated_at_column"() OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "public"."action_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "title" "text",
    "description" "text",
    "assigned_to" "text",
    "due_date" "date",
    "priority" "text" DEFAULT 'Medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'Open'::"text" NOT NULL,
    "meeting_reference" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "category" "text" DEFAULT 'GENERAL'::"text",
    "constraint_type" "text",
    "constraint_number" "text",
    "project_area" "text",
    "work_package_id" "uuid",
    CONSTRAINT "chk_action_items_priority" CHECK (("priority" = ANY (ARRAY['Low'::"text", 'Medium'::"text", 'High'::"text", 'Critical'::"text"]))),
    CONSTRAINT "chk_action_items_status" CHECK (("status" = ANY (ARRAY['Open'::"text", 'In Progress'::"text", 'Complete'::"text", 'Cancelled'::"text", 'Resolved'::"text", 'Closed'::"text"])))
);


ALTER TABLE "public"."action_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "entity_type" "text",
    "entity_id" "uuid",
    "action" "text",
    "description" "text",
    "performed_by" "text",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "entity_name" "text"
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "user_messages" "jsonb" NOT NULL,
    "final_answer" "text",
    "tool_calls" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alerts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "alert_type" "text",
    "severity" "text" DEFAULT 'Medium'::"text" NOT NULL,
    "title" "text",
    "description" "text",
    "entity_type" "text",
    "entity_id" "uuid",
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "dismissed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_dismissed" boolean DEFAULT false NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "message" "text",
    "record_type" "text",
    "record_id" "uuid",
    "related_entity" "text",
    "related_record_id" "uuid",
    "metric_snapshot" "text",
    CONSTRAINT "chk_alerts_severity" CHECK (("severity" = ANY (ARRAY['Critical'::"text", 'High'::"text", 'Medium'::"text", 'Low'::"text"]))),
    CONSTRAINT "chk_alerts_status" CHECK (("status" = ANY (ARRAY['Active'::"text", 'Acknowledged'::"text", 'Resolved'::"text", 'Dismissed'::"text"])))
);


ALTER TABLE "public"."alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backcharge_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "backcharge_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "from_status" "text",
    "to_status" "text",
    "detail" "text",
    "actor" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."backcharge_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backcharge_tm_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "backcharge_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "ticket_number" "text",
    "ticket_date" "date",
    "description" "text",
    "labor_hours" numeric(10,2) DEFAULT 0 NOT NULL,
    "labor_rate" numeric(10,2) DEFAULT 0 NOT NULL,
    "equipment_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "material_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "markup_percent" numeric(6,2) DEFAULT 0 NOT NULL,
    "amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "signed_by" "text",
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."backcharge_tm_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backcharges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "backcharge_number" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "responsible_party" "text",
    "responsible_party_type" "text" DEFAULT 'subcontractor'::"text",
    "reason_code" "text" DEFAULT 'rework'::"text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "incident_date" "date",
    "notice_date" "date",
    "linked_co_id" "uuid",
    "source_rfi_id" "uuid",
    "cost_code_id" "uuid",
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "backcharges_reason_code_check" CHECK (("reason_code" = ANY (ARRAY['rework'::"text", 'cleanup'::"text", 'delay'::"text", 'damage'::"text", 'defective_material'::"text", 'schedule'::"text", 'other'::"text"]))),
    CONSTRAINT "backcharges_responsible_party_type_check" CHECK (("responsible_party_type" = ANY (ARRAY['subcontractor'::"text", 'vendor'::"text", 'supplier'::"text", 'gc'::"text", 'other'::"text"]))),
    CONSTRAINT "backcharges_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'notice_sent'::"text", 'pending'::"text", 'disputed'::"text", 'approved'::"text", 'rejected'::"text", 'collected'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."backcharges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_config" (
    "scope" "text" DEFAULT 'default'::"text" NOT NULL,
    "stripe_price_pro" "text",
    "stripe_price_business" "text",
    "stripe_webhook_secret" "text",
    "stripe_webhook_endpoint_id" "text",
    "livemode" boolean,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."billing_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stripe_event_id" "text" NOT NULL,
    "type" "text",
    "org_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."billing_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budget_hour_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "scope_item" "text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "is_specialty" boolean DEFAULT false,
    "shop_hours_budget" numeric(10,2) DEFAULT 0,
    "shop_hours_actual" numeric(10,2) DEFAULT 0,
    "field_hours_budget" numeric(10,2) DEFAULT 0,
    "field_hours_actual" numeric(10,2) DEFAULT 0,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."budget_hour_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."change_orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "co_number" "text",
    "title" "text",
    "description" "text",
    "reason_code" "text",
    "status" "text" DEFAULT 'Draft'::"text" NOT NULL,
    "cost_code_id" "uuid",
    "co_amount" numeric,
    "submitted_date" "date",
    "approved_date" "date",
    "approved_by" "text",
    "notes" "text",
    "attachments" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "margin_percent" numeric DEFAULT 0,
    "schedule_impact_days" integer DEFAULT 0,
    "source_rfi_id" "uuid",
    "sov_line_item_id" "uuid",
    "sov_line_number" integer,
    CONSTRAINT "chk_change_orders_status" CHECK (("status" = ANY (ARRAY['Draft'::"text", 'Submitted'::"text", 'Under Review'::"text", 'Approved'::"text", 'Rejected'::"text", 'Void'::"text"])))
);


ALTER TABLE "public"."change_orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."change_orders"."margin_percent" IS 'Margin percentage (0-100) entered at CO creation. Margin dollars = co_amount * margin_percent / 100.';



COMMENT ON COLUMN "public"."change_orders"."source_rfi_id" IS 'RFI this CO was converted from (rfis.id); set when a cost-impact RFI is turned into a change order.';



COMMENT ON COLUMN "public"."change_orders"."sov_line_item_id" IS 'SOV line item (sov_items.id) this CO adjusts.';



COMMENT ON COLUMN "public"."change_orders"."sov_line_number" IS 'Denormalized SOV line_item_number for display.';



CREATE TABLE IF NOT EXISTS "public"."change_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "title" "text",
    "description" "text",
    "requested_by" "text",
    "request_date" "date",
    "reason" "text",
    "affected_areas" "text",
    "estimated_cost_impact" numeric,
    "estimated_schedule_impact_days" integer,
    "priority" "text" DEFAULT 'Medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'Submitted'::"text" NOT NULL,
    "scope_impact" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "chk_change_requests_priority" CHECK (("priority" = ANY (ARRAY['Low'::"text", 'Medium'::"text", 'High'::"text", 'Critical'::"text"]))),
    CONSTRAINT "chk_change_requests_status" CHECK (("status" = ANY (ARRAY['Submitted'::"text", 'Under Review'::"text", 'Approved'::"text", 'Rejected'::"text", 'Deferred'::"text"])))
);


ALTER TABLE "public"."change_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "author_name" "text",
    "body" "text" NOT NULL,
    "mentions" "text"[] DEFAULT '{}'::"text"[],
    "edited_at" timestamp with time zone,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'open'::"text",
    "status_changed_at" timestamp with time zone,
    "status_changed_by" "uuid",
    CONSTRAINT "comments_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['rfi'::"text", 'submittal'::"text", 'drawing_set'::"text", 'drawing'::"text", 'schedule_task'::"text", 'delivery'::"text", 'change_order'::"text", 'change_request'::"text", 'work_package'::"text", 'inspection'::"text", 'punchlist_item'::"text", 'daily_log'::"text", 'action_item'::"text", 'meeting'::"text", 'project'::"text"]))),
    CONSTRAINT "comments_status_check" CHECK ((("status" IS NULL) OR ("status" = ANY (ARRAY['open'::"text", 'addressed'::"text", 'rejected'::"text", 'clarification'::"text"]))))
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "first_name" "text",
    "last_name" "text",
    "company" "text",
    "role" "text",
    "contact_type" "text",
    "email" "text",
    "phone" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cost_codes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "code" "text",
    "description" "text",
    "category" "text",
    "budget" numeric,
    "actual" numeric DEFAULT 0,
    "committed" numeric DEFAULT 0,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "cost_code_number" "text",
    "budget_amount" numeric DEFAULT 0,
    "actual_cost" numeric DEFAULT 0,
    "committed_cost" numeric DEFAULT 0,
    "forecast_to_complete" numeric DEFAULT 0,
    "notes" "text",
    "phase" "text" DEFAULT 'Materials'::"text"
);


ALTER TABLE "public"."cost_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "date" "date",
    "superintendent" "text",
    "crew_name" "text",
    "headcount" integer,
    "hours_worked" numeric,
    "weather_description" "text",
    "temperature" "text",
    "wind_speed" "text",
    "activities" "text",
    "equipment_used" "text",
    "delays" "text",
    "delay_hours" numeric,
    "safety_incidents" integer DEFAULT 0,
    "safety_notes" "text",
    "toolbox_talk_completed" boolean DEFAULT false,
    "status" "text" DEFAULT 'Draft'::"text",
    "photos" "jsonb" DEFAULT '[]'::"jsonb",
    "wp_progress" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "related_action_item_ids" "jsonb" DEFAULT '[]'::"jsonb",
    "related_rfi_ids" "jsonb" DEFAULT '[]'::"jsonb",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "delivery_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "schedule_task_ids" "uuid"[] DEFAULT '{}'::"uuid"[]
);


ALTER TABLE "public"."daily_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."daily_logs"."related_action_item_ids" IS 'Optional array of action_items.id strings linked from this daily log';



COMMENT ON COLUMN "public"."daily_logs"."related_rfi_ids" IS 'Optional array of rfis.id strings linked from this daily log';



CREATE TABLE IF NOT EXISTS "public"."default_cost_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cost_code_number" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" NOT NULL,
    "default_budget_amount" numeric DEFAULT 0,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."default_cost_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deliveries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "work_package_id" "uuid",
    "vendor" "text",
    "po_number" "text",
    "scheduled_date" "date",
    "required_date" "date",
    "actual_date" "date",
    "status" "text" DEFAULT 'Scheduled'::"text" NOT NULL,
    "priority" "text" DEFAULT 'Normal'::"text" NOT NULL,
    "pieces" integer,
    "weight_tons" numeric,
    "description" "text",
    "notes" "text",
    "special_instructions" "text",
    "carrier" "text",
    "tracking_number" "text",
    "received_by" "text",
    "receiving_location" "text",
    "contact_name" "text",
    "contact_phone" "text",
    "inspection_required" boolean DEFAULT false,
    "delivery_type" "text",
    "procurement_category" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "delivery_title" "text",
    "load_number" "text",
    "load_category" "text",
    "capacity_lbs" integer,
    "shipping_ticket_url" "text",
    "shipping_ticket_path" "text",
    "shipping_ticket_name" "text",
    "impacts_activity_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "is_long_lead" boolean DEFAULT false,
    "lead_time_weeks" integer,
    "order_placed_date" "date",
    "expected_ship_date" "date",
    "area" "text",
    "sequence_number" "text",
    "delivery_number" "text",
    CONSTRAINT "chk_deliveries_priority" CHECK (("priority" = ANY (ARRAY['Critical'::"text", 'High'::"text", 'Normal'::"text", 'Low'::"text"]))),
    CONSTRAINT "chk_deliveries_status" CHECK (("status" = ANY (ARRAY['Scheduled'::"text", 'In Transit'::"text", 'Delivered'::"text", 'Partial'::"text", 'Rejected'::"text", 'Delayed'::"text"])))
);


ALTER TABLE "public"."deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "delivery_id" "uuid",
    "line_no" integer,
    "qty" integer DEFAULT 1 NOT NULL,
    "assembly_mark" "text",
    "sequence" "text",
    "profile" "text",
    "length_text" "text",
    "length_inches" numeric,
    "grade" "text",
    "finish" "text",
    "weight_lbs" numeric,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."delivery_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "parent_folder_id" "uuid",
    "name" "text" NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "document_folders_name_check" CHECK (("length"(TRIM(BOTH FROM "name")) > 0))
);


ALTER TABLE "public"."document_folders" OWNER TO "postgres";


COMMENT ON TABLE "public"."document_folders" IS 'Hierarchical folders that organise the Documents repo per project. NULL parent_folder_id = root folder.';



COMMENT ON COLUMN "public"."document_folders"."parent_folder_id" IS 'Self-FK for nesting. NULL = top-level folder. ON DELETE CASCADE removes child folders when a parent is hard-deleted, but the soft-delete path (is_deleted=true) is the normal one.';



CREATE TABLE IF NOT EXISTS "public"."document_import_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "linked_folder_id" "uuid",
    "provider" "text" NOT NULL,
    "external_file_id" "text" NOT NULL,
    "external_file_url" "text",
    "file_name" "text" NOT NULL,
    "file_size" bigint,
    "mime_type" "text",
    "external_last_modified" timestamp with time zone,
    "import_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "target_folder_id" "uuid",
    "created_document_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "document_import_queue_import_status_check" CHECK (("import_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'imported'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."document_import_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "title" "text",
    "document_type" "text",
    "category" "text",
    "file_url" "text",
    "file_name" "text",
    "file_size" integer,
    "version" "text",
    "status" "text",
    "description" "text",
    "uploaded_by" "text",
    "tags" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "discipline" "text" DEFAULT 'General'::"text",
    "drawing_number" "text",
    "revision" "text",
    "sheet_number" "text",
    "display_name" "text",
    "file_type" "text",
    "file_size_kb" integer,
    "mime_type" "text",
    "revision_number" "text" DEFAULT '0'::"text",
    "revision_date" "date",
    "uploaded_date" timestamp with time zone,
    "linked_wp_id" "uuid",
    "review_lead_time" integer DEFAULT 14,
    "due_date" "date",
    "is_submittal" boolean DEFAULT false,
    "document_number" "text",
    "work_package_id" "uuid",
    "rfi_id" "uuid",
    "delivery_id" "uuid",
    "change_order_id" "uuid",
    "submittal_id" "uuid",
    "is_current" boolean DEFAULT true,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "folder_id" "uuid",
    "external_provider" "text",
    "external_file_id" "text",
    "external_file_url" "text",
    "external_drive_id" "text",
    "external_site_id" "text",
    "external_last_modified" timestamp with time zone,
    "external_synced_at" timestamp with time zone,
    "linked_folder_id" "uuid",
    "import_source" "text",
    CONSTRAINT "documents_import_source_check" CHECK (("import_source" = ANY (ARRAY['upload'::"text", 'email'::"text", 'sharepoint'::"text", 'onedrive'::"text", 'google_drive'::"text", 'dropbox'::"text", 'bluebeam'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "drawing_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "from_value" "text",
    "to_value" "text",
    "actor_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_drawing_activity_event_type" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'stage_changed'::"text", 'revision_changed'::"text", 'approval_changed'::"text", 'deleted'::"text", 'restored'::"text", 'ai_status_changed'::"text", 'superseded'::"text"])))
);


ALTER TABLE "public"."drawing_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_analyses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid",
    "file_name" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "storage_path" "text",
    "drawing_stage" "text",
    "revision" "text",
    "issue_date" "date",
    "uploaded_by" "text",
    "uploaded_at" timestamp with time zone DEFAULT "now"(),
    "analysis_status" "text" DEFAULT 'pending'::"text",
    "error_message" "text",
    "sheet_count" integer,
    "ai_summary" "text",
    "model" "text",
    "raw_ai_response" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "imported_set_id" "uuid",
    CONSTRAINT "drawing_analyses_analysis_status_check" CHECK (("analysis_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'complete'::"text", 'error'::"text"]))),
    CONSTRAINT "drawing_analyses_drawing_stage_check" CHECK ((("drawing_stage" IS NULL) OR ("drawing_stage" = ANY (ARRAY['OFA'::"text", 'BFA'::"text", 'OFS'::"text", 'Released'::"text", 'IFA'::"text", 'IFC'::"text", 'Shop'::"text", 'Revision'::"text"]))))
);


ALTER TABLE "public"."drawing_analyses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_findings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "analysis_id" "uuid",
    "sheet_number" "text",
    "finding_type" "text",
    "severity" "text",
    "description" "text" NOT NULL,
    "recommended_action" "text",
    "linked_rfi_id" "uuid",
    "dismissed" boolean DEFAULT false,
    "dismissed_at" timestamp with time zone,
    "dismissed_by" "text",
    "page_index" integer,
    "x_min" numeric,
    "y_min" numeric,
    "x_max" numeric,
    "y_max" numeric,
    "bbox_source" "text",
    CONSTRAINT "chk_drawing_findings_bbox_range" CHECK (((("x_min" IS NULL) AND ("y_min" IS NULL) AND ("x_max" IS NULL) AND ("y_max" IS NULL)) OR (("x_min" >= (0)::numeric) AND ("x_min" <= (1)::numeric) AND ("y_min" >= (0)::numeric) AND ("y_min" <= (1)::numeric) AND ("x_max" >= (0)::numeric) AND ("x_max" <= (1)::numeric) AND ("y_max" >= (0)::numeric) AND ("y_max" <= (1)::numeric) AND ("x_max" > "x_min") AND ("y_max" > "y_min")))),
    CONSTRAINT "chk_drawing_findings_bbox_source" CHECK ((("bbox_source" IS NULL) OR ("bbox_source" = ANY (ARRAY['ai'::"text", 'user'::"text", 'derived'::"text"])))),
    CONSTRAINT "drawing_findings_finding_type_check" CHECK (("finding_type" = ANY (ARRAY['missing_info'::"text", 'coordination_conflict'::"text", 'callout_issue'::"text", 'revision_delta'::"text", 'dimension_concern'::"text", 'aess_concern'::"text"]))),
    CONSTRAINT "drawing_findings_severity_check" CHECK (("severity" = ANY (ARRAY['critical'::"text", 'high'::"text", 'medium'::"text", 'low'::"text", 'info'::"text"])))
);


ALTER TABLE "public"."drawing_findings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_impacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "drawing_revision_id" "uuid" NOT NULL,
    "impact_type" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "notes" "text",
    "assigned_to" "uuid",
    "due_date" "date",
    "resolved_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "drawing_impacts_impact_type_check" CHECK (("impact_type" = ANY (ARRAY['fabrication'::"text", 'erection'::"text", 'embed'::"text", 'anchor_bolts'::"text", 'connections'::"text", 'material_takeoff'::"text", 'shop_drawing_required'::"text", 'rfi_followup'::"text", 'change_order'::"text", 'field_rework'::"text"]))),
    CONSTRAINT "drawing_impacts_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "drawing_impacts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_review'::"text", 'ready'::"text", 'blocked'::"text", 'resolved'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."drawing_impacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "drawing_zone_id" "uuid" NOT NULL,
    "drawing_id" "uuid" NOT NULL,
    "drawing_revision_id" "uuid" NOT NULL,
    "linked_record_type" "text" NOT NULL,
    "linked_record_id" "uuid" NOT NULL,
    "link_role" "text" DEFAULT 'related'::"text" NOT NULL,
    "link_source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "confidence_score" numeric(5,4),
    "is_confirmed" boolean DEFAULT true NOT NULL,
    "confirmed_by" "uuid",
    "confirmed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "removed_by" "uuid",
    "removed_at" timestamp with time zone,
    CONSTRAINT "drawing_links_record_type_allowed" CHECK (("linked_record_type" = ANY (ARRAY['rfi'::"text", 'work_package'::"text", 'delivery'::"text", 'photo'::"text", 'inspection'::"text", 'daily_log'::"text", 'document'::"text", 'change_order'::"text", 'submittal'::"text", 'drawing'::"text", 'finding'::"text"]))),
    CONSTRAINT "drawing_links_role_allowed" CHECK (("link_role" = ANY (ARRAY['related'::"text", 'affects'::"text", 'blocks'::"text", 'documents'::"text", 'verifies'::"text", 'delivers_to'::"text", 'observes'::"text"]))),
    CONSTRAINT "drawing_links_source_allowed" CHECK (("link_source" = ANY (ARRAY['manual'::"text", 'ai_suggested'::"text", 'ai_confirmed'::"text", 'imported'::"text", 'inherited'::"text"])))
);


ALTER TABLE "public"."drawing_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_markups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "drawing_revision_id" "uuid",
    "author_id" "uuid",
    "markup_type" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "page_number" integer DEFAULT 1 NOT NULL,
    "page_x" numeric(12,4),
    "page_y" numeric(12,4),
    "width" numeric(12,4),
    "height" numeric(12,4),
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "drawing_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "color" "text",
    "author_email" "text",
    "author_name" "text",
    CONSTRAINT "drawing_markups_markup_type_check" CHECK (("markup_type" = ANY (ARRAY['cloud'::"text", 'pin'::"text", 'dimension_note'::"text", 'qa_note'::"text", 'field_note'::"text", 'coordination_note'::"text"]))),
    CONSTRAINT "drawing_markups_page_number_check" CHECK (("page_number" > 0)),
    CONSTRAINT "drawing_markups_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'resolved'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."drawing_markups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "drawing_revision_id" "uuid" NOT NULL,
    "review_role" "text" NOT NULL,
    "reviewer_id" "uuid",
    "decision" "text" DEFAULT 'pending'::"text" NOT NULL,
    "comments" "text",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "drawing_reviews_decision_check" CHECK (("decision" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'approved_with_notes'::"text", 'rejected'::"text", 'not_required'::"text"]))),
    CONSTRAINT "drawing_reviews_review_role_check" CHECK (("review_role" = ANY (ARRAY['project_manager'::"text", 'detailer'::"text", 'shop'::"text", 'field_ops'::"text", 'document_control'::"text", 'executive'::"text"])))
);


ALTER TABLE "public"."drawing_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "drawing_id" "text",
    "sheet_number" "text",
    "title" "text",
    "discipline" "text" DEFAULT 'Structural'::"text",
    "revision_number" "text" DEFAULT '0'::"text",
    "stage" "text" DEFAULT 'Not Started'::"text",
    "submitted_date" "date",
    "return_date" "date",
    "due_date" "date",
    "reviewer" "text",
    "spec_section" "text",
    "notes" "text",
    "linked_rfi_ids" "text",
    "priority_flag" boolean DEFAULT false,
    "override_reason" "text",
    "drawing_set_name" "text",
    "file_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "ifc_status" "text",
    "is_superseded" boolean DEFAULT false,
    "set_approval_status" "text",
    "set_approved_date" timestamp with time zone,
    "thumbnail_url" "text",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "drawing_set_id" "uuid",
    "upload_status" "text" DEFAULT 'Uploaded'::"text",
    "ai_extraction_status" "text" DEFAULT 'Pending'::"text",
    "extracted_text" "text",
    "hyperlinks" "jsonb" DEFAULT '[]'::"jsonb",
    "upload_batch_id" "uuid",
    "ai_extraction_error" "text",
    "last_extracted_at" timestamp with time zone,
    "pdf_page" integer DEFAULT 1,
    "callouts" "jsonb" DEFAULT '[]'::"jsonb",
    "fabrication_start_date" "date",
    "fabrication_finish_date" "date",
    "ready_for_install_date" "date",
    "final_delivery_date" "date",
    "markup" "jsonb" DEFAULT '[]'::"jsonb",
    "markup_scale" numeric,
    CONSTRAINT "chk_drawings_ai_extraction_status" CHECK (("ai_extraction_status" = ANY (ARRAY['Pending'::"text", 'Extracting'::"text", 'Processed'::"text", 'NeedsReview'::"text", 'Failed'::"text"]))),
    CONSTRAINT "chk_drawings_stage" CHECK (("stage" = ANY (ARRAY['Not Started'::"text", 'IFA'::"text", 'OFA'::"text", 'BFA'::"text", 'OFS'::"text", 'IFC'::"text", 'Released'::"text"]))),
    CONSTRAINT "chk_drawings_upload_status" CHECK (("upload_status" = ANY (ARRAY['Uploading'::"text", 'Uploaded'::"text", 'Failed'::"text"])))
);


ALTER TABLE "public"."drawings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."drawings"."stage" IS '7-stage detailing/submittal flow: Not Started -> IFA (In For Approval, internal prep) -> OFA (Out For Approval, with EOR/AOR) -> BFA (Back From Approval) -> OFS (Out For Scrub, post-approval cleanup) -> IFC (Issued For Construction, record copy to GC) -> Released (S&H internal release to fab shop). DEPRECATED for workflow rollups: read submittals.status instead. Single source of truth: src/lib/submittalStageMapping.js.';



COMMENT ON COLUMN "public"."drawings"."override_reason" IS 'DEPRECATED: Feature never shipped. No writers remain. Drop candidate.';



COMMENT ON COLUMN "public"."drawings"."drawing_set_name" IS 'DEPRECATED: Use drawing_set_id FK instead. Kept for backward compatibility with legacy readers and the import path. Will be dropped in migration 026.';



COMMENT ON COLUMN "public"."drawings"."ifc_status" IS 'DEPRECATED: Superseded by stage = ''Released''. No writers remain. Drop candidate.';



COMMENT ON COLUMN "public"."drawings"."set_approval_status" IS 'DEPRECATED: workflow lives on submittals table (Sprint 2). Retained for legacy drawings-page display.';



COMMENT ON COLUMN "public"."drawings"."markup_scale" IS 'Per-drawing scale multiplier: real_inches_per_pdf_inch. Calibrated by the user via the CALIBRATE tool in the PDF viewer. NULL = not calibrated; measurements show raw page-inches.';



CREATE OR REPLACE VIEW "public"."drawing_register_view" WITH ("security_invoker"='true') AS
 SELECT "d"."id" AS "drawing_id",
    "d"."project_id",
    "d"."sheet_number",
    "d"."title" AS "sheet_title",
    "d"."discipline",
    "d"."drawing_set_name",
    "d"."stage",
    "cur"."id" AS "current_revision_id",
    "cur"."revision_code" AS "current_revision",
    "cur"."release_status" AS "current_status",
    "cur"."issued_at" AS "current_issued_at",
    ( SELECT "count"(*) AS "count"
           FROM "public"."drawing_impacts" "i"
          WHERE (("i"."drawing_revision_id" = "cur"."id") AND ("i"."status" <> ALL (ARRAY['resolved'::"text", 'closed'::"text"])))) AS "open_impact_count",
    ( SELECT "count"(*) AS "count"
           FROM "public"."drawing_reviews" "r"
          WHERE (("r"."drawing_revision_id" = "cur"."id") AND ("r"."decision" = 'pending'::"text"))) AS "pending_review_count",
    ( SELECT "count"(*) AS "count"
           FROM "public"."drawing_links" "l"
          WHERE (("l"."drawing_id" = "d"."id") AND ("l"."linked_record_type" = 'rfi'::"text") AND ("l"."removed_at" IS NULL))) AS "rfi_count",
    ( SELECT "count"(*) AS "count"
           FROM "public"."drawing_links" "l"
          WHERE (("l"."drawing_id" = "d"."id") AND ("l"."linked_record_type" = 'work_package'::"text") AND ("l"."removed_at" IS NULL))) AS "work_package_count",
    GREATEST("d"."updated_at", "cur"."updated_at") AS "last_activity"
   FROM ("public"."drawings" "d"
     LEFT JOIN LATERAL ( SELECT "r"."id",
            "r"."project_id",
            "r"."drawing_id",
            "r"."revision_code",
            "r"."revision_name",
            "r"."sheet_number",
            "r"."sheet_title",
            "r"."file_id",
            "r"."version_number",
            "r"."is_current",
            "r"."issued_at",
            "r"."received_at",
            "r"."supersedes_revision_id",
            "r"."viewer_width",
            "r"."viewer_height",
            "r"."created_by",
            "r"."created_at",
            "r"."updated_by",
            "r"."updated_at",
            "r"."archived_at",
            "r"."release_status"
           FROM "public"."drawing_revisions" "r"
          WHERE (("r"."drawing_id" = "d"."id") AND ("r"."is_current" = true))
         LIMIT 1) "cur" ON (true))
  WHERE ("d"."is_deleted" = false);


ALTER VIEW "public"."drawing_register_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_revision_comparisons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid",
    "from_analysis_id" "uuid",
    "to_analysis_id" "uuid",
    "compare_status" "text" DEFAULT 'pending'::"text",
    "error_message" "text",
    "ai_summary" "text",
    "delta_count" integer,
    "model" "text",
    "requested_by" "text",
    "raw_ai_response" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "from_revision_id" "uuid",
    "to_revision_id" "uuid",
    "drawing_id" "uuid",
    "source" "text" DEFAULT 'analysis'::"text" NOT NULL,
    CONSTRAINT "chk_diff_analyses_differ" CHECK (("from_analysis_id" <> "to_analysis_id")),
    CONSTRAINT "chk_revision_comparison_source" CHECK (((("source" = 'analysis'::"text") AND ("from_analysis_id" IS NOT NULL) AND ("to_analysis_id" IS NOT NULL)) OR (("source" = 'revision'::"text") AND ("from_revision_id" IS NOT NULL) AND ("to_revision_id" IS NOT NULL) AND ("drawing_id" IS NOT NULL) AND ("from_revision_id" <> "to_revision_id")))),
    CONSTRAINT "drawing_revision_comparisons_compare_status_check" CHECK (("compare_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'complete'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."drawing_revision_comparisons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_revision_deltas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "comparison_id" "uuid",
    "sheet_number" "text",
    "delta_type" "text",
    "severity" "text",
    "description" "text" NOT NULL,
    "recommended_action" "text",
    "linked_rfi_id" "uuid",
    "dismissed" boolean DEFAULT false,
    "dismissed_at" timestamp with time zone,
    "dismissed_by" "text",
    CONSTRAINT "drawing_revision_deltas_delta_type_check" CHECK (("delta_type" = ANY (ARRAY['sheet_added'::"text", 'sheet_removed'::"text", 'grid_shift'::"text", 'connection_change'::"text", 'dimension_change'::"text", 'detail_revised'::"text", 'callout_added'::"text", 'callout_removed'::"text", 'material_change'::"text", 'elevation_change'::"text", 'other'::"text"]))),
    CONSTRAINT "drawing_revision_deltas_severity_check" CHECK (("severity" = ANY (ARRAY['critical'::"text", 'high'::"text", 'medium'::"text", 'low'::"text", 'info'::"text"])))
);


ALTER TABLE "public"."drawing_revision_deltas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_revision_summaries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "drawing_set_id" "uuid",
    "set_name" "text",
    "sheets_changed" integer DEFAULT 0 NOT NULL,
    "high_risk_count" integer DEFAULT 0 NOT NULL,
    "likely_rfi" boolean DEFAULT false NOT NULL,
    "impact_level" "text" DEFAULT 'low'::"text" NOT NULL,
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "generated_by" "uuid",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "drawing_revision_summaries_impact_level_check" CHECK (("impact_level" = ANY (ARRAY['none'::"text", 'low'::"text", 'medium'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."drawing_revision_summaries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_sets" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "set_name" "text",
    "description" "text",
    "issued_date" "date",
    "revision" "text",
    "status" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "project_name" "text",
    "discipline" "text",
    "issued_by" "text",
    "notes" "text",
    "stage_summary" "text",
    "revision_summary" "text",
    "upload_batch_id" "uuid",
    "sheet_count" integer DEFAULT 0,
    "processed_count" integer DEFAULT 0,
    "needs_review_count" integer DEFAULT 0,
    "failed_count" integer DEFAULT 0,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "set_approval_status" "text",
    "set_approved_date" "date",
    "set_approved_by" "text",
    "set_approval_notes" "text",
    "file_url" "text",
    "revision_history" "text",
    "titleblock_title_rect" "jsonb",
    "titleblock_number_rect" "jsonb",
    "current_submittal_id" "uuid",
    "submittal_status" "text",
    "is_locked" boolean DEFAULT false NOT NULL,
    "locked_at" timestamp with time zone,
    "locked_by" "uuid",
    "locked_reason" "text",
    "eor_reviewer" "text",
    "area_sequence" "text",
    "due_date" "date",
    "linked_work_package_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "detailing_state" "text",
    "material_impacted" boolean,
    "long_lead_impact" boolean,
    CONSTRAINT "chk_drawing_sets_approval_status" CHECK ((("set_approval_status" IS NULL) OR ("set_approval_status" = ANY (ARRAY['approved'::"text", 'rejected'::"text", 'superseded'::"text", 'pending_review'::"text"])))),
    CONSTRAINT "drawing_sets_detailing_state_check" CHECK ((("detailing_state" IS NULL) OR ("detailing_state" = ANY (ARRAY['Not Started'::"text", 'In Detailing'::"text", 'Internal Review'::"text", 'Ready to Submit'::"text", 'Partially Released'::"text", 'Released for Erection'::"text"])))),
    CONSTRAINT "drawing_sets_titleblock_number_rect_shape" CHECK ((("titleblock_number_rect" IS NULL) OR (("jsonb_typeof"("titleblock_number_rect") = 'object'::"text") AND ("jsonb_typeof"(("titleblock_number_rect" -> 'x'::"text")) = 'number'::"text") AND ("jsonb_typeof"(("titleblock_number_rect" -> 'y'::"text")) = 'number'::"text") AND ("jsonb_typeof"(("titleblock_number_rect" -> 'width'::"text")) = 'number'::"text") AND ("jsonb_typeof"(("titleblock_number_rect" -> 'height'::"text")) = 'number'::"text") AND (((("titleblock_number_rect" ->> 'x'::"text"))::numeric >= (0)::numeric) AND ((("titleblock_number_rect" ->> 'x'::"text"))::numeric <= (1)::numeric)) AND (((("titleblock_number_rect" ->> 'y'::"text"))::numeric >= (0)::numeric) AND ((("titleblock_number_rect" ->> 'y'::"text"))::numeric <= (1)::numeric)) AND (((("titleblock_number_rect" ->> 'width'::"text"))::numeric >= (0)::numeric) AND ((("titleblock_number_rect" ->> 'width'::"text"))::numeric <= (1)::numeric)) AND (((("titleblock_number_rect" ->> 'height'::"text"))::numeric >= (0)::numeric) AND ((("titleblock_number_rect" ->> 'height'::"text"))::numeric <= (1)::numeric))))),
    CONSTRAINT "drawing_sets_titleblock_title_rect_shape" CHECK ((("titleblock_title_rect" IS NULL) OR (("jsonb_typeof"("titleblock_title_rect") = 'object'::"text") AND ("jsonb_typeof"(("titleblock_title_rect" -> 'x'::"text")) = 'number'::"text") AND ("jsonb_typeof"(("titleblock_title_rect" -> 'y'::"text")) = 'number'::"text") AND ("jsonb_typeof"(("titleblock_title_rect" -> 'width'::"text")) = 'number'::"text") AND ("jsonb_typeof"(("titleblock_title_rect" -> 'height'::"text")) = 'number'::"text") AND (((("titleblock_title_rect" ->> 'x'::"text"))::numeric >= (0)::numeric) AND ((("titleblock_title_rect" ->> 'x'::"text"))::numeric <= (1)::numeric)) AND (((("titleblock_title_rect" ->> 'y'::"text"))::numeric >= (0)::numeric) AND ((("titleblock_title_rect" ->> 'y'::"text"))::numeric <= (1)::numeric)) AND (((("titleblock_title_rect" ->> 'width'::"text"))::numeric >= (0)::numeric) AND ((("titleblock_title_rect" ->> 'width'::"text"))::numeric <= (1)::numeric)) AND (((("titleblock_title_rect" ->> 'height'::"text"))::numeric >= (0)::numeric) AND ((("titleblock_title_rect" ->> 'height'::"text"))::numeric <= (1)::numeric)))))
);


ALTER TABLE "public"."drawing_sets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."drawing_sets"."set_approval_status" IS 'DEPRECATED: workflow lives on submittals table (Sprint 2). Retained for legacy display.';



COMMENT ON COLUMN "public"."drawing_sets"."titleblock_title_rect" IS 'Normalised rectangle (0..1 coords) marking the sheet TITLE region in the titleblock. Shape: {"x":0..1, "y":0..1, "width":0..1, "height":0..1}. NULL = no template set; ingest falls through to the LLM extraction path.';



COMMENT ON COLUMN "public"."drawing_sets"."titleblock_number_rect" IS 'Normalised rectangle (0..1 coords) marking the SHEET NUMBER region in the titleblock. Same shape as titleblock_title_rect.';



CREATE TABLE IF NOT EXISTS "public"."drawing_sheets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "analysis_id" "uuid",
    "sheet_number" "text" NOT NULL,
    "sheet_title" "text",
    "sheet_category" "text",
    "page_index" integer
);


ALTER TABLE "public"."drawing_sheets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_signoffs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "drawing_revision_id" "uuid" NOT NULL,
    "drawing_id" "uuid" NOT NULL,
    "stamp_type" "text" NOT NULL,
    "pdf_page" integer,
    "x" numeric,
    "y" numeric,
    "width" numeric,
    "height" numeric,
    "rotation_deg" numeric DEFAULT 0,
    "stamped_by_id" "uuid",
    "stamped_by_name" "text",
    "stamped_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "signature_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_voided" boolean DEFAULT false NOT NULL,
    "voided_at" timestamp with time zone,
    "voided_by" "uuid",
    "voided_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "drawing_signoffs_stamp_type_check" CHECK (("stamp_type" = ANY (ARRAY['approved_for_fabrication'::"text", 'approved_as_noted'::"text", 'revise_and_resubmit'::"text", 'rejected'::"text", 'reviewed'::"text", 'for_information_only'::"text", 'void'::"text"]))),
    CONSTRAINT "drawing_signoffs_x_check" CHECK ((("x" >= (0)::numeric) AND ("x" <= (1)::numeric))),
    CONSTRAINT "drawing_signoffs_y_check" CHECK ((("y" >= (0)::numeric) AND ("y" <= (1)::numeric)))
);


ALTER TABLE "public"."drawing_signoffs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_transmittal_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "transmittal_id" "uuid" NOT NULL,
    "drawing_revision_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."drawing_transmittal_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_transmittals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "transmittal_number" "text" NOT NULL,
    "direction" "text" DEFAULT 'incoming'::"text" NOT NULL,
    "source_company" "text",
    "received_from" "text",
    "sent_to" "text",
    "subject" "text",
    "date_sent" timestamp with time zone,
    "date_received" timestamp with time zone,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    CONSTRAINT "drawing_transmittals_direction_check" CHECK (("direction" = ANY (ARRAY['incoming'::"text", 'outgoing'::"text", 'internal'::"text"])))
);


ALTER TABLE "public"."drawing_transmittals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_watchers" (
    "project_id" "uuid" NOT NULL,
    "drawing_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "watch_type" "text" DEFAULT 'all_updates'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "drawing_watchers_watch_type_check" CHECK (("watch_type" = ANY (ARRAY['all_updates'::"text", 'revision_only'::"text", 'field_release_only'::"text", 'impact_only'::"text"])))
);


ALTER TABLE "public"."drawing_watchers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_zone_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "drawing_zone_id" "uuid" NOT NULL,
    "drawing_id" "uuid",
    "event_type" "text" NOT NULL,
    "from_value" "text",
    "to_value" "text",
    "actor_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "drawing_zone_activity_event_allowed" CHECK (("event_type" = ANY (ARRAY['zone_created'::"text", 'zone_renamed'::"text", 'status_changed'::"text", 'zone_deleted'::"text", 'link_added'::"text", 'link_removed'::"text", 'dependency_added'::"text", 'dependency_removed'::"text"])))
);


ALTER TABLE "public"."drawing_zone_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_zone_dependencies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "source_zone_id" "uuid" NOT NULL,
    "target_zone_id" "uuid" NOT NULL,
    "relationship" "text" NOT NULL,
    "note" "text",
    "propagation_weight" numeric DEFAULT 1.0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "removed_at" timestamp with time zone,
    "removed_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "chk_drawing_zone_dependencies_relationship" CHECK (("relationship" = ANY (ARRAY['blocks'::"text", 'depends_on'::"text", 'relates_to'::"text"]))),
    CONSTRAINT "chk_drawing_zone_dependencies_weight" CHECK ((("propagation_weight" >= (0)::numeric) AND ("propagation_weight" <= (2)::numeric))),
    CONSTRAINT "chk_no_self_dependency" CHECK (("source_zone_id" <> "target_zone_id"))
);


ALTER TABLE "public"."drawing_zone_dependencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_zone_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "drawing_id" "uuid" NOT NULL,
    "drawing_revision_id" "uuid",
    "analysis_id" "uuid",
    "finding_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "cluster_size" integer DEFAULT 1 NOT NULL,
    "shape_type" "text" DEFAULT 'rect'::"text" NOT NULL,
    "x_min" numeric,
    "y_min" numeric,
    "x_max" numeric,
    "y_max" numeric,
    "polygon_points" "jsonb",
    "suggested_zone_type" "text",
    "suggested_label" "text",
    "confidence" numeric,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "accepted_zone_id" "uuid",
    "merged_into_proposal_id" "uuid",
    "decision_reason" "text",
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_drawing_zone_proposals_bbox_range" CHECK ((("shape_type" <> 'rect'::"text") OR (("x_min" IS NOT NULL) AND ("y_min" IS NOT NULL) AND ("x_max" IS NOT NULL) AND ("y_max" IS NOT NULL) AND ("x_min" >= (0)::numeric) AND ("x_min" <= (1)::numeric) AND ("y_min" >= (0)::numeric) AND ("y_min" <= (1)::numeric) AND ("x_max" >= (0)::numeric) AND ("x_max" <= (1)::numeric) AND ("y_max" >= (0)::numeric) AND ("y_max" <= (1)::numeric) AND ("x_max" > "x_min") AND ("y_max" > "y_min")))),
    CONSTRAINT "chk_drawing_zone_proposals_confidence_range" CHECK ((("confidence" IS NULL) OR (("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric)))),
    CONSTRAINT "chk_drawing_zone_proposals_polygon_consistency" CHECK (
CASE "shape_type"
    WHEN 'rect'::"text" THEN ("polygon_points" IS NULL)
    WHEN 'polygon'::"text" THEN (("polygon_points" IS NOT NULL) AND ("jsonb_typeof"("polygon_points") = 'array'::"text") AND ("jsonb_array_length"("polygon_points") >= 3))
    ELSE false
END),
    CONSTRAINT "chk_drawing_zone_proposals_shape" CHECK (("shape_type" = ANY (ARRAY['rect'::"text", 'polygon'::"text"]))),
    CONSTRAINT "chk_drawing_zone_proposals_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'merged'::"text"])))
);


ALTER TABLE "public"."drawing_zone_proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "drawing_id" "uuid" NOT NULL,
    "drawing_revision_id" "uuid" NOT NULL,
    "parent_zone_id" "uuid",
    "zone_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "zone_type" "text" DEFAULT 'area'::"text" NOT NULL,
    "shape_type" "text" DEFAULT 'rect'::"text" NOT NULL,
    "x_min" numeric(12,6) NOT NULL,
    "y_min" numeric(12,6) NOT NULL,
    "x_max" numeric(12,6) NOT NULL,
    "y_max" numeric(12,6) NOT NULL,
    "level_ref" "text",
    "grid_ref" "text",
    "detail_ref" "text",
    "discipline_code" "text",
    "sequence_ref" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'green'::"text" NOT NULL,
    "status_reason" "text",
    "status_computed_at" timestamp with time zone,
    "status_computed_by" "text" DEFAULT 'rule_engine'::"text",
    "is_manual_status_override" boolean DEFAULT false NOT NULL,
    "manual_status_override_at" timestamp with time zone,
    "manual_status_override_by" "uuid",
    "manual_status_note" "text",
    "source_kind" "text" DEFAULT 'manual'::"text" NOT NULL,
    "confidence_score" numeric(5,4),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "polygon_points" "jsonb",
    CONSTRAINT "drawing_zones_polygon_shape_consistency" CHECK (
CASE "shape_type"
    WHEN 'rect'::"text" THEN ("polygon_points" IS NULL)
    WHEN 'polygon'::"text" THEN (("polygon_points" IS NOT NULL) AND ("jsonb_typeof"("polygon_points") = 'array'::"text") AND ("jsonb_array_length"("polygon_points") >= 3))
    ELSE false
END),
    CONSTRAINT "drawing_zones_shape_allowed" CHECK (("shape_type" = ANY (ARRAY['rect'::"text", 'polygon'::"text"]))),
    CONSTRAINT "drawing_zones_source_allowed" CHECK (("source_kind" = ANY (ARRAY['manual'::"text", 'ai_suggested'::"text", 'imported'::"text", 'model_derived'::"text"]))),
    CONSTRAINT "drawing_zones_status_allowed" CHECK (("status" = ANY (ARRAY['green'::"text", 'blue'::"text", 'amber'::"text", 'red'::"text", 'purple'::"text", 'neutral'::"text"]))),
    CONSTRAINT "drawing_zones_type_allowed" CHECK (("zone_type" = ANY (ARRAY['area'::"text", 'detail'::"text", 'bay'::"text", 'erection_zone'::"text", 'delivery_zone'::"text", 'inspection_zone'::"text", 'member_group'::"text"]))),
    CONSTRAINT "drawing_zones_x_max_range" CHECK ((("x_max" >= (0)::numeric) AND ("x_max" <= (1)::numeric))),
    CONSTRAINT "drawing_zones_x_min_range" CHECK ((("x_min" >= (0)::numeric) AND ("x_min" <= (1)::numeric))),
    CONSTRAINT "drawing_zones_x_ordered" CHECK (("x_max" > "x_min")),
    CONSTRAINT "drawing_zones_y_max_range" CHECK ((("y_max" >= (0)::numeric) AND ("y_max" <= (1)::numeric))),
    CONSTRAINT "drawing_zones_y_min_range" CHECK ((("y_min" >= (0)::numeric) AND ("y_min" <= (1)::numeric))),
    CONSTRAINT "drawing_zones_y_ordered" CHECK (("y_max" > "y_min"))
);


ALTER TABLE "public"."drawing_zones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'outlook'::"text" NOT NULL,
    "email_address" "text" NOT NULL,
    "display_name" "text",
    "connection_type" "text" DEFAULT 'manual_forward'::"text" NOT NULL,
    "access_token" "text",
    "refresh_token" "text",
    "token_expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_sync_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "email_accounts_connection_type_check" CHECK (("connection_type" = ANY (ARRAY['manual_forward'::"text", 'oauth'::"text"]))),
    CONSTRAINT "email_accounts_provider_check" CHECK (("provider" = ANY (ARRAY['outlook'::"text", 'gmail'::"text"])))
);


ALTER TABLE "public"."email_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "filename" "text" NOT NULL,
    "content_type" "text",
    "size_bytes" bigint,
    "content_hash" "text",
    "storage_path" "text",
    "storage_bucket" "text" DEFAULT 'email-attachments'::"text",
    "document_id" "uuid",
    "is_filed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_intake_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "source_message_id" "text" NOT NULL,
    "source_mailbox" "text",
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "sender_address" "text" DEFAULT ''::"text" NOT NULL,
    "sender_name" "text",
    "received_at" timestamp with time zone,
    "body_text" "text" DEFAULT ''::"text",
    "body_html" "text" DEFAULT ''::"text",
    "detected_type" "text" DEFAULT 'Unknown'::"text" NOT NULL,
    "confidence" numeric(3,2) DEFAULT 0.00,
    "classification_reason" "text",
    "attachments" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_notes" "text",
    "created_record_type" "text",
    "created_record_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_intake_queue_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))),
    CONSTRAINT "email_intake_queue_detected_type_check" CHECK (("detected_type" = ANY (ARRAY['RFI'::"text", 'Submittal'::"text", 'Action Item'::"text", 'Document'::"text", 'Unknown'::"text"]))),
    CONSTRAINT "email_intake_queue_status_check" CHECK (("status" = ANY (ARRAY['Pending'::"text", 'Approved'::"text", 'Rejected'::"text", 'Processing'::"text", 'Error'::"text"])))
);


ALTER TABLE "public"."email_intake_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_integration_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "mailbox_address" "text" NOT NULL,
    "provider" "text" DEFAULT 'outlook'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "assignment_rules" "jsonb" DEFAULT '[]'::"jsonb",
    "auto_classify" boolean DEFAULT true NOT NULL,
    "default_type" "text" DEFAULT 'Unknown'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_integration_settings_default_type_check" CHECK (("default_type" = ANY (ARRAY['RFI'::"text", 'Submittal'::"text", 'Action Item'::"text", 'Document'::"text", 'Unknown'::"text"]))),
    CONSTRAINT "email_integration_settings_provider_check" CHECK (("provider" = ANY (ARRAY['outlook'::"text", 'gmail'::"text", 'imap'::"text"])))
);


ALTER TABLE "public"."email_integration_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "account_id" "uuid",
    "external_id" "text",
    "conversation_id" "text",
    "subject" "text",
    "sender_email" "text" NOT NULL,
    "sender_name" "text",
    "recipients" "jsonb" DEFAULT '[]'::"jsonb",
    "cc" "jsonb" DEFAULT '[]'::"jsonb",
    "body_text" "text",
    "body_html" "text",
    "received_at" timestamp with time zone NOT NULL,
    "has_attachments" boolean DEFAULT false NOT NULL,
    "attachment_count" integer DEFAULT 0 NOT NULL,
    "parsed_type" "text",
    "parsed_confidence" double precision,
    "parsed_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "import_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "linked_entity_type" "text",
    "linked_entity_id" "uuid",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "is_starred" boolean DEFAULT false NOT NULL,
    "labels" "jsonb" DEFAULT '[]'::"jsonb",
    "direction" "text" DEFAULT 'inbound'::"text" NOT NULL,
    "in_reply_to" "text",
    "thread_id" "text",
    "sent_at" timestamp with time zone,
    "sent_by" "uuid",
    CONSTRAINT "email_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "email_messages_import_status_check" CHECK (("import_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'linked'::"text", 'archived'::"text"]))),
    CONSTRAINT "email_messages_parsed_type_check" CHECK (("parsed_type" = ANY (ARRAY['rfi'::"text", 'submittal'::"text", 'action_item'::"text", 'transmittal'::"text", 'general'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."email_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "expense_number" "text",
    "description" "text",
    "expense_type" "text",
    "cost_code" "text",
    "cost_code_name" "text",
    "amount" numeric,
    "quantity" numeric DEFAULT 1,
    "unit_cost" numeric,
    "unit" "text",
    "vendor" "text",
    "invoice_number" "text",
    "invoice_date" "date",
    "payment_status" "text" DEFAULT 'Unpaid'::"text",
    "payment_date" "date",
    "work_package_id" "uuid",
    "work_package_name" "text",
    "sov_line_item_id" "uuid",
    "sov_line_item_name" "text",
    "expense_date" "date",
    "submitted_by" "text",
    "approved_by" "text",
    "approved_date" "date",
    "notes" "text",
    "receipt_url" "text",
    "tags" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "chk_expenses_amount" CHECK (("amount" >= (0)::numeric))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."external_file_refs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "drawing_set_id" "uuid",
    "provider" "text" NOT NULL,
    "folder_url" "text" NOT NULL,
    "folder_name" "text",
    "external_file_id" "text",
    "filename" "text" NOT NULL,
    "mime_type" "text",
    "file_size_bytes" bigint,
    "last_modified_at" timestamp with time zone,
    "sync_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "sync_error" "text",
    "last_synced_at" timestamp with time zone,
    "linked_document_id" "uuid",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "external_file_refs_filename_check" CHECK (("length"(TRIM(BOTH FROM "filename")) > 0)),
    CONSTRAINT "external_file_refs_folder_url_check" CHECK (("length"(TRIM(BOTH FROM "folder_url")) > 0)),
    CONSTRAINT "external_file_refs_provider_check" CHECK (("provider" = ANY (ARRAY['sharepoint'::"text", 'onedrive'::"text", 'google_drive'::"text", 'dropbox'::"text"]))),
    CONSTRAINT "external_file_refs_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'error'::"text", 'importing'::"text", 'imported'::"text"])))
);


ALTER TABLE "public"."external_file_refs" OWNER TO "postgres";


COMMENT ON TABLE "public"."external_file_refs" IS 'Metadata references to files in external storage providers (SharePoint, OneDrive, Google Drive, Dropbox). No file content is stored here — only metadata and the link back to the Document record after import.';



COMMENT ON COLUMN "public"."external_file_refs"."folder_url" IS 'The shared/public URL of the external folder this file belongs to.';



COMMENT ON COLUMN "public"."external_file_refs"."external_file_id" IS 'Provider-specific file identifier (driveItem id, etc.) for deduplication on re-sync.';



COMMENT ON COLUMN "public"."external_file_refs"."sync_status" IS 'pending=never synced, synced=metadata current, error=last sync failed, importing=copy in progress, imported=copied to Supabase storage.';



COMMENT ON COLUMN "public"."external_file_refs"."linked_document_id" IS 'Set after a human-approved import copies the file to Supabase and creates a Document record.';



CREATE TABLE IF NOT EXISTS "public"."external_linked_folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "drawing_set_id" "uuid",
    "provider" "text" NOT NULL,
    "folder_url" "text" NOT NULL,
    "folder_name" "text" DEFAULT 'Linked Folder'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "sync_error" "text",
    "linked_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "external_linked_folders_folder_url_check" CHECK (("length"(TRIM(BOTH FROM "folder_url")) > 0)),
    CONSTRAINT "external_linked_folders_provider_check" CHECK (("provider" = ANY (ARRAY['sharepoint'::"text", 'onedrive'::"text", 'google_drive'::"text", 'dropbox'::"text"]))),
    CONSTRAINT "external_linked_folders_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'error'::"text", 'disconnected'::"text"])))
);


ALTER TABLE "public"."external_linked_folders" OWNER TO "postgres";


COMMENT ON TABLE "public"."external_linked_folders" IS 'Tracks external storage folders linked to SteelBuild projects. Each row represents a folder connection to a cloud provider.';



CREATE TABLE IF NOT EXISTS "public"."fab_release_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "released_by" "uuid" DEFAULT "auth"."uid"(),
    "package_kind" "text" DEFAULT 'fab_release'::"text" NOT NULL,
    "package_name" "text",
    "drawing_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "blocking_rfi_numbers" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "override_reason" "text",
    "released_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "drawing_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "fab_release_log_package_kind_check" CHECK (("package_kind" = ANY (ARRAY['fab_release'::"text", 'turnover'::"text"])))
);


ALTER TABLE "public"."fab_release_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fab_release_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "overridden_by" "uuid" DEFAULT "auth"."uid"(),
    "package_kind" "text",
    "package_name" "text",
    "drawing_count" integer,
    "blocking_rfi_numbers" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fab_release_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fab_releases" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid",
    "release_number" "text" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "work_package_id" "uuid",
    "piece_marks" "text",
    "weight_tons" numeric,
    "piece_count" integer,
    "release_date" "date",
    "required_date" "date",
    "notes" "text",
    "is_deleted" boolean DEFAULT false
);


ALTER TABLE "public"."fab_releases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "flag_key" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "description" "text",
    "user_overrides" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feature_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspections" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "inspection_type" "text",
    "inspection_date" "date",
    "location" "text",
    "inspector_name" "text",
    "inspector_role" "text",
    "description" "text",
    "status" "text" DEFAULT 'Scheduled'::"text" NOT NULL,
    "findings" "text",
    "deficiencies_count" integer DEFAULT 0,
    "corrective_actions" "text",
    "sign_off_status" "text" DEFAULT 'Pending'::"text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "chk_inspections_signoff" CHECK (("sign_off_status" = ANY (ARRAY['Pending'::"text", 'Approved'::"text", 'Conditional Approval'::"text", 'Rejected'::"text"]))),
    CONSTRAINT "chk_inspections_status" CHECK (("status" = ANY (ARRAY['Scheduled'::"text", 'In Progress'::"text", 'Completed'::"text", 'On Hold'::"text", 'Cancelled'::"text"])))
);


ALTER TABLE "public"."inspections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."linked_folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "folder_name" "text" NOT NULL,
    "folder_path" "text",
    "external_folder_id" "text",
    "external_site_id" "text",
    "external_drive_id" "text",
    "sync_enabled" boolean DEFAULT false NOT NULL,
    "sync_frequency" "text" DEFAULT 'manual'::"text" NOT NULL,
    "last_sync_at" timestamp with time zone,
    "last_sync_status" "text",
    "last_sync_error" "text",
    "tenant_id" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "linked_folders_last_sync_status_check" CHECK (("last_sync_status" = ANY (ARRAY['success'::"text", 'error'::"text", 'pending'::"text", 'never'::"text"]))),
    CONSTRAINT "linked_folders_provider_check" CHECK (("provider" = ANY (ARRAY['sharepoint'::"text", 'onedrive'::"text", 'google_drive'::"text", 'dropbox'::"text", 'bluebeam'::"text"]))),
    CONSTRAINT "linked_folders_sync_frequency_check" CHECK (("sync_frequency" = ANY (ARRAY['manual'::"text", 'hourly'::"text", 'daily'::"text"])))
);


ALTER TABLE "public"."linked_folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."llm_telemetry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "use_case" "text" DEFAULT 'general'::"text" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "user_id" "uuid",
    "project_id" "uuid",
    "input_tokens" integer,
    "output_tokens" integer,
    "cost_usd" numeric(12,6),
    "latency_ms" integer,
    "success" boolean DEFAULT true NOT NULL,
    "error_kind" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."llm_telemetry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."look_ahead" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "week_start" "date",
    "week_end" "date",
    "tasks" "jsonb" DEFAULT '[]'::"jsonb",
    "constraints" "text",
    "notes" "text",
    "status" "text" DEFAULT 'Draft'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."look_ahead" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meetings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "title" "text",
    "meeting_type" "text",
    "meeting_date" "date",
    "location" "text",
    "attendees" "text",
    "minutes" "text",
    "status" "text" DEFAULT 'Scheduled'::"text",
    "next_meeting_date" "date",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."meetings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_activity" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "actor_email" "text",
    "target_user_id" "uuid",
    "target_email" "text",
    "event_type" "text" NOT NULL,
    "old_role" "text",
    "new_role" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "member_activity_event_type_check" CHECK (("event_type" = ANY (ARRAY['member_added'::"text", 'role_changed'::"text", 'member_removed'::"text"])))
);


ALTER TABLE "public"."member_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mitigation_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mitigation_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "action_type" "text",
    "action_date" "date" DEFAULT CURRENT_DATE,
    "performed_by" "text",
    "description" "text" NOT NULL,
    "outcome" "text",
    "proof_url" "text",
    "proof_filename" "text",
    "follow_up_required" boolean DEFAULT false,
    "follow_up_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "mitigation_actions_action_type_check" CHECK (("action_type" = ANY (ARRAY['Email Sent'::"text", 'RFI Submitted'::"text", 'Meeting Held'::"text", 'Drawing Revised'::"text", 'Schedule Updated'::"text", 'Verbal Notice'::"text", 'Document Uploaded'::"text", 'Other'::"text"])))
);


ALTER TABLE "public"."mitigation_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mitigation_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "mitigation_number" "text",
    "title" "text" NOT NULL,
    "issue_source" "text",
    "source_entity_ref" "text",
    "source_entity_id" "uuid",
    "identified_date" "date" DEFAULT CURRENT_DATE,
    "identified_by" "text",
    "status" "text" DEFAULT 'Open'::"text" NOT NULL,
    "cost_exposure" numeric(14,2) DEFAULT 0,
    "schedule_exposure_days" integer DEFAULT 0,
    "is_co_candidate" boolean DEFAULT false,
    "notice_sent_date" "date",
    "notice_sent_to" "text",
    "notice_method" "text",
    "internal_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "recovery_likelihood" integer DEFAULT 50,
    "expected_recovery" numeric(14,2) GENERATED ALWAYS AS (((COALESCE("cost_exposure", (0)::numeric) * (COALESCE("recovery_likelihood", 50))::numeric) / 100.0)) STORED,
    "root_cause_category" "text",
    "responsible_party" "text",
    "approved_by" "text",
    "approval_date" "date",
    "impact_types" "text",
    CONSTRAINT "mitigation_logs_issue_source_check" CHECK (("issue_source" = ANY (ARRAY['Alert'::"text", 'RFI'::"text", 'Constraint'::"text", 'Delivery'::"text", 'Drawing'::"text", 'WorkPackage'::"text", 'ChangeOrder'::"text", 'Manual'::"text"]))),
    CONSTRAINT "mitigation_logs_notice_method_check" CHECK ((("notice_method" IS NULL) OR ("notice_method" = ANY (ARRAY['Email'::"text", 'Certified Letter'::"text", 'Hand Delivered'::"text", 'Verbal'::"text", 'Portal Upload'::"text", 'Other'::"text"])))),
    CONSTRAINT "mitigation_logs_recovery_likelihood_check" CHECK ((("recovery_likelihood" >= 0) AND ("recovery_likelihood" <= 100))),
    CONSTRAINT "mitigation_logs_root_cause_category_check" CHECK ((("root_cause_category" IS NULL) OR ("root_cause_category" = ANY (ARRAY['Design Error'::"text", 'Site Readiness'::"text", 'Material Delay'::"text", 'Coordination Gap'::"text", 'Scope Change'::"text", 'Weather/Force Majeure'::"text", 'Subcontractor'::"text", 'Owner Decision'::"text", 'Other'::"text"])))),
    CONSTRAINT "mitigation_logs_status_check" CHECK (("status" = ANY (ARRAY['Open'::"text", 'Pending PM Review'::"text", 'Noticed'::"text", 'Action Taken'::"text", 'Resolved'::"text", 'Escalated'::"text"])))
);


ALTER TABLE "public"."mitigation_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."model_element_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "model_id" "uuid" NOT NULL,
    "element_id" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "note" "text",
    "project_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "model_element_links_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['rfi'::"text", 'drawing'::"text", 'work_package'::"text"])))
);


ALTER TABLE "public"."model_element_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."model_elements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "model_id" "uuid",
    "element_guid" "text",
    "piece_mark" "text" NOT NULL,
    "assembly_mark" "text",
    "profile" "text",
    "material_grade" "text",
    "quantity" numeric DEFAULT 1 NOT NULL,
    "weight_kg" numeric,
    "sequence_number" "text",
    "erection_area" "text",
    "drawing_no" "text",
    "drawing_id" "uuid",
    "drawing_set_id" "uuid",
    "work_package_id" "uuid",
    "source" "text" DEFAULT 'csv'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fab_status" "text",
    CONSTRAINT "model_elements_fab_status_check" CHECK ((("fab_status" IS NULL) OR ("fab_status" = ANY (ARRAY['not_started'::"text", 'in_fabrication'::"text", 'fabricated'::"text", 'shipped'::"text", 'erected'::"text"])))),
    CONSTRAINT "model_elements_source_check" CHECK (("source" = ANY (ARRAY['csv'::"text", 'ifc'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."model_elements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."model_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_url" "text",
    "file_type" "text" NOT NULL,
    "version" "text" DEFAULT '1.0'::"text",
    "revision_number" integer DEFAULT 1,
    "upload_date" timestamp with time zone DEFAULT "now"(),
    "source" "text" DEFAULT 'local'::"text" NOT NULL,
    "coordinate_system" "text",
    "cloud_url" "text",
    "cloud_model_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "linked_drawings" "jsonb" DEFAULT '[]'::"jsonb",
    "linked_rfis" "jsonb" DEFAULT '[]'::"jsonb",
    "linked_work_packages" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "superseded_by" "uuid",
    "document_id" "uuid",
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "model_registry_file_type_check" CHECK (("file_type" = ANY (ARRAY['IFC'::"text", 'GLTF'::"text", 'GLB'::"text", 'RVT'::"text"]))),
    CONSTRAINT "model_registry_source_check" CHECK (("source" = ANY (ARRAY['local'::"text", 'autodesk_cloud'::"text", 'revit_export'::"text"]))),
    CONSTRAINT "model_registry_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'superseded'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."model_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."number_sequences" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "record_type" "text" NOT NULL,
    "next_value" integer DEFAULT 1
);


ALTER TABLE "public"."number_sequences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invited_by" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval) NOT NULL,
    CONSTRAINT "organization_invitations_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))),
    CONSTRAINT "organization_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."organization_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "subscription_status" "text",
    "current_period_end" timestamp with time zone
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pay_application_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pay_application_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "sov_item_id" "uuid",
    "line_item_number" "text",
    "description" "text",
    "scheduled_value" numeric(14,2) DEFAULT 0 NOT NULL,
    "work_completed_previous" numeric(14,2) DEFAULT 0 NOT NULL,
    "work_completed_this_period" numeric(14,2) DEFAULT 0 NOT NULL,
    "materials_stored" numeric(14,2) DEFAULT 0 NOT NULL,
    "percent_complete" numeric(6,3) DEFAULT 0 NOT NULL,
    "retainage" numeric(14,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."pay_application_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pay_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "application_number" integer DEFAULT 1 NOT NULL,
    "period_from" "date",
    "period_to" "date",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "retainage_percent" numeric(6,3) DEFAULT 0 NOT NULL,
    "original_contract_sum" numeric(14,2) DEFAULT 0 NOT NULL,
    "net_change_orders" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_completed_stored" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_retainage" numeric(14,2) DEFAULT 0 NOT NULL,
    "less_previous_certificates" numeric(14,2) DEFAULT 0 NOT NULL,
    "current_payment_due" numeric(14,2) DEFAULT 0 NOT NULL,
    "submitted_date" "date",
    "certified_date" "date",
    "paid_date" "date",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "pay_applications_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'submitted'::"text", 'approved'::"text", 'paid'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."pay_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."photos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "category" "text",
    "title" "text",
    "description" "text",
    "location" "text",
    "taken_date" "date",
    "file_url" "text",
    "file_name" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "daily_log_id" "uuid",
    "punchlist_item_id" "uuid",
    "inspection_id" "uuid",
    "client_op_id" "uuid"
);


ALTER TABLE "public"."photos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."photos"."client_op_id" IS 'Client idempotency key for offline-queued photo creates (Field Today outbox). Null for rows created online.';



CREATE TABLE IF NOT EXISTS "public"."piece_production" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "piece_mark" "text" NOT NULL,
    "assembly_mark" "text",
    "status" "text",
    "percent_complete" integer,
    "quantity" numeric,
    "weight" numeric,
    "sequence_number" "text",
    "erection_area" "text",
    "ship_date" "date",
    "stage_data" "jsonb",
    "source" "text" DEFAULT 'tekla_epm'::"text" NOT NULL,
    "external_ref" "text",
    "notes" "text",
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    CONSTRAINT "piece_production_percent_complete_check" CHECK ((("percent_complete" >= 0) AND ("percent_complete" <= 100)))
);


ALTER TABLE "public"."piece_production" OWNER TO "postgres";


COMMENT ON TABLE "public"."piece_production" IS 'Per-piece fabrication/production status imported from a Tekla EPM / FabSuite production-control CSV (Phase 4). Keyed by (project_id, piece_mark).';



CREATE TABLE IF NOT EXISTS "public"."pma_assumptions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "title" "text",
    "description" "text",
    "category" "text",
    "owner" "text",
    "status" "text" DEFAULT 'Open'::"text",
    "risk_level" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."pma_assumptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pma_audit_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "action" "text",
    "changed_by" "text",
    "old_values" "jsonb" DEFAULT '{}'::"jsonb",
    "new_values" "jsonb" DEFAULT '{}'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."pma_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pma_decisions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "title" "text",
    "description" "text",
    "decision_date" "date",
    "decided_by" "text",
    "category" "text",
    "impact" "text",
    "alternatives" "text",
    "rationale" "text",
    "status" "text" DEFAULT 'Open'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."pma_decisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_notes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "date" "date",
    "shift" "text",
    "status" "text" DEFAULT 'Draft'::"text",
    "notes" "text",
    "sketch_data" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "note_date" "date",
    "content" "text",
    "category" "text" DEFAULT 'General'::"text",
    "is_high_priority" boolean DEFAULT false,
    "is_resolved" boolean DEFAULT false,
    "resolved_date" timestamp with time zone,
    "author" "text"
);


ALTER TABLE "public"."production_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_closeout" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "closeout_date" "date",
    "status" "text" DEFAULT 'In Progress'::"text",
    "as_built_complete" boolean DEFAULT false,
    "manuals_complete" boolean DEFAULT false,
    "warranties_complete" boolean DEFAULT false,
    "punchlist_complete" boolean DEFAULT false,
    "final_inspection_date" "date",
    "certificate_of_occupancy" "date",
    "notes" "text",
    "checklist" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."project_closeout" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_handoff_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "seq" integer NOT NULL,
    "description" "text" NOT NULL,
    "date_required" "date",
    "status" "text" DEFAULT 'Not Completed'::"text" NOT NULL,
    "completed_by" "text",
    "date_completed" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_handoff_items_status_check" CHECK (("status" = ANY (ARRAY['Not Completed'::"text", 'In Progress'::"text", 'Completed'::"text", 'Not Applicable'::"text"])))
);


ALTER TABLE "public"."project_handoff_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_number" "text",
    "name" "text" NOT NULL,
    "client" "text",
    "general_contractor" "text",
    "engineer_of_record" "text",
    "project_manager" "text",
    "superintendent" "text",
    "contract_type" "text",
    "original_contract_value" numeric,
    "start_date" "date",
    "target_completion_date" "date",
    "forecast_completion_date" "date",
    "phase" "text" DEFAULT 'Pre-Construction'::"text" NOT NULL,
    "health_status" "text" DEFAULT 'On Track'::"text" NOT NULL,
    "retainage_percent" numeric DEFAULT 10,
    "contingency_amount" numeric,
    "address" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "scope_complete_pct_override" numeric,
    "scope_complete_pct_override_date" "date",
    "job_type" "text",
    "drawing_date" "date",
    "loi_received_date" "date",
    "gc_contract_present" boolean,
    "liquidated_damages" boolean,
    "detailer_contact_id" "uuid",
    "joist_manufacturer" "text",
    "deck_manufacturer" "text",
    "deck_installer" "text",
    "special_coatings" "text",
    "engineering_firm" "text",
    "kickoff_complete" boolean DEFAULT false,
    "kickoff_completed_at" timestamp with time zone,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "on_hold" boolean DEFAULT false NOT NULL,
    "on_hold_at" timestamp with time zone,
    "on_hold_reason" "text",
    "on_hold_by" "uuid",
    "org_id" "uuid" NOT NULL,
    CONSTRAINT "chk_projects_contract_value" CHECK (("original_contract_value" >= (0)::numeric)),
    CONSTRAINT "chk_projects_health" CHECK (("health_status" = ANY (ARRAY['On Track'::"text", 'Watch'::"text", 'At Risk'::"text", 'Awaiting Data'::"text"]))),
    CONSTRAINT "chk_projects_phase" CHECK (("phase" = ANY (ARRAY['Pre-Construction'::"text", 'Detailing'::"text", 'Procurement'::"text", 'Fabrication'::"text", 'Delivery'::"text", 'Installation'::"text", 'Erection'::"text", 'Closeout'::"text"]))),
    CONSTRAINT "chk_projects_retainage" CHECK ((("retainage_percent" >= (0)::numeric) AND ("retainage_percent" <= (100)::numeric))),
    CONSTRAINT "projects_job_type_check" CHECK ((("job_type" IS NULL) OR ("job_type" = ANY (ARRAY['Beams/Deck'::"text", 'Beams/Joists/Deck'::"text", 'Joist Deck'::"text", 'Tilt'::"text", 'Tilt Hybrid'::"text", 'Misc.'::"text", 'Other'::"text"]))))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


COMMENT ON COLUMN "public"."projects"."scope_complete_pct_override" IS 'PM-entered scope completion override (0-100). When NULL, KPIs fall back to the EVM-derived value from calcEVM().';



COMMENT ON COLUMN "public"."projects"."scope_complete_pct_override_date" IS 'Date when scope_complete_pct_override was last set by the PM.';



COMMENT ON COLUMN "public"."projects"."on_hold" IS 'Project paused; hidden from switcher/portfolio/KPIs, visible only on /Projects.';



COMMENT ON COLUMN "public"."projects"."on_hold_at" IS 'Timestamp when on_hold was last set to true.';



COMMENT ON COLUMN "public"."projects"."on_hold_reason" IS 'Free-text reason for the hold (optional).';



COMMENT ON COLUMN "public"."projects"."on_hold_by" IS 'User who set on_hold=true (FK to auth.users; SET NULL on user delete).';



CREATE TABLE IF NOT EXISTS "public"."punchlist_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "description" "text",
    "category" "text",
    "location" "text",
    "assigned_to" "text",
    "priority" "text" DEFAULT 'Medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'Open'::"text" NOT NULL,
    "target_completion_date" "date",
    "percent_complete" numeric DEFAULT 0,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "photos" "jsonb" DEFAULT '[]'::"jsonb",
    "closed_by" "text",
    "closed_at" timestamp with time zone,
    "drawing_id" "uuid",
    "inspection_id" "uuid",
    "client_op_id" "uuid",
    CONSTRAINT "chk_punchlist_priority" CHECK (("priority" = ANY (ARRAY['Critical'::"text", 'High'::"text", 'Medium'::"text", 'Low'::"text"]))),
    CONSTRAINT "chk_punchlist_status" CHECK (("status" = ANY (ARRAY['Open'::"text", 'In Progress'::"text", 'Completed'::"text", 'On Hold'::"text", 'Deferred'::"text"])))
);


ALTER TABLE "public"."punchlist_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."punchlist_items"."photos" IS 'Array of {file_url, name, uploaded_at} objects (matches daily_logs.photos shape)';



COMMENT ON COLUMN "public"."punchlist_items"."client_op_id" IS 'Client idempotency key for offline-queued creates (Field Today outbox). Null for rows created online.';



CREATE TABLE IF NOT EXISTS "public"."quality_control_records" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "test_type" "text",
    "test_date" "date",
    "material_or_component" "text",
    "location" "text",
    "test_lab_or_inspector" "text",
    "specification" "text",
    "result" "text",
    "test_value" "text",
    "acceptance_criteria" "text",
    "quantity_tested" integer,
    "quantity_passed" integer,
    "notes" "text",
    "status" "text" DEFAULT 'Pending'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."quality_control_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resources" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "name" "text",
    "resource_type" "text",
    "role" "text",
    "capacity" numeric,
    "unit" "text",
    "cost_rate" numeric,
    "availability" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "parent_resource_id" "uuid",
    CONSTRAINT "chk_resources_no_self_parent" CHECK ((("parent_resource_id" IS NULL) OR ("parent_resource_id" <> "id")))
);


ALTER TABLE "public"."resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rfis" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "rfi_number" "text",
    "title" "text",
    "description" "text",
    "question" "text",
    "answer" "text",
    "drawing_reference" "text",
    "spec_section" "text",
    "priority" "text" DEFAULT 'Medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'Open'::"text" NOT NULL,
    "submitted_by" "text",
    "submitted_date" "date",
    "date_required" "date",
    "date_answered" "date",
    "assigned_to" "text",
    "answered_by" "text",
    "ball_in_court" "text" DEFAULT 'Contractor'::"text",
    "cost_impact" boolean DEFAULT false,
    "cost_impact_amount" numeric,
    "schedule_impact" boolean DEFAULT false,
    "schedule_impact_days" integer,
    "distribution_list" "text",
    "created_date" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "due_date" "date",
    "responded_date" "date",
    "response_text" "text",
    "internal_notes" "text",
    "work_package_id" "uuid",
    "cost_code_id" "text",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "impacts_activity_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "discipline" "text",
    "drawing_set_id" "uuid",
    "area_sequence" "text",
    CONSTRAINT "chk_rfis_priority" CHECK (("priority" = ANY (ARRAY['Low'::"text", 'Medium'::"text", 'High'::"text", 'Critical'::"text"]))),
    CONSTRAINT "chk_rfis_status" CHECK (("status" = ANY (ARRAY['Open'::"text", 'Under Review'::"text", 'Incomplete Response'::"text", 'Answered'::"text", 'Closed'::"text", 'Void'::"text"])))
);


ALTER TABLE "public"."rfis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."risks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "probability" integer NOT NULL,
    "impact" integer NOT NULL,
    "severity" "text" GENERATED ALWAYS AS (
CASE
    WHEN (("probability" * "impact") >= 20) THEN 'Critical'::"text"
    WHEN (("probability" * "impact") >= 12) THEN 'High'::"text"
    WHEN (("probability" * "impact") >= 6) THEN 'Medium'::"text"
    ELSE 'Low'::"text"
END) STORED,
    "status" "text" DEFAULT 'Open'::"text" NOT NULL,
    "mitigation_plan" "text",
    "contingency_plan" "text",
    "owner" "text",
    "identified_date" "date" DEFAULT CURRENT_DATE,
    "target_close_date" "date",
    "closed_date" "date",
    "trigger_event" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "risks_impact_check" CHECK ((("impact" >= 1) AND ("impact" <= 5))),
    CONSTRAINT "risks_probability_check" CHECK ((("probability" >= 1) AND ("probability" <= 5))),
    CONSTRAINT "risks_status_check" CHECK (("status" = ANY (ARRAY['Open'::"text", 'Mitigating'::"text", 'Mitigated'::"text", 'Closed'::"text", 'Accepted'::"text", 'Transferred'::"text"])))
);


ALTER TABLE "public"."risks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."safety_incidents" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "incident_type" "text",
    "severity" "text" DEFAULT 'Medium'::"text" NOT NULL,
    "incident_date" "date",
    "incident_time" time without time zone,
    "location" "text",
    "reported_by" "text",
    "description" "text",
    "injuries" "text",
    "root_cause" "text",
    "corrective_actions" "text",
    "responsible_party" "text",
    "action_due_date" "date",
    "status" "text" DEFAULT 'Open'::"text" NOT NULL,
    "investigation_completed" boolean DEFAULT false,
    "safety_trained" boolean DEFAULT false,
    "witnesses" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "chk_safety_severity" CHECK (("severity" = ANY (ARRAY['Critical'::"text", 'High'::"text", 'Medium'::"text", 'Low'::"text"]))),
    CONSTRAINT "chk_safety_status" CHECK (("status" = ANY (ARRAY['Open'::"text", 'Under Investigation'::"text", 'Action Plan'::"text", 'In Progress'::"text", 'Completed'::"text", 'Closed'::"text"])))
);


ALTER TABLE "public"."safety_incidents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_tasks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "task_name" "text",
    "task_type" "text" DEFAULT 'Task'::"text",
    "phase" "text",
    "start_date" "date",
    "end_date" "date",
    "status" "text" DEFAULT 'Not Started'::"text" NOT NULL,
    "priority" "text" DEFAULT 'Normal'::"text",
    "percent_complete" numeric DEFAULT 0,
    "assigned_to" "text",
    "notes" "text",
    "dependencies" "text",
    "milestone" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "parent_task_id" "uuid",
    "wbs_code" "text",
    "outline_level" integer DEFAULT 0,
    "duration" integer,
    "resource_names" "text",
    "crew_id" "uuid",
    "crew_name" "text",
    "blockers" "jsonb" DEFAULT '[]'::"jsonb",
    "is_milestone" boolean DEFAULT false,
    "target_release" "date",
    "sort_order" integer,
    "related_rfi_ids" "jsonb" DEFAULT '[]'::"jsonb",
    "related_change_order_ids" "jsonb" DEFAULT '[]'::"jsonb",
    "related_action_item_ids" "jsonb" DEFAULT '[]'::"jsonb",
    "is_summary" boolean DEFAULT false NOT NULL,
    CONSTRAINT "chk_schedule_tasks_status" CHECK (("status" = ANY (ARRAY['Not Started'::"text", 'In Progress'::"text", 'Complete'::"text", 'On Hold'::"text", 'Delayed'::"text"]))),
    CONSTRAINT "schedule_status_pct_consistency" CHECK ((("percent_complete" IS NULL) OR (("status" = 'Complete'::"text") AND ("percent_complete" = (100)::numeric)) OR (("status" = 'Not Started'::"text") AND ("percent_complete" = (0)::numeric)) OR (("status" = 'In Progress'::"text") AND ("percent_complete" < (100)::numeric)) OR ("status" <> ALL (ARRAY['Complete'::"text", 'Not Started'::"text", 'In Progress'::"text"]))))
);


ALTER TABLE "public"."schedule_tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."schedule_tasks"."related_rfi_ids" IS 'Optional array of rfis.id strings linked from this schedule task';



COMMENT ON COLUMN "public"."schedule_tasks"."related_change_order_ids" IS 'Optional array of change_orders.id strings linked from this schedule task';



COMMENT ON COLUMN "public"."schedule_tasks"."related_action_item_ids" IS 'Optional array of action_items.id strings linked from this schedule task';



CREATE TABLE IF NOT EXISTS "public"."scope_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "item_type" "text" DEFAULT 'Exclusion'::"text" NOT NULL,
    "category" "text",
    "description" "text",
    "notes" "text",
    "reference" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "added_by" "text",
    "is_completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "completed_by" "text",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "file_url" "text",
    "storage_path" "text",
    "file_name" "text",
    "in_progress" boolean DEFAULT false NOT NULL,
    "in_progress_at" timestamp with time zone,
    "in_progress_by" "text",
    CONSTRAINT "chk_scope_items_type" CHECK (("item_type" = ANY (ARRAY['Scope'::"text", 'Exclusion'::"text", 'Clarification'::"text"])))
);


ALTER TABLE "public"."scope_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sov_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "application_number" integer,
    "period_from" "date",
    "period_to" "date",
    "line_item_number" integer,
    "description" "text",
    "scheduled_value" numeric,
    "previous_percent_complete" numeric DEFAULT 0,
    "current_percent_complete" numeric DEFAULT 0,
    "retainage_percent" numeric DEFAULT 10,
    "status" "text" DEFAULT 'Draft'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "sov_id" "text",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "submitted_date" "date",
    "payment_received_date" "date",
    "cost_code" "text",
    "cost_code_name" "text"
);


ALTER TABLE "public"."sov_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."sov_items"."submitted_date" IS 'Date the pay application was submitted to GC/owner. DSO start point.';



COMMENT ON COLUMN "public"."sov_items"."payment_received_date" IS 'Date payment was actually received. DSO end point. DSO = payment_received_date - submitted_date.';



COMMENT ON COLUMN "public"."sov_items"."cost_code" IS 'Steel cost-code number (e.g. "06") linking this SOV line to cost_codes; set on import via auto-map or explicitly.';



COMMENT ON COLUMN "public"."sov_items"."cost_code_name" IS 'Human-readable cost-code name (e.g. "Shop Labor and Fabrication") captured alongside cost_code for display.';



CREATE TABLE IF NOT EXISTS "public"."submittal_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "submittal_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "from_value" "text",
    "to_value" "text",
    "actor_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "submittal_activity_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'status_changed'::"text", 'round_created'::"text", 'round_returned'::"text", 'file_uploaded'::"text", 'rfi_linked'::"text", 'task_linked'::"text", 'deleted'::"text", 'restored'::"text", 'sheet_response_added'::"text", 'bic_changed'::"text"])))
);


ALTER TABLE "public"."submittal_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submittal_rounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "submittal_id" "uuid" NOT NULL,
    "round_number" integer DEFAULT 1 NOT NULL,
    "submitted_date" "date",
    "returned_date" "date",
    "status" "text" DEFAULT 'Submitted'::"text" NOT NULL,
    "ball_in_court" "text",
    "submitted_by" "text",
    "reviewer" "text",
    "response_notes" "text",
    "file_url" "text",
    "markup_file_url" "text",
    "drawing_set_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "submittal_rounds_status_check" CHECK (("status" = ANY (ARRAY['Submitted'::"text", 'Under Review'::"text", 'Approved'::"text", 'Approved as Noted'::"text", 'Revise and Resubmit'::"text", 'Rejected'::"text", 'Released for Fabrication'::"text"])))
);


ALTER TABLE "public"."submittal_rounds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submittal_sheet_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "submittal_round_id" "uuid" NOT NULL,
    "drawing_id" "uuid",
    "drawing_set_id" "uuid",
    "sheet_number" "text",
    "response_status" "text" DEFAULT 'No Exception'::"text" NOT NULL,
    "reviewer_comment" "text",
    "markup_file_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "submittal_sheet_responses_response_status_check" CHECK (("response_status" = ANY (ARRAY['No Exception'::"text", 'Approved as Noted'::"text", 'Revise and Resubmit'::"text", 'Rejected'::"text", 'See Comments'::"text"])))
);


ALTER TABLE "public"."submittal_sheet_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submittals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "submittal_number" "text" NOT NULL,
    "title" "text" NOT NULL,
    "spec_section" "text",
    "submittal_type" "text",
    "discipline" "text",
    "revision" "text" DEFAULT '0'::"text",
    "round_number" integer DEFAULT 1,
    "submitted_date" "date",
    "required_date" "date",
    "returned_date" "date",
    "approved_date" "date",
    "status" "text" DEFAULT 'Draft'::"text" NOT NULL,
    "ball_in_court" "text",
    "submitted_by" "text",
    "reviewer" "text",
    "drawing_set_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "linked_rfi_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "linked_task_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "notes" "text",
    "file_url" "text",
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "current_round_id" "uuid",
    "total_rounds" integer DEFAULT 1 NOT NULL,
    "days_in_review" integer,
    "received_from" "text",
    "distributed_to" "text",
    "transmittal_number" "text",
    "external_source" "text",
    "external_id" "uuid",
    "approval_chain" "jsonb",
    "approval_chain_step" integer,
    "fab_release_override_reason" "text",
    CONSTRAINT "chk_submittals_approval_chain_step" CHECK ((("approval_chain_step" IS NULL) OR ("approval_chain_step" >= 0))),
    CONSTRAINT "submittals_status_check" CHECK (("status" = ANY (ARRAY['Draft'::"text", 'Submitted'::"text", 'Under Review'::"text", 'Approved'::"text", 'Approved as Noted'::"text", 'Revise and Resubmit'::"text", 'Rejected'::"text", 'Released for Fabrication'::"text", 'Void'::"text"]))),
    CONSTRAINT "submittals_submittal_type_check" CHECK ((("submittal_type" = ANY (ARRAY['Shop Drawing'::"text", 'Product Data'::"text", 'Sample'::"text", 'Mock-up'::"text", 'Calculation'::"text", 'Other'::"text"])) OR ("submittal_type" IS NULL)))
);


ALTER TABLE "public"."submittals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_dependencies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "predecessor_id" "uuid" NOT NULL,
    "successor_id" "uuid" NOT NULL,
    "dependency_type" "text" DEFAULT 'FS'::"text" NOT NULL,
    "lag_days" integer DEFAULT 0,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "task_dep_no_self" CHECK (("predecessor_id" <> "successor_id")),
    CONSTRAINT "task_dependencies_dependency_type_check" CHECK (("dependency_type" = ANY (ARRAY['FS'::"text", 'SS'::"text", 'FF'::"text", 'SF'::"text"])))
);


ALTER TABLE "public"."task_dependencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."uploaded_files" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "file_name" "text",
    "file_url" "text",
    "file_size" integer,
    "content_type" "text",
    "uploaded_by" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."uploaded_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "email" "text",
    "full_name" "text",
    "role" "text" DEFAULT 'user'::"text",
    "avatar_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_projects" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'pm'::"text" NOT NULL,
    CONSTRAINT "user_projects_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'pm'::"text", 'field'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."user_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendors" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "company_name" "text",
    "vendor_type" "text",
    "contact_person" "text",
    "title" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    "zip" "text",
    "website" "text",
    "certifications" "text",
    "certifications_expiry" "date",
    "insurance_provider" "text",
    "insurance_expiry" "date",
    "years_in_business" integer,
    "status" "text" DEFAULT 'Active'::"text",
    "pricing_tier" "text" DEFAULT 'Standard'::"text",
    "payment_terms" "text",
    "is_preferred" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "org_id" "uuid"
);


ALTER TABLE "public"."vendors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warranties" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "warranty_type" "text",
    "component_description" "text",
    "vendor_name" "text",
    "vendor_contact" "text",
    "vendor_phone" "text",
    "vendor_email" "text",
    "warranty_term_years" numeric,
    "coverage_percentage" numeric,
    "start_date" "date",
    "expiration_date" "date",
    "exclusions" "text",
    "is_active" boolean DEFAULT true,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."warranties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_packages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "project_name" "text",
    "wp_number" "text",
    "name" "text",
    "phase" "text",
    "released_date" "date",
    "status" "text" DEFAULT 'Not Started'::"text" NOT NULL,
    "tonnage" numeric,
    "shop_hours_budget" numeric,
    "shop_hours_actual" numeric DEFAULT 0,
    "field_hours_budget" numeric,
    "field_hours_actual" numeric DEFAULT 0,
    "crew" "text",
    "linked_drawing_ids" "text",
    "linked_rfi_ids" "text",
    "notes" "text",
    "percent_complete" numeric DEFAULT 0,
    "vif_confirmed" boolean DEFAULT false,
    "vif_confirmed_by" "text",
    "vif_confirmed_date" "date",
    "load_list_complete" boolean DEFAULT false,
    "sequence_confirmed" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "scheduled_start_date" "date",
    "scheduled_end_date" "date",
    "drawing_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "rfi_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "area" "text",
    "sequence_number" "text",
    "trade_phase" "text",
    "shipping_phase" "text",
    "install_phase" "text",
    CONSTRAINT "chk_work_packages_status" CHECK (("status" = ANY (ARRAY['Not Started'::"text", 'In Progress'::"text", 'Complete'::"text", 'On Hold'::"text"])))
);


ALTER TABLE "public"."work_packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "storage"."buckets" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "owner" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "public" boolean DEFAULT false,
    "avif_autodetection" boolean DEFAULT false,
    "file_size_limit" bigint,
    "allowed_mime_types" "text"[],
    "owner_id" "text",
    "type" "storage"."buckettype" DEFAULT 'STANDARD'::"storage"."buckettype" NOT NULL
);


ALTER TABLE "storage"."buckets" OWNER TO "supabase_storage_admin";


COMMENT ON COLUMN "storage"."buckets"."owner" IS 'Field is deprecated, use owner_id instead';



CREATE TABLE IF NOT EXISTS "storage"."buckets_analytics" (
    "name" "text" NOT NULL,
    "type" "storage"."buckettype" DEFAULT 'ANALYTICS'::"storage"."buckettype" NOT NULL,
    "format" "text" DEFAULT 'ICEBERG'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "storage"."buckets_analytics" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."buckets_vectors" (
    "id" "text" NOT NULL,
    "type" "storage"."buckettype" DEFAULT 'VECTOR'::"storage"."buckettype" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "storage"."buckets_vectors" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."migrations" (
    "id" integer NOT NULL,
    "name" character varying(100) NOT NULL,
    "hash" character varying(40) NOT NULL,
    "executed_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "storage"."migrations" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."objects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bucket_id" "text",
    "name" "text",
    "owner" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_accessed_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    "path_tokens" "text"[] GENERATED ALWAYS AS ("string_to_array"("name", '/'::"text")) STORED,
    "version" "text",
    "owner_id" "text",
    "user_metadata" "jsonb"
);


ALTER TABLE "storage"."objects" OWNER TO "supabase_storage_admin";


COMMENT ON COLUMN "storage"."objects"."owner" IS 'Field is deprecated, use owner_id instead';



CREATE TABLE IF NOT EXISTS "storage"."s3_multipart_uploads" (
    "id" "text" NOT NULL,
    "in_progress_size" bigint DEFAULT 0 NOT NULL,
    "upload_signature" "text" NOT NULL,
    "bucket_id" "text" NOT NULL,
    "key" "text" NOT NULL COLLATE "pg_catalog"."C",
    "version" "text" NOT NULL,
    "owner_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_metadata" "jsonb",
    "metadata" "jsonb"
);


ALTER TABLE "storage"."s3_multipart_uploads" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."s3_multipart_uploads_parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "upload_id" "text" NOT NULL,
    "size" bigint DEFAULT 0 NOT NULL,
    "part_number" integer NOT NULL,
    "bucket_id" "text" NOT NULL,
    "key" "text" NOT NULL COLLATE "pg_catalog"."C",
    "etag" "text" NOT NULL,
    "owner_id" "text",
    "version" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "storage"."s3_multipart_uploads_parts" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."vector_indexes" (
    "id" "text" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL COLLATE "pg_catalog"."C",
    "bucket_id" "text" NOT NULL,
    "data_type" "text" NOT NULL,
    "dimension" integer NOT NULL,
    "distance_metric" "text" NOT NULL,
    "metadata_configuration" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "storage"."vector_indexes" OWNER TO "supabase_storage_admin";


ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_audit_log"
    ADD CONSTRAINT "ai_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backcharge_events"
    ADD CONSTRAINT "backcharge_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backcharge_tm_tickets"
    ADD CONSTRAINT "backcharge_tm_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backcharges"
    ADD CONSTRAINT "backcharges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_config"
    ADD CONSTRAINT "billing_config_pkey" PRIMARY KEY ("scope");



ALTER TABLE ONLY "public"."billing_events"
    ADD CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_events"
    ADD CONSTRAINT "billing_events_stripe_event_id_key" UNIQUE ("stripe_event_id");



ALTER TABLE ONLY "public"."budget_hour_items"
    ADD CONSTRAINT "budget_hour_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."change_orders"
    ADD CONSTRAINT "change_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."change_requests"
    ADD CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cost_codes"
    ADD CONSTRAINT "cost_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_logs"
    ADD CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."default_cost_codes"
    ADD CONSTRAINT "default_cost_codes_cost_code_number_key" UNIQUE ("cost_code_number");



ALTER TABLE ONLY "public"."default_cost_codes"
    ADD CONSTRAINT "default_cost_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_folders"
    ADD CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_import_queue"
    ADD CONSTRAINT "document_import_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_activity"
    ADD CONSTRAINT "drawing_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_analyses"
    ADD CONSTRAINT "drawing_analyses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_findings"
    ADD CONSTRAINT "drawing_findings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_impacts"
    ADD CONSTRAINT "drawing_impacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_links"
    ADD CONSTRAINT "drawing_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_markups"
    ADD CONSTRAINT "drawing_markups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_reviews"
    ADD CONSTRAINT "drawing_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_revision_comparisons"
    ADD CONSTRAINT "drawing_revision_comparisons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_revision_deltas"
    ADD CONSTRAINT "drawing_revision_deltas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_revision_summaries"
    ADD CONSTRAINT "drawing_revision_summaries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_revisions"
    ADD CONSTRAINT "drawing_revisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_sets"
    ADD CONSTRAINT "drawing_sets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_sheets"
    ADD CONSTRAINT "drawing_sheets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_signoffs"
    ADD CONSTRAINT "drawing_signoffs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_transmittal_items"
    ADD CONSTRAINT "drawing_transmittal_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_transmittals"
    ADD CONSTRAINT "drawing_transmittals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_watchers"
    ADD CONSTRAINT "drawing_watchers_pkey" PRIMARY KEY ("drawing_id", "user_id");



ALTER TABLE ONLY "public"."drawing_zone_activity"
    ADD CONSTRAINT "drawing_zone_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_zone_dependencies"
    ADD CONSTRAINT "drawing_zone_dependencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_zone_proposals"
    ADD CONSTRAINT "drawing_zone_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_zones"
    ADD CONSTRAINT "drawing_zones_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."drawings"
    ADD CONSTRAINT "drawings_drawing_set_id_required_chk" CHECK (("drawing_set_id" IS NOT NULL)) NOT VALID;



COMMENT ON CONSTRAINT "drawings_drawing_set_id_required_chk" ON "public"."drawings" IS 'Prevents new drawing rows from being orphaned from drawing_sets. NOT VALID intentionally allows any historical null drawing_set_id rows to remain until repaired.';



ALTER TABLE ONLY "public"."drawings"
    ADD CONSTRAINT "drawings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_accounts"
    ADD CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_accounts"
    ADD CONSTRAINT "email_accounts_project_id_email_address_key" UNIQUE ("project_id", "email_address");



ALTER TABLE ONLY "public"."email_attachments"
    ADD CONSTRAINT "email_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_intake_queue"
    ADD CONSTRAINT "email_intake_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_integration_settings"
    ADD CONSTRAINT "email_integration_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_project_id_external_id_key" UNIQUE ("project_id", "external_id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_file_refs"
    ADD CONSTRAINT "external_file_refs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_linked_folders"
    ADD CONSTRAINT "external_linked_folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fab_release_log"
    ADD CONSTRAINT "fab_release_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fab_release_overrides"
    ADD CONSTRAINT "fab_release_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fab_releases"
    ADD CONSTRAINT "fab_releases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_flag_key_key" UNIQUE ("flag_key");



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."linked_folders"
    ADD CONSTRAINT "linked_folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."llm_telemetry"
    ADD CONSTRAINT "llm_telemetry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."look_ahead"
    ADD CONSTRAINT "look_ahead_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_activity"
    ADD CONSTRAINT "member_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mitigation_actions"
    ADD CONSTRAINT "mitigation_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mitigation_logs"
    ADD CONSTRAINT "mitigation_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."model_element_links"
    ADD CONSTRAINT "model_element_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."model_elements"
    ADD CONSTRAINT "model_elements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."model_registry"
    ADD CONSTRAINT "model_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."number_sequences"
    ADD CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_org_id_user_id_key" UNIQUE ("org_id", "user_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."pay_application_lines"
    ADD CONSTRAINT "pay_application_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pay_applications"
    ADD CONSTRAINT "pay_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."piece_production"
    ADD CONSTRAINT "piece_production_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pma_assumptions"
    ADD CONSTRAINT "pma_assumptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pma_audit_logs"
    ADD CONSTRAINT "pma_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pma_decisions"
    ADD CONSTRAINT "pma_decisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_notes"
    ADD CONSTRAINT "production_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_closeout"
    ADD CONSTRAINT "project_closeout_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_handoff_items"
    ADD CONSTRAINT "project_handoff_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_handoff_items"
    ADD CONSTRAINT "project_handoff_items_project_id_seq_key" UNIQUE ("project_id", "seq");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."punchlist_items"
    ADD CONSTRAINT "punchlist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quality_control_records"
    ADD CONSTRAINT "quality_control_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfis"
    ADD CONSTRAINT "rfis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."risks"
    ADD CONSTRAINT "risks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."safety_incidents"
    ADD CONSTRAINT "safety_incidents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_tasks"
    ADD CONSTRAINT "schedule_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scope_items"
    ADD CONSTRAINT "scope_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sov_items"
    ADD CONSTRAINT "sov_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submittal_activity"
    ADD CONSTRAINT "submittal_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submittal_rounds"
    ADD CONSTRAINT "submittal_rounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submittal_sheet_responses"
    ADD CONSTRAINT "submittal_sheet_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submittals"
    ADD CONSTRAINT "submittals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dep_unique_edge" UNIQUE ("predecessor_id", "successor_id", "dependency_type");



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."uploaded_files"
    ADD CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_integration_settings"
    ADD CONSTRAINT "uq_email_settings_project_mailbox" UNIQUE ("project_id", "mailbox_address");



ALTER TABLE ONLY "public"."number_sequences"
    ADD CONSTRAINT "uq_number_sequences_project_record" UNIQUE ("project_id", "record_type");



ALTER TABLE ONLY "public"."drawing_transmittals"
    ADD CONSTRAINT "uq_project_transmittal" UNIQUE ("project_id", "transmittal_number");



ALTER TABLE ONLY "public"."drawing_reviews"
    ADD CONSTRAINT "uq_revision_review_role" UNIQUE ("drawing_revision_id", "review_role");



ALTER TABLE ONLY "public"."submittal_rounds"
    ADD CONSTRAINT "uq_submittal_round" UNIQUE ("submittal_id", "round_number");



ALTER TABLE ONLY "public"."drawing_transmittal_items"
    ADD CONSTRAINT "uq_transmittal_revision" UNIQUE ("transmittal_id", "drawing_revision_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_projects"
    ADD CONSTRAINT "user_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_projects"
    ADD CONSTRAINT "user_projects_user_id_project_id_key" UNIQUE ("user_id", "project_id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warranties"
    ADD CONSTRAINT "warranties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_packages"
    ADD CONSTRAINT "work_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."buckets_analytics"
    ADD CONSTRAINT "buckets_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."buckets"
    ADD CONSTRAINT "buckets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."buckets_vectors"
    ADD CONSTRAINT "buckets_vectors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."migrations"
    ADD CONSTRAINT "migrations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "storage"."migrations"
    ADD CONSTRAINT "migrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."objects"
    ADD CONSTRAINT "objects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads_parts"
    ADD CONSTRAINT "s3_multipart_uploads_parts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads"
    ADD CONSTRAINT "s3_multipart_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."vector_indexes"
    ADD CONSTRAINT "vector_indexes_pkey" PRIMARY KEY ("id");



CREATE INDEX "budget_hour_items_project_idx" ON "public"."budget_hour_items" USING "btree" ("project_id") WHERE ("is_deleted" IS NOT TRUE);



CREATE INDEX "budget_hour_items_sort_idx" ON "public"."budget_hour_items" USING "btree" ("project_id", "sort_order") WHERE ("is_deleted" IS NOT TRUE);



CREATE UNIQUE INDEX "doc_import_queue_dedup" ON "public"."document_import_queue" USING "btree" ("project_id", "external_file_id", "provider") WHERE (("is_deleted" = false) AND ("import_status" <> ALL (ARRAY['rejected'::"text", 'skipped'::"text"])));



CREATE INDEX "doc_import_queue_folder_idx" ON "public"."document_import_queue" USING "btree" ("linked_folder_id") WHERE ("is_deleted" = false);



CREATE INDEX "doc_import_queue_project_idx" ON "public"."document_import_queue" USING "btree" ("project_id", "import_status") WHERE ("is_deleted" = false);



CREATE INDEX "document_folders_project_parent_idx" ON "public"."document_folders" USING "btree" ("project_id", "parent_folder_id") WHERE ("is_deleted" = false);



CREATE UNIQUE INDEX "document_folders_unique_name_per_parent" ON "public"."document_folders" USING "btree" ("project_id", COALESCE("parent_folder_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "lower"(TRIM(BOTH FROM "name"))) WHERE ("is_deleted" = false);



CREATE INDEX "documents_external_provider_idx" ON "public"."documents" USING "btree" ("external_provider") WHERE ("external_provider" IS NOT NULL);



CREATE INDEX "documents_folder_id_idx" ON "public"."documents" USING "btree" ("folder_id") WHERE ("is_deleted" = false);



CREATE INDEX "documents_linked_folder_idx" ON "public"."documents" USING "btree" ("linked_folder_id") WHERE ("linked_folder_id" IS NOT NULL);



CREATE INDEX "drawing_revision_summaries_set_idx" ON "public"."drawing_revision_summaries" USING "btree" ("project_id", "drawing_set_id", "generated_at" DESC);



CREATE INDEX "email_messages_direction_idx" ON "public"."email_messages" USING "btree" ("project_id", "direction", "sent_at" DESC) WHERE ("is_deleted" = false);



CREATE INDEX "email_messages_read_idx" ON "public"."email_messages" USING "btree" ("project_id", "is_read") WHERE (("is_read" = false) AND ("is_deleted" = false));



CREATE INDEX "email_messages_starred_idx" ON "public"."email_messages" USING "btree" ("project_id", "is_starred") WHERE (("is_starred" = true) AND ("is_deleted" = false));



CREATE INDEX "email_messages_thread_idx" ON "public"."email_messages" USING "btree" ("project_id", "thread_id") WHERE (("thread_id" IS NOT NULL) AND ("is_deleted" = false));



CREATE INDEX "external_file_refs_linked_doc_idx" ON "public"."external_file_refs" USING "btree" ("linked_document_id") WHERE (("linked_document_id" IS NOT NULL) AND ("is_deleted" = false));



CREATE INDEX "external_file_refs_project_provider_idx" ON "public"."external_file_refs" USING "btree" ("project_id", "provider", "folder_url") WHERE ("is_deleted" = false);



CREATE UNIQUE INDEX "external_linked_folders_unique_per_project" ON "public"."external_linked_folders" USING "btree" ("project_id", "provider", "folder_url");



CREATE INDEX "idx_action_items_category" ON "public"."action_items" USING "btree" ("project_id", "category");



CREATE INDEX "idx_action_items_constraint_type" ON "public"."action_items" USING "btree" ("constraint_type") WHERE ("constraint_type" IS NOT NULL);



CREATE INDEX "idx_action_items_project_id" ON "public"."action_items" USING "btree" ("project_id");



CREATE INDEX "idx_action_items_work_package_id" ON "public"."action_items" USING "btree" ("work_package_id") WHERE ("work_package_id" IS NOT NULL);



CREATE INDEX "idx_activities_project_id" ON "public"."activities" USING "btree" ("project_id");



CREATE INDEX "idx_ai_audit_log_project_created" ON "public"."ai_audit_log" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "idx_ai_audit_log_user_id" ON "public"."ai_audit_log" USING "btree" ("user_id");



CREATE INDEX "idx_alerts_active" ON "public"."alerts" USING "btree" ("project_id", "is_dismissed") WHERE (NOT "is_dismissed");



CREATE INDEX "idx_alerts_project_id" ON "public"."alerts" USING "btree" ("project_id");



CREATE INDEX "idx_alerts_unread" ON "public"."alerts" USING "btree" ("project_id", "is_read") WHERE ((NOT "is_read") AND (NOT "is_dismissed"));



CREATE INDEX "idx_audit_logs_changed_by" ON "public"."pma_audit_logs" USING "btree" ("changed_by");



CREATE INDEX "idx_audit_logs_created" ON "public"."pma_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_entity" ON "public"."pma_audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_backcharge_events_actor" ON "public"."backcharge_events" USING "btree" ("actor");



CREATE INDEX "idx_backcharge_tm_tickets_created_by" ON "public"."backcharge_tm_tickets" USING "btree" ("created_by");



CREATE INDEX "idx_backcharges_co" ON "public"."backcharges" USING "btree" ("linked_co_id");



CREATE INDEX "idx_backcharges_cost_code_id" ON "public"."backcharges" USING "btree" ("cost_code_id");



CREATE INDEX "idx_backcharges_created_by" ON "public"."backcharges" USING "btree" ("created_by");



CREATE INDEX "idx_backcharges_project" ON "public"."backcharges" USING "btree" ("project_id");



CREATE INDEX "idx_backcharges_rfi" ON "public"."backcharges" USING "btree" ("source_rfi_id");



CREATE INDEX "idx_bc_events_backcharge" ON "public"."backcharge_events" USING "btree" ("backcharge_id", "created_at");



CREATE INDEX "idx_bc_events_project" ON "public"."backcharge_events" USING "btree" ("project_id");



CREATE INDEX "idx_bc_tm_backcharge" ON "public"."backcharge_tm_tickets" USING "btree" ("backcharge_id");



CREATE INDEX "idx_bc_tm_project" ON "public"."backcharge_tm_tickets" USING "btree" ("project_id");



CREATE INDEX "idx_billing_events_org_id" ON "public"."billing_events" USING "btree" ("org_id");



CREATE INDEX "idx_change_orders_active" ON "public"."change_orders" USING "btree" ("project_id") WHERE (NOT "is_deleted");



CREATE INDEX "idx_change_orders_project_id" ON "public"."change_orders" USING "btree" ("project_id");



CREATE INDEX "idx_change_orders_source_rfi" ON "public"."change_orders" USING "btree" ("source_rfi_id") WHERE ("source_rfi_id" IS NOT NULL);



CREATE INDEX "idx_change_orders_sov_line" ON "public"."change_orders" USING "btree" ("sov_line_item_id") WHERE ("sov_line_item_id" IS NOT NULL);



CREATE INDEX "idx_change_requests_project_id" ON "public"."change_requests" USING "btree" ("project_id");



CREATE INDEX "idx_comments_author_id" ON "public"."comments" USING "btree" ("author_id");



CREATE INDEX "idx_comments_created" ON "public"."comments" USING "btree" ("created_at" DESC) WHERE ("is_deleted" = false);



CREATE INDEX "idx_comments_entity" ON "public"."comments" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_comments_project" ON "public"."comments" USING "btree" ("project_id");



CREATE INDEX "idx_comments_status_changed_by" ON "public"."comments" USING "btree" ("status_changed_by");



CREATE INDEX "idx_contacts_active" ON "public"."contacts" USING "btree" ("project_id") WHERE (NOT "is_deleted");



CREATE INDEX "idx_contacts_project_id" ON "public"."contacts" USING "btree" ("project_id");



CREATE INDEX "idx_cost_codes_project_id" ON "public"."cost_codes" USING "btree" ("project_id");



CREATE INDEX "idx_daily_logs_is_deleted" ON "public"."daily_logs" USING "btree" ("is_deleted") WHERE ("is_deleted" = false);



CREATE INDEX "idx_daily_logs_project_id" ON "public"."daily_logs" USING "btree" ("project_id");



CREATE INDEX "idx_deliveries_active" ON "public"."deliveries" USING "btree" ("project_id") WHERE (NOT "is_deleted");



CREATE INDEX "idx_deliveries_area" ON "public"."deliveries" USING "btree" ("area") WHERE ("area" IS NOT NULL);



CREATE INDEX "idx_deliveries_delivery_number" ON "public"."deliveries" USING "btree" ("delivery_number") WHERE ("delivery_number" IS NOT NULL);



CREATE INDEX "idx_deliveries_load_number" ON "public"."deliveries" USING "btree" ("project_id", "load_number") WHERE ("load_number" IS NOT NULL);



CREATE INDEX "idx_deliveries_long_lead" ON "public"."deliveries" USING "btree" ("project_id") WHERE (("is_long_lead" = true) AND ("status" <> 'Delivered'::"text"));



CREATE INDEX "idx_deliveries_project_id" ON "public"."deliveries" USING "btree" ("project_id");



CREATE INDEX "idx_delivery_items_delivery" ON "public"."delivery_items" USING "btree" ("delivery_id");



CREATE INDEX "idx_delivery_items_mark" ON "public"."delivery_items" USING "btree" ("assembly_mark") WHERE ("assembly_mark" IS NOT NULL);



CREATE INDEX "idx_document_folders_parent_folder_id" ON "public"."document_folders" USING "btree" ("parent_folder_id");



CREATE INDEX "idx_document_import_queue_created_document_id" ON "public"."document_import_queue" USING "btree" ("created_document_id");



CREATE INDEX "idx_document_import_queue_target_folder_id" ON "public"."document_import_queue" USING "btree" ("target_folder_id");



CREATE INDEX "idx_documents_active" ON "public"."documents" USING "btree" ("project_id") WHERE (NOT "is_deleted");



CREATE INDEX "idx_documents_doc_number" ON "public"."documents" USING "btree" ("document_number") WHERE ("document_number" IS NOT NULL);



CREATE INDEX "idx_documents_linked_wp_id" ON "public"."documents" USING "btree" ("linked_wp_id");



CREATE INDEX "idx_documents_project_id" ON "public"."documents" USING "btree" ("project_id");



CREATE INDEX "idx_documents_rfi" ON "public"."documents" USING "btree" ("rfi_id") WHERE ("rfi_id" IS NOT NULL);



CREATE INDEX "idx_documents_wp" ON "public"."documents" USING "btree" ("work_package_id") WHERE ("work_package_id" IS NOT NULL);



CREATE INDEX "idx_drawing_activity_drawing" ON "public"."drawing_activity" USING "btree" ("drawing_id", "created_at" DESC);



CREATE INDEX "idx_drawing_activity_project" ON "public"."drawing_activity" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "idx_drawing_activity_type" ON "public"."drawing_activity" USING "btree" ("event_type");



CREATE INDEX "idx_drawing_analyses_imported_set" ON "public"."drawing_analyses" USING "btree" ("imported_set_id") WHERE ("imported_set_id" IS NOT NULL);



CREATE INDEX "idx_drawing_analyses_project" ON "public"."drawing_analyses" USING "btree" ("project_id");



CREATE INDEX "idx_drawing_analyses_status" ON "public"."drawing_analyses" USING "btree" ("analysis_status");



CREATE INDEX "idx_drawing_findings_analysis" ON "public"."drawing_findings" USING "btree" ("analysis_id");



CREATE INDEX "idx_drawing_findings_bbox" ON "public"."drawing_findings" USING "btree" ("analysis_id", "sheet_number") WHERE ("x_min" IS NOT NULL);



CREATE INDEX "idx_drawing_findings_linked_rfi_id" ON "public"."drawing_findings" USING "btree" ("linked_rfi_id");



CREATE INDEX "idx_drawing_findings_severity" ON "public"."drawing_findings" USING "btree" ("severity") WHERE ("dismissed" = false);



CREATE INDEX "idx_drawing_impacts_assigned" ON "public"."drawing_impacts" USING "btree" ("assigned_to");



CREATE INDEX "idx_drawing_impacts_created_by" ON "public"."drawing_impacts" USING "btree" ("created_by");



CREATE INDEX "idx_drawing_impacts_project_status" ON "public"."drawing_impacts" USING "btree" ("project_id", "status");



CREATE INDEX "idx_drawing_impacts_revision" ON "public"."drawing_impacts" USING "btree" ("drawing_revision_id");



CREATE INDEX "idx_drawing_links_drawing_id" ON "public"."drawing_links" USING "btree" ("drawing_id");



CREATE INDEX "idx_drawing_links_project_type" ON "public"."drawing_links" USING "btree" ("project_id", "linked_record_type") WHERE ("removed_at" IS NULL);



CREATE INDEX "idx_drawing_links_record_lookup" ON "public"."drawing_links" USING "btree" ("linked_record_type", "linked_record_id") WHERE ("removed_at" IS NULL);



CREATE INDEX "idx_drawing_links_revision" ON "public"."drawing_links" USING "btree" ("drawing_revision_id") WHERE ("removed_at" IS NULL);



CREATE INDEX "idx_drawing_links_zone" ON "public"."drawing_links" USING "btree" ("drawing_zone_id") WHERE ("removed_at" IS NULL);



CREATE INDEX "idx_drawing_markups_author_id" ON "public"."drawing_markups" USING "btree" ("author_id");



CREATE INDEX "idx_drawing_markups_drawing" ON "public"."drawing_markups" USING "btree" ("drawing_id");



CREATE INDEX "idx_drawing_markups_project" ON "public"."drawing_markups" USING "btree" ("project_id");



CREATE INDEX "idx_drawing_markups_revision" ON "public"."drawing_markups" USING "btree" ("drawing_revision_id");



CREATE INDEX "idx_drawing_reviews_project" ON "public"."drawing_reviews" USING "btree" ("project_id");



CREATE INDEX "idx_drawing_reviews_reviewer_id" ON "public"."drawing_reviews" USING "btree" ("reviewer_id");



CREATE INDEX "idx_drawing_reviews_revision" ON "public"."drawing_reviews" USING "btree" ("drawing_revision_id");



CREATE INDEX "idx_drawing_revision_comparisons_from_analysis_id" ON "public"."drawing_revision_comparisons" USING "btree" ("from_analysis_id");



CREATE INDEX "idx_drawing_revision_comparisons_from_revision_id" ON "public"."drawing_revision_comparisons" USING "btree" ("from_revision_id");



CREATE INDEX "idx_drawing_revision_comparisons_to_analysis_id" ON "public"."drawing_revision_comparisons" USING "btree" ("to_analysis_id");



CREATE INDEX "idx_drawing_revision_comparisons_to_revision_id" ON "public"."drawing_revision_comparisons" USING "btree" ("to_revision_id");



CREATE INDEX "idx_drawing_revision_deltas_linked_rfi_id" ON "public"."drawing_revision_deltas" USING "btree" ("linked_rfi_id");



CREATE INDEX "idx_drawing_revision_summaries_drawing_set_id" ON "public"."drawing_revision_summaries" USING "btree" ("drawing_set_id");



CREATE INDEX "idx_drawing_revision_summaries_generated_by" ON "public"."drawing_revision_summaries" USING "btree" ("generated_by");



CREATE INDEX "idx_drawing_revisions_drawing" ON "public"."drawing_revisions" USING "btree" ("drawing_id");



CREATE INDEX "idx_drawing_revisions_project" ON "public"."drawing_revisions" USING "btree" ("project_id");



CREATE INDEX "idx_drawing_revisions_release_status" ON "public"."drawing_revisions" USING "btree" ("project_id", "release_status");



CREATE INDEX "idx_drawing_revisions_supersedes_revision_id" ON "public"."drawing_revisions" USING "btree" ("supersedes_revision_id");



CREATE INDEX "idx_drawing_sets_active" ON "public"."drawing_sets" USING "btree" ("project_id", "created_at" DESC) WHERE ("is_deleted" = false);



CREATE INDEX "idx_drawing_sets_current_submittal_id" ON "public"."drawing_sets" USING "btree" ("current_submittal_id");



CREATE INDEX "idx_drawing_sets_due_date" ON "public"."drawing_sets" USING "btree" ("due_date") WHERE ("due_date" IS NOT NULL);



CREATE INDEX "idx_drawing_sets_locked_by" ON "public"."drawing_sets" USING "btree" ("locked_by");



CREATE INDEX "idx_drawing_sets_project_id" ON "public"."drawing_sets" USING "btree" ("project_id");



CREATE INDEX "idx_drawing_sheets_analysis" ON "public"."drawing_sheets" USING "btree" ("analysis_id");



CREATE INDEX "idx_drawing_signoffs_drawing" ON "public"."drawing_signoffs" USING "btree" ("drawing_id") WHERE ("is_voided" = false);



CREATE INDEX "idx_drawing_signoffs_project" ON "public"."drawing_signoffs" USING "btree" ("project_id");



CREATE INDEX "idx_drawing_signoffs_revision" ON "public"."drawing_signoffs" USING "btree" ("drawing_revision_id") WHERE ("is_voided" = false);



CREATE INDEX "idx_drawing_signoffs_stamped_by_id" ON "public"."drawing_signoffs" USING "btree" ("stamped_by_id");



CREATE INDEX "idx_drawing_signoffs_voided_by" ON "public"."drawing_signoffs" USING "btree" ("voided_by");



CREATE INDEX "idx_drawing_transmittal_items_project_id" ON "public"."drawing_transmittal_items" USING "btree" ("project_id");



CREATE INDEX "idx_drawing_transmittals_created_by" ON "public"."drawing_transmittals" USING "btree" ("created_by");



CREATE INDEX "idx_drawing_transmittals_project" ON "public"."drawing_transmittals" USING "btree" ("project_id");



CREATE INDEX "idx_drawing_watchers_project_id" ON "public"."drawing_watchers" USING "btree" ("project_id");



CREATE INDEX "idx_drawing_watchers_user" ON "public"."drawing_watchers" USING "btree" ("user_id");



CREATE INDEX "idx_drawing_zone_activity_drawing_id" ON "public"."drawing_zone_activity" USING "btree" ("drawing_id");



CREATE INDEX "idx_drawing_zone_activity_event" ON "public"."drawing_zone_activity" USING "btree" ("event_type", "created_at" DESC);



CREATE INDEX "idx_drawing_zone_activity_project" ON "public"."drawing_zone_activity" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "idx_drawing_zone_activity_zone" ON "public"."drawing_zone_activity" USING "btree" ("drawing_zone_id", "created_at" DESC);



CREATE INDEX "idx_drawing_zone_dependencies_active_source" ON "public"."drawing_zone_dependencies" USING "btree" ("project_id", "source_zone_id") WHERE ("removed_at" IS NULL);



CREATE INDEX "idx_drawing_zone_dependencies_active_target" ON "public"."drawing_zone_dependencies" USING "btree" ("project_id", "target_zone_id") WHERE ("removed_at" IS NULL);



CREATE INDEX "idx_drawing_zone_dependencies_created_by" ON "public"."drawing_zone_dependencies" USING "btree" ("created_by");



CREATE INDEX "idx_drawing_zone_dependencies_removed_by" ON "public"."drawing_zone_dependencies" USING "btree" ("removed_by");



CREATE INDEX "idx_drawing_zone_dependencies_target_zone_id" ON "public"."drawing_zone_dependencies" USING "btree" ("target_zone_id");



CREATE INDEX "idx_drawing_zone_proposals_accepted_zone_id" ON "public"."drawing_zone_proposals" USING "btree" ("accepted_zone_id");



CREATE INDEX "idx_drawing_zone_proposals_analysis_id" ON "public"."drawing_zone_proposals" USING "btree" ("analysis_id");



CREATE INDEX "idx_drawing_zone_proposals_decided_by" ON "public"."drawing_zone_proposals" USING "btree" ("decided_by");



CREATE INDEX "idx_drawing_zone_proposals_drawing_id" ON "public"."drawing_zone_proposals" USING "btree" ("drawing_id");



CREATE INDEX "idx_drawing_zone_proposals_merged_into_proposal_id" ON "public"."drawing_zone_proposals" USING "btree" ("merged_into_proposal_id");



CREATE INDEX "idx_drawing_zone_proposals_project_analysis" ON "public"."drawing_zone_proposals" USING "btree" ("project_id", "analysis_id");



CREATE INDEX "idx_drawing_zone_proposals_project_drawing_status" ON "public"."drawing_zone_proposals" USING "btree" ("project_id", "drawing_id", "status");



CREATE INDEX "idx_drawing_zone_proposals_revision" ON "public"."drawing_zone_proposals" USING "btree" ("drawing_revision_id");



CREATE INDEX "idx_drawing_zones_drawing" ON "public"."drawing_zones" USING "btree" ("drawing_id");



CREATE INDEX "idx_drawing_zones_label" ON "public"."drawing_zones" USING "btree" ("drawing_revision_id", "label");



CREATE INDEX "idx_drawing_zones_parent_zone_id" ON "public"."drawing_zones" USING "btree" ("parent_zone_id");



CREATE INDEX "idx_drawing_zones_project" ON "public"."drawing_zones" USING "btree" ("project_id");



CREATE INDEX "idx_drawing_zones_revision" ON "public"."drawing_zones" USING "btree" ("drawing_revision_id", "is_active");



CREATE INDEX "idx_drawing_zones_status" ON "public"."drawing_zones" USING "btree" ("project_id", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_drawings_active" ON "public"."drawings" USING "btree" ("project_id") WHERE (NOT "is_deleted");



CREATE INDEX "idx_drawings_ai_extraction_status" ON "public"."drawings" USING "btree" ("ai_extraction_status");



CREATE INDEX "idx_drawings_drawing_set_id" ON "public"."drawings" USING "btree" ("drawing_set_id");



CREATE INDEX "idx_drawings_extracted_text_gin" ON "public"."drawings" USING "gin" ("to_tsvector"('"english"'::"regconfig", COALESCE("extracted_text", ''::"text")));



CREATE INDEX "idx_drawings_project_id" ON "public"."drawings" USING "btree" ("project_id");



CREATE INDEX "idx_drawings_set_name" ON "public"."drawings" USING "btree" ("drawing_set_name") WHERE ("drawing_set_name" IS NOT NULL);



CREATE INDEX "idx_drawings_upload_batch_id" ON "public"."drawings" USING "btree" ("upload_batch_id");



CREATE INDEX "idx_drawings_upload_status" ON "public"."drawings" USING "btree" ("upload_status");



CREATE INDEX "idx_email_accounts_created_by" ON "public"."email_accounts" USING "btree" ("created_by");



CREATE INDEX "idx_email_accounts_project" ON "public"."email_accounts" USING "btree" ("project_id");



CREATE INDEX "idx_email_attachments_message" ON "public"."email_attachments" USING "btree" ("message_id");



CREATE INDEX "idx_email_attachments_project_id" ON "public"."email_attachments" USING "btree" ("project_id");



CREATE UNIQUE INDEX "idx_email_intake_queue_dedup" ON "public"."email_intake_queue" USING "btree" ("source_mailbox", "source_message_id");



CREATE INDEX "idx_email_intake_queue_project" ON "public"."email_intake_queue" USING "btree" ("project_id");



CREATE INDEX "idx_email_intake_queue_reviewed_by" ON "public"."email_intake_queue" USING "btree" ("reviewed_by");



CREATE INDEX "idx_email_intake_queue_status" ON "public"."email_intake_queue" USING "btree" ("status");



CREATE INDEX "idx_email_integration_settings_project" ON "public"."email_integration_settings" USING "btree" ("project_id");



CREATE INDEX "idx_email_messages_account_id" ON "public"."email_messages" USING "btree" ("account_id");



CREATE INDEX "idx_email_messages_external" ON "public"."email_messages" USING "btree" ("project_id", "external_id");



CREATE INDEX "idx_email_messages_project" ON "public"."email_messages" USING "btree" ("project_id");



CREATE INDEX "idx_email_messages_received" ON "public"."email_messages" USING "btree" ("project_id", "received_at" DESC);



CREATE INDEX "idx_email_messages_reviewed_by" ON "public"."email_messages" USING "btree" ("reviewed_by");



CREATE INDEX "idx_email_messages_sent_by" ON "public"."email_messages" USING "btree" ("sent_by");



CREATE INDEX "idx_email_messages_status" ON "public"."email_messages" USING "btree" ("project_id", "import_status");



CREATE INDEX "idx_expenses_active" ON "public"."expenses" USING "btree" ("project_id") WHERE (NOT "is_deleted");



CREATE INDEX "idx_expenses_project_id" ON "public"."expenses" USING "btree" ("project_id");



CREATE INDEX "idx_external_file_refs_drawing_set_id" ON "public"."external_file_refs" USING "btree" ("drawing_set_id");



CREATE INDEX "idx_external_linked_folders_drawing_set_id" ON "public"."external_linked_folders" USING "btree" ("drawing_set_id");



CREATE INDEX "idx_fab_release_log_project" ON "public"."fab_release_log" USING "btree" ("project_id");



CREATE INDEX "idx_fab_release_log_released_by" ON "public"."fab_release_log" USING "btree" ("released_by");



CREATE INDEX "idx_fab_release_overrides_by" ON "public"."fab_release_overrides" USING "btree" ("overridden_by");



CREATE INDEX "idx_fab_release_overrides_project" ON "public"."fab_release_overrides" USING "btree" ("project_id");



CREATE INDEX "idx_fab_releases_project_id" ON "public"."fab_releases" USING "btree" ("project_id");



CREATE INDEX "idx_feature_flags_key" ON "public"."feature_flags" USING "btree" ("flag_key");



CREATE INDEX "idx_inspections_active" ON "public"."inspections" USING "btree" ("project_id") WHERE (NOT "is_deleted");



CREATE INDEX "idx_inspections_project_id" ON "public"."inspections" USING "btree" ("project_id");



CREATE INDEX "idx_llm_telemetry_project" ON "public"."llm_telemetry" USING "btree" ("project_id", "occurred_at" DESC) WHERE ("project_id" IS NOT NULL);



CREATE INDEX "idx_llm_telemetry_provider" ON "public"."llm_telemetry" USING "btree" ("provider", "occurred_at" DESC);



CREATE INDEX "idx_llm_telemetry_use_case" ON "public"."llm_telemetry" USING "btree" ("use_case", "occurred_at" DESC);



CREATE INDEX "idx_llm_telemetry_user_recent" ON "public"."llm_telemetry" USING "btree" ("user_id", "occurred_at" DESC) WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_look_ahead_project_id" ON "public"."look_ahead" USING "btree" ("project_id");



CREATE INDEX "idx_meetings_active" ON "public"."meetings" USING "btree" ("project_id") WHERE (NOT "is_deleted");



CREATE INDEX "idx_meetings_project_id" ON "public"."meetings" USING "btree" ("project_id");



CREATE INDEX "idx_member_activity_project_created" ON "public"."member_activity" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "idx_member_activity_target_user" ON "public"."member_activity" USING "btree" ("target_user_id");



CREATE INDEX "idx_mitigation_actions_mitigation" ON "public"."mitigation_actions" USING "btree" ("mitigation_id", "action_date" DESC);



CREATE INDEX "idx_mitigation_actions_project_id" ON "public"."mitigation_actions" USING "btree" ("project_id");



CREATE INDEX "idx_mitigation_logs_co_candidate" ON "public"."mitigation_logs" USING "btree" ("project_id") WHERE ("is_co_candidate" = true);



CREATE INDEX "idx_mitigation_logs_impact" ON "public"."mitigation_logs" USING "btree" ("project_id", "impact_types") WHERE ("impact_types" IS NOT NULL);



CREATE INDEX "idx_mitigation_logs_project" ON "public"."mitigation_logs" USING "btree" ("project_id", "status");



CREATE INDEX "idx_mitigation_logs_root_cause" ON "public"."mitigation_logs" USING "btree" ("project_id", "root_cause_category") WHERE ("root_cause_category" IS NOT NULL);



CREATE INDEX "idx_model_element_links_entity" ON "public"."model_element_links" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_model_element_links_model" ON "public"."model_element_links" USING "btree" ("model_id");



CREATE INDEX "idx_model_element_links_project_id" ON "public"."model_element_links" USING "btree" ("project_id");



CREATE INDEX "idx_model_registry_document_id" ON "public"."model_registry" USING "btree" ("document_id");



CREATE INDEX "idx_model_registry_project" ON "public"."model_registry" USING "btree" ("project_id") WHERE ("is_deleted" = false);



CREATE INDEX "idx_model_registry_status" ON "public"."model_registry" USING "btree" ("project_id", "status") WHERE ("is_deleted" = false);



CREATE INDEX "idx_model_registry_superseded_by" ON "public"."model_registry" USING "btree" ("superseded_by");



CREATE INDEX "idx_org_invite_org" ON "public"."organization_invitations" USING "btree" ("org_id");



CREATE INDEX "idx_org_members_org" ON "public"."organization_members" USING "btree" ("org_id");



CREATE INDEX "idx_org_members_user" ON "public"."organization_members" USING "btree" ("user_id");



CREATE INDEX "idx_org_stripe_customer" ON "public"."organizations" USING "btree" ("stripe_customer_id");



CREATE INDEX "idx_organization_invitations_invited_by" ON "public"."organization_invitations" USING "btree" ("invited_by");



CREATE INDEX "idx_organizations_created_by" ON "public"."organizations" USING "btree" ("created_by");



CREATE INDEX "idx_pay_applications_created_by" ON "public"."pay_applications" USING "btree" ("created_by");



CREATE INDEX "idx_pay_apps_project" ON "public"."pay_applications" USING "btree" ("project_id");



CREATE INDEX "idx_payapp_lines_app" ON "public"."pay_application_lines" USING "btree" ("pay_application_id");



CREATE INDEX "idx_payapp_lines_project" ON "public"."pay_application_lines" USING "btree" ("project_id");



CREATE INDEX "idx_payapp_lines_sov" ON "public"."pay_application_lines" USING "btree" ("sov_item_id");



CREATE INDEX "idx_photos_daily_log_id" ON "public"."photos" USING "btree" ("daily_log_id") WHERE ("daily_log_id" IS NOT NULL);



CREATE INDEX "idx_photos_inspection_id" ON "public"."photos" USING "btree" ("inspection_id") WHERE ("inspection_id" IS NOT NULL);



CREATE INDEX "idx_photos_is_deleted" ON "public"."photos" USING "btree" ("is_deleted") WHERE ("is_deleted" = false);



CREATE INDEX "idx_photos_project_id" ON "public"."photos" USING "btree" ("project_id");



CREATE INDEX "idx_photos_punchlist_item_id" ON "public"."photos" USING "btree" ("punchlist_item_id") WHERE ("punchlist_item_id" IS NOT NULL);



CREATE INDEX "idx_piece_production_project" ON "public"."piece_production" USING "btree" ("project_id");



CREATE INDEX "idx_pma_assumptions_project_id" ON "public"."pma_assumptions" USING "btree" ("project_id");



CREATE INDEX "idx_pma_audit_logs_project_id" ON "public"."pma_audit_logs" USING "btree" ("project_id");



CREATE INDEX "idx_pma_decisions_project_id" ON "public"."pma_decisions" USING "btree" ("project_id");



CREATE INDEX "idx_production_notes_project_id" ON "public"."production_notes" USING "btree" ("project_id");



CREATE INDEX "idx_project_closeout_project_id" ON "public"."project_closeout" USING "btree" ("project_id");



CREATE INDEX "idx_project_handoff_items_project" ON "public"."project_handoff_items" USING "btree" ("project_id");



CREATE INDEX "idx_projects_active_created_at" ON "public"."projects" USING "btree" ("created_at" DESC) WHERE ("is_deleted" = false);



CREATE INDEX "idx_projects_detailer_contact_id" ON "public"."projects" USING "btree" ("detailer_contact_id") WHERE ("detailer_contact_id" IS NOT NULL);



CREATE INDEX "idx_projects_name_trgm" ON "public"."projects" USING "gin" ("name" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_projects_on_hold" ON "public"."projects" USING "btree" ("on_hold") WHERE ("on_hold" = true);



CREATE INDEX "idx_projects_on_hold_by" ON "public"."projects" USING "btree" ("on_hold_by");



CREATE INDEX "idx_projects_org" ON "public"."projects" USING "btree" ("org_id");



CREATE UNIQUE INDEX "idx_projects_project_number" ON "public"."projects" USING "btree" ("project_number") WHERE (("project_number" IS NOT NULL) AND (COALESCE("is_deleted", false) = false));



CREATE INDEX "idx_punchlist_items_active" ON "public"."punchlist_items" USING "btree" ("project_id") WHERE (NOT "is_deleted");



CREATE INDEX "idx_punchlist_items_drawing_id" ON "public"."punchlist_items" USING "btree" ("drawing_id") WHERE ("drawing_id" IS NOT NULL);



CREATE INDEX "idx_punchlist_items_inspection_id" ON "public"."punchlist_items" USING "btree" ("inspection_id") WHERE ("inspection_id" IS NOT NULL);



CREATE INDEX "idx_punchlist_items_project_id" ON "public"."punchlist_items" USING "btree" ("project_id");



CREATE INDEX "idx_qcr_is_deleted" ON "public"."quality_control_records" USING "btree" ("is_deleted") WHERE ("is_deleted" = false);



CREATE INDEX "idx_quality_control_records_project_id" ON "public"."quality_control_records" USING "btree" ("project_id");



CREATE INDEX "idx_resources_parent" ON "public"."resources" USING "btree" ("parent_resource_id") WHERE ("parent_resource_id" IS NOT NULL);



CREATE INDEX "idx_resources_project_id" ON "public"."resources" USING "btree" ("project_id");



CREATE INDEX "idx_revision_comparisons_drawing" ON "public"."drawing_revision_comparisons" USING "btree" ("drawing_id") WHERE ("source" = 'revision'::"text");



CREATE INDEX "idx_revision_comparisons_project" ON "public"."drawing_revision_comparisons" USING "btree" ("project_id");



CREATE INDEX "idx_revision_comparisons_status" ON "public"."drawing_revision_comparisons" USING "btree" ("compare_status");



CREATE INDEX "idx_revision_deltas_comparison" ON "public"."drawing_revision_deltas" USING "btree" ("comparison_id");



CREATE INDEX "idx_revision_deltas_severity" ON "public"."drawing_revision_deltas" USING "btree" ("severity") WHERE ("dismissed" = false);



CREATE INDEX "idx_rfis_active" ON "public"."rfis" USING "btree" ("project_id") WHERE (NOT "is_deleted");



CREATE INDEX "idx_rfis_drawing_set_id" ON "public"."rfis" USING "btree" ("drawing_set_id") WHERE ("drawing_set_id" IS NOT NULL);



CREATE INDEX "idx_rfis_project_id" ON "public"."rfis" USING "btree" ("project_id");



CREATE INDEX "idx_rfis_work_package_id" ON "public"."rfis" USING "btree" ("work_package_id") WHERE ("work_package_id" IS NOT NULL);



CREATE INDEX "idx_safety_incidents_active" ON "public"."safety_incidents" USING "btree" ("project_id") WHERE (NOT "is_deleted");



CREATE INDEX "idx_safety_incidents_project_id" ON "public"."safety_incidents" USING "btree" ("project_id");



CREATE INDEX "idx_schedule_tasks_crew" ON "public"."schedule_tasks" USING "btree" ("crew_id") WHERE ("crew_id" IS NOT NULL);



CREATE INDEX "idx_schedule_tasks_parent" ON "public"."schedule_tasks" USING "btree" ("parent_task_id");



CREATE INDEX "idx_schedule_tasks_project_id" ON "public"."schedule_tasks" USING "btree" ("project_id");



CREATE INDEX "idx_schedule_tasks_sort_order" ON "public"."schedule_tasks" USING "btree" ("project_id", "parent_task_id", "sort_order") WHERE ("sort_order" IS NOT NULL);



CREATE INDEX "idx_scope_items_active" ON "public"."scope_items" USING "btree" ("project_id") WHERE (NOT "is_deleted");



CREATE INDEX "idx_scope_items_in_progress" ON "public"."scope_items" USING "btree" ("project_id", "in_progress") WHERE ("in_progress" = true);



CREATE INDEX "idx_scope_items_project_completed" ON "public"."scope_items" USING "btree" ("project_id", "is_completed");



CREATE INDEX "idx_scope_items_project_id" ON "public"."scope_items" USING "btree" ("project_id");



CREATE INDEX "idx_sheet_responses_drawing" ON "public"."submittal_sheet_responses" USING "btree" ("drawing_id") WHERE ("drawing_id" IS NOT NULL);



CREATE INDEX "idx_sheet_responses_project" ON "public"."submittal_sheet_responses" USING "btree" ("project_id");



CREATE INDEX "idx_sheet_responses_round" ON "public"."submittal_sheet_responses" USING "btree" ("submittal_round_id");



CREATE INDEX "idx_sov_items_active" ON "public"."sov_items" USING "btree" ("project_id") WHERE (NOT "is_deleted");



CREATE INDEX "idx_sov_items_project_id" ON "public"."sov_items" USING "btree" ("project_id");



CREATE INDEX "idx_submittal_activity_project" ON "public"."submittal_activity" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "idx_submittal_activity_submittal" ON "public"."submittal_activity" USING "btree" ("submittal_id", "created_at" DESC);



CREATE INDEX "idx_submittal_rounds_project" ON "public"."submittal_rounds" USING "btree" ("project_id");



CREATE INDEX "idx_submittal_rounds_submittal" ON "public"."submittal_rounds" USING "btree" ("submittal_id", "round_number");



CREATE INDEX "idx_submittal_sheet_responses_drawing_set_id" ON "public"."submittal_sheet_responses" USING "btree" ("drawing_set_id");



CREATE INDEX "idx_submittals_current_round_id" ON "public"."submittals" USING "btree" ("current_round_id");



CREATE INDEX "idx_submittals_project" ON "public"."submittals" USING "btree" ("project_id");



CREATE INDEX "idx_submittals_required" ON "public"."submittals" USING "btree" ("required_date") WHERE ("is_deleted" = false);



CREATE INDEX "idx_submittals_status" ON "public"."submittals" USING "btree" ("status") WHERE ("is_deleted" = false);



CREATE INDEX "idx_task_deps_pred" ON "public"."task_dependencies" USING "btree" ("predecessor_id");



CREATE INDEX "idx_task_deps_project" ON "public"."task_dependencies" USING "btree" ("project_id");



CREATE INDEX "idx_task_deps_succ" ON "public"."task_dependencies" USING "btree" ("successor_id");



CREATE INDEX "idx_transmittal_items_revision" ON "public"."drawing_transmittal_items" USING "btree" ("drawing_revision_id");



CREATE INDEX "idx_transmittal_items_transmittal" ON "public"."drawing_transmittal_items" USING "btree" ("transmittal_id");



CREATE INDEX "idx_uploaded_files_project_id" ON "public"."uploaded_files" USING "btree" ("project_id");



CREATE INDEX "idx_user_projects_composite" ON "public"."user_projects" USING "btree" ("user_id", "project_id");



CREATE INDEX "idx_user_projects_project_id" ON "public"."user_projects" USING "btree" ("project_id");



CREATE INDEX "idx_user_projects_user_id" ON "public"."user_projects" USING "btree" ("user_id");



CREATE INDEX "idx_user_projects_user_role" ON "public"."user_projects" USING "btree" ("user_id", "role");



CREATE INDEX "idx_vendors_org_id" ON "public"."vendors" USING "btree" ("org_id");



CREATE INDEX "idx_warranties_project_id" ON "public"."warranties" USING "btree" ("project_id");



CREATE INDEX "idx_work_packages_active" ON "public"."work_packages" USING "btree" ("project_id") WHERE (NOT "is_deleted");



CREATE INDEX "idx_work_packages_area" ON "public"."work_packages" USING "btree" ("area") WHERE ("area" IS NOT NULL);



CREATE INDEX "idx_work_packages_project_id" ON "public"."work_packages" USING "btree" ("project_id");



CREATE INDEX "idx_work_packages_schedule_window" ON "public"."work_packages" USING "btree" ("project_id", "scheduled_start_date") WHERE ("scheduled_start_date" IS NOT NULL);



CREATE INDEX "idx_work_packages_sequence" ON "public"."work_packages" USING "btree" ("sequence_number") WHERE ("sequence_number" IS NOT NULL);



CREATE INDEX "idx_zone_activity_actor" ON "public"."drawing_zone_activity" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "linked_folders_project_idx" ON "public"."linked_folders" USING "btree" ("project_id") WHERE ("is_deleted" = false);



CREATE INDEX "linked_folders_provider_idx" ON "public"."linked_folders" USING "btree" ("provider", "project_id");



CREATE INDEX "model_elements_drawing_id_idx" ON "public"."model_elements" USING "btree" ("drawing_id");



CREATE UNIQUE INDEX "model_elements_model_guid_uq" ON "public"."model_elements" USING "btree" ("model_id", "element_guid") WHERE (("element_guid" IS NOT NULL) AND ("model_id" IS NOT NULL));



CREATE INDEX "model_elements_model_id_idx" ON "public"."model_elements" USING "btree" ("model_id");



CREATE INDEX "model_elements_project_piece_idx" ON "public"."model_elements" USING "btree" ("project_id", "piece_mark");



CREATE INDEX "model_elements_project_seq_idx" ON "public"."model_elements" USING "btree" ("project_id", "sequence_number");



CREATE INDEX "model_elements_set_id_idx" ON "public"."model_elements" USING "btree" ("drawing_set_id");



CREATE INDEX "model_elements_wp_id_idx" ON "public"."model_elements" USING "btree" ("work_package_id");



CREATE INDEX "risks_project_idx" ON "public"."risks" USING "btree" ("project_id") WHERE ("is_deleted" IS NOT TRUE);



CREATE INDEX "risks_severity_idx" ON "public"."risks" USING "btree" ("severity") WHERE ("is_deleted" IS NOT TRUE);



CREATE INDEX "risks_status_idx" ON "public"."risks" USING "btree" ("status") WHERE ("is_deleted" IS NOT TRUE);



CREATE INDEX "schedule_tasks_is_summary_idx" ON "public"."schedule_tasks" USING "btree" ("is_summary") WHERE ("is_summary" = true);



CREATE UNIQUE INDEX "submittals_unique_per_project" ON "public"."submittals" USING "btree" ("project_id", "submittal_number") WHERE ("is_deleted" IS NOT TRUE);



CREATE UNIQUE INDEX "uq_change_orders_project_number" ON "public"."change_orders" USING "btree" ("project_id", "co_number") WHERE ("co_number" IS NOT NULL);



CREATE UNIQUE INDEX "uq_drawing_sets_project_set_name" ON "public"."drawing_sets" USING "btree" ("project_id", "set_name") WHERE (("set_name" IS NOT NULL) AND ("set_name" <> ''::"text") AND ("is_deleted" = false));



CREATE UNIQUE INDEX "uq_drawings_set_sheet_revision" ON "public"."drawings" USING "btree" ("project_id", "drawing_set_id", "sheet_number", "revision_number") WHERE (("is_deleted" = false) AND ("sheet_number" IS NOT NULL) AND ("sheet_number" <> ''::"text"));



CREATE UNIQUE INDEX "uq_org_invite_pending" ON "public"."organization_invitations" USING "btree" ("org_id", "lower"("email")) WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "uq_pay_app_number" ON "public"."pay_applications" USING "btree" ("project_id", "application_number") WHERE ("is_deleted" = false);



CREATE UNIQUE INDEX "uq_photos_client_op_id" ON "public"."photos" USING "btree" ("client_op_id") WHERE ("client_op_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_piece_production_project_mark" ON "public"."piece_production" USING "btree" ("project_id", "piece_mark") WHERE ("is_deleted" = false);



CREATE UNIQUE INDEX "uq_punchlist_items_client_op_id" ON "public"."punchlist_items" USING "btree" ("client_op_id") WHERE ("client_op_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_rfis_project_number" ON "public"."rfis" USING "btree" ("project_id", "rfi_number") WHERE (("rfi_number" IS NOT NULL) AND ("rfi_number" <> ''::"text") AND ("is_deleted" = false));



CREATE UNIQUE INDEX "uq_submittals_external_id" ON "public"."submittals" USING "btree" ("external_id");



CREATE UNIQUE INDEX "ux_drawing_links_active_unique" ON "public"."drawing_links" USING "btree" ("drawing_zone_id", "linked_record_type", "linked_record_id", "link_role") WHERE ("removed_at" IS NULL);



CREATE UNIQUE INDEX "ux_drawing_revisions_one_current" ON "public"."drawing_revisions" USING "btree" ("drawing_id") WHERE ("is_current" = true);



CREATE UNIQUE INDEX "ux_drawing_revisions_sheet_rev" ON "public"."drawing_revisions" USING "btree" ("drawing_id", "revision_code");



CREATE UNIQUE INDEX "ux_drawing_revisions_unique_version" ON "public"."drawing_revisions" USING "btree" ("drawing_id", "version_number");



CREATE UNIQUE INDEX "ux_drawing_zone_dependencies_active" ON "public"."drawing_zone_dependencies" USING "btree" ("source_zone_id", "target_zone_id", "relationship") WHERE ("removed_at" IS NULL);



CREATE UNIQUE INDEX "ux_drawing_zones_zone_key" ON "public"."drawing_zones" USING "btree" ("drawing_revision_id", "zone_key");



CREATE UNIQUE INDEX "ux_revision_comparison_pair" ON "public"."drawing_revision_comparisons" USING "btree" ("drawing_id", "from_revision_id", "to_revision_id") WHERE ("source" = 'revision'::"text");



CREATE UNIQUE INDEX "bname" ON "storage"."buckets" USING "btree" ("name");



CREATE UNIQUE INDEX "bucketid_objname" ON "storage"."objects" USING "btree" ("bucket_id", "name");



CREATE UNIQUE INDEX "buckets_analytics_unique_name_idx" ON "storage"."buckets_analytics" USING "btree" ("name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_multipart_uploads_list" ON "storage"."s3_multipart_uploads" USING "btree" ("bucket_id", "key", "created_at");



CREATE INDEX "idx_objects_bucket_id_name" ON "storage"."objects" USING "btree" ("bucket_id", "name" COLLATE "C");



CREATE INDEX "idx_objects_bucket_id_name_lower" ON "storage"."objects" USING "btree" ("bucket_id", "lower"("name") COLLATE "C");



CREATE INDEX "name_prefix_search" ON "storage"."objects" USING "btree" ("name" "text_pattern_ops");



CREATE UNIQUE INDEX "vector_indexes_name_bucket_id_idx" ON "storage"."vector_indexes" USING "btree" ("name", "bucket_id");



CREATE OR REPLACE TRIGGER "drawing_sets_unlock_role_check" BEFORE UPDATE OF "is_locked" ON "public"."drawing_sets" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_drawing_set_unlock_role"();



CREATE OR REPLACE TRIGGER "prevent_user_profile_role_change" BEFORE UPDATE OF "role" ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_user_profile_role_change"();



CREATE OR REPLACE TRIGGER "project_handoff_items_touch" BEFORE UPDATE ON "public"."project_handoff_items" FOR EACH ROW EXECUTE FUNCTION "public"."project_handoff_items_touch_updated_at"();



CREATE OR REPLACE TRIGGER "projects_seed_handoff_items" AFTER INSERT ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."trg_projects_seed_handoff_items"();



CREATE OR REPLACE TRIGGER "set_mitigation_actions_updated_at" BEFORE UPDATE ON "public"."mitigation_actions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_mitigation_logs_updated_at" BEFORE UPDATE ON "public"."mitigation_logs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_model_element_links_updated_at" BEFORE UPDATE ON "public"."model_element_links" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_model_registry_updated_at" BEFORE UPDATE ON "public"."model_registry" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_budget_hour_items" BEFORE UPDATE ON "public"."budget_hour_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_feature_flags" BEFORE UPDATE ON "public"."feature_flags" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_model_elements" BEFORE UPDATE ON "public"."model_elements" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_model_elements"();



CREATE OR REPLACE TRIGGER "set_updated_at_risks" BEFORE UPDATE ON "public"."risks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "tg_drawing_zone_proposals_touch" BEFORE INSERT OR UPDATE ON "public"."drawing_zone_proposals" FOR EACH ROW EXECUTE FUNCTION "public"."tg_drawing_zone_proposals_touch"();



CREATE OR REPLACE TRIGGER "tg_validate_drawing_zone_dependency_project" BEFORE INSERT OR UPDATE OF "source_zone_id", "target_zone_id", "project_id" ON "public"."drawing_zone_dependencies" FOR EACH ROW EXECUTE FUNCTION "public"."tg_validate_drawing_zone_dependency_project"();



CREATE OR REPLACE TRIGGER "trg_action_items_updated_at" BEFORE UPDATE ON "public"."action_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_activities_updated_at" BEFORE UPDATE ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_alerts_updated_at" BEFORE UPDATE ON "public"."alerts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_audit_log" AFTER INSERT OR DELETE OR UPDATE ON "public"."change_orders" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_log" AFTER INSERT OR DELETE OR UPDATE ON "public"."change_requests" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_log" AFTER INSERT OR DELETE OR UPDATE ON "public"."deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_log" AFTER INSERT OR DELETE OR UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_log" AFTER INSERT OR DELETE OR UPDATE ON "public"."inspections" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_log" AFTER INSERT OR DELETE OR UPDATE ON "public"."punchlist_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_log" AFTER INSERT OR DELETE OR UPDATE ON "public"."rfis" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_log" AFTER INSERT OR DELETE OR UPDATE ON "public"."safety_incidents" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_log" AFTER INSERT OR DELETE OR UPDATE ON "public"."scope_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_log" AFTER INSERT OR DELETE OR UPDATE ON "public"."sov_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_log" AFTER INSERT OR DELETE OR UPDATE ON "public"."work_packages" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "trg_backcharges_updated_at" BEFORE UPDATE ON "public"."backcharges" FOR EACH ROW EXECUTE FUNCTION "public"."backcharge_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_bc_tm_updated_at" BEFORE UPDATE ON "public"."backcharge_tm_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."backcharge_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_change_orders_updated_at" BEFORE UPDATE ON "public"."change_orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_change_requests_updated_at" BEFORE UPDATE ON "public"."change_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_comments_updated_at" BEFORE UPDATE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_contacts_updated_at" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cost_codes_updated_at" BEFORE UPDATE ON "public"."cost_codes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_daily_logs_updated_at" BEFORE UPDATE ON "public"."daily_logs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_deliveries_updated_at" BEFORE UPDATE ON "public"."deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_delivery_items_updated_at" BEFORE UPDATE ON "public"."delivery_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_document_folders_updated_at" BEFORE UPDATE ON "public"."document_folders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_document_import_queue_updated_at" BEFORE UPDATE ON "public"."document_import_queue" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_documents_updated_at" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_drawing_analyses_updated_at" BEFORE UPDATE ON "public"."drawing_analyses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_drawing_findings_updated_at" BEFORE UPDATE ON "public"."drawing_findings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_drawing_impacts_updated_at" BEFORE UPDATE ON "public"."drawing_impacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_drawing_links_activity" AFTER INSERT OR UPDATE ON "public"."drawing_links" FOR EACH ROW EXECUTE FUNCTION "public"."log_drawing_link_activity"();



CREATE OR REPLACE TRIGGER "trg_drawing_links_validate_target" BEFORE INSERT OR UPDATE OF "linked_record_type", "linked_record_id", "project_id" ON "public"."drawing_links" FOR EACH ROW EXECUTE FUNCTION "public"."validate_drawing_link_target"();



CREATE OR REPLACE TRIGGER "trg_drawing_markups_updated_at" BEFORE UPDATE ON "public"."drawing_markups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_drawing_reviews_updated_at" BEFORE UPDATE ON "public"."drawing_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_drawing_revision_comparisons_updated_at" BEFORE UPDATE ON "public"."drawing_revision_comparisons" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_drawing_revision_deltas_updated_at" BEFORE UPDATE ON "public"."drawing_revision_deltas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_drawing_revisions_updated_at" BEFORE UPDATE ON "public"."drawing_revisions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_drawing_sets_updated_at" BEFORE UPDATE ON "public"."drawing_sets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_drawing_transmittals_updated_at" BEFORE UPDATE ON "public"."drawing_transmittals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_drawing_watch_notify_impact" AFTER INSERT ON "public"."drawing_impacts" FOR EACH ROW EXECUTE FUNCTION "public"."drawing_watch_notify_impact"();



CREATE OR REPLACE TRIGGER "trg_drawing_watch_notify_revision" AFTER INSERT OR UPDATE OF "release_status" ON "public"."drawing_revisions" FOR EACH ROW EXECUTE FUNCTION "public"."drawing_watch_notify_revision"();



CREATE OR REPLACE TRIGGER "trg_drawing_zones_activity" AFTER INSERT OR UPDATE ON "public"."drawing_zones" FOR EACH ROW EXECUTE FUNCTION "public"."log_drawing_zone_activity"();



CREATE OR REPLACE TRIGGER "trg_drawing_zones_updated_at" BEFORE UPDATE ON "public"."drawing_zones" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_drawing_zones_validate_polygon" BEFORE INSERT OR UPDATE OF "polygon_points", "shape_type" ON "public"."drawing_zones" FOR EACH ROW EXECUTE FUNCTION "public"."validate_drawing_zone_polygon"();



CREATE OR REPLACE TRIGGER "trg_drawings_activity" AFTER INSERT OR UPDATE ON "public"."drawings" FOR EACH ROW EXECUTE FUNCTION "public"."log_drawing_activity"();



CREATE OR REPLACE TRIGGER "trg_drawings_sync_set_counts" AFTER INSERT OR DELETE OR UPDATE OF "drawing_set_id", "ai_extraction_status", "upload_status", "is_deleted" ON "public"."drawings" FOR EACH ROW EXECUTE FUNCTION "public"."sync_drawing_set_counts"();



CREATE OR REPLACE TRIGGER "trg_drawings_updated_at" BEFORE UPDATE ON "public"."drawings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_email_intake_queue_updated_at" BEFORE UPDATE ON "public"."email_intake_queue" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_email_integration_settings_updated_at" BEFORE UPDATE ON "public"."email_integration_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_enforce_fab_release_gate" BEFORE INSERT ON "public"."fab_release_log" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_fab_release_gate"();



CREATE OR REPLACE TRIGGER "trg_enforce_org_invite_limit" BEFORE INSERT ON "public"."organization_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_org_invite_limit"();



CREATE OR REPLACE TRIGGER "trg_enforce_org_member_guard" BEFORE INSERT OR UPDATE ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_org_member_guard"();



CREATE OR REPLACE TRIGGER "trg_enforce_submittal_fab_release_gate" BEFORE UPDATE ON "public"."submittals" FOR EACH ROW WHEN (("new"."status" IS DISTINCT FROM "old"."status")) EXECUTE FUNCTION "public"."enforce_submittal_fab_release_gate"();



CREATE OR REPLACE TRIGGER "trg_expenses_updated_at" BEFORE UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_external_file_refs_updated_at" BEFORE UPDATE ON "public"."external_file_refs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_external_linked_folders_updated_at" BEFORE UPDATE ON "public"."external_linked_folders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_inspections_updated_at" BEFORE UPDATE ON "public"."inspections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_linked_folders_updated_at" BEFORE UPDATE ON "public"."linked_folders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_look_ahead_updated_at" BEFORE UPDATE ON "public"."look_ahead" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_meetings_updated_at" BEFORE UPDATE ON "public"."meetings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_number_sequences_updated_at" BEFORE UPDATE ON "public"."number_sequences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_org_protect_billing" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."org_protect_billing_columns"();



CREATE OR REPLACE TRIGGER "trg_organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."organizations_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pay_apps_updated_at" BEFORE UPDATE ON "public"."pay_applications" FOR EACH ROW EXECUTE FUNCTION "public"."payapp_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_payapp_line_draft_only" BEFORE INSERT OR UPDATE ON "public"."pay_application_lines" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_payapp_line_draft_only"();



CREATE OR REPLACE TRIGGER "trg_photos_updated_at" BEFORE UPDATE ON "public"."photos" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_piece_production_updated_at" BEFORE UPDATE ON "public"."piece_production" FOR EACH ROW EXECUTE FUNCTION "public"."piece_production_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pma_assumptions_updated_at" BEFORE UPDATE ON "public"."pma_assumptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pma_audit_logs_updated_at" BEFORE UPDATE ON "public"."pma_audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pma_decisions_updated_at" BEFORE UPDATE ON "public"."pma_decisions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_production_notes_updated_at" BEFORE UPDATE ON "public"."production_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_closeout_updated_at" BEFORE UPDATE ON "public"."project_closeout" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_on_hold_stamp" BEFORE UPDATE OF "on_hold" ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."project_on_hold_stamp"();



CREATE OR REPLACE TRIGGER "trg_projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_punchlist_items_updated_at" BEFORE UPDATE ON "public"."punchlist_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_quality_control_records_updated_at" BEFORE UPDATE ON "public"."quality_control_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_resources_updated_at" BEFORE UPDATE ON "public"."resources" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_rfi_bic_handoff" AFTER UPDATE OF "ball_in_court" ON "public"."rfis" FOR EACH ROW WHEN (("old"."ball_in_court" IS DISTINCT FROM "new"."ball_in_court")) EXECUTE FUNCTION "public"."notify_rfi_bic_handoff"();



CREATE OR REPLACE TRIGGER "trg_rfis_updated_at" BEFORE UPDATE ON "public"."rfis" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_safety_incidents_updated_at" BEFORE UPDATE ON "public"."safety_incidents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_schedule_tasks_updated_at" BEFORE UPDATE ON "public"."schedule_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_scope_items_updated_at" BEFORE UPDATE ON "public"."scope_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_seed_project_cost_codes" AFTER INSERT ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."seed_project_cost_codes"();



CREATE OR REPLACE TRIGGER "trg_seed_setup_items" AFTER INSERT ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."seed_default_setup_items"();



CREATE OR REPLACE TRIGGER "trg_sheet_responses_updated_at" BEFORE UPDATE ON "public"."submittal_sheet_responses" FOR EACH ROW EXECUTE FUNCTION "public"."tg_submittal_rounds_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sov_items_updated_at" BEFORE UPDATE ON "public"."sov_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_submittal_rounds_updated_at" BEFORE UPDATE ON "public"."submittal_rounds" FOR EACH ROW EXECUTE FUNCTION "public"."tg_submittal_rounds_updated_at"();



CREATE OR REPLACE TRIGGER "trg_submittals_updated_at" BEFORE UPDATE ON "public"."submittals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_task_dependencies_updated_at" BEFORE UPDATE ON "public"."task_dependencies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."action_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."alerts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."change_orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."change_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."cost_codes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."daily_logs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."drawing_sets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."drawings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."inspections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."look_ahead" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."meetings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."number_sequences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."photos" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."pma_assumptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."pma_decisions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."production_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."project_closeout" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."punchlist_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."quality_control_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."resources" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."rfis" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."safety_incidents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."schedule_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."scope_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."sov_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."uploaded_files" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."vendors" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."warranties" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at" BEFORE UPDATE ON "public"."work_packages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_uploaded_files_updated_at" BEFORE UPDATE ON "public"."uploaded_files" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_projects_updated_at" BEFORE UPDATE ON "public"."user_projects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_vendors_set_org" BEFORE INSERT ON "public"."vendors" FOR EACH ROW EXECUTE FUNCTION "public"."vendors_set_org"();



CREATE OR REPLACE TRIGGER "trg_vendors_updated_at" BEFORE UPDATE ON "public"."vendors" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_warranties_updated_at" BEFORE UPDATE ON "public"."warranties" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_work_packages_updated_at" BEFORE UPDATE ON "public"."work_packages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "user_projects_member_activity_log" AFTER INSERT OR DELETE OR UPDATE OF "role" ON "public"."user_projects" FOR EACH ROW EXECUTE FUNCTION "public"."log_user_project_member_activity"();



CREATE OR REPLACE TRIGGER "user_projects_membership_identity_check" BEFORE UPDATE OF "user_id", "project_id" ON "public"."user_projects" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_user_projects_membership_identity"();



CREATE OR REPLACE TRIGGER "enforce_bucket_name_length_trigger" BEFORE INSERT OR UPDATE OF "name" ON "storage"."buckets" FOR EACH ROW EXECUTE FUNCTION "storage"."enforce_bucket_name_length"();



CREATE OR REPLACE TRIGGER "protect_buckets_delete" BEFORE DELETE ON "storage"."buckets" FOR EACH STATEMENT EXECUTE FUNCTION "storage"."protect_delete"();



CREATE OR REPLACE TRIGGER "protect_objects_delete" BEFORE DELETE ON "storage"."objects" FOR EACH STATEMENT EXECUTE FUNCTION "storage"."protect_delete"();



CREATE OR REPLACE TRIGGER "update_objects_updated_at" BEFORE UPDATE ON "storage"."objects" FOR EACH ROW EXECUTE FUNCTION "storage"."update_updated_at_column"();



ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_work_package_id_fkey" FOREIGN KEY ("work_package_id") REFERENCES "public"."work_packages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_audit_log"
    ADD CONSTRAINT "ai_audit_log_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_audit_log"
    ADD CONSTRAINT "ai_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."backcharge_events"
    ADD CONSTRAINT "backcharge_events_actor_fkey" FOREIGN KEY ("actor") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."backcharge_events"
    ADD CONSTRAINT "backcharge_events_backcharge_id_fkey" FOREIGN KEY ("backcharge_id") REFERENCES "public"."backcharges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."backcharge_events"
    ADD CONSTRAINT "backcharge_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."backcharge_tm_tickets"
    ADD CONSTRAINT "backcharge_tm_tickets_backcharge_id_fkey" FOREIGN KEY ("backcharge_id") REFERENCES "public"."backcharges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."backcharge_tm_tickets"
    ADD CONSTRAINT "backcharge_tm_tickets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."backcharge_tm_tickets"
    ADD CONSTRAINT "backcharge_tm_tickets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."backcharges"
    ADD CONSTRAINT "backcharges_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "public"."cost_codes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."backcharges"
    ADD CONSTRAINT "backcharges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."backcharges"
    ADD CONSTRAINT "backcharges_linked_co_id_fkey" FOREIGN KEY ("linked_co_id") REFERENCES "public"."change_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."backcharges"
    ADD CONSTRAINT "backcharges_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."backcharges"
    ADD CONSTRAINT "backcharges_source_rfi_id_fkey" FOREIGN KEY ("source_rfi_id") REFERENCES "public"."rfis"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."billing_events"
    ADD CONSTRAINT "billing_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."budget_hour_items"
    ADD CONSTRAINT "budget_hour_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."change_orders"
    ADD CONSTRAINT "change_orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."change_requests"
    ADD CONSTRAINT "change_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_status_changed_by_fkey" FOREIGN KEY ("status_changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cost_codes"
    ADD CONSTRAINT "cost_codes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_logs"
    ADD CONSTRAINT "daily_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_folders"
    ADD CONSTRAINT "document_folders_parent_folder_id_fkey" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."document_folders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_folders"
    ADD CONSTRAINT "document_folders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_import_queue"
    ADD CONSTRAINT "document_import_queue_created_document_id_fkey" FOREIGN KEY ("created_document_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_import_queue"
    ADD CONSTRAINT "document_import_queue_linked_folder_id_fkey" FOREIGN KEY ("linked_folder_id") REFERENCES "public"."linked_folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_import_queue"
    ADD CONSTRAINT "document_import_queue_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_import_queue"
    ADD CONSTRAINT "document_import_queue_target_folder_id_fkey" FOREIGN KEY ("target_folder_id") REFERENCES "public"."document_folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."document_folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_linked_folder_id_fkey" FOREIGN KEY ("linked_folder_id") REFERENCES "public"."linked_folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_linked_wp_id_fkey" FOREIGN KEY ("linked_wp_id") REFERENCES "public"."work_packages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_activity"
    ADD CONSTRAINT "drawing_activity_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_analyses"
    ADD CONSTRAINT "drawing_analyses_imported_set_id_fkey" FOREIGN KEY ("imported_set_id") REFERENCES "public"."drawing_sets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_analyses"
    ADD CONSTRAINT "drawing_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_findings"
    ADD CONSTRAINT "drawing_findings_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "public"."drawing_analyses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_findings"
    ADD CONSTRAINT "drawing_findings_linked_rfi_id_fkey" FOREIGN KEY ("linked_rfi_id") REFERENCES "public"."rfis"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_impacts"
    ADD CONSTRAINT "drawing_impacts_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_impacts"
    ADD CONSTRAINT "drawing_impacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_impacts"
    ADD CONSTRAINT "drawing_impacts_drawing_revision_id_fkey" FOREIGN KEY ("drawing_revision_id") REFERENCES "public"."drawing_revisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_impacts"
    ADD CONSTRAINT "drawing_impacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_links"
    ADD CONSTRAINT "drawing_links_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_links"
    ADD CONSTRAINT "drawing_links_drawing_revision_id_fkey" FOREIGN KEY ("drawing_revision_id") REFERENCES "public"."drawing_revisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_links"
    ADD CONSTRAINT "drawing_links_drawing_zone_id_fkey" FOREIGN KEY ("drawing_zone_id") REFERENCES "public"."drawing_zones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_links"
    ADD CONSTRAINT "drawing_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_markups"
    ADD CONSTRAINT "drawing_markups_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_markups"
    ADD CONSTRAINT "drawing_markups_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_markups"
    ADD CONSTRAINT "drawing_markups_drawing_revision_id_fkey" FOREIGN KEY ("drawing_revision_id") REFERENCES "public"."drawing_revisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_markups"
    ADD CONSTRAINT "drawing_markups_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_reviews"
    ADD CONSTRAINT "drawing_reviews_drawing_revision_id_fkey" FOREIGN KEY ("drawing_revision_id") REFERENCES "public"."drawing_revisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_reviews"
    ADD CONSTRAINT "drawing_reviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_reviews"
    ADD CONSTRAINT "drawing_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_revision_comparisons"
    ADD CONSTRAINT "drawing_revision_comparisons_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_revision_comparisons"
    ADD CONSTRAINT "drawing_revision_comparisons_from_analysis_id_fkey" FOREIGN KEY ("from_analysis_id") REFERENCES "public"."drawing_analyses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_revision_comparisons"
    ADD CONSTRAINT "drawing_revision_comparisons_from_revision_id_fkey" FOREIGN KEY ("from_revision_id") REFERENCES "public"."drawing_revisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_revision_comparisons"
    ADD CONSTRAINT "drawing_revision_comparisons_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_revision_comparisons"
    ADD CONSTRAINT "drawing_revision_comparisons_to_analysis_id_fkey" FOREIGN KEY ("to_analysis_id") REFERENCES "public"."drawing_analyses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_revision_comparisons"
    ADD CONSTRAINT "drawing_revision_comparisons_to_revision_id_fkey" FOREIGN KEY ("to_revision_id") REFERENCES "public"."drawing_revisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_revision_deltas"
    ADD CONSTRAINT "drawing_revision_deltas_comparison_id_fkey" FOREIGN KEY ("comparison_id") REFERENCES "public"."drawing_revision_comparisons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_revision_deltas"
    ADD CONSTRAINT "drawing_revision_deltas_linked_rfi_id_fkey" FOREIGN KEY ("linked_rfi_id") REFERENCES "public"."rfis"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_revision_summaries"
    ADD CONSTRAINT "drawing_revision_summaries_drawing_set_id_fkey" FOREIGN KEY ("drawing_set_id") REFERENCES "public"."drawing_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_revision_summaries"
    ADD CONSTRAINT "drawing_revision_summaries_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."drawing_revision_summaries"
    ADD CONSTRAINT "drawing_revision_summaries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_revisions"
    ADD CONSTRAINT "drawing_revisions_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_revisions"
    ADD CONSTRAINT "drawing_revisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_revisions"
    ADD CONSTRAINT "drawing_revisions_supersedes_revision_id_fkey" FOREIGN KEY ("supersedes_revision_id") REFERENCES "public"."drawing_revisions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_sets"
    ADD CONSTRAINT "drawing_sets_current_submittal_id_fkey" FOREIGN KEY ("current_submittal_id") REFERENCES "public"."submittals"("id");



ALTER TABLE ONLY "public"."drawing_sets"
    ADD CONSTRAINT "drawing_sets_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."drawing_sets"
    ADD CONSTRAINT "drawing_sets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_sheets"
    ADD CONSTRAINT "drawing_sheets_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "public"."drawing_analyses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_signoffs"
    ADD CONSTRAINT "drawing_signoffs_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_signoffs"
    ADD CONSTRAINT "drawing_signoffs_drawing_revision_id_fkey" FOREIGN KEY ("drawing_revision_id") REFERENCES "public"."drawing_revisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_signoffs"
    ADD CONSTRAINT "drawing_signoffs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_signoffs"
    ADD CONSTRAINT "drawing_signoffs_stamped_by_id_fkey" FOREIGN KEY ("stamped_by_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."drawing_signoffs"
    ADD CONSTRAINT "drawing_signoffs_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."drawing_transmittal_items"
    ADD CONSTRAINT "drawing_transmittal_items_drawing_revision_id_fkey" FOREIGN KEY ("drawing_revision_id") REFERENCES "public"."drawing_revisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_transmittal_items"
    ADD CONSTRAINT "drawing_transmittal_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_transmittal_items"
    ADD CONSTRAINT "drawing_transmittal_items_transmittal_id_fkey" FOREIGN KEY ("transmittal_id") REFERENCES "public"."drawing_transmittals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_transmittals"
    ADD CONSTRAINT "drawing_transmittals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_transmittals"
    ADD CONSTRAINT "drawing_transmittals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_watchers"
    ADD CONSTRAINT "drawing_watchers_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_watchers"
    ADD CONSTRAINT "drawing_watchers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_watchers"
    ADD CONSTRAINT "drawing_watchers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_zone_activity"
    ADD CONSTRAINT "drawing_zone_activity_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_zone_activity"
    ADD CONSTRAINT "drawing_zone_activity_drawing_zone_id_fkey" FOREIGN KEY ("drawing_zone_id") REFERENCES "public"."drawing_zones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_zone_activity"
    ADD CONSTRAINT "drawing_zone_activity_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_zone_dependencies"
    ADD CONSTRAINT "drawing_zone_dependencies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_zone_dependencies"
    ADD CONSTRAINT "drawing_zone_dependencies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_zone_dependencies"
    ADD CONSTRAINT "drawing_zone_dependencies_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_zone_dependencies"
    ADD CONSTRAINT "drawing_zone_dependencies_source_zone_id_fkey" FOREIGN KEY ("source_zone_id") REFERENCES "public"."drawing_zones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_zone_dependencies"
    ADD CONSTRAINT "drawing_zone_dependencies_target_zone_id_fkey" FOREIGN KEY ("target_zone_id") REFERENCES "public"."drawing_zones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_zone_proposals"
    ADD CONSTRAINT "drawing_zone_proposals_accepted_zone_id_fkey" FOREIGN KEY ("accepted_zone_id") REFERENCES "public"."drawing_zones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_zone_proposals"
    ADD CONSTRAINT "drawing_zone_proposals_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "public"."drawing_analyses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_zone_proposals"
    ADD CONSTRAINT "drawing_zone_proposals_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_zone_proposals"
    ADD CONSTRAINT "drawing_zone_proposals_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_zone_proposals"
    ADD CONSTRAINT "drawing_zone_proposals_drawing_revision_id_fkey" FOREIGN KEY ("drawing_revision_id") REFERENCES "public"."drawing_revisions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_zone_proposals"
    ADD CONSTRAINT "drawing_zone_proposals_merged_into_proposal_id_fkey" FOREIGN KEY ("merged_into_proposal_id") REFERENCES "public"."drawing_zone_proposals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_zone_proposals"
    ADD CONSTRAINT "drawing_zone_proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_zones"
    ADD CONSTRAINT "drawing_zones_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_zones"
    ADD CONSTRAINT "drawing_zones_drawing_revision_id_fkey" FOREIGN KEY ("drawing_revision_id") REFERENCES "public"."drawing_revisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawing_zones"
    ADD CONSTRAINT "drawing_zones_parent_zone_id_fkey" FOREIGN KEY ("parent_zone_id") REFERENCES "public"."drawing_zones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawing_zones"
    ADD CONSTRAINT "drawing_zones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drawings"
    ADD CONSTRAINT "drawings_drawing_set_id_fkey" FOREIGN KEY ("drawing_set_id") REFERENCES "public"."drawing_sets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drawings"
    ADD CONSTRAINT "drawings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_accounts"
    ADD CONSTRAINT "email_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."email_accounts"
    ADD CONSTRAINT "email_accounts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_attachments"
    ADD CONSTRAINT "email_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_attachments"
    ADD CONSTRAINT "email_attachments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_intake_queue"
    ADD CONSTRAINT "email_intake_queue_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_intake_queue"
    ADD CONSTRAINT "email_intake_queue_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."email_integration_settings"
    ADD CONSTRAINT "email_integration_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."external_file_refs"
    ADD CONSTRAINT "external_file_refs_drawing_set_id_fkey" FOREIGN KEY ("drawing_set_id") REFERENCES "public"."drawing_sets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."external_file_refs"
    ADD CONSTRAINT "external_file_refs_linked_document_id_fkey" FOREIGN KEY ("linked_document_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."external_file_refs"
    ADD CONSTRAINT "external_file_refs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."external_linked_folders"
    ADD CONSTRAINT "external_linked_folders_drawing_set_id_fkey" FOREIGN KEY ("drawing_set_id") REFERENCES "public"."drawing_sets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."external_linked_folders"
    ADD CONSTRAINT "external_linked_folders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fab_release_log"
    ADD CONSTRAINT "fab_release_log_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fab_release_log"
    ADD CONSTRAINT "fab_release_log_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."fab_release_overrides"
    ADD CONSTRAINT "fab_release_overrides_overridden_by_fkey" FOREIGN KEY ("overridden_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."fab_release_overrides"
    ADD CONSTRAINT "fab_release_overrides_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fab_releases"
    ADD CONSTRAINT "fab_releases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."linked_folders"
    ADD CONSTRAINT "linked_folders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."look_ahead"
    ADD CONSTRAINT "look_ahead_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_activity"
    ADD CONSTRAINT "member_activity_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mitigation_actions"
    ADD CONSTRAINT "mitigation_actions_mitigation_id_fkey" FOREIGN KEY ("mitigation_id") REFERENCES "public"."mitigation_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mitigation_actions"
    ADD CONSTRAINT "mitigation_actions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mitigation_logs"
    ADD CONSTRAINT "mitigation_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."model_element_links"
    ADD CONSTRAINT "model_element_links_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."model_registry"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."model_element_links"
    ADD CONSTRAINT "model_element_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."model_elements"
    ADD CONSTRAINT "model_elements_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."model_elements"
    ADD CONSTRAINT "model_elements_drawing_set_id_fkey" FOREIGN KEY ("drawing_set_id") REFERENCES "public"."drawing_sets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."model_elements"
    ADD CONSTRAINT "model_elements_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."model_registry"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."model_elements"
    ADD CONSTRAINT "model_elements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."model_elements"
    ADD CONSTRAINT "model_elements_work_package_id_fkey" FOREIGN KEY ("work_package_id") REFERENCES "public"."work_packages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."model_registry"
    ADD CONSTRAINT "model_registry_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");



ALTER TABLE ONLY "public"."model_registry"
    ADD CONSTRAINT "model_registry_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."model_registry"
    ADD CONSTRAINT "model_registry_superseded_by_fkey" FOREIGN KEY ("superseded_by") REFERENCES "public"."model_registry"("id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pay_application_lines"
    ADD CONSTRAINT "pay_application_lines_pay_application_id_fkey" FOREIGN KEY ("pay_application_id") REFERENCES "public"."pay_applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pay_application_lines"
    ADD CONSTRAINT "pay_application_lines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pay_application_lines"
    ADD CONSTRAINT "pay_application_lines_sov_item_id_fkey" FOREIGN KEY ("sov_item_id") REFERENCES "public"."sov_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pay_applications"
    ADD CONSTRAINT "pay_applications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pay_applications"
    ADD CONSTRAINT "pay_applications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "public"."daily_logs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_punchlist_item_id_fkey" FOREIGN KEY ("punchlist_item_id") REFERENCES "public"."punchlist_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."piece_production"
    ADD CONSTRAINT "piece_production_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pma_assumptions"
    ADD CONSTRAINT "pma_assumptions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pma_audit_logs"
    ADD CONSTRAINT "pma_audit_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pma_decisions"
    ADD CONSTRAINT "pma_decisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_notes"
    ADD CONSTRAINT "production_notes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_closeout"
    ADD CONSTRAINT "project_closeout_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_handoff_items"
    ADD CONSTRAINT "project_handoff_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_detailer_contact_id_fkey" FOREIGN KEY ("detailer_contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_on_hold_by_fkey" FOREIGN KEY ("on_hold_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."punchlist_items"
    ADD CONSTRAINT "punchlist_items_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."punchlist_items"
    ADD CONSTRAINT "punchlist_items_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."punchlist_items"
    ADD CONSTRAINT "punchlist_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quality_control_records"
    ADD CONSTRAINT "quality_control_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_parent_resource_id_fkey" FOREIGN KEY ("parent_resource_id") REFERENCES "public"."resources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfis"
    ADD CONSTRAINT "rfis_drawing_set_id_fkey" FOREIGN KEY ("drawing_set_id") REFERENCES "public"."drawing_sets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rfis"
    ADD CONSTRAINT "rfis_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfis"
    ADD CONSTRAINT "rfis_work_package_id_fkey" FOREIGN KEY ("work_package_id") REFERENCES "public"."work_packages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."risks"
    ADD CONSTRAINT "risks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."safety_incidents"
    ADD CONSTRAINT "safety_incidents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_tasks"
    ADD CONSTRAINT "schedule_tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "public"."schedule_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."schedule_tasks"
    ADD CONSTRAINT "schedule_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scope_items"
    ADD CONSTRAINT "scope_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sov_items"
    ADD CONSTRAINT "sov_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submittal_activity"
    ADD CONSTRAINT "submittal_activity_submittal_id_fkey" FOREIGN KEY ("submittal_id") REFERENCES "public"."submittals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submittal_rounds"
    ADD CONSTRAINT "submittal_rounds_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submittal_rounds"
    ADD CONSTRAINT "submittal_rounds_submittal_id_fkey" FOREIGN KEY ("submittal_id") REFERENCES "public"."submittals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submittal_sheet_responses"
    ADD CONSTRAINT "submittal_sheet_responses_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."submittal_sheet_responses"
    ADD CONSTRAINT "submittal_sheet_responses_drawing_set_id_fkey" FOREIGN KEY ("drawing_set_id") REFERENCES "public"."drawing_sets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."submittal_sheet_responses"
    ADD CONSTRAINT "submittal_sheet_responses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submittal_sheet_responses"
    ADD CONSTRAINT "submittal_sheet_responses_submittal_round_id_fkey" FOREIGN KEY ("submittal_round_id") REFERENCES "public"."submittal_rounds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submittals"
    ADD CONSTRAINT "submittals_current_round_id_fkey" FOREIGN KEY ("current_round_id") REFERENCES "public"."submittal_rounds"("id");



ALTER TABLE ONLY "public"."submittals"
    ADD CONSTRAINT "submittals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dependencies_predecessor_id_fkey" FOREIGN KEY ("predecessor_id") REFERENCES "public"."schedule_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dependencies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dependencies_successor_id_fkey" FOREIGN KEY ("successor_id") REFERENCES "public"."schedule_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."uploaded_files"
    ADD CONSTRAINT "uploaded_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_projects"
    ADD CONSTRAINT "user_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_projects"
    ADD CONSTRAINT "user_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."warranties"
    ADD CONSTRAINT "warranties_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_packages"
    ADD CONSTRAINT "work_packages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "storage"."objects"
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads"
    ADD CONSTRAINT "s3_multipart_uploads_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads_parts"
    ADD CONSTRAINT "s3_multipart_uploads_parts_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads_parts"
    ADD CONSTRAINT "s3_multipart_uploads_parts_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "storage"."s3_multipart_uploads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "storage"."vector_indexes"
    ADD CONSTRAINT "vector_indexes_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets_vectors"("id");



CREATE POLICY "Users can delete email intake for their projects" ON "public"."email_intake_queue" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "Users can delete email settings for their projects" ON "public"."email_integration_settings" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "Users can insert email intake for their projects" ON "public"."email_intake_queue" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "Users can insert email settings for their projects" ON "public"."email_integration_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "Users can manage email accounts for their projects" ON "public"."email_accounts" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "email_accounts"."project_id") AND (NOT "p"."is_deleted")))));



CREATE POLICY "Users can update email intake for their projects" ON "public"."email_intake_queue" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "Users can update email settings for their projects" ON "public"."email_integration_settings" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "Users can view and manage email attachments for their projects" ON "public"."email_attachments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "email_attachments"."project_id") AND (NOT "p"."is_deleted")))));



CREATE POLICY "Users can view and manage email messages for their projects" ON "public"."email_messages" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "email_messages"."project_id") AND (NOT "p"."is_deleted")))));



CREATE POLICY "Users can view email intake for their projects" ON "public"."email_intake_queue" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "Users can view email settings for their projects" ON "public"."email_integration_settings" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



ALTER TABLE "public"."action_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins_delete_memberships" ON "public"."user_projects" FOR DELETE TO "authenticated" USING (("public"."user_is_system_admin"() OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text")));



CREATE POLICY "admins_insert_memberships" ON "public"."user_projects" FOR INSERT TO "authenticated" WITH CHECK ((("public"."user_is_system_admin"() OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text")) AND ("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'pm'::"text", 'field'::"text", 'viewer'::"text"]))));



CREATE POLICY "admins_update_memberships" ON "public"."user_projects" FOR UPDATE TO "authenticated" USING (("public"."user_is_system_admin"() OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text"))) WITH CHECK ((("public"."user_is_system_admin"() OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text")) AND ("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'pm'::"text", 'field'::"text", 'viewer'::"text"]))));



ALTER TABLE "public"."ai_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_audit_log_insert_own" ON "public"."ai_audit_log" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."user_has_project_access"("project_id")));



CREATE POLICY "ai_audit_log_read_own_or_project" ON "public"."ai_audit_log" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."user_has_project_access"("project_id")));



ALTER TABLE "public"."alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backcharge_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backcharge_tm_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backcharges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "backcharges_delete" ON "public"."backcharges" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'admin'::"text"));



CREATE POLICY "backcharges_insert" ON "public"."backcharges" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "backcharges_select" ON "public"."backcharges" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "backcharges_update" ON "public"."backcharges" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "bc_events_insert" ON "public"."backcharge_events" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_has_project_role_at_least"("project_id", 'pm'::"text") AND ("actor" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "bc_events_select" ON "public"."backcharge_events" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "bc_tm_delete" ON "public"."backcharge_tm_tickets" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'admin'::"text"));



CREATE POLICY "bc_tm_insert" ON "public"."backcharge_tm_tickets" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "bc_tm_select" ON "public"."backcharge_tm_tickets" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "bc_tm_update" ON "public"."backcharge_tm_tickets" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



ALTER TABLE "public"."billing_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."budget_hour_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budget_hour_items_delete" ON "public"."budget_hour_items" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "budget_hour_items_insert" ON "public"."budget_hour_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "budget_hour_items_select" ON "public"."budget_hour_items" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "budget_hour_items_update" ON "public"."budget_hour_items" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



ALTER TABLE "public"."change_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."change_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cost_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."default_cost_codes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "default_cost_codes_admin_delete" ON "public"."default_cost_codes" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("user_profiles"."role" = 'admin'::"text")))));



CREATE POLICY "default_cost_codes_admin_insert" ON "public"."default_cost_codes" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("user_profiles"."role" = 'admin'::"text")))));



CREATE POLICY "default_cost_codes_admin_update" ON "public"."default_cost_codes" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("user_profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("user_profiles"."role" = 'admin'::"text")))));



CREATE POLICY "default_cost_codes_read" ON "public"."default_cost_codes" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "doc_import_queue_project_member" ON "public"."document_import_queue" TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



ALTER TABLE "public"."document_folders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_import_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drawing_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drawing_analyses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drawing_findings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drawing_impacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drawing_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drawing_links_delete" ON "public"."drawing_links" FOR DELETE TO "authenticated" USING (("public"."user_has_project_access"("project_id") AND ((NOT "public"."set_for_drawing_is_locked"("drawing_id")) OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text"))));



CREATE POLICY "drawing_links_insert" ON "public"."drawing_links" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_has_project_access"("project_id") AND ((NOT "public"."set_for_drawing_is_locked"("drawing_id")) OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text"))));



CREATE POLICY "drawing_links_select" ON "public"."drawing_links" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "drawing_links_update" ON "public"."drawing_links" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK (("public"."user_has_project_access"("project_id") AND ((NOT "public"."set_for_drawing_is_locked"("drawing_id")) OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text"))));



ALTER TABLE "public"."drawing_markups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drawing_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drawing_revision_comparisons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drawing_revision_deltas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drawing_revision_summaries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drawing_revision_summaries_delete" ON "public"."drawing_revision_summaries" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "drawing_revision_summaries_insert" ON "public"."drawing_revision_summaries" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "drawing_revision_summaries_select" ON "public"."drawing_revision_summaries" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



ALTER TABLE "public"."drawing_revisions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drawing_revisions_project_access" ON "public"."drawing_revisions" TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



ALTER TABLE "public"."drawing_sets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drawing_sets_delete_admin" ON "public"."drawing_sets" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'admin'::"text"));



CREATE POLICY "drawing_sets_insert" ON "public"."drawing_sets" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "drawing_sets_select" ON "public"."drawing_sets" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "drawing_sets_update" ON "public"."drawing_sets" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



ALTER TABLE "public"."drawing_sheets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drawing_signoffs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drawing_signoffs_delete" ON "public"."drawing_signoffs" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'admin'::"text"));



CREATE POLICY "drawing_signoffs_insert" ON "public"."drawing_signoffs" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "drawing_signoffs_select" ON "public"."drawing_signoffs" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "drawing_signoffs_update" ON "public"."drawing_signoffs" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK (("public"."user_has_project_access"("project_id") AND (("is_voided" = false) OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text") OR ("stamped_by_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."drawing_transmittal_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drawing_transmittals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drawing_watchers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drawing_zone_activity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drawing_zone_activity_project_access" ON "public"."drawing_zone_activity" TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



ALTER TABLE "public"."drawing_zone_dependencies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drawing_zone_dependencies_delete" ON "public"."drawing_zone_dependencies" FOR DELETE TO "authenticated" USING (("public"."user_has_project_access"("project_id") AND ((NOT "public"."set_for_zone_is_locked"("source_zone_id")) OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text"))));



CREATE POLICY "drawing_zone_dependencies_insert" ON "public"."drawing_zone_dependencies" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_has_project_access"("project_id") AND ((NOT "public"."set_for_zone_is_locked"("source_zone_id")) OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text"))));



CREATE POLICY "drawing_zone_dependencies_select" ON "public"."drawing_zone_dependencies" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "drawing_zone_dependencies_update" ON "public"."drawing_zone_dependencies" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK (("public"."user_has_project_access"("project_id") AND ((NOT "public"."set_for_zone_is_locked"("source_zone_id")) OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text"))));



ALTER TABLE "public"."drawing_zone_proposals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drawing_zone_proposals_project_access" ON "public"."drawing_zone_proposals" TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



ALTER TABLE "public"."drawing_zones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drawing_zones_delete" ON "public"."drawing_zones" FOR DELETE TO "authenticated" USING (("public"."user_has_project_access"("project_id") AND ((NOT "public"."set_for_drawing_is_locked"("drawing_id")) OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text"))));



CREATE POLICY "drawing_zones_insert" ON "public"."drawing_zones" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_has_project_access"("project_id") AND ((NOT "public"."set_for_drawing_is_locked"("drawing_id")) OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text"))));



CREATE POLICY "drawing_zones_select" ON "public"."drawing_zones" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "drawing_zones_update" ON "public"."drawing_zones" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK (("public"."user_has_project_access"("project_id") AND ((NOT "public"."set_for_drawing_is_locked"("drawing_id")) OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text"))));



ALTER TABLE "public"."drawings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drawings_delete" ON "public"."drawings" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "drawings_insert" ON "public"."drawings" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "drawings_select" ON "public"."drawings" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "drawings_update" ON "public"."drawings" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK (("public"."user_has_project_role_at_least"("project_id", 'field'::"text") AND ((NOT COALESCE(( SELECT "ds"."is_locked"
   FROM "public"."drawing_sets" "ds"
  WHERE ("ds"."id" = "drawings"."drawing_set_id")), false)) OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text"))));



ALTER TABLE "public"."email_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_intake_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_integration_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_file_refs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_linked_folders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fab_release_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fab_release_log_insert" ON "public"."fab_release_log" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_has_project_role_at_least"("project_id", 'pm'::"text") AND ("released_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "fab_release_log_select" ON "public"."fab_release_log" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



ALTER TABLE "public"."fab_release_overrides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fab_release_overrides_insert" ON "public"."fab_release_overrides" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_has_project_role_at_least"("project_id", 'field'::"text") AND ("overridden_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "fab_release_overrides_select" ON "public"."fab_release_overrides" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



ALTER TABLE "public"."fab_releases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fab_releases_delete" ON "public"."fab_releases" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'admin'::"text"));



CREATE POLICY "fab_releases_insert" ON "public"."fab_releases" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "fab_releases_select" ON "public"."fab_releases" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "fab_releases_update" ON "public"."fab_releases" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



ALTER TABLE "public"."feature_flags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feature_flags_admin_delete" ON "public"."feature_flags" FOR DELETE TO "authenticated" USING ("public"."user_is_system_admin"());



CREATE POLICY "feature_flags_admin_insert" ON "public"."feature_flags" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_is_system_admin"());



CREATE POLICY "feature_flags_admin_update" ON "public"."feature_flags" FOR UPDATE TO "authenticated" USING ("public"."user_is_system_admin"()) WITH CHECK ("public"."user_is_system_admin"());



CREATE POLICY "feature_flags_select" ON "public"."feature_flags" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."inspections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."linked_folders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "linked_folders_project_member" ON "public"."linked_folders" TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



ALTER TABLE "public"."llm_telemetry" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "llm_telemetry_select" ON "public"."llm_telemetry" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("user_profiles"."role" = 'admin'::"text")))));



ALTER TABLE "public"."look_ahead" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meetings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."member_activity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_activity_insert_admins" ON "public"."member_activity" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_is_system_admin"() OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text")));



CREATE POLICY "member_activity_select_project_members" ON "public"."member_activity" FOR SELECT TO "authenticated" USING (("public"."user_is_system_admin"() OR "public"."user_has_project_access"("project_id")));



CREATE POLICY "members_select_memberships" ON "public"."user_projects" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."user_is_system_admin"() OR "public"."user_has_project_role_at_least"("project_id", 'admin'::"text")));



ALTER TABLE "public"."mitigation_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mitigation_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."model_element_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "model_element_links_access" ON "public"."model_element_links" TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



ALTER TABLE "public"."model_elements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."model_registry" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "model_registry_access" ON "public"."model_registry" TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



ALTER TABLE "public"."number_sequences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_invites_delete" ON "public"."organization_invitations" FOR DELETE USING ("public"."user_org_role_at_least"("org_id", 'admin'::"text"));



CREATE POLICY "org_invites_insert" ON "public"."organization_invitations" FOR INSERT WITH CHECK (("public"."user_org_role_at_least"("org_id", 'admin'::"text") AND ("invited_by" = ( SELECT "auth"."uid"() AS "uid")) AND (("role" <> 'owner'::"text") OR "public"."user_org_role_at_least"("org_id", 'owner'::"text"))));



CREATE POLICY "org_invites_select" ON "public"."organization_invitations" FOR SELECT USING ("public"."user_is_org_member"("org_id"));



CREATE POLICY "org_invites_update" ON "public"."organization_invitations" FOR UPDATE USING ("public"."user_org_role_at_least"("org_id", 'admin'::"text")) WITH CHECK ("public"."user_org_role_at_least"("org_id", 'admin'::"text"));



CREATE POLICY "org_members_delete" ON "public"."organization_members" FOR DELETE USING (("public"."user_org_role_at_least"("org_id", 'admin'::"text") OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "org_members_insert" ON "public"."organization_members" FOR INSERT WITH CHECK (("public"."user_org_role_at_least"("org_id", 'admin'::"text") AND (("role" <> 'owner'::"text") OR "public"."user_org_role_at_least"("org_id", 'owner'::"text"))));



CREATE POLICY "org_members_select" ON "public"."organization_members" FOR SELECT USING ("public"."user_is_org_member"("org_id"));



CREATE POLICY "org_members_update" ON "public"."organization_members" FOR UPDATE USING (("public"."user_org_role_at_least"("org_id", 'admin'::"text") AND (("role" <> 'owner'::"text") OR "public"."user_org_role_at_least"("org_id", 'owner'::"text")))) WITH CHECK (("public"."user_org_role_at_least"("org_id", 'admin'::"text") AND (("role" <> 'owner'::"text") OR "public"."user_org_role_at_least"("org_id", 'owner'::"text"))));



ALTER TABLE "public"."organization_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_delete" ON "public"."organizations" FOR DELETE USING ("public"."user_org_role_at_least"("id", 'owner'::"text"));



CREATE POLICY "organizations_insert" ON "public"."organizations" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "organizations_select" ON "public"."organizations" FOR SELECT USING ("public"."user_is_org_member"("id"));



CREATE POLICY "organizations_update" ON "public"."organizations" FOR UPDATE USING ("public"."user_org_role_at_least"("id", 'admin'::"text")) WITH CHECK ("public"."user_org_role_at_least"("id", 'admin'::"text"));



ALTER TABLE "public"."pay_application_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pay_applications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pay_apps_delete" ON "public"."pay_applications" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'admin'::"text"));



CREATE POLICY "pay_apps_insert" ON "public"."pay_applications" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "pay_apps_select" ON "public"."pay_applications" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "pay_apps_update" ON "public"."pay_applications" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "payapp_lines_delete" ON "public"."pay_application_lines" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "payapp_lines_insert" ON "public"."pay_application_lines" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "payapp_lines_select" ON "public"."pay_application_lines" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "payapp_lines_update" ON "public"."pay_application_lines" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



ALTER TABLE "public"."photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."piece_production" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "piece_production_delete" ON "public"."piece_production" FOR DELETE USING ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "piece_production_insert" ON "public"."piece_production" FOR INSERT WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "piece_production_select" ON "public"."piece_production" FOR SELECT USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "piece_production_update" ON "public"."piece_production" FOR UPDATE USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



ALTER TABLE "public"."pma_assumptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pma_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pma_decisions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "postgres_full_access" ON "public"."number_sequences" TO "postgres" USING (true) WITH CHECK (true);



CREATE POLICY "postgres_full_access" ON "public"."user_projects" TO "postgres" USING (true) WITH CHECK (true);



ALTER TABLE "public"."production_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."user_profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_select" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."users_share_org"(( SELECT "auth"."uid"() AS "uid"), "id")));



CREATE POLICY "profiles_update_own" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."project_closeout" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_delete" ON "public"."action_items" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_delete" ON "public"."activities" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."alerts" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."change_orders" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'admin'::"text"));



CREATE POLICY "project_delete" ON "public"."change_requests" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."contacts" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_delete" ON "public"."cost_codes" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'admin'::"text"));



CREATE POLICY "project_delete" ON "public"."daily_logs" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_delete" ON "public"."deliveries" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_delete" ON "public"."documents" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."drawing_activity" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."drawing_impacts" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."drawing_markups" FOR DELETE TO "authenticated" USING (("public"."user_has_project_role_at_least"("project_id", 'field'::"text") AND (("author_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."user_has_project_role_at_least"("project_id", 'pm'::"text"))));



CREATE POLICY "project_delete" ON "public"."drawing_reviews" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."drawing_transmittal_items" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."drawing_transmittals" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."expenses" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_delete" ON "public"."inspections" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_delete" ON "public"."look_ahead" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."meetings" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."mitigation_actions" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."mitigation_logs" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."model_elements" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_delete" ON "public"."number_sequences" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."photos" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_delete" ON "public"."pma_assumptions" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."pma_decisions" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."production_notes" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_delete" ON "public"."project_closeout" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."punchlist_items" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_delete" ON "public"."quality_control_records" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."resources" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."rfis" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_delete" ON "public"."safety_incidents" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_delete" ON "public"."schedule_tasks" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_delete" ON "public"."scope_items" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."sov_items" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'admin'::"text"));



CREATE POLICY "project_delete" ON "public"."submittals" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_delete" ON "public"."uploaded_files" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."warranties" FOR DELETE TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_delete" ON "public"."work_packages" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



ALTER TABLE "public"."project_handoff_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_handoff_items_delete" ON "public"."project_handoff_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE ("p"."id" = "project_handoff_items"."project_id"))));



CREATE POLICY "project_handoff_items_insert" ON "public"."project_handoff_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE ("p"."id" = "project_handoff_items"."project_id"))));



CREATE POLICY "project_handoff_items_select" ON "public"."project_handoff_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE ("p"."id" = "project_handoff_items"."project_id"))));



CREATE POLICY "project_handoff_items_update" ON "public"."project_handoff_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE ("p"."id" = "project_handoff_items"."project_id"))));



CREATE POLICY "project_insert" ON "public"."action_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_insert" ON "public"."activities" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."alerts" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."change_orders" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "project_insert" ON "public"."change_requests" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."contacts" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_insert" ON "public"."cost_codes" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "project_insert" ON "public"."daily_logs" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_insert" ON "public"."deliveries" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_insert" ON "public"."documents" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."drawing_activity" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."drawing_impacts" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."drawing_markups" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_has_project_role_at_least"("project_id", 'field'::"text") AND (("author_id" IS NULL) OR ("author_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "project_insert" ON "public"."drawing_reviews" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."drawing_transmittal_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."drawing_transmittals" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."expenses" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_insert" ON "public"."inspections" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_insert" ON "public"."look_ahead" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."meetings" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."mitigation_actions" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."mitigation_logs" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."model_elements" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_insert" ON "public"."number_sequences" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."photos" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_insert" ON "public"."pma_assumptions" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."pma_audit_logs" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."pma_decisions" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."production_notes" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_insert" ON "public"."project_closeout" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."projects" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_is_org_member"("org_id"));



CREATE POLICY "project_insert" ON "public"."punchlist_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_insert" ON "public"."quality_control_records" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."resources" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."rfis" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_insert" ON "public"."safety_incidents" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_insert" ON "public"."schedule_tasks" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_insert" ON "public"."scope_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."sov_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "project_insert" ON "public"."submittals" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_insert" ON "public"."uploaded_files" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."warranties" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_insert" ON "public"."work_packages" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_member_access" ON "public"."comments" TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_member_access" ON "public"."delivery_items" TO "authenticated" USING (("delivery_id" IN ( SELECT "d"."id"
   FROM "public"."deliveries" "d"
  WHERE "public"."user_has_project_access"("d"."project_id")))) WITH CHECK (("delivery_id" IN ( SELECT "d"."id"
   FROM "public"."deliveries" "d"
  WHERE "public"."user_has_project_access"("d"."project_id"))));



CREATE POLICY "project_member_access" ON "public"."document_folders" TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_member_access" ON "public"."drawing_analyses" TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_member_access" ON "public"."drawing_findings" TO "authenticated" USING (("analysis_id" IN ( SELECT "a"."id"
   FROM "public"."drawing_analyses" "a"
  WHERE "public"."user_has_project_access"("a"."project_id")))) WITH CHECK (("analysis_id" IN ( SELECT "a"."id"
   FROM "public"."drawing_analyses" "a"
  WHERE "public"."user_has_project_access"("a"."project_id"))));



CREATE POLICY "project_member_access" ON "public"."drawing_revision_comparisons" TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_member_access" ON "public"."drawing_revision_deltas" TO "authenticated" USING (("comparison_id" IN ( SELECT "c"."id"
   FROM "public"."drawing_revision_comparisons" "c"
  WHERE "public"."user_has_project_access"("c"."project_id")))) WITH CHECK (("comparison_id" IN ( SELECT "c"."id"
   FROM "public"."drawing_revision_comparisons" "c"
  WHERE "public"."user_has_project_access"("c"."project_id"))));



CREATE POLICY "project_member_access" ON "public"."drawing_sheets" TO "authenticated" USING (("analysis_id" IN ( SELECT "a"."id"
   FROM "public"."drawing_analyses" "a"
  WHERE "public"."user_has_project_access"("a"."project_id")))) WITH CHECK (("analysis_id" IN ( SELECT "a"."id"
   FROM "public"."drawing_analyses" "a"
  WHERE "public"."user_has_project_access"("a"."project_id"))));



CREATE POLICY "project_member_access" ON "public"."external_file_refs" TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_member_access" ON "public"."external_linked_folders" TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_member_access" ON "public"."submittal_activity" TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_member_access" ON "public"."task_dependencies" TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."action_items" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."activities" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."alerts" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."change_orders" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."change_requests" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."contacts" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."cost_codes" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."daily_logs" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."deliveries" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."documents" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."drawing_activity" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."drawing_impacts" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."drawing_markups" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."drawing_reviews" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."drawing_transmittal_items" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."drawing_transmittals" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."expenses" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."inspections" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."look_ahead" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."meetings" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."mitigation_actions" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."mitigation_logs" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."model_elements" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."number_sequences" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."photos" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."pma_assumptions" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."pma_audit_logs" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."pma_decisions" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."production_notes" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."project_closeout" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."projects" FOR SELECT TO "authenticated" USING (("public"."user_has_project_access"("id") OR "public"."user_is_system_admin"()));



CREATE POLICY "project_select" ON "public"."punchlist_items" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."quality_control_records" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."resources" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."rfis" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."safety_incidents" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."schedule_tasks" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."scope_items" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."sov_items" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."submittals" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."uploaded_files" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."warranties" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_select" ON "public"."work_packages" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."action_items" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."activities" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."alerts" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."change_orders" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "project_update" ON "public"."change_requests" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."contacts" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."cost_codes" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "project_update" ON "public"."daily_logs" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."deliveries" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."documents" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."drawing_activity" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."drawing_impacts" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."drawing_markups" FOR UPDATE TO "authenticated" USING (("public"."user_has_project_role_at_least"("project_id", 'field'::"text") AND (("author_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."user_has_project_role_at_least"("project_id", 'pm'::"text")))) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."drawing_reviews" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."drawing_transmittal_items" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."drawing_transmittals" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."expenses" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."inspections" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."look_ahead" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."meetings" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."mitigation_actions" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."mitigation_logs" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."model_elements" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."number_sequences" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."photos" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."pma_assumptions" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."pma_decisions" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."production_notes" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."project_closeout" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."projects" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("id")) WITH CHECK ("public"."user_has_project_access"("id"));



CREATE POLICY "project_update" ON "public"."punchlist_items" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."quality_control_records" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."resources" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."rfis" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."safety_incidents" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."schedule_tasks" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."scope_items" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."sov_items" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'pm'::"text"));



CREATE POLICY "project_update" ON "public"."submittals" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "project_update" ON "public"."uploaded_files" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."warranties" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_access"("project_id")) WITH CHECK ("public"."user_has_project_access"("project_id"));



CREATE POLICY "project_update" ON "public"."work_packages" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."punchlist_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quality_control_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."risks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "risks_delete" ON "public"."risks" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "risks_insert" ON "public"."risks" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "risks_select" ON "public"."risks" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "risks_update" ON "public"."risks" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



ALTER TABLE "public"."safety_incidents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scope_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sov_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."submittal_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."submittal_rounds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "submittal_rounds_delete" ON "public"."submittal_rounds" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "submittal_rounds_insert" ON "public"."submittal_rounds" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "submittal_rounds_released_for_fab_requires_elevated_role_ins" ON "public"."submittal_rounds" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((("status" IS DISTINCT FROM 'Released for Fabrication'::"text") OR "public"."user_has_project_role_at_least"("project_id", 'pm'::"text")));



CREATE POLICY "submittal_rounds_released_for_fab_requires_elevated_role_upd" ON "public"."submittal_rounds" AS RESTRICTIVE FOR UPDATE TO "authenticated" WITH CHECK ((("status" IS DISTINCT FROM 'Released for Fabrication'::"text") OR "public"."user_has_project_role_at_least"("project_id", 'pm'::"text")));



CREATE POLICY "submittal_rounds_select" ON "public"."submittal_rounds" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "submittal_rounds_update" ON "public"."submittal_rounds" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



ALTER TABLE "public"."submittal_sheet_responses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "submittal_sheet_responses_delete" ON "public"."submittal_sheet_responses" FOR DELETE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "submittal_sheet_responses_insert" ON "public"."submittal_sheet_responses" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



CREATE POLICY "submittal_sheet_responses_select" ON "public"."submittal_sheet_responses" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "submittal_sheet_responses_update" ON "public"."submittal_sheet_responses" FOR UPDATE TO "authenticated" USING ("public"."user_has_project_role_at_least"("project_id", 'field'::"text")) WITH CHECK ("public"."user_has_project_role_at_least"("project_id", 'field'::"text"));



ALTER TABLE "public"."submittals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "submittals_released_for_fab_requires_elevated_role" ON "public"."submittals" AS RESTRICTIVE FOR UPDATE TO "authenticated" WITH CHECK ((("status" IS DISTINCT FROM 'Released for Fabrication'::"text") OR "public"."user_has_project_role_at_least"("project_id", 'pm'::"text")));



ALTER TABLE "public"."task_dependencies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."uploaded_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendors_delete" ON "public"."vendors" FOR DELETE TO "authenticated" USING ("public"."user_is_org_member"("org_id"));



CREATE POLICY "vendors_insert" ON "public"."vendors" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_is_org_member"("org_id"));



CREATE POLICY "vendors_select" ON "public"."vendors" FOR SELECT TO "authenticated" USING ("public"."user_is_org_member"("org_id"));



CREATE POLICY "vendors_update" ON "public"."vendors" FOR UPDATE TO "authenticated" USING ("public"."user_is_org_member"("org_id")) WITH CHECK ("public"."user_is_org_member"("org_id"));



ALTER TABLE "public"."warranties" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "watchers_delete" ON "public"."drawing_watchers" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "watchers_insert" ON "public"."drawing_watchers" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."user_has_project_access"("project_id")));



CREATE POLICY "watchers_select" ON "public"."drawing_watchers" FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));



CREATE POLICY "watchers_update" ON "public"."drawing_watchers" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."work_packages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "auth_delete" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'app-files'::"text") AND ("owner" = "auth"."uid"())));



CREATE POLICY "auth_read" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'app-files'::"text") AND (((("storage"."foldername"("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::"text") AND "public"."user_is_org_member"((("storage"."foldername"("name"))[1])::"uuid")) OR ((("storage"."foldername"("name"))[1] = 'uploads'::"text") AND "public"."user_is_org_member"("public"."founding_org_id"())))));



CREATE POLICY "auth_update" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'app-files'::"text") AND ("owner" = "auth"."uid"()))) WITH CHECK ((("bucket_id" = 'app-files'::"text") AND ("owner" = "auth"."uid"())));



CREATE POLICY "auth_upload" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'app-files'::"text") AND (((("storage"."foldername"("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::"text") AND "public"."user_is_org_member"((("storage"."foldername"("name"))[1])::"uuid")) OR ((("storage"."foldername"("name"))[1] = 'uploads'::"text") AND "public"."user_is_org_member"("public"."founding_org_id"())))));



ALTER TABLE "storage"."buckets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."buckets_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."buckets_vectors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_attachments_select" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'email-attachments'::"text") AND (("storage"."foldername"("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::"text") AND "public"."user_has_project_access"((("storage"."foldername"("name"))[1])::"uuid")));



ALTER TABLE "storage"."migrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."objects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."s3_multipart_uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."s3_multipart_uploads_parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."vector_indexes" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT USAGE ON SCHEMA "storage" TO "postgres" WITH GRANT OPTION;
GRANT USAGE ON SCHEMA "storage" TO "anon";
GRANT USAGE ON SCHEMA "storage" TO "authenticated";
GRANT USAGE ON SCHEMA "storage" TO "service_role";
GRANT ALL ON SCHEMA "storage" TO "supabase_storage_admin" WITH GRANT OPTION;
GRANT ALL ON SCHEMA "storage" TO "dashboard_user";



REVOKE ALL ON FUNCTION "public"."accept_invitation"("p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_invitation"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_invitation"("p_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_updated_at_trigger"("tbl" "regclass") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_updated_at_trigger"("tbl" "regclass") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_updated_at_trigger"("tbl" "regclass") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_updated_at_trigger"("tbl" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_updated_at_trigger"("tbl" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_updated_at_trigger"("tbl" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_log_trigger"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_log_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."backcharge_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."backcharge_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."backcharge_touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_project"("project_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_project"("project_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_project"("project_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_drawing_set"("p_set_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_drawing_set"("p_set_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_drawing_set"("p_set_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."drawing_watch_notify_impact"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."drawing_watch_notify_impact"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."drawing_watch_notify_revision"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."drawing_watch_notify_revision"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_drawing_set_unlock_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_drawing_set_unlock_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_fab_release_gate"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_fab_release_gate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_fab_release_gate"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_org_invite_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_org_invite_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_org_member_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_org_member_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_org_member_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_org_member_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_payapp_line_draft_only"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_payapp_line_draft_only"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_payapp_line_draft_only"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_submittal_fab_release_gate"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_submittal_fab_release_gate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_submittal_fab_release_gate"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_user_projects_membership_identity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_user_projects_membership_identity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."escalate_rfi_sla"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."escalate_rfi_sla"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fab_release_blocking_rfis"("p_drawing_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fab_release_blocking_rfis"("p_drawing_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fab_release_blocking_rfis"("p_drawing_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."founding_org_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."founding_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."founding_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_invitation"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invitation"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invitation"("p_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_llm_usage_window"("p_user_id" "uuid", "p_since" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_llm_usage_window"("p_user_id" "uuid", "p_since" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_project_role"("p_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_project_role"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_project_role"("p_project_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_next_sequence_number"("p_project_id" "uuid", "p_record_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_next_sequence_number"("p_project_id" "uuid", "p_record_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_sequence_number"("p_project_id" "uuid", "p_record_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_project"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_project"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_drawing_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_drawing_activity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_drawing_link_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_drawing_link_activity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_drawing_link_event"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_drawing_link_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_drawing_link_event"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_drawing_zone_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_drawing_zone_activity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_drawing_zone_event"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_drawing_zone_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_drawing_zone_event"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_user_project_member_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_user_project_member_activity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_rfi_bic_handoff"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_rfi_bic_handoff"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."org_protect_billing_columns"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."org_protect_billing_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."organizations_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."organizations_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."organizations_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."payapp_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."payapp_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."payapp_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."piece_production_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."piece_production_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."piece_production_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."plan_member_limit"("p_plan" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."plan_member_limit"("p_plan" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."plan_member_limit"("p_plan" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."plan_project_limit"("p_plan" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."plan_project_limit"("p_plan" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."plan_project_limit"("p_plan" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_user_profile_role_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_user_profile_role_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."project_handoff_items_touch_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."project_handoff_items_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."project_handoff_items_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."project_on_hold_stamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."project_on_hold_stamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."project_on_hold_stamp"() TO "service_role";



GRANT ALL ON TABLE "public"."drawing_revisions" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_revisions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."publish_drawing_revision"("p_revision_id" "uuid", "p_release_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_drawing_revision"("p_revision_id" "uuid", "p_release_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."publish_drawing_revision"("p_revision_id" "uuid", "p_release_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconcile_stuck_extractions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_stuck_extractions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."seed_default_setup_items"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."seed_default_setup_items"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."seed_project_cost_codes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."seed_project_cost_codes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."seed_project_handoff_items"("p_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."seed_project_handoff_items"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_project_handoff_items"("p_project_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_for_drawing_is_locked"("p_drawing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_for_drawing_is_locked"("p_drawing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_for_drawing_is_locked"("p_drawing_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_for_zone_is_locked"("p_zone_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_for_zone_is_locked"("p_zone_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_for_zone_is_locked"("p_zone_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_updated_at_model_elements"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_updated_at_model_elements"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."soft_delete_project"("p_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."soft_delete_project"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."soft_delete_project"("p_project_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submittal_blocking_rfis"("p_submittal_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submittal_blocking_rfis"("p_submittal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submittal_blocking_rfis"("p_submittal_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_drawing_set_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_drawing_set_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_drawing_set_counts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tg_drawing_zone_proposals_touch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tg_drawing_zone_proposals_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_drawing_zone_proposals_touch"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tg_submittal_rounds_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tg_submittal_rounds_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_submittal_rounds_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tg_validate_drawing_zone_dependency_project"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tg_validate_drawing_zone_dependency_project"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_validate_drawing_zone_dependency_project"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_projects_seed_handoff_items"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_projects_seed_handoff_items"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_has_project_access"("p_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_has_project_access"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_project_access"("p_project_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_has_project_role"("p_project_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_has_project_role"("p_project_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_project_role"("p_project_id" "uuid", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_has_project_role_at_least"("p_project_id" "uuid", "p_min_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_has_project_role_at_least"("p_project_id" "uuid", "p_min_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_project_role_at_least"("p_project_id" "uuid", "p_min_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_is_org_member"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_is_org_member"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_org_member"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_is_project_admin"("p_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_is_project_admin"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_project_admin"("p_project_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_is_system_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_is_system_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_system_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_org_role_at_least"("p_org_id" "uuid", "p_min_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_org_role_at_least"("p_org_id" "uuid", "p_min_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_org_role_at_least"("p_org_id" "uuid", "p_min_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."users_share_org"("p_a" "uuid", "p_b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."users_share_org"("p_a" "uuid", "p_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."users_share_org"("p_a" "uuid", "p_b" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_drawing_link_target"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_drawing_link_target"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_drawing_link_target"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_drawing_zone_polygon"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_drawing_zone_polygon"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_drawing_zone_polygon"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."vendors_set_org"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vendors_set_org"() TO "service_role";



GRANT ALL ON TABLE "public"."action_items" TO "authenticated";
GRANT ALL ON TABLE "public"."action_items" TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."ai_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."alerts" TO "service_role";



GRANT ALL ON TABLE "public"."backcharge_events" TO "authenticated";
GRANT ALL ON TABLE "public"."backcharge_events" TO "service_role";



GRANT ALL ON TABLE "public"."backcharge_tm_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."backcharge_tm_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."backcharges" TO "authenticated";
GRANT ALL ON TABLE "public"."backcharges" TO "service_role";



GRANT ALL ON TABLE "public"."billing_config" TO "service_role";



GRANT ALL ON TABLE "public"."billing_events" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_events" TO "service_role";



GRANT ALL ON TABLE "public"."budget_hour_items" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_hour_items" TO "service_role";



GRANT ALL ON TABLE "public"."change_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."change_orders" TO "service_role";



GRANT ALL ON TABLE "public"."change_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."change_requests" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."cost_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_codes" TO "service_role";



GRANT ALL ON TABLE "public"."daily_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_logs" TO "service_role";



GRANT ALL ON TABLE "public"."default_cost_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."default_cost_codes" TO "service_role";



GRANT ALL ON TABLE "public"."deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_items" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_items" TO "service_role";



GRANT ALL ON TABLE "public"."document_folders" TO "authenticated";
GRANT ALL ON TABLE "public"."document_folders" TO "service_role";



GRANT ALL ON TABLE "public"."document_import_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."document_import_queue" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_activity" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_analyses" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_analyses" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_findings" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_findings" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_impacts" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_impacts" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_links" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_links" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_markups" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_markups" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."drawings" TO "authenticated";
GRANT ALL ON TABLE "public"."drawings" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_register_view" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_register_view" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_revision_comparisons" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_revision_comparisons" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_revision_deltas" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_revision_deltas" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_revision_summaries" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_revision_summaries" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_sets" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_sets" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_sheets" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_sheets" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_signoffs" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_signoffs" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_transmittal_items" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_transmittal_items" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_transmittals" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_transmittals" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_watchers" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_watchers" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_zone_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_zone_activity" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_zone_dependencies" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_zone_dependencies" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_zone_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_zone_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_zones" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_zones" TO "service_role";



GRANT ALL ON TABLE "public"."email_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."email_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."email_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."email_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."email_intake_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."email_intake_queue" TO "service_role";



GRANT ALL ON TABLE "public"."email_integration_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."email_integration_settings" TO "service_role";



GRANT ALL ON TABLE "public"."email_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."email_messages" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."external_file_refs" TO "authenticated";
GRANT ALL ON TABLE "public"."external_file_refs" TO "service_role";



GRANT ALL ON TABLE "public"."external_linked_folders" TO "authenticated";
GRANT ALL ON TABLE "public"."external_linked_folders" TO "service_role";



GRANT ALL ON TABLE "public"."fab_release_log" TO "authenticated";
GRANT ALL ON TABLE "public"."fab_release_log" TO "service_role";



GRANT ALL ON TABLE "public"."fab_release_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."fab_release_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."fab_releases" TO "authenticated";
GRANT ALL ON TABLE "public"."fab_releases" TO "service_role";



GRANT ALL ON TABLE "public"."feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_flags" TO "service_role";



GRANT ALL ON TABLE "public"."inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."inspections" TO "service_role";



GRANT ALL ON TABLE "public"."linked_folders" TO "authenticated";
GRANT ALL ON TABLE "public"."linked_folders" TO "service_role";



GRANT ALL ON TABLE "public"."llm_telemetry" TO "authenticated";
GRANT ALL ON TABLE "public"."llm_telemetry" TO "service_role";



GRANT ALL ON TABLE "public"."look_ahead" TO "authenticated";
GRANT ALL ON TABLE "public"."look_ahead" TO "service_role";



GRANT ALL ON TABLE "public"."meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."meetings" TO "service_role";



GRANT ALL ON TABLE "public"."member_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."member_activity" TO "service_role";



GRANT ALL ON TABLE "public"."mitigation_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."mitigation_actions" TO "service_role";



GRANT ALL ON TABLE "public"."mitigation_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."mitigation_logs" TO "service_role";



GRANT ALL ON TABLE "public"."model_element_links" TO "authenticated";
GRANT ALL ON TABLE "public"."model_element_links" TO "service_role";



GRANT ALL ON TABLE "public"."model_elements" TO "authenticated";
GRANT ALL ON TABLE "public"."model_elements" TO "service_role";



GRANT ALL ON TABLE "public"."model_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."model_registry" TO "service_role";



GRANT ALL ON TABLE "public"."number_sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."number_sequences" TO "service_role";



GRANT ALL ON TABLE "public"."organization_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."pay_application_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."pay_application_lines" TO "service_role";



GRANT ALL ON TABLE "public"."pay_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."pay_applications" TO "service_role";



GRANT ALL ON TABLE "public"."photos" TO "authenticated";
GRANT ALL ON TABLE "public"."photos" TO "service_role";



GRANT ALL ON TABLE "public"."piece_production" TO "authenticated";
GRANT ALL ON TABLE "public"."piece_production" TO "service_role";



GRANT ALL ON TABLE "public"."pma_assumptions" TO "authenticated";
GRANT ALL ON TABLE "public"."pma_assumptions" TO "service_role";



GRANT ALL ON TABLE "public"."pma_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."pma_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."pma_decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."pma_decisions" TO "service_role";



GRANT ALL ON TABLE "public"."production_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."production_notes" TO "service_role";



GRANT ALL ON TABLE "public"."project_closeout" TO "authenticated";
GRANT ALL ON TABLE "public"."project_closeout" TO "service_role";



GRANT ALL ON TABLE "public"."project_handoff_items" TO "authenticated";
GRANT ALL ON TABLE "public"."project_handoff_items" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."punchlist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."punchlist_items" TO "service_role";



GRANT ALL ON TABLE "public"."quality_control_records" TO "authenticated";
GRANT ALL ON TABLE "public"."quality_control_records" TO "service_role";



GRANT ALL ON TABLE "public"."resources" TO "authenticated";
GRANT ALL ON TABLE "public"."resources" TO "service_role";



GRANT ALL ON TABLE "public"."rfis" TO "authenticated";
GRANT ALL ON TABLE "public"."rfis" TO "service_role";



GRANT ALL ON TABLE "public"."risks" TO "authenticated";
GRANT ALL ON TABLE "public"."risks" TO "service_role";



GRANT ALL ON TABLE "public"."safety_incidents" TO "authenticated";
GRANT ALL ON TABLE "public"."safety_incidents" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."scope_items" TO "authenticated";
GRANT ALL ON TABLE "public"."scope_items" TO "service_role";



GRANT ALL ON TABLE "public"."sov_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sov_items" TO "service_role";



GRANT ALL ON TABLE "public"."submittal_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."submittal_activity" TO "service_role";



GRANT ALL ON TABLE "public"."submittal_rounds" TO "authenticated";
GRANT ALL ON TABLE "public"."submittal_rounds" TO "service_role";



GRANT ALL ON TABLE "public"."submittal_sheet_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."submittal_sheet_responses" TO "service_role";



GRANT ALL ON TABLE "public"."submittals" TO "authenticated";
GRANT ALL ON TABLE "public"."submittals" TO "service_role";



GRANT ALL ON TABLE "public"."task_dependencies" TO "authenticated";
GRANT ALL ON TABLE "public"."task_dependencies" TO "service_role";



GRANT ALL ON TABLE "public"."uploaded_files" TO "authenticated";
GRANT ALL ON TABLE "public"."uploaded_files" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT UPDATE("updated_at") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("full_name") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("avatar_url") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("metadata") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."user_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."user_projects" TO "service_role";



GRANT ALL ON TABLE "public"."vendors" TO "authenticated";
GRANT ALL ON TABLE "public"."vendors" TO "service_role";



GRANT ALL ON TABLE "public"."warranties" TO "authenticated";
GRANT ALL ON TABLE "public"."warranties" TO "service_role";



GRANT ALL ON TABLE "public"."work_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."work_packages" TO "service_role";



REVOKE ALL ON TABLE "storage"."buckets" FROM "supabase_storage_admin";
GRANT ALL ON TABLE "storage"."buckets" TO "supabase_storage_admin" WITH GRANT OPTION;
GRANT ALL ON TABLE "storage"."buckets" TO "service_role";
GRANT ALL ON TABLE "storage"."buckets" TO "authenticated";
GRANT ALL ON TABLE "storage"."buckets" TO "anon";
GRANT ALL ON TABLE "storage"."buckets" TO "postgres" WITH GRANT OPTION;



GRANT ALL ON TABLE "storage"."buckets_analytics" TO "service_role";
GRANT ALL ON TABLE "storage"."buckets_analytics" TO "authenticated";
GRANT ALL ON TABLE "storage"."buckets_analytics" TO "anon";



GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "service_role";
GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "authenticated";
GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "anon";



REVOKE ALL ON TABLE "storage"."objects" FROM "supabase_storage_admin";
GRANT ALL ON TABLE "storage"."objects" TO "supabase_storage_admin" WITH GRANT OPTION;
GRANT ALL ON TABLE "storage"."objects" TO "service_role";
GRANT ALL ON TABLE "storage"."objects" TO "authenticated";
GRANT ALL ON TABLE "storage"."objects" TO "anon";
GRANT ALL ON TABLE "storage"."objects" TO "postgres" WITH GRANT OPTION;



GRANT ALL ON TABLE "storage"."s3_multipart_uploads" TO "service_role";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads" TO "authenticated";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads" TO "anon";



GRANT ALL ON TABLE "storage"."s3_multipart_uploads_parts" TO "service_role";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads_parts" TO "authenticated";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads_parts" TO "anon";



GRANT SELECT ON TABLE "storage"."vector_indexes" TO "service_role";
GRANT SELECT ON TABLE "storage"."vector_indexes" TO "authenticated";
GRANT SELECT ON TABLE "storage"."vector_indexes" TO "anon";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "service_role";




