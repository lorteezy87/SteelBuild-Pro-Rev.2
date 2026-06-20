-- Extend the server-side fab-release gate beyond open RFIs to the rest of the
-- dimensions the client gate (src/lib/fabReleaseGate.js) already checks, so they
-- can't be bypassed by a client that skips the UI:
--   2. Rejected / revise-and-resubmit sheets  (isRejectedSheet)
--   3. Sheets superseded by a newer revision   (isSupersededSheet)
-- Open RFIs (dimension 1) is unchanged. The opt-in "missing fab sign-offs"
-- dimension stays client-side for now (needs a per-project setting lookup).
--
-- The audited PM override (override_reason) remains the single escape hatch and
-- now short-circuits EVERY dimension — a deliberate partial release, exactly like
-- the UI. BEFORE INSERT on a brand-new release row: existing data and the
-- submittal auto-lock / manual-release flows are untouched. Applied live 2026-06-18.
create or replace function public.enforce_fab_release_gate()
returns trigger
language plpgsql
set search_path = public
as $$
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

notify pgrst, 'reload schema';
