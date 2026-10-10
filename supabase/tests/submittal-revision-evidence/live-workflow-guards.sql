-- Read-only production catalog snapshot 2026-10-09. Guard definitions, no records.
CREATE OR REPLACE FUNCTION public.enforce_submittal_fab_release_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_blocking text[];
  v_rejected text[];
  v_superseded text[];
begin
  if new.status is distinct from 'Released for Fabrication'
     or old.status is not distinct from 'Released for Fabrication' then
    return new;
  end if;

  -- Audited override escapes every dimension (matches package export gate).
  if coalesce(btrim(new.fab_release_override_reason), '') <> '' then
    return new;
  end if;

  select coalesce(array_agg(distinct b.rfi_number) filter (where b.rfi_number is not null), '{}')
    into v_blocking
  from public.submittal_blocking_rfis(new.id) b;
  if array_length(v_blocking, 1) is not null then
    raise exception
      'FAB_RELEASE_BLOCKED: % open RFI(s) reference sheets in this submittal''s package (%). Resolve them or release with an override reason.',
      array_length(v_blocking, 1), array_to_string(v_blocking, ', ');
  end if;

  select coalesce(array_agg(d.sheet_number order by d.sheet_number)
                    filter (where d.sheet_number is not null), '{}')
    into v_rejected
  from public.drawings d
  where d.drawing_set_id = any (coalesce(new.drawing_set_ids, '{}'))
    and d.is_deleted is distinct from true
    and lower(coalesce(d.stage,'') || ' ' || coalesce(d.set_approval_status,'') || ' ' || coalesce(d.ifc_status,''))
          ~ '(reject|revise|resubmit|returned|r&r)';
  if array_length(v_rejected, 1) is not null then
    raise exception
      'FAB_RELEASE_BLOCKED: % sheet marks in this submittal''s package came back rejected or revise-and-resubmit. Resolve them or release with an override reason. Sheets: %',
      array_length(v_rejected, 1), array_to_string(v_rejected, ', ');
  end if;

  select coalesce(array_agg(d.sheet_number order by d.sheet_number)
                    filter (where d.sheet_number is not null), '{}')
    into v_superseded
  from public.drawings d
  where d.drawing_set_id = any (coalesce(new.drawing_set_ids, '{}'))
    and d.is_deleted is distinct from true
    and d.is_superseded is true;
  if array_length(v_superseded, 1) is not null then
    raise exception
      'FAB_RELEASE_BLOCKED: % sheet marks in this submittal''s package are superseded by a newer revision. Release the current revision or release with an override reason. Sheets: %',
      array_length(v_superseded, 1), array_to_string(v_superseded, ', ');
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_submittal_status_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status is null or btrim(new.status) = '' then
    new.status := 'Draft';
  end if;
  if new.status not in (
    'Draft', 'Submitted', 'Under Review', 'Approved', 'Approved as Noted',
    'Revise and Resubmit', 'Rejected', 'Released for Fabrication', 'Void'
  ) then
    raise exception 'SUBMITTAL_TRANSITION_BLOCKED: Unknown submittal status "%".', new.status;
  end if;
  -- Creating directly as Released for Fabrication still hits the fab gate trigger.
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_submittal_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_from text;
  v_to text;
  v_allowed text[];
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_from := coalesce(nullif(btrim(old.status), ''), 'Draft');
  v_to := btrim(new.status);

  if v_to is null or v_to = '' then
    raise exception 'SUBMITTAL_TRANSITION_BLOCKED: A target submittal status is required.';
  end if;

  case v_from
    when 'Draft' then
      v_allowed := array['Submitted', 'Under Review', 'Void'];
    when 'Submitted' then
      v_allowed := array['Under Review', 'Approved', 'Approved as Noted', 'Revise and Resubmit', 'Rejected', 'Void'];
    when 'Under Review' then
      v_allowed := array['Submitted', 'Approved', 'Approved as Noted', 'Revise and Resubmit', 'Rejected', 'Void'];
    when 'Approved' then
      -- No 'Under Review': OFS is scrub, not a resubmittal (Slice 4).
      v_allowed := array['Released for Fabrication', 'Revise and Resubmit', 'Void'];
    when 'Approved as Noted' then
      v_allowed := array['Released for Fabrication', 'Revise and Resubmit', 'Void'];
    when 'Revise and Resubmit' then
      v_allowed := array['Submitted', 'Under Review', 'Void'];
    when 'Rejected' then
      v_allowed := array['Draft', 'Submitted', 'Under Review', 'Void'];
    when 'Released for Fabrication' then
      v_allowed := array['Void'];
    when 'Void' then
      v_allowed := array[]::text[];
    else
      return new;
  end case;

  if not (v_to = any (v_allowed)) then
    raise exception
      'SUBMITTAL_TRANSITION_BLOCKED: Cannot move a submittal from "%" to "%". Allowed next statuses: %.',
      v_from,
      v_to,
      case when coalesce(array_length(v_allowed, 1), 0) = 0 then '(terminal)' else array_to_string(v_allowed, ', ') end;
  end if;

  -- R&R → sent requires transmission evidence (Slice 3).
  if v_from in ('Revise and Resubmit', 'Rejected')
     and v_to in ('Submitted', 'Under Review') then
    if new.submitted_date is null
       or (old.returned_date is not null and new.submitted_date < old.returned_date) then
      raise exception
        'RR_RESUBMIT_BLOCKED: This package is in R&R — it moves back out for approval only when the revised set is actually transmitted. Record the actual (new) submission date.';
    end if;
    if coalesce(btrim(new.ball_in_court), '') = '' then
      raise exception
        'RR_RESUBMIT_BLOCKED: This package is in R&R — record the recipient (ball-in-court) receiving the resubmittal.';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_submittal_workflow_gates()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_from text; v_to text; v_open int; v_reasons text[] := '{}'; v_override boolean;
