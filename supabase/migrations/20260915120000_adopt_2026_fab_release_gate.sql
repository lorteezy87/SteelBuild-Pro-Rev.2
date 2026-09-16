-- Adopt the sibling app's stronger fab-release-gate logic into Rev.2.
--
-- Recorded in supabase/production-ownership-manifest.json as unresolved since
-- 2026-09-14: the tracked supabase/migrations_quarantine/20260727232000_piece_drawing_sets.sql
-- carries a STALE evaluate_release_gate/piece_control_drawing_is_approved pair
-- that checks drawing approval per-sheet with no set-level submittal stage, no
-- open-RFI check, no active-holds check, no superseded-sheet check and no
-- no-file check. Production has since moved on to a set-level evaluator
-- (evaluate_fab_release_set, driving both work_package_drawing_set_reports and
-- piece_control_drawing_is_approved) that checks all of those - the sibling
-- SteelBuild-Pro-2026 app's hardened design. Applying the quarantined file
-- as-is would overwrite the live, stronger gate with the older, weaker one and
-- silently drop live P0 safety blockers - it must stay quarantined.
--
-- This file instead re-declares the CURRENT LIVE definitions so Rev.2 tracks
-- them going forward. Every statement was pulled from pg_get_functiondef /
-- information_schema / pg_policy on kjrwqagyeswwoxpjkcko on 2026-09-15 and
-- verified functionally identical to what was live before this migration
-- ran (same tables, same conditions, same blocker kinds, same jsonb shape) -
-- the value is fresh-database replay and having Rev.2's own migration
-- history match reality, not a behavior change.
--
-- One caveat found applying this: the session's SQL execution path does not
-- preserve `--` line comments written INSIDE a plpgsql function body (they
-- reached this repo's file but did not reach the live function source) - so
-- evaluate_fab_release_set and evaluate_release_gate below carry the
-- explanatory comments their live source once had removed, with the same
-- explanations kept in this header instead. This is a documentation-only
-- side effect with no behavioral consequence (comments do not execute) and
-- is called out here rather than silently left as an unexplained diff from
-- earlier fetches taken during this same session.
--
-- Owner decision (2026-09-15): adopt this logic as Rev.2's own. Superseding
-- note added to 20260727232000's manifest override in the same commit.

-- ── piece_events: allow the drawing-set-link event types ───────────────────
-- Already live (verified byte-identical); re-declared for fresh-DB replay.
ALTER TABLE public.piece_events
  DROP CONSTRAINT IF EXISTS piece_events_event_type_check;

ALTER TABLE public.piece_events
  ADD CONSTRAINT piece_events_event_type_check CHECK (
    event_type = ANY (ARRAY[
      'imported'::text,
      'updated_from_import'::text,
      'lot_split'::text,
      'lot_merged'::text,
      'assigned_to_work_package'::text,
      'drawing_linked'::text,
      'drawing_unlinked'::text,
      'drawing_set_linked'::text,
      'drawing_set_unlinked'::text,
      'hold_applied'::text,
      'hold_released'::text,
      'released_for_fabrication'::text,
      'release_exception'::text,
      'station_advanced'::text,
      'station_override'::text,
      'shipped'::text,
      'delivered'::text,
      'erected'::text,
      'archived'::text,
      'attributes_updated'::text
    ])
  );

-- ── piece_drawing_sets: piece links target drawing SETS, not sheets ────────
-- Already live (verified byte-identical schema); re-declared for fresh-DB
-- replay. Fab release still expands each linked set to its active sheets.
CREATE TABLE IF NOT EXISTS public.piece_drawing_sets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  piece_id uuid NOT NULL,
  drawing_set_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT piece_drawing_sets_pkey PRIMARY KEY (id),
  CONSTRAINT piece_drawing_sets_project_fk FOREIGN KEY (project_id)
    REFERENCES public.projects (id) ON DELETE CASCADE,
  CONSTRAINT piece_drawing_sets_piece_fk FOREIGN KEY (piece_id)
    REFERENCES public.pieces (id) ON DELETE CASCADE,
  CONSTRAINT piece_drawing_sets_set_fk FOREIGN KEY (drawing_set_id)
    REFERENCES public.drawing_sets (id) ON DELETE CASCADE,
  CONSTRAINT piece_drawing_sets_created_by_fk FOREIGN KEY (created_by)
    REFERENCES auth.users (id),
  CONSTRAINT piece_drawing_sets_piece_set_unique UNIQUE (piece_id, drawing_set_id)
);

