-- =============================================================================
-- Phase 2 — tighten publish_drawing_revision authorization
-- Project: kjrwqagyeswwoxpjkcko
--
-- Before: gated only by user_has_project_access(project) — i.e. ANY project
-- member, including a read-only `viewer`, could publish/supersede a drawing
-- revision via /rest/v1/rpc/publish_drawing_revision.
-- After: requires >= pm. Publishing/superseding a revision is a controlled
-- release act (consistent with delete_drawing_set requiring admin).
--
-- Body is otherwise byte-identical to the live function as of 2026-06-17;
-- the only change is the authorization predicate + its error message.
-- =============================================================================
create or replace function public.publish_drawing_revision(p_revision_id uuid, p_release_status text default 'released_for_field'::text)
 returns drawing_revisions
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
end $function$;