begin
  new.derived_stage := public.submittal_derived_stage(new.status, new.ball_in_court, new.approved_date);
  if tg_op = 'INSERT' then
    new.stage_entered_at := coalesce(new.stage_entered_at, now());
    return new;
  end if;
  v_from := coalesce(old.derived_stage, public.submittal_derived_stage(old.status, old.ball_in_court, old.approved_date));
  v_to := new.derived_stage;
  if v_to is distinct from v_from then
    new.stage_entered_at := now();
    if v_to in ('IFC','Released') and v_from in ('Not Started','IFA','OFA','BFA','R&R','OFS')
       and not public.submittal_ofs_checklist_complete(coalesce(new.metadata, '{}'::jsonb)) then
      v_reasons := array_append(v_reasons, 'OFS scrub checklist incomplete (metadata.ofs_checklist)');
    end if;
    if (v_to in ('IFC','Released') and v_from in ('Not Started','IFA','OFA','BFA','R&R','OFS')) or (v_from = 'R&R' and v_to = 'OFA') then
      select count(*) into v_open from public.submittal_comment_dispositions d
       where d.submittal_id = new.id and d.is_deleted = false and d.is_required = true
         and d.status not in ('Complete','Not Applicable','Incorporated');
      if v_open > 0 then v_reasons := array_append(v_reasons, v_open || ' required comment disposition(s) unresolved'); end if;
    end if;
    if array_length(v_reasons, 1) is not null then
      v_override := coalesce(btrim(new.gate_override_reason), '') <> '' and new.gate_override_reason is distinct from old.gate_override_reason;
      if not v_override then
        raise exception 'SUBMITTAL_GATE_BLOCKED: % → % blocked: %. Record an audited override reason to proceed.', v_from, v_to, array_to_string(v_reasons, '; ') using errcode = 'P0001';
      end if;
      if not public.user_has_project_role_at_least(new.project_id, 'pm') then
        raise exception 'SUBMITTAL_GATE_BLOCKED: only PM+ may override a workflow gate' using errcode = '42501';
      end if;
      new.gate_override_by := (select auth.uid());
      new.gate_override_at := now();
    end if;
  end if;
  return new;
end;
$function$
;