CREATE INDEX IF NOT EXISTS piece_drawing_sets_project_piece_idx
  ON public.piece_drawing_sets (project_id, piece_id);

CREATE INDEX IF NOT EXISTS piece_drawing_sets_project_set_idx
  ON public.piece_drawing_sets (project_id, drawing_set_id);

CREATE OR REPLACE TRIGGER set_piece_drawing_sets_updated_at
BEFORE UPDATE ON public.piece_drawing_sets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.piece_drawing_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS piece_drawing_set_read ON public.piece_drawing_sets;
CREATE POLICY piece_drawing_set_read
ON public.piece_drawing_sets
FOR SELECT TO authenticated
USING (public.user_has_project_access(project_id));

REVOKE ALL ON TABLE public.piece_drawing_sets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.piece_drawing_sets TO authenticated;
GRANT ALL ON TABLE public.piece_drawing_sets TO service_role;

-- Backfill from legacy sheet-level links (idempotent; already run in
-- production, needed on a fresh database so a new environment starts with
-- the same set-level links a legacy piece_drawings history would imply).
INSERT INTO public.piece_drawing_sets (project_id, piece_id, drawing_set_id, created_by)
SELECT DISTINCT
  pd.project_id,
  pd.piece_id,
  d.drawing_set_id,
  pd.created_by
FROM public.piece_drawings AS pd
JOIN public.drawings AS d
  ON d.id = pd.drawing_id
 AND d.project_id = pd.project_id
WHERE d.drawing_set_id IS NOT NULL
  AND d.is_deleted = false
  AND d.deleted_at IS NULL
ON CONFLICT (piece_id, drawing_set_id) DO NOTHING;

