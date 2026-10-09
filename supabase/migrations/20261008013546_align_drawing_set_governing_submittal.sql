-- Align the set-level fabrication gate with the client approval selector and
-- stage mapping. A never-submitted Draft does not displace a submitted round;
-- unknown/legacy approval BIC is not promoted to IFC. The shared stage helper
-- is intentionally unchanged for its other callers.
-- Apply and hand-stamp this exact migration only through the approved rollout.

CREATE OR REPLACE FUNCTION public.evaluate_fab_release_set(p_project_id uuid, p_drawing_set_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_set public.drawing_sets%rowtype; v_sub record; v_stage text; v_blockers jsonb := '[]'::jsonb;
  v_sheets uuid[]; v_names text[]; v_rfis text[]; v_hold_names text[]; v_super text[]; v_nofile text[];
  v_undistributed text[]; v_missing_current text[]; v_missing_signoffs text[];
  v_require_signoffs boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.user_has_project_access(p_project_id) then
    raise exception 'Not authorized for this project' using errcode = '42501';
  end if;
  select * into v_set from public.drawing_sets where id = p_drawing_set_id and project_id = p_project_id and is_deleted = false and deleted_at is null;
  if not found then raise exception 'Drawing set not found in this project' using errcode = 'P0002'; end if;
  select coalesce(array_agg(d.id), '{}'::uuid[]), coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_sheets, v_names
    from public.drawings d where d.drawing_set_id = p_drawing_set_id and d.project_id = p_project_id and d.is_deleted = false and d.deleted_at is null;
  select s.id, s.submittal_number,
    case
      when s.status = 'Draft' then 'IFA'
      when s.status in ('Submitted', 'Under Review') then case
        when s.ball_in_court in ('Detailer', 'Contractor', 'Subcontractor') then 'IFA'
        else 'OFA'
      end
      when s.status in ('Approved', 'Approved as Noted') then case
        when s.ball_in_court in ('EOR', 'Architect', 'AOR') then 'BFA'
        when s.ball_in_court in ('Detailer', 'Contractor', 'Subcontractor') then 'OFS'
        when s.ball_in_court in ('GC', 'Owner') then 'IFC'
        else 'BFA'
      end
      when s.status in ('Revise and Resubmit', 'Rejected') then 'R&R'
      when s.status = 'Released for Fabrication' then 'Released'
      else null
    end as stage into v_sub
    from public.submittals s where s.project_id = p_project_id and s.is_deleted = false and s.deleted_at is null and s.submittal_type = 'Shop Drawing' and s.status in ('Draft', 'Submitted', 'Under Review', 'Approved', 'Approved as Noted', 'Revise and Resubmit', 'Rejected', 'Released for Fabrication') and p_drawing_set_id = any(coalesce(s.drawing_set_ids, '{}'::uuid[]))
   order by s.submitted_date desc nulls last,
            s.updated_at desc nulls last,
            coalesce(s.round_number, 1) desc,
            s.created_at desc nulls last,
            s.id desc
   limit 1;
  v_stage := coalesce(v_sub.stage, 'Not Started');
  if cardinality(v_sheets) = 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'no_sheets', 'title', 'The package has no sheets', 'sheet_numbers', '[]'::jsonb, 'rfi_numbers', '[]'::jsonb);
  end if;
  if v_sub.id is null then
    v_blockers := v_blockers || jsonb_build_object('kind', 'no_submittal', 'title', 'No linked shop drawing submittal governs this package', 'sheet_numbers', to_jsonb(v_names), 'rfi_numbers', '[]'::jsonb);
  elsif v_stage not in ('IFC', 'Released') then
    v_blockers := v_blockers || jsonb_build_object('kind', 'not_ifc', 'title', format('Governing submittal %s is at %s — fab release needs IFC or Released', v_sub.submittal_number, v_stage), 'sheet_numbers', to_jsonb(v_names), 'rfi_numbers', '[]'::jsonb, 'submittal_number', v_sub.submittal_number, 'stage', v_stage);
  end if;
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_hold_names
    from public.drawing_holds h join public.drawings d on d.id = h.drawing_id
   where h.project_id = p_project_id and h.is_active = true and d.project_id = p_project_id and d.drawing_set_id = p_drawing_set_id and d.is_deleted = false and d.deleted_at is null;
  if cardinality(v_hold_names) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'active_holds', 'title', format('%s sheet(s) on hold', cardinality(v_hold_names)), 'sheet_numbers', to_jsonb(v_hold_names), 'rfi_numbers', '[]'::jsonb);
  end if;
  select coalesce(array_agg(distinct x.rfi_number order by x.rfi_number), '{}'::text[]) into v_rfis from (
    select r.rfi_number from public.rfis r
     where r.project_id = p_project_id and r.is_deleted = false and coalesce(r.status, 'Open') not in ('Answered', 'Closed', 'Void')
       and (r.drawing_set_id = p_drawing_set_id or r.drawing_id = any(v_sheets))
    union
    select b.rfi_number from public.fab_release_blocking_rfis(v_sheets) b
  ) x where x.rfi_number is not null;
  if cardinality(v_rfis) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'open_rfis', 'title', format('%s open RFI(s) reference this package', cardinality(v_rfis)), 'sheet_numbers', '[]'::jsonb, 'rfi_numbers', to_jsonb(v_rfis));
  end if;
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_super from public.drawings d
   where d.drawing_set_id = p_drawing_set_id and d.project_id = p_project_id and d.is_deleted = false and d.deleted_at is null and d.is_superseded is true;
  if cardinality(v_super) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'superseded', 'title', format('%s sheet(s) superseded by a newer revision', cardinality(v_super)), 'sheet_numbers', to_jsonb(v_super), 'rfi_numbers', '[]'::jsonb);
  end if;
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_nofile from public.drawings d
   where d.drawing_set_id = p_drawing_set_id and d.project_id = p_project_id and d.is_deleted = false and d.deleted_at is null and nullif(btrim(d.file_url), '') is null;
  if cardinality(v_nofile) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'no_file', 'title', format('%s sheet(s) have no PDF attached', cardinality(v_nofile)), 'sheet_numbers', to_jsonb(v_nofile), 'rfi_numbers', '[]'::jsonb);
  end if;
  -- A PDF and an old approved submittal do not prove which revision is current.
  -- Every live sheet needs exactly one active current revision before release.
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[])
    into v_missing_current
    from public.drawings d
   where d.drawing_set_id = p_drawing_set_id and d.project_id = p_project_id
     and d.is_deleted = false and d.deleted_at is null
     and not exists (
       select 1 from public.drawing_revisions rev
        where rev.drawing_id = d.id and rev.project_id = p_project_id
          and rev.is_current = true and rev.archived_at is null
     );
  if cardinality(v_missing_current) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'missing_current_revision', 'title', format('%s sheet(s) have no active current revision', cardinality(v_missing_current)), 'sheet_numbers', to_jsonb(v_missing_current), 'rfi_numbers', '[]'::jsonb);
  end if;
  select coalesce(p.metadata ->> 'require_fab_signoffs' = 'true', false)
    into v_require_signoffs from public.projects p where p.id = p_project_id;
  if coalesce(v_require_signoffs, false) then
    -- The two signoff FKs are independent. Require both IDs to resolve to the
    -- same project, sheet, and active current revision; a stale or mislinked
    -- signoff cannot authorize the current PDF.
    select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[])
      into v_missing_signoffs
      from public.drawings d
     where d.drawing_set_id = p_drawing_set_id and d.project_id = p_project_id
       and d.is_deleted = false and d.deleted_at is null
       and not exists (
         select 1 from public.drawing_revisions rev
         join public.drawing_signoffs signoff
           on signoff.drawing_revision_id = rev.id
          and signoff.drawing_id = d.id and signoff.project_id = p_project_id
          and signoff.is_voided = false
          and signoff.stamp_type in ('approved_for_fabrication', 'approved_as_noted')
          where rev.drawing_id = d.id and rev.project_id = p_project_id
            and rev.is_current = true and rev.archived_at is null
       );
    if cardinality(v_missing_signoffs) > 0 then
      v_blockers := v_blockers || jsonb_build_object('kind', 'missing_signoffs', 'title', format('%s sheet(s) lack a valid current-revision fabrication signoff', cardinality(v_missing_signoffs)), 'sheet_numbers', to_jsonb(v_missing_signoffs), 'rfi_numbers', '[]'::jsonb);
    end if;
  end if;
  -- A new revision enters as received/pending review. An older approved
  -- submittal still linked to this set cannot clear that new current sheet.
  -- Distribution alone never grants approval; this is a blocker only.
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[])
    into v_undistributed
    from public.drawings d
    join public.drawing_revisions rev
      on rev.drawing_id = d.id and rev.project_id = p_project_id
     and rev.is_current = true and rev.archived_at is null
   where d.drawing_set_id = p_drawing_set_id and d.project_id = p_project_id
     and d.is_deleted = false and d.deleted_at is null
     and rev.release_status not in ('released_for_shop', 'released_for_field');
  if cardinality(v_undistributed) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'current_revision_not_distributed', 'title', format('%s current sheet revision(s) have not been distributed to the shop', cardinality(v_undistributed)), 'sheet_numbers', to_jsonb(v_undistributed), 'rfi_numbers', '[]'::jsonb);
  end if;
  if v_set.set_approval_status = 'pending_review' then
    v_blockers := v_blockers || jsonb_build_object('kind', 'set_revision_pending_review', 'title', 'The drawing-set revision is pending review', 'sheet_numbers', to_jsonb(v_names), 'rfi_numbers', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'rule_version', 'drawing-shop-v2',
    'ok', jsonb_array_length(v_blockers) = 0, 'drawing_set_id', p_drawing_set_id, 'set_name', v_set.set_name, 'sheet_count', cardinality(v_sheets),
    'sheet_ids', to_jsonb(v_sheets), 'governing_stage', v_stage, 'submittal_id', v_sub.id, 'submittal_number', v_sub.submittal_number,
    'blocking_rfi_numbers', to_jsonb(v_rfis), 'blockers', v_blockers, 'evaluated_at', now());
end;
$function$;

REVOKE ALL ON FUNCTION public.evaluate_fab_release_set(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_fab_release_set(uuid, uuid) TO authenticated, service_role;