-- ── link/unlink RPCs ────────────────────────────────────────────────────────
-- Already live (verified byte-identical); re-declared for fresh-DB replay.
CREATE OR REPLACE FUNCTION public.link_piece_drawing_set(
  p_project_id uuid,
  p_piece_id uuid,
  p_drawing_set_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_inserted integer := 0;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to link piece drawing sets in this project'
      USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode
  FROM public.projects
  WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pieces
    WHERE id = p_piece_id
      AND project_id = p_project_id
      AND deleted_at IS NULL
      AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Active piece not found in this project';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pieces
    WHERE parent_piece_id = p_piece_id
      AND deleted_at IS NULL
      AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Container pieces cannot be linked; link active leaf lots instead';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.drawing_sets
    WHERE id = p_drawing_set_id
      AND project_id = p_project_id
      AND is_deleted = false
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active drawing set not found in this project';
  END IF;

  INSERT INTO public.piece_drawing_sets (
    project_id, piece_id, drawing_set_id, created_by
  ) VALUES (
    p_project_id, p_piece_id, p_drawing_set_id, v_actor
  )
  ON CONFLICT (piece_id, drawing_set_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    INSERT INTO public.piece_events (
      project_id, piece_id, event_type, previous_state, next_state,
      reason, source_system, created_by
    ) VALUES (
      p_project_id,
      p_piece_id,
      'drawing_set_linked',
      '{}'::jsonb,
      jsonb_build_object('drawing_set_id', p_drawing_set_id),
      'Drawing set linked through Piece Control',
      'piece_control',
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'piece_id', p_piece_id,
    'drawing_set_id', p_drawing_set_id,
    'linked', v_inserted = 1,
    'unchanged', v_inserted = 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_piece_drawing_set(
  p_project_id uuid,
  p_piece_id uuid,
  p_drawing_set_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_deleted integer := 0;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to unlink piece drawing sets in this project'
      USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode
  FROM public.projects
  WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pieces
    WHERE id = p_piece_id AND project_id = p_project_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.drawing_sets
    WHERE id = p_drawing_set_id AND project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'Piece and drawing set must belong to the same project';
  END IF;

  DELETE FROM public.piece_drawing_sets
  WHERE project_id = p_project_id
    AND piece_id = p_piece_id
    AND drawing_set_id = p_drawing_set_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 1 THEN
    INSERT INTO public.piece_events (
      project_id, piece_id, event_type, previous_state, next_state,
      reason, source_system, created_by
    ) VALUES (
      p_project_id,
      p_piece_id,
      'drawing_set_unlinked',
      jsonb_build_object('drawing_set_id', p_drawing_set_id),
      '{}'::jsonb,
      'Drawing set unlinked through Piece Control',
      'piece_control',
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'piece_id', p_piece_id,
    'drawing_set_id', p_drawing_set_id,
    'unlinked', v_deleted = 1,
    'unchanged', v_deleted = 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_piece_drawing_set(uuid, uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlink_piece_drawing_set(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_piece_drawing_set(uuid, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_piece_drawing_set(uuid, uuid, uuid)
  TO authenticated;

-- ── submittal_derived_stage: new to Rev.2, already live ────────────────────
-- Its only caller in this file is evaluate_fab_release_set below. Rev.2 has
-- carried submittal_bic_class (20260911062832) but never this derivation.
CREATE OR REPLACE FUNCTION public.submittal_derived_stage(p_status text, p_bic text, p_approved_date date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  select case p_status
    when 'Draft' then 'IFA'
    when 'Submitted' then case when public.submittal_bic_class(p_bic) = 'detailer' then 'IFA' else 'OFA' end
    when 'Under Review' then case when public.submittal_bic_class(p_bic) = 'detailer' then 'IFA' else 'OFA' end
    when 'Approved' then case public.submittal_bic_class(p_bic) when 'downstream' then 'IFC' when 'closed' then 'IFC' when 'approver' then 'BFA' else 'OFS' end
    when 'Approved as Noted' then case public.submittal_bic_class(p_bic)
        when 'downstream' then 'IFC' when 'closed' then 'IFC' when 'approver' then 'BFA'
        else case when p_approved_date is null then 'BFA' else 'OFS' end end
    when 'Revise and Resubmit' then 'R&R'
    when 'Rejected' then 'R&R'
    when 'Released for Fabrication' then 'Released'
    else 'Not Started' end;
$function$;

REVOKE ALL ON FUNCTION public.submittal_derived_stage(text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submittal_derived_stage(text, text, date) TO authenticated, service_role;

-- ── fab_release_blocking_rfis: new to Rev.2, already live ──────────────────
-- Matches drawings.linked_rfi_ids (text, comma-separated RFI numbers) against
-- rfis.rfi_number using the same normNum rule as src/lib/fabReleaseGate.ts
-- (comma-only split, uppercase, strip non-alphanumerics) - see CLAUDE.md
-- "Linked-RFI id spaces". This is the drawing-set gate's RFI check; it is a
-- second, independent source of open-RFI blockers alongside the direct
-- rfis.drawing_id / rfis.drawing_set_id links evaluate_fab_release_set also
-- checks.
CREATE OR REPLACE FUNCTION public.fab_release_blocking_rfis(p_drawing_ids uuid[])
RETURNS TABLE(id uuid, rfi_number text, title text, status text, project_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.fab_release_blocking_rfis(uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fab_release_blocking_rfis(uuid[]) TO authenticated;

-- ── evaluate_fab_release_set: new to Rev.2, already live ───────────────────
-- The set-level evaluator. NOT SECURITY DEFINER (runs as the caller, RLS
-- applies) - it still checks user_has_project_access explicitly as defence in
-- depth since several of its reads (drawing_holds, rfis, fab_release_blocking_rfis)
-- are reached through SECURITY DEFINER helpers below it.
CREATE OR REPLACE FUNCTION public.evaluate_fab_release_set(p_project_id uuid, p_drawing_set_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_set public.drawing_sets%rowtype; v_sub record; v_stage text; v_blockers jsonb := '[]'::jsonb;
  v_sheets uuid[]; v_names text[]; v_rfis text[]; v_hold_names text[]; v_super text[]; v_nofile text[];
begin
  if not public.user_has_project_access(p_project_id) then raise exception 'Not authorized for this project' using errcode = '42501'; end if;
  select * into v_set from public.drawing_sets where id = p_drawing_set_id and project_id = p_project_id and is_deleted = false;
  if not found then raise exception 'Drawing set not found in this project' using errcode = 'P0002'; end if;
  select coalesce(array_agg(d.id), '{}'::uuid[]), coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_sheets, v_names
    from public.drawings d where d.drawing_set_id = p_drawing_set_id and d.is_deleted = false;
  select s.id, s.submittal_number, public.submittal_derived_stage(s.status, s.ball_in_court, s.approved_date) as stage into v_sub
    from public.submittals s where s.project_id = p_project_id and s.is_deleted = false and s.status <> 'Void' and p_drawing_set_id = any(coalesce(s.drawing_set_ids, '{}'::uuid[]))
   order by s.created_at desc limit 1;
  v_stage := coalesce(v_sub.stage, 'Not Started');
  if cardinality(v_sheets) = 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'no_sheets', 'title', 'The package has no sheets', 'sheet_numbers', '[]'::jsonb, 'rfi_numbers', '[]'::jsonb);
  end if;
  if v_sub.id is null then
    v_blockers := v_blockers || jsonb_build_object('kind', 'no_submittal', 'title', 'No submittal governs this package', 'sheet_numbers', to_jsonb(v_names), 'rfi_numbers', '[]'::jsonb);
  elsif v_stage not in ('IFC', 'Released') then
    v_blockers := v_blockers || jsonb_build_object('kind', 'not_ifc', 'title', format('Governing submittal %s is at %s — fab release needs IFC or Released', v_sub.submittal_number, v_stage), 'sheet_numbers', to_jsonb(v_names), 'rfi_numbers', '[]'::jsonb, 'submittal_number', v_sub.submittal_number, 'stage', v_stage);
  end if;
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_hold_names
    from public.drawing_holds h join public.drawings d on d.id = h.drawing_id
   where h.project_id = p_project_id and h.is_active = true and d.drawing_set_id = p_drawing_set_id and d.is_deleted = false;
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
   where d.drawing_set_id = p_drawing_set_id and d.is_deleted = false and d.is_superseded is true;
  if cardinality(v_super) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'superseded', 'title', format('%s sheet(s) superseded by a newer revision', cardinality(v_super)), 'sheet_numbers', to_jsonb(v_super), 'rfi_numbers', '[]'::jsonb);
  end if;
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_nofile from public.drawings d
   where d.drawing_set_id = p_drawing_set_id and d.is_deleted = false and d.file_url is null;
  if cardinality(v_nofile) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'no_file', 'title', format('%s sheet(s) have no PDF attached', cardinality(v_nofile)), 'sheet_numbers', to_jsonb(v_nofile), 'rfi_numbers', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'ok', jsonb_array_length(v_blockers) = 0, 'drawing_set_id', p_drawing_set_id, 'set_name', v_set.set_name, 'sheet_count', cardinality(v_sheets),
    'sheet_ids', to_jsonb(v_sheets), 'governing_stage', v_stage, 'submittal_id', v_sub.id, 'submittal_number', v_sub.submittal_number,
    'blocking_rfi_numbers', to_jsonb(v_rfis), 'blockers', v_blockers, 'evaluated_at', now());
end;
$function$;

REVOKE ALL ON FUNCTION public.evaluate_fab_release_set(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_fab_release_set(uuid, uuid) TO authenticated, service_role;

-- ── work_package_drawing_set_reports: new to Rev.2, already live ───────────
-- Expands a work package's scoped pieces to their linked drawing sets and
-- reports each set's evaluate_fab_release_set result. Its only in-database
-- caller is evaluate_release_gate below, which already checks
-- user_has_project_access before reaching it.
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
  if v_project_id is null then return v_reports; end if;
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

REVOKE ALL ON FUNCTION public.work_package_drawing_set_reports(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_package_drawing_set_reports(uuid) TO authenticated, service_role;

-- ── piece_control_drawing_is_approved: supersedes 20260727232000's version ─
-- OLD (quarantined) body checked per-sheet approval directly. Current live
-- body defers to evaluate_fab_release_set's governing_stage so a sheet's
-- approval reflects its SET's governing submittal, open RFIs, holds,
-- supersession and file presence - not just the sheet in isolation.
CREATE OR REPLACE FUNCTION public.piece_control_drawing_is_approved(p_drawing_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select (public.evaluate_fab_release_set(d.project_id, d.drawing_set_id) ->> 'governing_stage') in ('IFC', 'Released')
      from public.drawings d
     where d.id = p_drawing_id and d.is_deleted = false and d.deleted_at is null and d.is_superseded = false and d.drawing_set_id is not null
  ), false);
$function$;

REVOKE ALL ON FUNCTION public.piece_control_drawing_is_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piece_control_drawing_is_approved(uuid) TO authenticated, service_role;

-- ── evaluate_release_gate: supersedes 20260727232000's version ────────────
-- OLD (quarantined) body summed per-sheet piece_control_drawing_is_approved
-- calls directly. Current live body delegates the drawings check entirely to
-- work_package_drawing_set_reports (one evaluate_fab_release_set call per
-- linked set), gaining governing-submittal-stage, open-RFI, active-holds,
-- superseded-sheet and no-file blockers the old per-sheet check never had.
-- scope/material/holds checks and the overall jsonb shape are unchanged -
-- release_work_package_canonical_impl (20260905130000) already reads
-- checks.scope / checks.drawings / checks.material / checks.holds /
-- already_released / passes / blockers from this function and needs no
-- changes.
CREATE OR REPLACE FUNCTION public.evaluate_release_gate(p_work_package_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_project_id uuid; v_mode text;
  v_scope_count integer := 0; v_held_piece_count integer := 0;
  v_linked_drawing_count integer := 0; v_missing_drawing_count integer := 0; v_unmapped_drawing_piece_count integer := 0;
  v_set_reports jsonb; v_report jsonb; v_blocker jsonb; v_set_count integer := 0; v_set_ok_count integer := 0;
  v_requirement_count integer := 0; v_received_requirement_count integer := 0; v_unmapped_material_piece_count integer := 0;
  v_already_released boolean := false;
  v_scope_pass boolean; v_drawings_pass boolean; v_material_pass boolean; v_holds_pass boolean;
  v_blockers text[] := '{}'::text[]; v_scope_blockers text[] := '{}'::text[]; v_drawing_blockers text[] := '{}'::text[];
  v_material_blockers text[] := '{}'::text[]; v_hold_blockers text[] := '{}'::text[];
begin
  select wp.project_id, p.piece_control_mode into v_project_id, v_mode
    from public.work_packages wp join public.projects p on p.id = wp.project_id
   where wp.id = p_work_package_id and wp.is_deleted = false and wp.deleted_at is null;
  if v_project_id is null then raise exception 'Active work package not found'; end if;
  if v_actor is null or not public.user_has_project_access(v_project_id) then
    raise exception 'Not authorized to evaluate release readiness for this project' using errcode = '42501';
  end if;
  if v_mode = 'off' then raise exception 'Piece control is disabled for this project'; end if;

  select exists (select 1 from public.fab_releases where work_package_id = p_work_package_id and coalesce(is_deleted, false) = false
                   and (canonical_release = true or lower(coalesce(status, '')) = 'released')) into v_already_released;

  with scope as (
    select piece.* from public.pieces piece
     where piece.project_id = v_project_id and piece.work_package_id = p_work_package_id and piece.deleted_at is null and piece.is_deleted = false
       and piece.lifecycle_status not in ('shipped', 'delivered', 'erected')
       and not exists (select 1 from public.pieces child where child.parent_piece_id = piece.id and child.deleted_at is null and child.is_deleted = false))
  select count(*), count(*) filter (where on_hold = true) into v_scope_count, v_held_piece_count from scope;
  v_scope_pass := v_scope_count > 0;
  if not v_scope_pass then v_scope_blockers := array_append(v_scope_blockers, 'No active, actionable canonical leaf pieces are assigned to this work package.'); end if;

  with scope as (
    select piece.id from public.pieces piece
     where piece.project_id = v_project_id and piece.work_package_id = p_work_package_id and piece.deleted_at is null and piece.is_deleted = false
       and piece.lifecycle_status not in ('shipped', 'delivered', 'erected')
       and not exists (select 1 from public.pieces child where child.parent_piece_id = piece.id and child.deleted_at is null and child.is_deleted = false)),
  linked as (
    select distinct drawing_id from (
      select pd.drawing_id from public.piece_drawings pd join scope on scope.id = pd.piece_id where pd.project_id = v_project_id
      union
      select d.id from public.piece_drawing_sets pds join scope on scope.id = pds.piece_id
        join public.drawings d on d.drawing_set_id = pds.drawing_set_id and d.project_id = pds.project_id
       where pds.project_id = v_project_id and d.is_deleted = false and d.deleted_at is null and d.is_superseded = false) x)
  select count(*),
         count(*) filter (where not exists (select 1 from public.drawings dr where dr.id = linked.drawing_id and dr.project_id = v_project_id and dr.is_deleted = false and dr.deleted_at is null and dr.is_superseded = false))
    into v_linked_drawing_count, v_missing_drawing_count from linked;

  with scope as (
    select piece.id from public.pieces piece
     where piece.project_id = v_project_id and piece.work_package_id = p_work_package_id and piece.deleted_at is null and piece.is_deleted = false
       and piece.lifecycle_status not in ('shipped', 'delivered', 'erected')
       and not exists (select 1 from public.pieces child where child.parent_piece_id = piece.id and child.deleted_at is null and child.is_deleted = false))
  select count(*) into v_unmapped_drawing_piece_count from scope
   where not exists (select 1 from public.piece_drawing_sets pds where pds.piece_id = scope.id and pds.project_id = v_project_id)
     and not exists (select 1 from public.piece_drawings pd where pd.piece_id = scope.id and pd.project_id = v_project_id);

  v_set_reports := public.work_package_drawing_set_reports(p_work_package_id);
  for v_report in select value from jsonb_array_elements(v_set_reports) loop
    v_set_count := v_set_count + 1;
    if coalesce((v_report ->> 'ok')::boolean, false) then
      v_set_ok_count := v_set_ok_count + 1;
    else
      for v_blocker in select value from jsonb_array_elements(coalesce(v_report -> 'blockers', '[]'::jsonb)) loop
        v_drawing_blockers := array_append(v_drawing_blockers, format('%s: %s', coalesce(v_report ->> 'set_name', 'Drawing set'), v_blocker ->> 'title'));
      end loop;
    end if;
  end loop;

  v_drawings_pass := v_scope_pass and v_linked_drawing_count > 0 and v_unmapped_drawing_piece_count = 0 and v_missing_drawing_count = 0
                     and v_set_count > 0 and v_set_ok_count = v_set_count;
  if v_scope_pass and v_linked_drawing_count = 0 then v_drawing_blockers := array_append(v_drawing_blockers, 'No required shop drawings are linked to the scoped pieces.'); end if;
  if v_unmapped_drawing_piece_count > 0 then v_drawing_blockers := array_append(v_drawing_blockers, format('%s scoped piece(s) have no linked shop drawing set.', v_unmapped_drawing_piece_count)); end if;
  if v_missing_drawing_count > 0 then v_drawing_blockers := array_append(v_drawing_blockers, format('%s linked drawing record(s) are missing or inactive.', v_missing_drawing_count)); end if;

  with scope as (
    select piece.id from public.pieces piece
     where piece.project_id = v_project_id and piece.work_package_id = p_work_package_id and piece.deleted_at is null and piece.is_deleted = false
       and piece.lifecycle_status not in ('shipped', 'delivered', 'erected')
       and not exists (select 1 from public.pieces child where child.parent_piece_id = piece.id and child.deleted_at is null and child.is_deleted = false)),
  requirements as (
    select distinct requirement.id, requirement.receipt_state from scope
      join public.piece_material_requirements mapping on mapping.piece_id = scope.id and mapping.project_id = v_project_id
      join public.material_requirements requirement on requirement.id = mapping.material_requirement_id and requirement.project_id = v_project_id
       and requirement.is_deleted = false and requirement.deleted_at is null)
  select count(*), count(*) filter (where receipt_state in ('received', 'on_hand')) into v_requirement_count, v_received_requirement_count from requirements;

  with scope as (
    select piece.id from public.pieces piece
     where piece.project_id = v_project_id and piece.work_package_id = p_work_package_id and piece.deleted_at is null and piece.is_deleted = false
       and piece.lifecycle_status not in ('shipped', 'delivered', 'erected')
       and not exists (select 1 from public.pieces child where child.parent_piece_id = piece.id and child.deleted_at is null and child.is_deleted = false))
  select count(*) into v_unmapped_material_piece_count from scope
   where not exists (select 1 from public.piece_material_requirements mapping
                       join public.material_requirements requirement on requirement.id = mapping.material_requirement_id and requirement.project_id = v_project_id
                        and requirement.is_deleted = false and requirement.deleted_at is null
                      where mapping.piece_id = scope.id and mapping.project_id = v_project_id);

  v_material_pass := v_scope_pass and v_requirement_count > 0 and v_unmapped_material_piece_count = 0 and v_received_requirement_count = v_requirement_count;
  if v_scope_pass and v_requirement_count = 0 then v_material_blockers := array_append(v_material_blockers, 'Material requirements are unknown or unmapped for this work package.'); end if;
  if v_unmapped_material_piece_count > 0 then v_material_blockers := array_append(v_material_blockers, format('%s scoped piece(s) have unknown or unmapped material.', v_unmapped_material_piece_count)); end if;
  if v_requirement_count - v_received_requirement_count > 0 then v_material_blockers := array_append(v_material_blockers, format('%s material requirement(s) are not explicitly received or on hand.', v_requirement_count - v_received_requirement_count)); end if;

  v_holds_pass := v_scope_pass and v_held_piece_count = 0;
  if v_held_piece_count > 0 then v_hold_blockers := array_append(v_hold_blockers, format('%s scoped piece(s) are on hold.', v_held_piece_count)); end if;

  v_blockers := v_scope_blockers || v_drawing_blockers || v_material_blockers || v_hold_blockers;
  if v_already_released then v_blockers := array_append(v_blockers, 'This work package already has an active fabrication release.'); end if;

  return jsonb_build_object(
    'work_package_id', p_work_package_id, 'project_id', v_project_id,
    'passes', (v_scope_pass and v_drawings_pass and v_material_pass and v_holds_pass and not v_already_released),
    'already_released', v_already_released,
    'checks', jsonb_build_object(
      'scope', jsonb_build_object('passed', v_scope_pass, 'piece_count', v_scope_count, 'blockers', to_jsonb(v_scope_blockers)),
      'drawings', jsonb_build_object('passed', v_drawings_pass, 'linked_count', v_linked_drawing_count, 'approved_count', v_set_ok_count, 'set_count', v_set_count,
                                     'missing_count', v_missing_drawing_count, 'unmapped_piece_count', v_unmapped_drawing_piece_count, 'blockers', to_jsonb(v_drawing_blockers), 'sets', v_set_reports),
      'material', jsonb_build_object('passed', v_material_pass, 'requirement_count', v_requirement_count, 'received_or_on_hand_count', v_received_requirement_count,
                                     'unmapped_piece_count', v_unmapped_material_piece_count, 'blockers', to_jsonb(v_material_blockers)),
      'holds', jsonb_build_object('passed', v_holds_pass, 'held_piece_count', v_held_piece_count, 'blockers', to_jsonb(v_hold_blockers))),
    'blockers', to_jsonb(v_blockers), 'evaluated_at', now());
end $function$;

REVOKE ALL ON FUNCTION public.evaluate_release_gate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_release_gate(uuid) TO authenticated, service_role;
